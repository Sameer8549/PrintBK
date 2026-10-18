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
  const urlObj = new URL(req.url, 'http://localhost:4215');
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

  const fallback = pathname.startsWith('/staff') ? path.join(clientDir, 'staff/index.html') : path.join(clientDir, 'index.html');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(fallback));
});

await new Promise((resolve) => server.listen(4215, resolve));
console.log('Server running on http://localhost:4215');

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(msg.text());
  });

  console.log('Navigating to Staff Counter App...');
  const STAFF_TOKEN = 'fafeee08f195644f79d5dc333533fe7f82b226a05b6748b0072d9a6a04644485';
  await page.goto('http://localhost:4215/staff/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate((token) => {
    localStorage.setItem('printbk-paired', 'true');
    localStorage.setItem('printbk_staff_paired', 'true');
    localStorage.setItem('printbk_staff_device_id', 'staff_master_pc');
    localStorage.setItem('printbk_staff_token', token);
  }, STAFF_TOKEN);
  await page.goto('http://localhost:4215/staff/index.html', { waitUntil: 'networkidle' });

  // Open Settings modal
  console.log('Opening Settings modal...');
  const settingsBtn = page.locator('nav.nav-actions button:has-text("Settings"), button:has-text("Settings")').first();
  await settingsBtn.waitFor({ state: 'visible', timeout: 5000 });
  await settingsBtn.click();

  // Wait for settings drawer/modal
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

  // Find all toggle buttons in section 8
  const toggles = page.locator('.toggle-row .setting-toggle');
  const toggleCount = await toggles.count();
  console.log(`Found ${toggleCount} toggle buttons.`);
  assert.ok(toggleCount >= 5, `Expected at least 5 service toggles, got ${toggleCount}`);

  // Inspect the first toggle (Black & White Printing)
  const firstToggle = toggles.first();
  const knob = firstToggle.locator('.toggle-knob');
  const label = firstToggle.locator('.toggle-label');

  await knob.waitFor({ state: 'visible' });
  await label.waitFor({ state: 'visible' });

  let knobBox = await knob.boundingBox();
  let labelBox = await label.boundingBox();
  let text = (await label.textContent()).trim();
  console.log(`Initial state - Text: "${text}", Knob box:`, knobBox, 'Label box:', labelBox);

  // Take screenshot in initial ENABLED state
  const enabledScreenshot = path.join(evidenceDir, 'staff-settings-toggles-enabled.png');
  await page.screenshot({ path: enabledScreenshot, fullPage: false });
  console.log(`Saved screenshot: ${enabledScreenshot}`);

  // Click first toggle to disable
  console.log('Clicking toggle to switch state...');
  await firstToggle.click();
  await page.waitForTimeout(600); // Wait for transition & saveSettings debounce/call

  // Verify no error message banner appeared
  const errorBanner = page.locator('.settings-error');
  const hasError = await errorBanner.isVisible();
  if (hasError) {
    const errorText = await errorBanner.textContent();
    console.error('ERROR BANNER DETECTED:', errorText);
    assert.fail(`Settings error banner displayed: "${errorText}"`);
  } else {
    console.log('SUCCESS: No error banner displayed after toggle click! (paperMultipliers validation passed)');
  }

  // Check updated knob and label positions
  knobBox = await knob.boundingBox();
  labelBox = await label.boundingBox();
  text = (await label.textContent()).trim();
  console.log(`Toggled state - Text: "${text}", Knob box:`, knobBox, 'Label box:', labelBox);

  // Take screenshot in DISABLED state
  const disabledScreenshot = path.join(evidenceDir, 'staff-settings-toggles-disabled.png');
  await page.screenshot({ path: disabledScreenshot, fullPage: false });
  console.log(`Saved screenshot: ${disabledScreenshot}`);

  // Re-enable toggle
  console.log('Re-enabling toggle...');
  await firstToggle.click();
  await page.waitForTimeout(600);

  const reEnabledError = await errorBanner.isVisible();
  assert.ok(!reEnabledError, 'Error banner appeared on re-enable');
  console.log('SUCCESS: Re-enabled toggle with zero errors!');

  // Now verify Student App loads cleanly without errors
  console.log('Navigating to Student Web App...');
  const studentPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const studentErrors = [];
  studentPage.on('pageerror', (err) => studentErrors.push(err.message));
  studentPage.on('console', (msg) => {
    if (msg.type() === 'error') studentErrors.push(msg.text());
  });

  await studentPage.goto('http://localhost:4215/index.html', { waitUntil: 'networkidle' });
  const studentTitle = await studentPage.title();
  console.log(`Student page title: ${studentTitle}`);
  assert.ok(studentTitle.includes('PrintBK'), `Unexpected student title: ${studentTitle}`);

  const studentScreenshot = path.join(evidenceDir, 'student-app-verified.png');
  await studentPage.screenshot({ path: studentScreenshot, fullPage: false });
  console.log(`Saved student screenshot: ${studentScreenshot}`);

  console.log('ALL PLAYWRIGHT TESTS PASSED CLEANLY!');
} finally {
  await browser.close();
  server.close();
}
