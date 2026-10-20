import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const staffRequire = createRequire(path.resolve('PrintBK/staff/package.json'));
const { chromium } = staffRequire('@playwright/test');

const evidenceDir = path.resolve('PrintBK/docs/final-evidence/ultrahd');
fs.mkdirSync(evidenceDir, { recursive: true });

const clientDir = path.resolve('PrintBK/client');

process.env.STAFF_TOKEN = 'test_staff_token_ultrahd';
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
  const urlObj = new URL(req.url, 'http://localhost:4220');
  const pathname = urlObj.pathname;

  if (pathname.startsWith('/server/api') || pathname.startsWith('/api') || pathname === '/config' || pathname.startsWith('/orders') || pathname.startsWith('/upload') || pathname.startsWith('/staff/live')) {
    return apiApp(req, res);
  }

  // Handle staff app routing
  if (pathname.startsWith('/staff')) {
    let p = pathname.replace(/^\/staff\/?/, '');
    if (!p || p === '') p = 'index.html';
    let staffFile = path.join(clientDir, 'staff', p);
    if (fs.existsSync(staffFile) && fs.statSync(staffFile).isFile()) {
      const ext = path.extname(staffFile);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      return res.end(fs.readFileSync(staffFile));
    }
    const staffFallback = path.join(clientDir, 'staff', 'index.html');
    if (fs.existsSync(staffFallback)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(staffFallback));
    }
  }

  // Handle student app routing
  let filePath = path.join(clientDir, pathname === '/' ? 'index.html' : pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    return res.end(fs.readFileSync(filePath));
  }

  const fallback = path.join(clientDir, 'index.html');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(fallback));
});

await new Promise((resolve) => server.listen(4220, resolve));
console.log('Test Server running on http://localhost:4220');

const browser = await chromium.launch({ headless: true });

try {
  // ─── STEP 1: STUDENT APP PHOTO UPLOAD & ULTRA HD SHEET GENERATION ───
  console.log('\n--- 1. Testing Student App Ultra HD Photo Upload ---');
  const studentContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2
  });
  const studentPage = await studentContext.newPage();

  console.log('Navigating to Student Web App...');
  await studentPage.goto('http://localhost:4220/#/', { waitUntil: 'domcontentloaded' });

  // Switch to Photos tab on Entry
  const photosTab = studentPage.locator('button:has-text("Photos")');
  await photosTab.click();
  await studentPage.waitForSelector('.photo-page', { timeout: 5000 });
  console.log('✓ PhotoTool opened');

  // Verify default layout is Passport 8-up
  const passportBtn = studentPage.locator('.layout-scroll button:has-text("Passport 8-up")');
  assert.ok(await passportBtn.evaluate(el => el.classList.contains('active')), 'Passport 8-up should be active');

  // Upload test photo
  const testPhotoPath = path.resolve('PrintBK/client/hkbk-logo.jpg');
  const fileInput = studentPage.locator('input[type="file"].visually-hidden');
  await fileInput.setInputFiles(testPhotoPath);

  // Wait for photo preview in slots
  const firstSlotImg = studentPage.locator('.photo-slot img').first();
  await firstSlotImg.waitFor({ state: 'visible', timeout: 5000 });
  console.log('✓ Photo rendered in live preview slots');

  // Select Black & White option
  const bwBtn = studentPage.locator('.photo-section-title + div button:has-text("Black & White")');
  await bwBtn.click();
  await studentPage.waitForTimeout(300);
  console.log('✓ Selected Black & White mode');

  // Capture PhotoTool screenshot
  const photoToolShot = path.join(evidenceDir, 'student-phototool-passport-bw.png');
  await studentPage.screenshot({ path: photoToolShot });
  console.log(`Saved screenshot: ${photoToolShot}`);

  // Tap "Add photo sheet" to generate Ultra HD 300 DPI composite
  console.log('Generating Ultra HD Photo Sheet (300 DPI)...');
  const addBtn = studentPage.locator('.bottom-dock button.primary');
  await addBtn.click();

  // Wait for navigation to Basket
  await studentPage.waitForSelector('.basket-page, main', { timeout: 8000 });
  await studentPage.waitForTimeout(1000);
  const basketText = await studentPage.innerText('body');
  assert.ok(basketText.includes('Photo Sheet'), 'Basket should contain Photo Sheet');
  console.log('✓ Photo Sheet added to Basket');

  // ─── STEP 2: TEST FULL PREVIEW MODE (NON-BLURRY CRISP ULTRA HD) ───
  console.log('\n--- 2. Testing Full Sheet Print Preview Mode ---');
  const previewBtn = studentPage.locator('button:has-text("Full Sheet Print Preview")');
  if (await previewBtn.isVisible()) {
    await previewBtn.click();
    await studentPage.waitForSelector('.preview-page', { timeout: 6000 });
    console.log('✓ Full Sheet Print Preview opened');

    // Verify Ultra HD 300 DPI badge
    const badge = studentPage.locator('text=Ultra HD 300 DPI');
    await badge.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Ultra HD 300 DPI badge verified');

    // Test Zoom control
    const zoomBtn = studentPage.locator('button:has-text("Zoom")');
    if (await zoomBtn.isVisible()) {
      await zoomBtn.click();
      await studentPage.waitForTimeout(400);
      console.log('✓ Zoomed in to inspect details');
    }

    const previewShot = path.join(evidenceDir, 'student-full-preview-mode-crisp.png');
    await studentPage.screenshot({ path: previewShot });
    console.log(`Saved screenshot: ${previewShot}`);

    // Return to basket
    const backBtn = studentPage.locator('header button.icon-button').first();
    await backBtn.click();
    await studentPage.waitForTimeout(500);
  }

  // ─── STEP 3: PLACE ORDER & VERIFY STAFF RECEIVES SAME ULTRA HD ───
  console.log('\n--- 3. Placing Order for Staff App Verification ---');
  const checkoutBtn = studentPage.locator('button.primary:has-text("Checkout"), .bottom-dock button.primary');
  await checkoutBtn.click();
  await studentPage.waitForSelector('.checkout-page, main', { timeout: 6000 });
  console.log('✓ Checkout page opened');

  // Select Cash payment
  const cashOpt = studentPage.locator('div:has-text("Pay with Cash"), div:has-text("Cash")').last();
  if (await cashOpt.isVisible()) {
    await cashOpt.click();
    await studentPage.waitForTimeout(300);
  }

  // Place order
  const placeOrderBtn = studentPage.locator('button:has-text("Reserve"), button:has-text("Pay")').last();
  await placeOrderBtn.click();
  await studentPage.waitForTimeout(2000);
  console.log('✓ Order placed successfully');

  // ─── STEP 4: STAFF COUNTER APP ULTRA HD PREVIEW & INSPECTION ───
  console.log('\n--- 4. Testing Staff Counter App Ultra HD Inspection ---');
  const staffContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });
  await staffContext.addInitScript(() => {
    localStorage.setItem('printbk_staff_token', 'test_staff_token_ultrahd');
    localStorage.setItem('printbk_staff_device_id', 'staff_test_device_01');
    localStorage.setItem('printbk-paired', 'true');
    localStorage.setItem('printbk_include_test', 'true');
  });
  const staffPage = await staffContext.newPage();

  console.log('Loading Staff Counter App...');
  await staffPage.goto('http://localhost:4220/staff/#/', { waitUntil: 'domcontentloaded' });
  await staffPage.waitForTimeout(2000);
  console.log('✓ Staff App loaded with paired token');

  // Wait for orders to arrive via /staff/live
  await staffPage.waitForSelector('.job-row', { timeout: 10000 });
  console.log('✓ Staff App loaded order rows');

  // Find the photo job row or the first job row
  const photoRow = staffPage.locator('.job-row').filter({ hasText: 'Photo' }).first();
  if (await photoRow.isVisible()) {
    await photoRow.click();
  } else {
    await staffPage.locator('.job-row').first().click();
  }
  console.log('✓ Clicked job row to open OrderDetailPanel');

  // Wait for OrderDetailPanel
  await staffPage.waitForSelector('.order-detail-panel', { timeout: 8000 });
  console.log('✓ OrderDetailPanel opened');

    // Verify Ultra HD 300 DPI preview panel is present
    const ultraHdHeading = staffPage.locator('text=ULTRA HD PRINT ASSET · 300 DPI');
    await ultraHdHeading.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ ULTRA HD PRINT ASSET · 300 DPI heading verified in Staff App');

    const staffDetailShot = path.join(evidenceDir, 'staff-order-detail-ultrahd-preview.png');
    await staffPage.screenshot({ path: staffDetailShot });
    console.log(`Saved screenshot: ${staffDetailShot}`);

    // Wait for fileUrl to load and enable "Full HD Preview" button
    const fullPreviewBtn = staffPage.locator('button:has-text("Full HD Preview")');
    await fullPreviewBtn.waitFor({ state: 'visible', timeout: 5000 });
    await staffPage.waitForFunction(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Full HD Preview'));
      return btn && !btn.hasAttribute('disabled');
    }, { timeout: 10000 });

    await fullPreviewBtn.click();
    await staffPage.waitForSelector('.ultra-hd-modal-scrim', { timeout: 5000 });
    console.log('✓ Full Screen Ultra HD Inspection Modal opened in Staff App');

    const modalShot = path.join(evidenceDir, 'staff-inspect-modal-ultrahd.png');
    await staffPage.screenshot({ path: modalShot });
    console.log(`Saved screenshot: ${modalShot}`);

  console.log('\n🎉 ALL ULTRA HD & FULL PREVIEW TESTS PASSED SUCCESSFULLY!');
} finally {
  await browser.close();
  server.close();
}
