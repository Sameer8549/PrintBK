import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const staffRequire = createRequire(path.resolve('staff/package.json'));
const { chromium } = staffRequire('@playwright/test');

const evidenceDir = path.resolve('docs/final-evidence/after');
fs.mkdirSync(evidenceDir, { recursive: true });

const clientDir = path.resolve('client');

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
  const urlObj = new URL(req.url, 'http://localhost:4218');
  const pathname = urlObj.pathname;

  if (pathname.startsWith('/server/api') || pathname.startsWith('/api') || pathname === '/config' || pathname.startsWith('/orders') || pathname.startsWith('/upload')) {
    return apiApp(req, res);
  }

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

await new Promise((resolve) => server.listen(4218, resolve));
console.log('Server running on http://localhost:4218');

const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  console.log('Navigating to Student Web App...');
  await page.goto('http://localhost:4218/#/', { waitUntil: 'networkidle' });

  // 1. Switch to Photos tab on Entry
  console.log('Clicking Photos tab on Entry...');
  const photosTab = page.locator('button:has-text("Photos")');
  await photosTab.click();

  // 2. Wait for Photo print screen
  await page.waitForSelector('.photo-page', { timeout: 5000 });
  console.log('PhotoTool screen loaded.');

  // Verify default layout is Passport 8-up (not blank!)
  const passportBtn = page.locator('.layout-scroll button:has-text("Passport 8-up")');
  const isActive = await passportBtn.evaluate(el => el.classList.contains('active'));
  console.log('Passport 8-up default active:', isActive);
  assert.ok(isActive, 'Expected Passport 8-up to be active by default');

  const slots = page.locator('.photo-slot');
  const slotCount = await slots.count();
  console.log('Slots rendered:', slotCount);
  assert.equal(slotCount, 8, 'Expected 8 slots for Passport 8-up layout');

  // 3. Upload a sample photo
  const testPhotoPath = path.resolve('client/hkbk-logo.jpg');
  console.log(`Setting input files: ${testPhotoPath}...`);
  const fileInput = page.locator('input[type="file"].visually-hidden');
  await fileInput.setInputFiles(testPhotoPath);

  // Wait for images to render in slots
  const firstSlotImg = page.locator('.photo-slot img').first();
  await firstSlotImg.waitFor({ state: 'visible', timeout: 5000 });
  console.log('Photo rendered successfully in preview slots!');

  // Check Colour mode price (₹40.00)
  const totalBlock = page.locator('.total-block b');
  let priceText = await totalBlock.textContent();
  console.log('Colour price:', priceText);
  assert.equal(priceText.trim(), '₹40.00', 'Expected ₹40.00 in Colour mode');

  // Capture Colour Screenshot
  const colourScreenshot = path.join(evidenceDir, 'photo-tool-passport-colour.png');
  await page.screenshot({ path: colourScreenshot });
  console.log(`Saved screenshot: ${colourScreenshot}`);

  // 4. Switch to Black & White option
  console.log('Switching to Black & White mode...');
  const bwBtn = page.locator('.photo-section-title + div button:has-text("Black & White")');
  await bwBtn.click();
  await page.waitForTimeout(300);

  // Verify 50% discount price (₹20.00)
  priceText = await totalBlock.textContent();
  console.log('B&W price:', priceText);
  assert.equal(priceText.trim(), '₹20.00', 'Expected ₹20.00 in Black & White mode');

  // Verify grayscale filter is applied to image
  const imgFilter = await firstSlotImg.evaluate(el => window.getComputedStyle(el).filter);
  console.log('Computed image filter:', imgFilter);
  assert.ok(imgFilter.includes('grayscale'), `Expected grayscale in filter, got: ${imgFilter}`);

  // Capture B&W Screenshot
  const bwScreenshot = path.join(evidenceDir, 'photo-tool-passport-bw.png');
  await page.screenshot({ path: bwScreenshot });
  console.log(`Saved screenshot: ${bwScreenshot}`);

  // 5. Add photo sheet to basket
  console.log('Clicking "Add photo sheet"...');
  const addBtn = page.locator('.bottom-dock button.primary');
  await addBtn.click();

  // Wait for Basket page
  await page.waitForSelector('main', { timeout: 5000 });
  await page.waitForTimeout(600);

  // Verify basket has the item
  const bodyText = await page.innerText('body');
  const pageContent = await page.content();
  assert.ok(bodyText.includes('Photo Sheet') || pageContent.includes('Photo Sheet'), 'Expected "Photo Sheet" to appear in basket');
  assert.ok(bodyText.includes('B&W') || pageContent.includes('B&amp;W'), 'Expected "B&W" to appear in basket');
  console.log('SUCCESS: Photo Sheet added to basket with correct B&W mode and price!');

  // Capture Basket Screenshot
  const basketScreenshot = path.join(evidenceDir, 'photo-basket-ready.png');
  await page.screenshot({ path: basketScreenshot });
  console.log(`Saved screenshot: ${basketScreenshot}`);

  console.log('ALL PHOTO TESTS PASSED CLEANLY!');
} finally {
  await browser.close();
  server.close();
}
