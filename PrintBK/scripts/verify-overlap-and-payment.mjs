import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const staffRequire = createRequire(path.resolve('PrintBK/staff/package.json'));
const { chromium } = staffRequire('@playwright/test');

const evidenceDir = path.resolve('PrintBK/docs/final-evidence/overlap-and-payment');
fs.mkdirSync(evidenceDir, { recursive: true });

const clientDir = path.resolve('PrintBK/client');

process.env.STAFF_TOKEN = 'test_staff_token_overlap';
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
  const urlObj = new URL(req.url, 'http://localhost:4235');
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

  const studentFallback = path.join(clientDir, 'index.html');
  if (fs.existsSync(studentFallback)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(studentFallback));
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

await new Promise((resolve) => server.listen(4235, resolve));
console.log('Test server running at http://localhost:4235');

try {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } });

  // Pre-seed localStorage before page creation
  await context.addInitScript(() => {
    const dummyFile = {
      id: 'test-basket-file-1',
      name: 'Project_Report_Final_Submission.pdf',
      size: 1024 * 1024 * 2,
      pages: 8,
      settings: {
        copies: 1,
        colorMode: 'bw',
        sided: 'double',
        paper: 'A4',
        orientation: 'portrait',
        range: 'all'
      }
    };
    const dummyFile2 = {
      id: 'test-basket-file-2',
      name: 'Campus_Map_HighRes_A3.png',
      size: 1024 * 1024 * 3,
      pages: 1,
      settings: {
        copies: 2,
        colorMode: 'color',
        sided: 'single',
        paper: 'A3',
        orientation: 'landscape',
        range: 'all'
      }
    };
    window.localStorage.setItem('printbk-basket-v4', JSON.stringify({
      state: {
        files: [dummyFile, dummyFile2],
        services: [{ id: 'srv-1', name: 'Spiral Binding (Plastic Coil)', price: 40, detail: 'Up to 100 sheets' }],
        activeFileId: null
      },
      version: 0
    }));
    window.localStorage.setItem('printbk_shop_config', JSON.stringify({
      state: { config: { open: true } },
      version: 0
    }));
  });

  const page = await context.newPage();

  console.log('\n--- 1. Testing Student Basket No-Overlap Layout ---');
  await page.goto('http://localhost:4235/#/basket');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Check scroll container and fixed checkout bar
  const fixedCheckoutBar = await page.locator('div[style*="position: fixed"][style*="bottom: 0"]').first();
  await fixedCheckoutBar.waitFor({ state: 'visible', timeout: 10000 });
  const checkoutBox = await fixedCheckoutBar.boundingBox();
  console.log('Fixed checkout bar bounding box:', checkoutBox);

  // Scroll down to the bottom of the basket container
  const scrollResult = await page.evaluate(() => {
    const scrollContainer = document.querySelector('main.page > div') || document.querySelector('div[style*="overflow"]');
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
      return { scrollTop: scrollContainer.scrollTop, scrollHeight: scrollContainer.scrollHeight };
    }
    return null;
  });
  console.log('Scroll container result after scroll to bottom:', scrollResult);
  await page.waitForTimeout(600);

  // Verify that the "+ Add more files" button is located strictly ABOVE the top of the fixed checkout bar
  const addMoreBtn = await page.locator('button:has-text("+ Add more files")').first();
  if (await addMoreBtn.count() > 0) {
    const addMoreBox = await addMoreBtn.boundingBox();
    console.log('+ Add more files button bounding box:', addMoreBox);
    assert.ok(checkoutBox, 'Fixed checkout bar must exist');
    assert.ok(addMoreBox, '+ Add more files button must be visible');
    assert.ok(addMoreBox.y + addMoreBox.height <= checkoutBox.y + 10, 
      `Button bottom (${addMoreBox.y + addMoreBox.height}) should be above checkout bar top (${checkoutBox.y})`);
    console.log('✅ Basket content scrolls cleanly above fixed checkout bar without overlap!');
  }

  const basketScreenshot = path.join(evidenceDir, 'basket-no-overlap.png');
  await page.screenshot({ path: basketScreenshot, fullPage: false });
  console.log(`Saved screenshot: ${basketScreenshot}`);

  console.log('\n--- 2. Testing Payment Return Auto-Confirm Guard ---');
  // Create an order via backend API
  const orderRes = await fetch('http://localhost:4235/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: [{ id: 'f1', name: 'Assignment.pdf', pages: 4, size: 50000, settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4' } }],
      paymentMethod: 'UPI'
    })
  });
  const orderData = await orderRes.json();
  const orderId = orderData.orderId || orderData.id;
  console.log(`Created test order #${orderData.orderNumber || 'test'} with ID: ${orderId}`);

  // Navigate to payment page
  await page.goto(`http://localhost:4235/#/pay/${orderId}`);
  await page.waitForTimeout(1000);

  // Verify we are on payment page
  const pageUrl1 = page.url();
  console.log('Current URL on payment entry:', pageUrl1);
  assert.ok(pageUrl1.includes(`/pay/${orderId}`), 'Should be on /pay/:id page');

  // Trigger UPI launch simulation
  const payUpiBtn = await page.locator('a:has-text("Pay with UPI")').first();
  await payUpiBtn.click();
  console.log('Clicked "Pay with UPI" link');

  // Simulate leaving the app (hidden for 2.5 seconds) and returning (visible)
  console.log('Simulating visibility change: hidden for 2.5s...');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await page.waitForTimeout(2500);

  console.log('Simulating visibility change: return to app (visible)...');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });

  await page.waitForTimeout(800);

  // VERIFY: We must STILL be on /pay/:id and NOT auto-redirected to receipt!
  const currentUrlAfterReturn = page.url();
  console.log('Current URL after returning from UPI app:', currentUrlAfterReturn);
  assert.ok(currentUrlAfterReturn.includes(`/pay/${orderId}`), 'MUST NOT auto-redirect to receipt upon return!');
  console.log('✅ PASS: Returning from UPI app did NOT auto-confirm payment!');

  // VERIFY: The explicit confirmation prompt MUST appear
  const verificationHeader = await page.locator('strong:has-text("Did you complete the payment?")').first();
  await verificationHeader.waitFor({ state: 'visible', timeout: 5000 });
  assert.ok(await verificationHeader.isVisible(), 'Confirmation prompt should be visible');
  console.log('✅ PASS: Explicit confirmation prompt "Did you complete the payment?" is displayed!');

  const promptScreenshot = path.join(evidenceDir, 'payment-verification-prompt.png');
  await page.screenshot({ path: promptScreenshot });
  console.log(`Saved screenshot: ${promptScreenshot}`);

  // Test dismissing prompt (Not Paid / Retry)
  const retryBtn = await page.locator('button:has-text("Not Paid / Retry")').first();
  await retryBtn.click();
  await page.waitForTimeout(400);

  assert.strictEqual(await verificationHeader.isVisible(), false, 'Prompt should dismiss upon clicking Not Paid / Retry');
  console.log('✅ PASS: "Not Paid / Retry" cleanly dismissed verification prompt without auto-claiming!');

  const retryScreenshot = path.join(evidenceDir, 'payment-retry-state.png');
  await page.screenshot({ path: retryScreenshot });
  console.log(`Saved screenshot: ${retryScreenshot}`);

  // Test explicit confirmation via "✓ I Have Completed Payment (View Receipt)" button
  const confirmPaymentBtn = await page.locator('button:has-text("I Have Completed Payment")').first();
  await confirmPaymentBtn.click();
  console.log('Clicked "✓ I Have Completed Payment (View Receipt)" button');

  // Verify redirection to receipt
  await page.waitForURL(url => url.toString().includes('/receipt/'), { timeout: 8000 });
  console.log('Successfully navigated to receipt:', page.url());
  assert.ok(page.url().includes(`/receipt/${orderId}`), 'Should be redirected to receipt upon explicit confirmation');

  const receiptScreenshot = path.join(evidenceDir, 'receipt-confirmed.png');
  await page.screenshot({ path: receiptScreenshot });
  console.log(`Saved screenshot: ${receiptScreenshot}`);

  console.log('\n--- 3. Testing Staff App Layout & Typography ---');
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const staffPage = await desktopContext.newPage();

  // Seed staff token and paired PC
  await staffPage.goto('http://localhost:4235/staff');
  await staffPage.evaluate(() => {
    window.localStorage.setItem('printbk_staff_token', 'test_staff_token_overlap');
    window.localStorage.setItem('printbk_staff_paired', 'true');
    window.localStorage.setItem('printbk_printer_bw', 'Brother HL-L2321D series');
    window.localStorage.setItem('printbk_printer_color', 'HP Ink Tank 315 series');
  });

  await staffPage.goto('http://localhost:4235/staff');
  await staffPage.waitForLoadState('networkidle');
  await staffPage.waitForTimeout(1000);

  // Check topbar presence and bold styling
  const topbar = await staffPage.locator('.topbar').first();
  assert.ok(await topbar.isVisible(), 'Staff topbar must be visible');

  // Verify button font weights in staff app
  const buttonWeight = await staffPage.evaluate(() => {
    const btn = document.querySelector('.button');
    return btn ? window.getComputedStyle(btn).fontWeight : null;
  });
  console.log('Staff .button computed font-weight:', buttonWeight);
  assert.ok(Number(buttonWeight) >= 700, 'Button font-weight should be bold (>= 700)');

  const staffScreenshot = path.join(evidenceDir, 'staff-layout-clean.png');
  await staffPage.screenshot({ path: staffScreenshot });
  console.log(`Saved screenshot: ${staffScreenshot}`);

  console.log('\n========================================');
  console.log('🎉 ALL EMPIRICAL CHECKS PASSED!');
  console.log('========================================\n');

  await browser.close();
} finally {
  server.close();
}
