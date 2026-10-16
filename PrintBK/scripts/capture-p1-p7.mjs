import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('../staff/node_modules/@playwright/test');
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('docs/fix-evidence/before');
const liveBase = 'https://printbk-60074625517.development.catalystserverless.in';

const env = fs.readFileSync('functions/api/.env', 'utf8');
let setupCode = '';
for (const line of env.split(/\r?\n/)) {
  if (line.startsWith('STAFF_SETUP_CODE=')) {
    setupCode = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  }
}

async function run() {
  const pairRes = await fetch(liveBase + '/server/api/staff/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupCode, label: 'History Screenshot' })
  });
  const { token } = await pairRes.json();

  const browser = await chromium.launch({ headless: true });
  const staffContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const staffPage = await staffContext.newPage();
  await staffPage.goto(liveBase + '/app/staff/index.html');
  await staffPage.evaluate((tok) => {
    localStorage.setItem('printbk_staff_token', tok);
    localStorage.setItem('printbk-paired', 'true');
  }, token);

  // Navigate to history by clicking the header button or navigating
  await staffPage.goto(liveBase + '/app/staff/index.html');
  await staffPage.waitForTimeout(2000);

  // Click Orders History
  const historyBtn = staffPage.locator('text=ORDERS HISTORY').first();
  if (await historyBtn.isVisible()) {
    await historyBtn.click();
  } else {
    // Try via TodayView
    const todayBtn = staffPage.locator('.quick-action-btn:has-text("TODAY"), button:has-text("TODAY")').first();
    if (await todayBtn.isVisible()) {
      await todayBtn.click();
      await staffPage.waitForTimeout(500);
      const hBtn = staffPage.locator('text=ORDERS HISTORY').first();
      if (await hBtn.isVisible()) await hBtn.click();
    }
  }
  await staffPage.waitForTimeout(2000);
  await staffPage.screenshot({ path: path.join(outDir, 'p1-staff-history-table-1440x900.png') });
  await staffContext.close();

  // Now create an order via student API to reach the UPI payment screen
  console.log('Creating order to reach payment screen...');
  const orderRes = await fetch(liveBase + '/server/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: [{
        id: 'test-file-1',
        name: 'Phase0_Evidence.pdf',
        size: 1024,
        type: 'pdf',
        pages: 1,
        colorPages: 0,
        colorDetection: 'completed',
        settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4', orientation: 'portrait', range: 'all' }
      }],
      services: [],
      payment: 'upi'
    })
  });
  const orderData = await orderRes.json();
  console.log('Order created:', orderData.orderId, orderData.orderNumber);

  if (orderData.orderId) {
    const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const studentPage = await studentContext.newPage();
    // In router.tsx: /pay/:id
    await studentPage.goto(liveBase + '/app/index.html#/pay/' + orderData.orderId);
    await studentPage.waitForTimeout(2500);
    await studentPage.screenshot({ path: path.join(outDir, 'p7-student-upi-premature-button-390x844.png') });
    await studentContext.close();
  }

  await browser.close();
  console.log('P1 and P7 evidence captured');
}
run();
