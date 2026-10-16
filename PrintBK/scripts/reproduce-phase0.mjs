import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('../staff/node_modules/@playwright/test');
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('docs/fix-evidence/before');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const env = fs.readFileSync('functions/api/.env', 'utf8');
let setupCode = '';
for (const line of env.split(/\r?\n/)) {
  if (line.startsWith('STAFF_SETUP_CODE=')) {
    setupCode = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  }
}

const liveBase = 'https://printbk-60074625517.development.catalystserverless.in';

async function getStaffToken() {
  const res = await fetch(`${liveBase}/server/api/staff/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupCode, label: 'Playwright Evidence Capture' })
  });
  const data = await res.json();
  return data.token;
}

async function run() {
  console.log('Pairing staff device to obtain fresh token...');
  const staffToken = await getStaffToken();
  console.log('Obtained token:', !!staffToken);

  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: '1920x1080', width: 1920, height: 1080 },
    { name: '1440x900', width: 1440, height: 900 },
    { name: '1024x768', width: 1024, height: 768 },
    { name: '390x844', width: 390, height: 844 }
  ];

  for (const vp of viewports) {
    console.log(`Capturing staff app at ${vp.name}...`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }
    });
    const page = await context.newPage();

    // Inject staff token
    await page.goto(`${liveBase}/app/staff/index.html`);
    await page.evaluate((tok) => {
      localStorage.setItem('printbk_staff_token', tok);
      localStorage.setItem('printbk-paired', 'true');
    }, staffToken);
    await page.goto(`${liveBase}/app/staff/index.html`);
    await page.waitForTimeout(2000);

    // 1. Live Orders Screen
    await page.screenshot({ path: path.join(outDir, `p5-staff-orders-${vp.name}.png`), fullPage: false });

    // 2. History Screen
    const historyBtn = page.locator('text=ORDERS HISTORY, text=Order History, text=HISTORY').first();
    if (await historyBtn.isVisible()) {
      await historyBtn.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(outDir, `p1-staff-history-${vp.name}.png`), fullPage: false });
    }

    // 3. Settings Screen (at 1920)
    if (vp.name === '1920x1080') {
      const liveBtn = page.locator('text=← BACK TO LIVE ORDERS').first();
      if (await liveBtn.isVisible()) await liveBtn.click();
      await page.waitForTimeout(500);

      const settingsBtn = page.locator('button[aria-label="Settings"], .quick-action-btn:has-text("SETTINGS"), button:has-text("SETTINGS")').first();
      if (await settingsBtn.isVisible()) {
        await settingsBtn.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(outDir, `p6-staff-settings-${vp.name}.png`), fullPage: false });

        // Open QR poster
        const printQrBtn = page.locator('button:has-text("PRINT YOUR QR")').first();
        if (await printQrBtn.isVisible()) {
          await printQrBtn.click();
          await page.waitForTimeout(1000);
          await page.screenshot({ path: path.join(outDir, `p4-staff-qr-modal-${vp.name}.png`), fullPage: false });
        }
      }
    }

    await context.close();
  }

  // Capture Student App
  console.log('Capturing student app...');
  const studentContext = await browser.newContext({
    viewport: { width: 390, height: 844 }
  });
  const studentPage = await studentContext.newPage();

  // 1. Entry Screen
  await studentPage.goto(`${liveBase}/app/index.html`);
  await studentPage.waitForTimeout(1500);
  await studentPage.screenshot({ path: path.join(outDir, 'p2-student-entry-390x844.png') });

  // 2. Settings Screen (showing plain icons)
  const studentSettingsBtn = studentPage.locator('button[aria-label="Settings"]').first();
  if (await studentSettingsBtn.isVisible()) {
    await studentSettingsBtn.click();
    await studentPage.waitForTimeout(1000);
    await studentPage.screenshot({ path: path.join(outDir, 'p8-student-settings-plain-icons-390x844.png') });
  }

  // 3. History Screen
  const backBtn = studentPage.locator('button[aria-label="Back"], .topbar-back').first();
  if (await backBtn.isVisible()) await backBtn.click();
  await studentPage.waitForTimeout(500);

  const studentHistoryBtn = studentPage.locator('button[aria-label="Order history"]').first();
  if (await studentHistoryBtn.isVisible()) {
    await studentHistoryBtn.click();
    await studentPage.waitForTimeout(1000);
    await studentPage.screenshot({ path: path.join(outDir, 'p1-student-history-390x844.png') });
  }

  await studentContext.close();
  await browser.close();
  console.log('Reproductions captured in docs/fix-evidence/before/');
}

run().catch((err) => {
  console.error('Reproduction failed:', err);
  process.exit(1);
});
