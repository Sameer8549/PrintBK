import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const staffRequire = createRequire(path.resolve('PrintBK/staff/package.json'));
const { chromium } = staffRequire('@playwright/test');

const evidenceDir = path.resolve('PrintBK/docs/final-evidence/settings');
fs.mkdirSync(evidenceDir, { recursive: true });

const clientDir = path.resolve('PrintBK/client');

process.env.STAFF_TOKEN = 'test_staff_token_settings';
process.env.COUNTER_SETUP_CODE = 'PBK-COUNTER-SETUP-4f8a29b7c1e3456d890a12b4';

// Import real backend app
const apiAppModule = await import('../functions/api/index.js');
const apiApp = apiAppModule.default || apiAppModule;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, 'http://127.0.0.1:4225');
  const pathname = urlObj.pathname;
  console.log(`[REQ] ${req.method} ${pathname}`);

  if (pathname.startsWith('/server/api') || pathname.startsWith('/api') || pathname === '/config' || pathname.startsWith('/orders') || pathname.startsWith('/upload') || pathname.startsWith('/staff/live')) {
    return apiApp(req, res);
  }

  // Student app routing
  let relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  let filePath = path.join(clientDir, relPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    return res.end(fs.readFileSync(filePath));
  }

  const fallback = path.join(clientDir, 'index.html');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(fallback));
});

await new Promise((resolve) => server.listen(4225, '127.0.0.1', resolve));
console.log('Verification Test Server running on http://127.0.0.1:4225');

const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  console.log('\n--- 1. Testing Image / Photo Upload & Adaptive Settings ---');
  await page.goto('http://127.0.0.1:4225/#/', { waitUntil: 'commit' });
  await page.waitForSelector('.drop-zone', { timeout: 10000 });
  await page.waitForTimeout(500);

  // Upload an image via drop-zone filechooser
  const photoPath = path.resolve('PrintBK/client/hkbk-logo.jpg');
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.locator('button.drop-zone').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(photoPath);

  // Should immediately navigate to basket
  await page.waitForSelector('text=PHOTO PRINT PREVIEW', { timeout: 8000 });
  console.log('✓ Navigated to Basket with PHOTO PRINT PREVIEW active');

  // Verify Image Settings are tailored
  const framingSection = page.locator('text=PHOTO FRAMING & FIT');
  assert.ok(await framingSection.isVisible(), 'PHOTO FRAMING & FIT must be visible for images');

  const paperTypeSection = page.locator('text=PAPER SIZE & FINISH');
  assert.ok(await paperTypeSection.isVisible(), 'PAPER SIZE & FINISH must be visible for images');

  // Verify multi-page imposition options are NOT present for image
  const duplexText = page.locator('text=PRINT SIDES');
  assert.equal(await duplexText.count(), 0, 'PRINT SIDES must NOT be shown for single images');
  const bookletText = page.locator('text=Booklet');
  assert.equal(await bookletText.count(), 0, 'Booklet must NOT be shown for single images');

  // Test Real-Time Color Mode Toggle to B&W
  console.log('Testing B&W color toggle on photo...');
  const bwBtn = page.locator('button:has-text("Black & White")').first();
  await bwBtn.click();
  await page.waitForTimeout(300);

  // Verify preview badge updated to B&W
  const bwBadge = page.locator('span:text-is("B&W")');
  assert.ok(await bwBadge.first().isVisible(), 'Preview badge should reflect B&W mode');

  // Test Real-Time Framing toggle to Fill Sheet
  console.log('Testing Fill Sheet framing toggle...');
  const fillSheetBtn = page.locator('button:has-text("Fill Sheet")');
  await fillSheetBtn.click();
  await page.waitForTimeout(300);

  const fullSheetBadge = page.locator('span:text-is("Full Sheet")');
  assert.ok(await fullSheetBadge.first().isVisible(), 'Preview badge should reflect Full Sheet');

  // Test Real-Time Rotation
  console.log('Testing Rotate 90°...');
  const rotateBtn = page.locator('button:has-text("↻ Rotate 90°")').first();
  await rotateBtn.click();
  await page.waitForTimeout(300);

  // Test Real-Time A3 Paper Selection on Image
  console.log('Testing A3 Large paper selection on image...');
  const a3PhotoBtn = page.locator('button:has-text("A3 Large")').first();
  await a3PhotoBtn.click();
  await page.waitForTimeout(400);

  // Verify A3 Badge & Watermark appear in preview
  const a3Badge = page.locator('span:text-is("📐 A3 Large")');
  assert.ok(await a3Badge.first().isVisible(), 'A3 Large preview badge must appear');
  const a3Watermark = page.locator('text=297×420 mm');
  assert.ok(await a3Watermark.first().isVisible(), 'A3 dimension watermark must appear inside preview');

  // Verify Card Header adapts to A3
  const a3CardHeader = page.locator('text=A3 Large Sheet');
  assert.ok(await a3CardHeader.first().isVisible(), 'Card header must adapt to A3 Large Sheet');

  // Verify Pricing Formula adapts to A3 price (₹3.00 for B&W 1-sided)
  const a3PriceFormula = page.locator('text=₹3.00 A3');
  assert.ok(await a3PriceFormula.first().isVisible(), 'Pricing formula must adapt to A3 rate');
  console.log('✓ Image successfully adapted to A3 settings (Visual badge, sheet watermark, header, and price)');

  // Take screenshot of Image Settings with A3 adaptation
  const imageEvidencePath = path.join(evidenceDir, '01-image-settings.png');
  await page.screenshot({ path: imageEvidencePath, fullPage: true });
  console.log(`✓ Image Settings screenshot saved to ${imageEvidencePath}`);

  // ─── STEP 2: MULTI-PAGE DOCUMENT ADAPTIVE SETTINGS ───
  console.log('\n--- 2. Testing Multi-Page Document Upload & Adaptive Settings ---');
  const addMoreBtn = page.locator('button:has-text("+ Add more files")');
  if (await addMoreBtn.isVisible()) {
    const docPath = path.resolve('PrintBK/test-fixtures/sample-10page.pdf');
    const docChooserPromise = page.waitForEvent('filechooser');
    await addMoreBtn.click();
    const docChooser = await docChooserPromise;
    await docChooser.setFiles(docPath);
    await page.waitForTimeout(2000);
  }

  // Scroll to the second file card
  const docFileHeader = page.locator('text=sample-10page.pdf');
  assert.ok(await docFileHeader.first().isVisible(), 'sample-10page.pdf must appear in basket');
  console.log('✓ sample-10page.pdf loaded in Basket');

  // Verify Multi-page settings are visible for the PDF
  const printSidesSection = page.locator('text=PRINT SIDES');
  assert.ok(await printSidesSection.isVisible(), 'PRINT SIDES must be visible for multi-page document');

  const pagesPerSheetSection = page.locator('text=PAGES PER SHEET');
  assert.ok(await pagesPerSheetSection.isVisible(), 'PAGES PER SHEET must be visible for multi-page document');

  const pageRangeSection = page.locator('text=PAGE RANGE');
  assert.ok(await pageRangeSection.isVisible(), 'PAGE RANGE must be visible for multi-page document');

  const docPaperSizeSection = page.locator('text=PAPER SIZE');
  assert.ok(await docPaperSizeSection.nth(1).isVisible(), 'PAPER SIZE must be visible for multi-page document');

  // Test Multi-page real-time interactions
  console.log('Testing 2-sided toggle and savings chip...');
  const twoSidedBtn = page.locator('button:has-text("2-Sided")').first();
  await twoSidedBtn.click();
  await page.waitForTimeout(300);

  const savingsChip = page.locator('text=Saved');
  assert.ok(await savingsChip.first().isVisible(), 'Savings chip should appear for 2-sided document');

  // Test 2-up grid
  console.log('Testing 2-Up Pages per Sheet...');
  const twoUpBtn = page.locator('button:has-text("2-up")').first();
  await twoUpBtn.click();
  await page.waitForTimeout(500);

  // Test A3 Selection on Multi-Page Document
  console.log('Testing A3 paper selection on multi-page document...');
  const docA3Btn = page.locator('button:has-text("📐 A3")').last();
  await docA3Btn.click();
  await page.waitForTimeout(400);

  // Verify document preview and pricing adapt to A3
  const docA3Watermark = page.locator('text=297×420 mm');
  assert.ok(await docA3Watermark.last().isVisible(), 'A3 dimension watermark must appear inside doc preview');
  console.log('✓ Multi-page document successfully adapted to A3 settings');

  // Take screenshot of Multi-Page Document Settings
  const docEvidencePath = path.join(evidenceDir, '02-multipage-doc-settings.png');
  await page.screenshot({ path: docEvidencePath, fullPage: true });
  console.log(`✓ Multi-Page Document Settings screenshot saved to ${docEvidencePath}`);

  console.log('\n✅ ALL SETTINGS EXPERIENCE TESTS PASSED EMPIRICALLY!');
} finally {
  await browser.close();
  server.close();
}
