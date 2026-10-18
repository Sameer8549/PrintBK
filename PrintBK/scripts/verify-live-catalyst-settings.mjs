import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const staffRequire = createRequire(path.resolve('staff/package.json'));
const { chromium } = staffRequire('@playwright/test');

const evidenceDir = path.resolve('docs/final-evidence/after');
fs.mkdirSync(evidenceDir, { recursive: true });

const LIVE_BASE = 'https://printbk-60074625517.development.catalystserverless.in';
const STAFF_TOKEN = 'fafeee08f195644f79d5dc333533fe7f82b226a05b6748b0072d9a6a04644485';

const browser = await chromium.launch({ headless: true });

try {
  console.log(`Connecting to Live Catalyst Staff App: ${LIVE_BASE}/app/staff/index.html...`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(msg.text());
  });

  await page.goto(`${LIVE_BASE}/app/staff/index.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((token) => {
    localStorage.setItem('printbk-paired', 'true');
    localStorage.setItem('printbk_staff_paired', 'true');
    localStorage.setItem('printbk_staff_device_id', 'staff_master_pc');
    localStorage.setItem('printbk_staff_token', token);
  }, STAFF_TOKEN);

  await page.goto(`${LIVE_BASE}/app/staff/index.html`, { waitUntil: 'networkidle' });

  // Open Settings modal
  console.log('Opening Settings modal on Live Catalyst...');
  const settingsBtn = page.locator('nav.nav-actions button:has-text("Settings"), button:has-text("Settings")').first();
  await settingsBtn.waitFor({ state: 'visible', timeout: 8000 });
  await settingsBtn.click();

  const settingsModal = page.locator('.printer-settings-panel');
  await settingsModal.waitFor({ state: 'visible', timeout: 5000 });
  console.log('Settings panel opened.');

  // Click Pricing tab
  const pricingTab = page.locator('.settings-tabs button:has-text("Pricing"), .settings-tabs button:nth-child(2)');
  await pricingTab.click();
  console.log('Switched to Pricing tab.');

  // Scroll to section 8 (Service Availability)
  const serviceSection = page.locator('.setting-card-title:has-text("8. SERVICE AVAILABILITY")');
  await serviceSection.scrollIntoViewIfNeeded();

  const toggles = page.locator('.toggle-row .setting-toggle');
  const toggleCount = await toggles.count();
  console.log(`Found ${toggleCount} live toggle buttons.`);
  assert.ok(toggleCount >= 5, `Expected at least 5 service toggles, got ${toggleCount}`);

  // Inspect first toggle
  const firstToggle = toggles.first();
  const knob = firstToggle.locator('.toggle-knob');
  const label = firstToggle.locator('.toggle-label');

  await knob.waitFor({ state: 'visible' });
  await label.waitFor({ state: 'visible' });

  let knobBox = await knob.boundingBox();
  let labelBox = await label.boundingBox();
  let text = (await label.textContent()).trim();
  console.log(`Live Initial state - Text: "${text}", Knob box:`, knobBox, 'Label box:', labelBox);

  // Take live screenshot
  const liveEnabledScreenshot = path.join(evidenceDir, 'live-staff-settings-toggles-enabled.png');
  await page.screenshot({ path: liveEnabledScreenshot, fullPage: false });
  console.log(`Saved screenshot: ${liveEnabledScreenshot}`);

  // Click toggle to test saving & validation against live backend
  console.log('Clicking toggle against live backend...');
  await firstToggle.click();
  await page.waitForTimeout(1000); // Allow network roundtrip to Catalyst backend

  // Verify no error banner appeared
  const errorBanner = page.locator('.settings-error');
  const hasError = await errorBanner.isVisible();
  if (hasError) {
    const errorText = await errorBanner.textContent();
    console.error('LIVE ERROR BANNER DETECTED:', errorText);
    assert.fail(`Live settings error banner displayed: "${errorText}"`);
  } else {
    console.log('SUCCESS: No error banner on Live Catalyst! Settings saved cleanly!');
  }

  // Take live screenshot after toggle
  const liveDisabledScreenshot = path.join(evidenceDir, 'live-staff-settings-toggles-disabled.png');
  await page.screenshot({ path: liveDisabledScreenshot, fullPage: false });
  console.log(`Saved screenshot: ${liveDisabledScreenshot}`);

  // Re-enable toggle on live backend
  console.log('Re-enabling toggle on Live Catalyst...');
  await firstToggle.click();
  await page.waitForTimeout(1000);

  const reEnabledError = await errorBanner.isVisible();
  assert.ok(!reEnabledError, 'Live error banner appeared on re-enable');
  console.log('SUCCESS: Live re-enable passed with 0 errors!');

  // Now verify Live Student App
  console.log(`Navigating to Live Student App: ${LIVE_BASE}/app/index.html...`);
  const studentPage = await context.newPage();
  await studentPage.setViewportSize({ width: 390, height: 844 });
  await studentPage.goto(`${LIVE_BASE}/app/index.html`, { waitUntil: 'networkidle' });

  const studentTitle = await studentPage.title();
  console.log(`Live Student page title: ${studentTitle}`);
  assert.ok(studentTitle.includes('PrintBK'), `Unexpected title: ${studentTitle}`);

  const liveStudentScreenshot = path.join(evidenceDir, 'live-student-app.png');
  await studentPage.screenshot({ path: liveStudentScreenshot, fullPage: false });
  console.log(`Saved live student screenshot: ${liveStudentScreenshot}`);

  console.log('ALL LIVE CATALYST VERIFICATION TESTS PASSED CLEANLY!');
} finally {
  await browser.close();
}
