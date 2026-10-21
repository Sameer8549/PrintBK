import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const staffRequire = createRequire(path.join(rootDir, 'staff', 'package.json'));
const { chromium } = staffRequire('@playwright/test');

const evidenceDir = path.join(rootDir, 'docs', 'final-evidence', 'after');
fs.mkdirSync(evidenceDir, { recursive: true });

const clientDir = path.join(rootDir, 'client');

// Import real backend app
const apiAppModule = await import(pathToFileURL(path.join(rootDir, 'functions', 'api', 'index.js')).href);
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
  const urlObj = new URL(req.url, 'http://localhost:4219');
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

await new Promise((resolve) => server.listen(4219, resolve));
console.log('Test server running on http://localhost:4219');

const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  console.log('1. Navigating to Student App...');
  await page.goto('http://localhost:4219/#/', { waitUntil: 'networkidle' });

  // 1. Switch to Photos tab on Entry
  console.log('2. Switching to Photos tab...');
  const photosTab = page.locator('button:has-text("Photos")');
  await photosTab.click();
  await page.waitForSelector('.photo-page', { timeout: 5000 });

  // 2. Upload sample photo
  console.log('3. Uploading sample photo...');
  const testPhotoPath = path.join(clientDir, 'hkbk-logo.jpg');
  const fileInput = page.locator('input[type="file"].visually-hidden');
  await fileInput.setInputFiles(testPhotoPath);

  const firstSlotImg = page.locator('.photo-slot img').first();
  await firstSlotImg.waitFor({ state: 'visible', timeout: 5000 });

  // Verify Colour price matches configured backend rate (₹60.00)
  const totalBlock = page.locator('.total-block b');
  let priceText = await totalBlock.textContent();
  console.log('   PhotoTool Colour price:', priceText);
  assert.equal(priceText.trim(), '₹60.00', 'Expected ₹60.00 in Colour mode as configured in backend');

  // 3. Add to basket
  console.log('4. Adding Photo Sheet to basket...');
  const addBtn = page.locator('.bottom-dock button.primary');
  await addBtn.click();

  // Wait for Basket screen
  await page.waitForSelector('main', { timeout: 5000 });
  await page.waitForTimeout(600);

  // 4. Verify basket has the item with non-zero price
  console.log('5. Verifying Photo Sheet in Basket...');
  const bodyText = await page.innerText('body');
  assert.ok(bodyText.includes('Photo Sheet'), 'Expected "Photo Sheet" in basket');

  // Check that line formula is visible and NOT ₹0.00
  const formulaEl = page.locator('div:has-text("1 sheet × ₹60.00")').first();
  const formulaVisible = await formulaEl.isVisible();
  console.log('   Formula contains 1 sheet × ₹60.00:', formulaVisible);
  assert.ok(formulaVisible, 'Formula should show real rate, not 0.00 or covered by photo service');

  // Verify bottom checkout total is ₹60.00
  const checkoutTotal = page.locator('div:has-text("₹60.00")').last();
  const totalVisible = await checkoutTotal.isVisible();
  console.log('   Checkout total shows ₹60.00:', totalVisible);
  assert.ok(totalVisible, 'Total should be ₹60.00');

  // 5. Test Edit Controls on Photo Card:
  console.log('6. Testing Live Editability of Photo Card...');
  
  // A. Increase copies: 1 -> 2
  console.log('   A. Increasing copies: 1 -> 2');
  const plusBtn = page.locator('button:has-text("+")').first();
  await plusBtn.click();
  await page.waitForTimeout(400);

  let newBody = await page.innerText('body');
  assert.ok(newBody.includes('₹120.00'), 'Total should update to ₹120.00 after 2 copies');
  console.log('   ✅ 2 copies total updated to ₹120.00');

  // B. Switch to Black & White: 50% discount (₹30/sheet -> ₹60 total for 2 copies)
  console.log('   B. Switching to Black & White...');
  const bwBtn = page.locator('button:has-text("Black & White")').first();
  await bwBtn.click();
  await page.waitForTimeout(400);

  newBody = await page.innerText('body');
  assert.ok(newBody.includes('₹60.00'), 'Total should update to ₹60.00 after B&W discount on 2 copies');
  console.log('   ✅ B&W discount applied to 2 copies: ₹60.00');

  // C. Switch to Glossy Paper: 2x multiplier (₹30 * 2 = ₹60/sheet -> ₹120 total for 2 copies)
  console.log('   C. Switching to Glossy photo paper...');
  const glossyBtn = page.locator('button:has-text("Glossy")').first();
  await glossyBtn.click();
  await page.waitForTimeout(400);

  newBody = await page.innerText('body');
  assert.ok(newBody.includes('₹120.00'), 'Total should update to ₹120.00 with Glossy multiplier');
  console.log('   ✅ Glossy paper multiplier applied: ₹120.00');

  // D. Test Photo Base Rate Preset Chip: click ₹40 preset
  console.log('   D. Testing Photo Base Rate Preset Chip (₹40)...');
  const chip40 = page.locator('button:has-text("₹40")').first();
  await chip40.click();
  await page.waitForTimeout(400);

  // Rate = 40 * 0.5 (B&W) = 20. Paper = 2 (Glossy) -> 40. Copies = 2 -> ₹80.00
  newBody = await page.innerText('body');
  assert.ok(newBody.includes('₹80.00'), 'Total should update to ₹80.00 with ₹40 base rate');
  console.log('   ✅ Photo Base Rate preset updated total to ₹80.00');

  // Capture final basket screenshot
  const shotPath = path.join(evidenceDir, 'photo-pricing-verified.png');
  await page.screenshot({ path: shotPath });
  console.log(`Saved screenshot: ${shotPath}`);

  // 6. Test Proceed to Checkout
  console.log('7. Testing Proceed to Checkout...');
  const checkoutBtn = page.locator('button:has-text("Proceed to Checkout")');
  await checkoutBtn.click();
  await page.waitForSelector('text=Total payable', { timeout: 5000 });

  const checkoutContent = await page.innerText('body');
  assert.ok(checkoutContent.includes('₹80.00'), 'Checkout screen should reflect final ₹80.00 price');
  console.log('   ✅ Checkout screen loaded with matching ₹80.00 total!');

  console.log('\n========================================');
  console.log('🎉 ALL PHOTO PRICING & EDIT TESTS PASSED!');
  console.log('========================================\n');
} finally {
  await browser.close();
  server.close();
}
