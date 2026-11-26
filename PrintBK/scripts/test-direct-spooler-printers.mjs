import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const agentRequire = createRequire(path.join(rootDir, 'agent', 'package.json'));

const { PDFDocument, rgb } = agentRequire('pdf-lib');
const { executeSumatraPrint, findSumatraBinary } = await import('../agent/dist/src/sumatra.js');

async function testPhysicalPrinters() {
  console.log('🖨️ Testing Direct Windows Spooler Printing to Designated Virtual/Physical Printers...\n');

  // 1. Generate test PDF
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  page.drawText('PrintBK System Spooler Direct Print Test', { x: 50, y: 750, size: 20, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`Timestamp: ${new Date().toISOString()}`, { x: 50, y: 710, size: 12, color: rgb(0.3, 0.3, 0.3) });
  page.drawText('Designated Printer: Spooled and Printed Cleanly', { x: 50, y: 680, size: 14, color: rgb(0.08, 0.6, 0.2) });

  const workDir = path.join(rootDir, 'agent', 'work');
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });
  const testPdfPath = path.join(workDir, 'direct_spool_test.pdf');
  fs.writeFileSync(testPdfPath, await pdfDoc.save());
  console.log(`✓ Test PDF created: ${testPdfPath}`);

  const sumatraPath = findSumatraBinary();
  console.log(`✓ SumatraPDF binary located: ${sumatraPath || 'Windows default fallback'}`);

  // 2. Direct print to PrintBK-BW-Virtual
  console.log('Sending test print to PrintBK-BW-Virtual...');
  await executeSumatraPrint(
    testPdfPath,
    'PrintBK-BW-Virtual',
    { copies: 1, duplex: 'simplex', color: 'monochrome', paper: 'A4' },
    sumatraPath
  );
  console.log('✓ PrintBK-BW-Virtual print completed successfully (no error).');

  // 3. Direct print to PrintBK-Colour-Virtual
  console.log('Sending test print to PrintBK-Colour-Virtual...');
  await executeSumatraPrint(
    testPdfPath,
    'PrintBK-Colour-Virtual',
    { copies: 1, duplex: 'simplex', color: 'color', paper: 'A4' },
    sumatraPath
  );
  console.log('✓ PrintBK-Colour-Virtual print completed successfully (no error).');

  // 4. Clean up test PDF
  if (fs.existsSync(testPdfPath)) fs.unlinkSync(testPdfPath);
  console.log('\n🎉 All designated printers spooled and completed with zero errors!\n');
}

testPhysicalPrinters().catch(err => {
  console.error('Physical printer test failed:', err);
  process.exit(1);
});
