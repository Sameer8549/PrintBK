import dns from 'node:dns';
try { dns.setDefaultResultOrder('ipv4first'); } catch (_) {}

import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const staffRequire = createRequire(path.join(rootDir, 'PrintBK', 'staff', 'package.json'));
const { chromium } = staffRequire('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'https://printbk-60074625517.development.catalystserverless.in';
const APP_URL = `${BASE_URL}/app/index.html`;
const SETUP_CODE = 'PBK-SETUP-9021';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ [PASS] ${message}`);
}

async function safeFetch(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

async function runOpenSourceUpiGatewayE2E() {
  console.log('========================================================================');
  console.log('💳 PRINTBK OPEN-SOURCE UPI GATEWAY END-TO-END VERIFICATION');
  console.log(`   Base: ${BASE_URL}`);
  console.log(`   App:  ${APP_URL}`);
  console.log('========================================================================\n');

  // --- PART 1: API & STATE MACHINE PROTOCOL VERIFICATION ---
  console.log('--- PART 1: NPCI UPI Protocol & Gateway Verification ---');

  // 1. Staff Pairing
  const pairRes = await safeFetch(`${BASE_URL}/server/api/staff/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupCode: SETUP_CODE, label: 'OpenSource UPI Verifier' })
  }).then(r => r.json());
  assert(pairRes.ok === true && !!pairRes.deviceToken, `Staff device paired (ID: ${pairRes.deviceId})`);
  const staffToken = pairRes.deviceToken;

  // 2. Create Order
  const orderRes = await safeFetch(`${BASE_URL}/server/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      is_test: true,
      files: [{
        id: 'upi-open-gateway-doc',
        name: 'Open_Source_UPI_Spec.pdf',
        pages: 3,
        colorPages: 0,
        settings: { copies: 1, paper: 'A4', sided: 'single', colorMode: 'bw' }
      }],
      payment: 'upi'
    })
  }).then(r => r.json());

  assert(!!orderRes.orderId && !!orderRes.accessToken, `Created test order #${orderRes.orderNumber} for UPI`);
  const orderId = orderRes.orderId;
  const token = orderRes.accessToken;

  // 3. Initiate Open Source UPI Gateway
  const upiStart = await safeFetch(`${BASE_URL}/server/api/orders/${orderId}/start-upi`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Order-Token': token
    }
  }).then(r => r.json());

  assert(upiStart.ok === true && upiStart.status === 'upi_started', 'UPI flow initiated; status is upi_started');
  assert(upiStart.upiId === 'Q098686787@ybl', `Verified merchant UPI ID is Q098686787@ybl (got: ${upiStart.upiId})`);
  assert(upiStart.amount > 0, `Amount verified: ₹${upiStart.amount}`);
  assert(upiStart.intentUrl.startsWith('upi://pay?'), 'Canonical NPCI URI starts with upi://pay?');
  assert(upiStart.intentUrl.includes('pa=Q098686787%40ybl') || upiStart.intentUrl.includes('pa=Q098686787@ybl'), 'NPCI URI encodes correct payee VPA');
  assert(upiStart.intentUrl.includes('cu=INR'), 'NPCI URI currency is INR');
  assert(!upiStart.intentUrl.includes('tr='), 'NPCI URI intentionally omits risk-blocking tr parameter');
  assert(!!upiStart.tr, 'Backend retains unique transaction reference tr for internal reconciliation');

  // Verify app-specific links
  assert(!!upiStart.gpayAndroid && !!upiStart.phonepeAndroid && !!upiStart.paytmAndroid && !!upiStart.bhimAndroid, 'Direct app intent URIs generated for GPay, PhonePe, Paytm, BHIM');

  // Verify pickup code is masked
  const preClaimView = await safeFetch(`${BASE_URL}/server/api/orders/${orderId}`, {
    headers: { 'X-Order-Token': token }
  }).then(r => r.json());
  assert(!preClaimView.pickupCode || preClaimView.pickupCode === '——', 'Pickup code hidden while payment is pending');

  // 4. Student confirms payment with 12-digit UTR
  const testUtr = '431802938102';
  const claimRes = await safeFetch(`${BASE_URL}/server/api/orders/${orderId}/upi-return`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Order-Token': token
    },
    body: JSON.stringify({ utr: testUtr })
  }).then(r => r.json());

  assert(claimRes.ok === true && claimRes.status === 'upi_claimed', 'Order claimed with 12-digit UTR; status upi_claimed');

  // 5. Counter Live Feed displays UPI claimed order with UTR
  const liveRes = await safeFetch(`${BASE_URL}/server/api/staff/live?include_test=true`, {
    headers: { 'X-Staff-Device-Token': staffToken }
  }).then(r => r.json());

  const queueItem = liveRes.items?.find(it => it.order_id === orderId || it.order_number === orderRes.orderNumber);
  assert(queueItem !== undefined, 'Claimed UPI order found in counter queue');
  assert(queueItem.payment_status === 'upi_claimed', 'Queue item reflects upi_claimed payment status');

  // 6. Counter Approves and Dispatches Print
  const approveRes = await safeFetch(`${BASE_URL}/server/api/staff/items/${queueItem.id}/approve-print`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': staffToken
    },
    body: JSON.stringify({ orderId })
  }).then(r => r.json());
  assert(approveRes.ok === true, 'Counter successfully approved UPI payment with HTTP 200');

  // 7. Student Digital Ticket reveals pickup code
  const approvedView = await safeFetch(`${BASE_URL}/server/api/orders/${orderId}`, {
    headers: { 'X-Order-Token': token }
  }).then(r => r.json());
  assert(approvedView.status === 'processing' || approvedView.status === 'ready' || approvedView.status === 'printing', `Status moved to ${approvedView.status}`);
  assert(!!approvedView.pickupCode && approvedView.pickupCode !== '——', `Pickup code revealed to student: ${approvedView.pickupCode}`);

  console.log('\n--- PART 2: Browser UI End-to-End Test (Playwright) ---');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--host-resolver-rules=MAP printbk-60074625517.development.catalystserverless.in 169.148.148.93, MAP printbk-60074625517.catalystserverless.in 169.148.148.93'
    ]
  });

  const page = await browser.newPage({
    viewport: { width: 412, height: 915 } // Standard mobile viewport
  });

  page.on('response', res => {
    if (res.status() >= 400 && !res.url().includes('robots.txt') && !res.url().includes('favicon')) {
      console.warn(`  [HTTP ${res.status()}]: ${res.url()}`);
    }
  });

  // Navigate to student web app
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    if (window.indexedDB) indexedDB.deleteDatabase('keyval-store');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  // Add document to basket
  console.log('  ➕ Adding document to student basket...');
  const samplePdfBytes = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n193\n%%EOF';

  await page.evaluate((pdfStr) => {
    const pdfBlob = new Blob([pdfStr], { type: 'application/pdf' });
    const f1 = new File([pdfBlob], 'Lab_Experiment_01.pdf', { type: 'application/pdf' });
    const dt = new DataTransfer();
    dt.items.add(f1);
    const dropZone = document.querySelector('.drop-zone');
    if (dropZone) {
      dropZone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }
  }, samplePdfBytes);

  await page.waitForTimeout(1500);

  // Click Checkout
  console.log('  🛒 Clicking Proceed to Checkout...');
  const checkoutBtn = await page.waitForSelector('button:has-text("Checkout"), button:has-text("Proceed to Checkout")');
  await checkoutBtn.click();
  await page.waitForTimeout(1000);

  // Verify UPI selected and click Pay via UPI
  console.log('  🚀 Selecting UPI and navigating to Open-Source UPI Gateway screen...');
  const payUpiBtn = await page.waitForSelector('button:has-text("via UPI")');
  await payUpiBtn.click();
  await page.waitForTimeout(2000);

  // Verify UPI Screen elements
  await page.waitForSelector('text=TOTAL AMOUNT DUE', { timeout: 10000 });
  console.log('  ✅ Open-Source UPI Gateway screen loaded!');

  const gatewayUiCheck = await page.evaluate(() => {
    const text = document.body.innerText;
    const hasVpa = text.includes('Q098686787@ybl');
    const hasScanTab = text.includes('Scan QR Code');
    const hasAppTab = text.includes('Pay via UPI App');
    const hasUtrField = !!document.querySelector('input[placeholder*="431802938102"], input[placeholder*="430123456789"]');
    const hasConfirmBtn = Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('I Have Paid'));
    return { hasVpa, hasScanTab, hasAppTab, hasUtrField, hasConfirmBtn };
  });

  assert(gatewayUiCheck.hasVpa, 'Merchant VPA Q098686787@ybl visible in UI');
  assert(gatewayUiCheck.hasScanTab && gatewayUiCheck.hasAppTab, 'Dual-mode tabs ("Scan QR Code" & "Pay via UPI App") present');
  assert(gatewayUiCheck.hasUtrField, '12-digit UTR input field is present');
  assert(gatewayUiCheck.hasConfirmBtn, '"✓ I Have Paid" confirmation button is present');

  // Test switching to "Scan QR Code" tab
  console.log('  📷 Switching to "Scan QR Code" tab...');
  const qrTabBtn = await page.waitForSelector('button:has-text("Scan QR Code")');
  await qrTabBtn.click();
  await page.waitForTimeout(800);

  const qrRendered = await page.evaluate(() => {
    const img = document.querySelector('img[alt*="UPI Payment QR Code"]');
    return !!img && img.offsetWidth > 100;
  });
  assert(qrRendered, 'High-contrast QR Code rendered and visible in UI');

  // Enter 12-digit UTR and Submit
  console.log('  ✍️ Entering 12-digit UTR in confirmation input...');
  const utrInput = await page.waitForSelector('input[placeholder*="431802938102"], input[placeholder*="430123456789"]');
  await utrInput.fill('431802938102');
  await page.waitForTimeout(300);

  console.log('  👆 Submitting confirmation: clicking "✓ I Have Paid (Open My Receipt)"...');
  const confirmBtn = await page.waitForSelector('button:has-text("I Have Paid")');
  await confirmBtn.click();
  await page.waitForTimeout(2500);

  // Verify transition to confirmed receipt
  await page.waitForSelector('text=ORDER CONFIRMED', { timeout: 10000 });
  console.log('  ✅ Seamlessly transitioned to Confirmed Receipt ticket!');

  const receiptCheck = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      confirmed: t.includes('ORDER CONFIRMED'),
      waitingVerification: t.includes('waiting for the shop to verify') || t.includes('UPI Payment Claimed')
    };
  });
  assert(receiptCheck.confirmed, 'Student confirmed receipt ticket is displayed');

  // Screenshot proof
  const screenshotPath = path.join(rootDir, 'docs', 'final-evidence', 'production', 'upi-open-gateway-verified.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`  📸 Verification screenshot captured: ${screenshotPath}`);

  await browser.close();

  console.log('\n========================================================================');
  console.log('🎉 OPEN-SOURCE UPI GATEWAY E2E VERIFICATION COMPLETED WITH 100% SUCCESS!');
  console.log('   UPI ID: Q098686787@ybl | Dual-Mode Tabs | 12-Digit UTR | Live Sync Verified');
  console.log('========================================================================\n');
}

runOpenSourceUpiGatewayE2E().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
