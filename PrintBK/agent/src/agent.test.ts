import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { PDFDocument } from 'pdf-lib';
import { buildSumatraSettings } from './sumatra';
import { parsePageRange, processDocumentLayout } from './layout';
import { cleanJobFiles, sweepTempDirectory } from './sweeper';
import { executeDryRunPrint } from './dryrun';

async function runUnitTests() {
  console.log('--- Running Agent Unit Tests ---');

  // Test 1: SumatraPDF CLI argument builder
  console.log('Test 1: buildSumatraSettings...');
  const s1 = buildSumatraSettings({ copies: 1, duplex: 'simplex', color: 'monochrome', paper: 'A4' });
  assert.strictEqual(s1, 'simplex,monochrome,paper=A4,fit');

  const s2 = buildSumatraSettings({ copies: 3, duplex: 'duplexlong', color: 'color', paper: 'Legal', range: '1-5' });
  assert.strictEqual(s2, '3x,duplexlong,color,paper=Legal,1-5,fit');

  const s3 = buildSumatraSettings({ duplex: 'duplexshort', tray: 'Tray 2', scale: 'noscale' });
  assert.strictEqual(s3, 'duplexshort,tray=Tray 2,noscale');
  console.log('  ✓ buildSumatraSettings correctly formats all CLI settings');

  // Test 2: Page range parser
  console.log('Test 2: parsePageRange...');
  assert.deepStrictEqual(parsePageRange('all', 5), [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(parsePageRange('1-3, 5', 5), [1, 2, 3, 5]);
  assert.deepStrictEqual(parsePageRange('2, 4-6, 99', 6), [2, 4, 5, 6]);
  console.log('  ✓ parsePageRange correctly parses and bounds ranges');

  // Test 3: Layout engine & Colour Plan splitting
  console.log('Test 3: processDocumentLayout with Colour Plan splitting...');
  const sampleDoc = await PDFDocument.create();
  sampleDoc.addPage([595, 842]); // Page 1 (B&W)
  sampleDoc.addPage([595, 842]); // Page 2 (Colour)
  sampleDoc.addPage([595, 842]); // Page 3 (B&W)
  const samplePdfBytes = await sampleDoc.save();

  // A. Split mode (Colour page 2 split from B&W pages 1 & 3)
  const splitResult = await processDocumentLayout(
    samplePdfBytes,
    {
      colorMode: 'custom',
      colorPlan: { mode: 'custom', colorPages: [2] },
      range: 'all'
    },
    'split',
    { orderNumber: 1042, pickupCode: '4242' }
  );

  assert.strictEqual(splitResult.totalPages, 3);
  assert.strictEqual(splitResult.parts.length, 2);

  const colourPart = splitResult.parts.find(p => p.role === 'colour');
  const bwPart = splitResult.parts.find(p => p.role === 'bw');

  assert.ok(colourPart, 'Should have a colour part');
  assert.ok(bwPart, 'Should have a B&W part');
  assert.strictEqual(colourPart.pageCount, 1);
  assert.deepStrictEqual(colourPart.pagesList, [2]);

  // B&W part has 2 content pages + 1 combine slip inserted = 3 pages in PDF
  const bwDocLoaded = await PDFDocument.load(bwPart.pdfBytes);
  assert.strictEqual(bwDocLoaded.getPageCount(), 3);
  console.log('  ✓ Colour plan splitting produced separate colour & B&W parts with combine slip');

  // B. Unified colour mode (all pages sent to colour printer)
  const unifiedResult = await processDocumentLayout(
    samplePdfBytes,
    {
      colorMode: 'custom',
      colorPlan: { mode: 'custom', colorPages: [2] },
      range: 'all'
    },
    'colour'
  );
  assert.strictEqual(unifiedResult.parts.length, 1);
  assert.strictEqual(unifiedResult.parts[0].role, 'colour');
  assert.strictEqual(unifiedResult.parts[0].pageCount, 3);
  console.log('  ✓ Unified colour mode sends all pages to colour printer');

  // Test 4: Sweeper & immediate file cleanup
  console.log('Test 4: cleanJobFiles and sweepTempDirectory...');
  const testTmpDir = path.join(process.cwd(), 'work', 'unit_test_tmp');
  if (!fs.existsSync(testTmpDir)) fs.mkdirSync(testTmpDir, { recursive: true });

  const f1 = path.join(testTmpDir, 'temp1.bin');
  const f2 = path.join(testTmpDir, 'temp2.bin');
  fs.writeFileSync(f1, 'temp-content-1');
  fs.writeFileSync(f2, 'temp-content-2');

  assert.ok(fs.existsSync(f1));
  cleanJobFiles([f1]);
  assert.ok(!fs.existsSync(f1), 'File 1 should be immediately deleted');

  // Sweep with maxAge 0ms should delete f2
  const swept = sweepTempDirectory(testTmpDir, -1);
  assert.ok(swept >= 1, 'Sweeper should have removed file 2');
  assert.ok(!fs.existsSync(f2));
  fs.rmdirSync(testTmpDir);
  console.log('  ✓ File cleaner and directory sweeper functioned as expected');

  // Test 5: Dry-run execution
  console.log('Test 5: executeDryRunPrint...');
  const dryRunDir = path.join(process.cwd(), 'dry-run-test');
  let progressUpdates = 0;

  const dryResult = await executeDryRunPrint(
    'test-job-999',
    'EPSON L3150',
    { kind: 'document_colour', order_number: 1088, pickup_code: '8888' },
    splitResult.parts,
    dryRunDir,
    async (done, total) => {
      progressUpdates++;
    }
  );

  assert.ok(dryResult.success);
  assert.ok(fs.existsSync(dryResult.manifestPath));
  assert.ok(progressUpdates > 0, 'Should have received progress callbacks');

  const manifest = JSON.parse(fs.readFileSync(dryResult.manifestPath, 'utf8'));
  assert.strictEqual(manifest.orderNumber, 1088);
  assert.strictEqual(manifest.parts.length, 2);

  // Clean up dry-run test folder
  fs.rmSync(dryRunDir, { recursive: true, force: true });
  console.log('  ✓ Dry-run simulated execution generated valid manifest and part files');

  console.log('\n🎉 All Agent Unit Tests passed successfully!\n');
}

runUnitTests().catch(err => {
  console.error('❌ Agent unit tests failed:', err);
  process.exit(1);
});
