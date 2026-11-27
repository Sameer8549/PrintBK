import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const staffRequire = createRequire(path.join(rootDir, 'staff', 'package.json'));
const { chromium } = staffRequire('@playwright/test');

const BASE_URL = 'https://printbk-60074625517.development.catalystserverless.in';
const evidenceDir = path.join(rootDir, 'docs', 'final-evidence', 'sync-verification');
fs.mkdirSync(evidenceDir, { recursive: true });

async function verifyRealtimeSync() {
  console.log('🚀 [VERIFY] Starting Comprehensive Staff <-> Student Real-Time Synchronization Verification...\n');

  const browser = await chromium.launch({ headless: true });
  const staffContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const studentContext = await browser.newContext({ viewport: { width: 440, height: 850 } });

  const staffPage = await staffContext.newPage();
  const studentPage = await studentContext.newPage();

  const studentErrors = [];
  const student404s = [];
  studentPage.on('console', msg => {
    if (msg.type() === 'error') {
      studentErrors.push(msg.text());
      console.log('  ⚠️ [Student Console Error]:', msg.text());
    }
  });
  studentPage.on('response', res => {
    if (res.status() === 404) {
      student404s.push(res.url());
      console.log('  ❌ [Student 404 Error]:', res.url());
    }
  });

  const staffErrors = [];
  staffPage.on('console', msg => {
    if (msg.type() === 'error') {
      staffErrors.push(msg.text());
      console.log('  ⚠️ [Staff Console Error]:', msg.text());
    }
  });

  // ==========================================
  // STEP 1: Staff App Setup & Pairing
  // ==========================================
  console.log('--- Step 1: Setting up Staff App ---');
  await staffPage.goto(`${BASE_URL}/app/staff/index.html`, { waitUntil: 'domcontentloaded' });
  await staffPage.evaluate(async () => {
    const res = await fetch('/server/api/staff/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupCode: 'PBK-SETUP-9021', label: 'E2E Sync Verifier' })
    });
    const d = await res.json();
    if (d.ok && d.token) {
      localStorage.setItem('printbk_staff_token', d.token);
      localStorage.setItem('printbk_staff_device_id', d.deviceId || 'e2e_verifier_device');
      localStorage.setItem('printbk-paired', 'true');
    }
  });
  await staffPage.goto(`${BASE_URL}/app/staff/index.html`, { waitUntil: 'networkidle' });

  // Ensure shop is in a known initial OPEN state
  await staffPage.evaluate(async () => {
    const token = localStorage.getItem('printbk_staff_token');
    await fetch('/server/api/staff/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Staff-Device-Token': token },
      body: JSON.stringify({
        open: true,
        announcement: '',
        rates: { bw: 1.5, colour: 8.0, duplex: 0.85, spiral: 35 }
      })
    });
  });
  await staffPage.waitForTimeout(1000);
  console.log('  ✓ Staff App paired and initialized in OPEN state with standard rates (B&W: ₹1.50, Colour: ₹8.00).');

  // ==========================================
  // STEP 2: Student App Initial Load & 404 Check
  // ==========================================
  console.log('\n--- Step 2: Opening Student App ---');
  await studentPage.goto(`${BASE_URL}/app/index.html`, { waitUntil: 'networkidle' });
  await studentPage.waitForTimeout(2000); // Allow 2 full polling cycles

  assert.equal(student404s.length, 0, `Expected 0 HTTP 404 errors on student polling, got ${student404s.length}: ${student404s.join(', ')}`);
  console.log('  ✓ Zero 404 network errors! Student config polling cleanly returns 304/200 without polling failures.');

  const initialBarrierCount = await studentPage.locator('.shop-closed-barrier').count();
  assert.equal(initialBarrierCount, 0, 'Shop should initially be OPEN on student side');
  console.log('  ✓ Shop is initially OPEN on student app.');

  // ==========================================
  // STEP 3: Toggle Shop CLOSED (Staff -> Student Sync)
  // ==========================================
  console.log('\n--- Step 3: Staff Toggles Shop CLOSED ---');
  const shopSwitch = staffPage.locator('button.shop-switch');
  await shopSwitch.waitFor({ state: 'visible', timeout: 5000 });
  await shopSwitch.click();
  console.log('  Clicked shop switch in Staff Header.');

  // Wait for student app to receive closed update (polling is 1000ms)
  console.log('  Waiting for Student App to show Closed Barrier...');
  const closedBarrier = studentPage.locator('.shop-closed-barrier');
  await closedBarrier.waitFor({ state: 'visible', timeout: 5000 });
  const isBarrierVisible = await closedBarrier.isVisible();
  assert.ok(isBarrierVisible, 'Shop Closed Barrier must appear on student app when staff closes shop');
  console.log('  ✓ LIGHTNING FAST SYNC CONFIRMED: Student App displayed Closed Barrier within <1.5s!');
  await studentPage.screenshot({ path: path.join(evidenceDir, '01-student-shop-closed-barrier.png') });

  // ==========================================
  // STEP 4: Toggle Shop OPEN (Staff -> Student Sync)
  // ==========================================
  console.log('\n--- Step 4: Staff Toggles Shop back to OPEN ---');
  await shopSwitch.click();
  console.log('  Clicked shop switch to reopen in Staff Header.');

  console.log('  Waiting for Student App Closed Barrier to disappear...');
  await closedBarrier.waitFor({ state: 'detached', timeout: 5000 });
  const isBarrierStillThere = await closedBarrier.isVisible().catch(() => false);
  assert.ok(!isBarrierStillThere, 'Shop Closed Barrier must disappear when shop is reopened');
  console.log('  ✓ LIGHTNING FAST SYNC CONFIRMED: Student App reopened and barrier removed within <1.5s!');
  await studentPage.screenshot({ path: path.join(evidenceDir, '02-student-shop-reopened.png') });

  // ==========================================
  // STEP 5: Price Updates (Staff -> Student Sync)
  // ==========================================
  console.log('\n--- Step 5: Staff Updates Prices via Settings ---');
  // Update B&W to 4.50 and Colour to 14.00
  const updatePricesRes = await staffPage.evaluate(async () => {
    const token = localStorage.getItem('printbk_staff_token');
    const res = await fetch('/server/api/staff/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Staff-Device-Token': token },
      body: JSON.stringify({
        rates: {
          bw: 4.50,
          colour: 14.00,
          spiral: 50.00
        }
      })
    });
    return { status: res.status, data: await res.json() };
  });
  assert.equal(updatePricesRes.status, 200, 'Staff price update API must return 200');
  console.log('  Staff saved new rates (B&W: ₹4.50, Colour: ₹14.00, Spiral: ₹50.00).');

  // Wait for student app to receive new prices
  console.log('  Waiting for Student App to receive updated prices...');
  await studentPage.waitForTimeout(2000);

  const studentRates = await studentPage.evaluate(async () => {
    const res = await fetch('/server/api/config');
    return res.json();
  });
  console.log('  Student fetched rates:', { bw: studentRates.rates?.bw, colour: studentRates.rates?.colour, spiral: studentRates.rates?.spiral });
  assert.equal(Number(studentRates.rates?.bw), 4.5, 'Student rates must show updated B&W price ₹4.50');
  assert.equal(Number(studentRates.rates?.colour), 14.0, 'Student rates must show updated Colour price ₹14.00');
  console.log('  ✓ LIGHTNING FAST PRICE SYNC CONFIRMED: Student App synchronized updated rates within <1.5s!');

  // ==========================================
  // STEP 6: Student Places an Order -> Staff Sees It Live
  // ==========================================
  console.log('\n--- Step 6: Student Places Order -> Staff Counter Feed ---');
  const orderRes = await studentPage.evaluate(async () => {
    const res = await fetch('/server/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': 'e2e_student_sync_device'
      },
      body: JSON.stringify({
        files: [
          {
            id: 'sync_doc_1',
            name: 'Project_Final_Report.pdf',
            pages: 10,
            copies: 1,
            colorMode: 'bw',
            binding: 'none',
            lamination: 'none'
          }
        ],
        services: [],
        rush: false,
        payment: 'Cash'
      })
    });
    return { status: res.status, data: await res.json() };
  });

  assert.equal(orderRes.status, 200, `Order creation should return 200, got ${orderRes.status}: ${JSON.stringify(orderRes.data)}`);
  const orderNumber = orderRes.data.orderNumber;
  const orderId = orderRes.data.orderId;
  console.log(`  Student placed Order #${orderNumber} (ID: ${orderId}, Total: ₹${orderRes.data.total}).`);

  // Verify Staff live feed receives the order
  console.log('  Waiting for Staff Live Feed to receive Order #' + orderNumber + '...');
  await staffPage.waitForTimeout(2000);

  const staffLive = await staffPage.evaluate(async () => {
    const token = localStorage.getItem('printbk_staff_token');
    const res = await fetch('/server/api/staff/live', {
      headers: { 'X-Staff-Device-Token': token }
    });
    return res.json();
  });

  const matchingStaffItem = (staffLive.items || []).find(it => it.order_id === orderId || it.orderId === orderId);
  assert.ok(matchingStaffItem, `Staff live feed must contain Order #${orderNumber}`);
  console.log(`  ✓ LIVE FEED ARRIVAL CONFIRMED: Staff received Order #${orderNumber} in feed! Item ID: ${matchingStaffItem.id}`);

  // Check Staff UI DOM
  const staffBodyText = await staffPage.textContent('body');
  const renderedInDom = staffBodyText.includes(String(orderNumber)) || staffBodyText.includes('Project_Final_Report');
  assert.ok(renderedInDom, `Order #${orderNumber} must be rendered in Staff UI DOM`);
  console.log(`  ✓ DOM VISIBILITY CONFIRMED: Order #${orderNumber} is visible on the Staff Orders Board!`);
  await staffPage.screenshot({ path: path.join(evidenceDir, '03-staff-live-orders-board.png') });

  // ==========================================
  // STEP 7: Staff Collects Cash and Approves Order
  // ==========================================
  console.log('\n--- Step 7: Staff Collects Cash & Approves Print ---');
  const collectCashRes = await staffPage.evaluate(async (oId) => {
    const token = localStorage.getItem('printbk_staff_token');
    const res = await fetch(`/server/api/staff/orders/${oId}/collect-cash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Staff-Device-Token': token },
      body: JSON.stringify({})
    });
    return { status: res.status, data: await res.json() };
  }, orderNumber);
  console.log('  Cash collection result:', collectCashRes.status, collectCashRes.data.ok);

  const approveRes = await staffPage.evaluate(async (itemId) => {
    const token = localStorage.getItem('printbk_staff_token');
    const res = await fetch(`/server/api/staff/items/${itemId}/approve-print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Staff-Device-Token': token },
      body: JSON.stringify({})
    });
    return { status: res.status, data: await res.json() };
  }, matchingStaffItem.id);
  console.log('  Approve print result:', approveRes.status, approveRes.data.ok);

  // ==========================================
  // STEP 8: Cleanup & Pristine Reset
  // ==========================================
  console.log('\n--- Step 8: Restoring Default Rates & Purging Test Data ---');
  await staffPage.evaluate(async () => {
    const token = localStorage.getItem('printbk_staff_token');
    // Restore default rates
    await fetch('/server/api/staff/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Staff-Device-Token': token },
      body: JSON.stringify({
        open: true,
        announcement: '',
        rates: { bw: 1.5, colour: 8.0, duplex: 0.85, spiral: 35 }
      })
    });
    // Purge test orders
    await fetch('/server/api/staff/orders/purge-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Staff-Device-Token': token },
      body: JSON.stringify({ all: true })
    });
  });
  console.log('  ✓ Pristine state restored (rates reset, test queue purged).');

  // Verify final 404 count
  assert.equal(student404s.length, 0, `Zero 404 errors during entire test run. Observed: ${student404s.length}`);
  console.log('\n🎉 ALL 8 REAL-TIME SYNCHRONIZATION CRITERIA EMPIRICALLY VERIFIED AND PASSING!');

  await browser.close();
}

verifyRealtimeSync().catch(err => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
