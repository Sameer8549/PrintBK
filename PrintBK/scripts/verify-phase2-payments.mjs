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

// Unified test server
const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, 'http://localhost:4202');
  const pathname = urlObj.pathname;

  if (pathname.startsWith('/server/api') || pathname.startsWith('/api') || pathname === '/config' || pathname.startsWith('/orders') || pathname.startsWith('/upload')) {
    return apiApp(req, res);
  }

  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(clientDir, 'index.html');
  } else if (pathname === '/staff/' || pathname === '/staff' || pathname === '/staff/index.html') {
    filePath = path.join(clientDir, 'staff/index.html');
  } else if (pathname.startsWith('/staff/')) {
    filePath = path.join(clientDir, pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(clientDir, 'staff', pathname.replace(/^\/staff\//, ''));
    }
  } else {
    filePath = path.join(clientDir, pathname);
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    return res.end(fs.readFileSync(filePath));
  }

  if (pathname.startsWith('/staff')) {
    const staffIndex = path.join(clientDir, 'staff/index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(staffIndex));
  }

  const studentIndex = path.join(clientDir, 'index.html');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  return res.end(fs.readFileSync(studentIndex));
});

async function main() {
  await new Promise(r => server.listen(4202, r));
  console.log('Running Phase 2 (P5, P6) verification on port 4202...');

  const STAFF_TOKEN = 'fafeee08f195644f79d5dc333533fe7f82b226a05b6748b0072d9a6a04644485';

  const browser = await chromium.launch({ headless: true });

  try {
    // ── Test 1: Create a real test order for UPI flow ──
    console.log('[Test 1] Creating test order for UPI flow...');
    const orderRes = await fetch('http://localhost:4202/server/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { name: 'UPI Test Student', phone: '9876543210' },
        files: [{
          id: 'test-doc-1',
          name: 'Assignment.pdf',
          pages: 10,
          settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4' }
        }],
        services: [],
        payment: 'UPI'
      })
    });
    assert.ok(orderRes.status === 200 || orderRes.status === 201, 'Order creation must succeed');
    const orderData = await orderRes.json();
    const testOrderId = orderData.orderId;
    const testOrderToken = orderData.accessToken;
    console.log(`  ✓ Created test order ${testOrderId} (#${orderData.orderNumber})`);

    // ── Test 2: Verify No "I've paid" button in DOM ──
    console.log('[Test 2] Verifying no "I\'ve paid" button exists in DOM...');
    const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const studentPage = await studentContext.newPage();

    // Pre-populate history in localStorage
    await studentPage.goto('http://localhost:4202/#/');
    await studentPage.evaluate(({ id, num, token }) => {
      const history = {
        orders: [{
          id,
          orderNumber: num,
          date: Date.now(),
          files: ['Assignment.pdf'],
          total: 15.0,
          pickupCode: '——',
          status: 'pending_payment',
          payment_status: 'unpaid',
          accessToken: token,
          paymentMethod: 'upi'
        }]
      };
      localStorage.setItem('printbk-history', JSON.stringify(history));
    }, { id: testOrderId, num: orderData.orderNumber, token: testOrderToken });

    await studentPage.goto(`http://localhost:4202/#/pay/${testOrderId}`);
    await studentPage.waitForSelector('text=Total Amount Due');

    const ivePaidLocator = studentPage.locator('button:has-text("I\'ve paid"), button:has-text("I have paid"), button:has-text("I\'ve Paid")');
    const count = await ivePaidLocator.count();
    assert.equal(count, 0, 'No "I\'ve paid" button must exist in the DOM');
    console.log('  ✓ Verified zero "I\'ve paid" elements in DOM');

    // ── Test 3: False return (< 2s) guard ──
    console.log('[Test 3] Testing false return guard (< 2s hidden)...');
    const payUpiButton = studentPage.locator('a:has-text("Pay with UPI")');
    await payUpiButton.click();

    // Simulate being hidden for only 500ms
    await studentPage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await studentPage.waitForTimeout(500);
    await studentPage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await studentPage.waitForTimeout(500);

    // Verify app did NOT redirect to receipt, but showed friendly fallback notice
    const currentUrl = studentPage.url();
    assert.ok(currentUrl.includes('/pay/'), 'Must NOT redirect to receipt on return under 2 seconds');
    const falseReturnNotice = await studentPage.textContent('body');
    assert.match(falseReturnNotice || '', /UPI App Didn't Open/i, 'Must show friendly false return message');
    console.log('  ✓ Verified return under 2s guards against redirect and shows friendly message');

    // ── Test 4: Valid return (>= 2s hidden) -> auto-claim -> redirect to receipt ──
    console.log('[Test 4] Testing valid return (>= 2s hidden)...');
    await payUpiButton.click();

    // Simulate being hidden for 2500ms
    await studentPage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await studentPage.waitForTimeout(2500);
    await studentPage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });

    // Await auto-redirect to /receipt/:id
    console.log('  Waiting for auto-redirect to receipt...');
    await studentPage.waitForURL(new RegExp(`/receipt/${testOrderId}`), { timeout: 8000 });
    console.log('  ✓ Automatically redirected straight to /receipt/:orderId!');

    // Wait for receipt rendering
    await studentPage.waitForSelector('text=Order confirmed');
    const receiptScreenshot = path.join(evidenceDir, 'p5-upi-receipt-order-confirmed.png');
    await studentPage.screenshot({ path: receiptScreenshot, fullPage: true });
    console.log(`  ✓ Saved ${receiptScreenshot}`);

    // Verify receipt contents
    const receiptText = await studentPage.textContent('body');
    assert.match(receiptText || '', /Order confirmed/i, 'Receipt must show "Order confirmed"');
    assert.match(receiptText || '', /Payment: waiting for the shop to verify/i, 'Receipt must show truthful payment line');
    assert.match(receiptText || '', /Pay again/i, 'Receipt must show "Pay again" link');
    assert.match(receiptText || '', /Last 4 digits of UPI ref/i, 'Receipt must show optional 4-digit UPI ref field');

    // ── Test 5: Staff app shows "UPI PAID, VERIFY" immediately ──
    console.log('[Test 5] Verifying staff feed shows "UPI PAID, VERIFY"...');
    const staffContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const staffPage = await staffContext.newPage();
    await staffPage.goto('http://localhost:4202/staff/');
    await staffPage.evaluate((token) => {
      localStorage.setItem('printbk-paired', 'true');
      localStorage.setItem('printbk_staff_paired', 'true');
      localStorage.setItem('printbk_staff_device_id', 'staff_master_pc');
      localStorage.setItem('printbk_staff_token', token);
      localStorage.setItem('printbk_include_test', 'true');
    }, STAFF_TOKEN);
    await staffPage.reload();
    await staffPage.waitForTimeout(1500);

    const staffText = await staffPage.textContent('body');
    assert.match(staffText || '', /UPI PAID, VERIFY/i, 'Staff feed must display UPI PAID, VERIFY');
    const staffScreenshot = path.join(evidenceDir, 'p5-staff-upi-verify.png');
    await staffPage.screenshot({ path: staffScreenshot, fullPage: true });
    console.log(`  ✓ Saved ${staffScreenshot}`);

    // ── Test 6: Reload receipt persists verified truth ──
    console.log('[Test 6] Reloading receipt...');
    await studentPage.reload();
    await studentPage.waitForSelector('text=Order confirmed');
    const reloadedText = await studentPage.textContent('body');
    assert.match(reloadedText || '', /Order confirmed/i, 'Reloaded receipt must still show Order confirmed');
    assert.match(reloadedText || '', /Payment: waiting for the shop to verify/i, 'Reloaded receipt retains payment status');
    console.log('  ✓ Receipt reload verified');

    // ── Test 7: Student History payment chips for all states (P6) ──
    console.log('[Test 7] Verifying Student History at 390px across all payment statuses...');
    const historyOrders = [
      {
        id: 'test-cash-due',
        orderNumber: 1081,
        date: Date.now() - 3600000,
        files: ['Lab_Manual.pdf'],
        total: 86.0,
        pickupCode: '——',
        status: 'pending_cash',
        payment_status: 'cash_due',
        paymentMethod: 'cash'
      },
      {
        id: 'test-cash-collected',
        orderNumber: 1082,
        date: Date.now() - 3000000,
        files: ['Project_Code.pdf'],
        total: 45.0,
        pickupCode: '1082',
        status: 'ready',
        payment_status: 'cash_collected',
        paymentMethod: 'cash'
      },
      {
        id: 'test-upi-claimed',
        orderNumber: 1083,
        date: Date.now() - 2400000,
        files: ['Notes_Unit_3.pdf'],
        total: 20.0,
        pickupCode: '——',
        status: 'upi_claimed',
        payment_status: 'upi_claimed',
        paymentMethod: 'upi'
      },
      {
        id: 'test-paid-verified',
        orderNumber: 1084,
        date: Date.now() - 1800000,
        files: ['Thesis_Draft.pdf'],
        total: 120.0,
        pickupCode: '1084',
        status: 'printing',
        payment_status: 'paid_verified',
        paymentMethod: 'upi'
      },
      {
        id: 'test-not-paid-cancelled',
        orderNumber: 1085,
        date: Date.now() - 1200000,
        files: ['Old_Syllabus.pdf'],
        total: 15.0,
        pickupCode: '——',
        status: 'cancelled',
        payment_status: 'not_paid',
        paymentMethod: 'upi'
      }
    ];

    const historyContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const historyPage = await historyContext.newPage();
    await historyPage.goto('http://localhost:4202/#/');
    await historyPage.evaluate((ords) => {
      localStorage.setItem('printbk-history-v1', JSON.stringify({ state: { orders: ords }, version: 0 }));
    }, historyOrders);
    await historyPage.reload();
    await historyPage.goto('http://localhost:4202/#/history');
    await historyPage.waitForSelector('text=Recent Orders');
    await historyPage.waitForTimeout(1000);

    const historyScreenshot = path.join(evidenceDir, 'p6-history-payment-labels-390px.png');
    await historyPage.screenshot({ path: historyScreenshot, fullPage: true });
    console.log(`  ✓ Saved ${historyScreenshot}`);

    const historyText = await historyPage.textContent('body');
    assert.match(historyText || '', /Pay ₹86\.00 at the counter/i, 'Must display "Pay ₹86.00 at the counter"');
    assert.match(historyText || '', /Paid in cash/i, 'Must display "Paid in cash"');
    assert.match(historyText || '', /UPI payment waiting for the shop to verify/i, 'Must display "UPI payment waiting for the shop to verify"');
    assert.match(historyText || '', /Payment verified/i, 'Must display "Payment verified"');
    assert.match(historyText || '', /Not paid \(cancelled\)/i, 'Must display "Not paid (cancelled)"');
    assert.doesNotMatch(historyText || '', /payment not received yet/i, 'Must NEVER display "payment not received yet"');

    console.log('\n🎉 Phase 2 (P5, P6) Playwright verification PASSED with empirical proof!');
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
}

main().catch(err => {
  console.error('❌ Phase 2 verification failed:', err);
  process.exit(1);
});
