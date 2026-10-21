import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const staffRequire = createRequire(path.join(rootDir, 'staff', 'package.json'));
const { chromium } = staffRequire('@playwright/test');

import app from '../functions/api/index.js';

const PORT = 4329;
const clientDir = path.resolve(rootDir, 'client');

// Static file server fallback to client bundle
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/server/api') || req.url.startsWith('/config')) {
    return app(req, res);
  }

  const urlPath = req.url.split('?')[0];
  let filePath = path.join(clientDir, urlPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    filePath = path.join(clientDir, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
  };

  const contentType = mimeMap[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
});

async function run() {
  console.log('🚀 Starting Verification of Settings, About (All HKBK), & Privacy Pages...');
  await new Promise(resolve => server.listen(PORT, resolve));
  const baseUrl = `http://127.0.0.1:${PORT}`;

  const evidenceDir = path.resolve('docs/final-evidence/after');
  fs.mkdirSync(evidenceDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newcontext ? await browser.newcontext() : await browser.newContext({
    viewport: { width: 420, height: 860 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  try {
    // 1. Load Settings Page
    console.log('1. Navigating to Settings page...');
    await page.goto(`${baseUrl}/#/settings`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Verify Preferences is removed
    const pageText = await page.textContent('body');
    assert(!pageText.includes('Default: 2-Sided · B&W · A4'), 'Old Preferences default preset must be removed');
    assert(!pageText.includes('Language\nEnglish (India)'), 'Old fake Language row must be removed');

    // Verify Merged Campus Hub & tabs exist
    assert(pageText.includes('Campus Hub & Support'), 'Merged Campus Hub must be present');
    assert(pageText.includes('Shop Hours'), 'Shop Hours tab must exist');
    assert(pageText.includes('How It Works'), 'How It Works tab must exist');
    assert(pageText.includes('Contact'), 'Contact tab must exist');
    assert(pageText.includes('Help & FAQ'), 'Help & FAQ tab must exist');

    // Test tab switching
    await page.click('button:has-text("How It Works")');
    await page.waitForTimeout(200);
    const howText = await page.textContent('body');
    assert(howText.includes('Upload Documents') && howText.includes('Fast Counter Pickup'), 'How It Works steps must render');

    await page.click('button:has-text("Contact")');
    await page.waitForTimeout(200);
    const contactText = await page.textContent('body');
    assert(contactText.includes('In-Person Counter Assistance'), 'In-Person Counter Assistance must render');
    assert(!contactText.includes('Call Counter'), 'Must not contain Call Counter button');
    assert(!contactText.includes('87068'), 'Must not contain contact phone numbers');

    await page.click('button:has-text("Shop Hours")');
    await page.waitForTimeout(200);

    const settingsText = await page.textContent('body');
    assert(!settingsText.includes('87068'), 'Settings page must not contain contact phone numbers');
    assert(settingsText.includes('Campus Hub & Support'), 'Must have merged Campus Hub & Support');

    const settingsScreenshot = path.join(evidenceDir, 'settings-merged-hub.png');
    await page.screenshot({ path: settingsScreenshot, fullPage: true });
    console.log(`✅ Saved Settings screenshot: ${settingsScreenshot}`);

    // 2. Click About PrintBK & verify it opens from the start
    console.log('2. Navigating to About PrintBK page...');
    await page.click('button:has-text("About PrintBK")');
    await page.waitForTimeout(600);

    const scrollYAbout = await page.evaluate(() => window.scrollY || document.documentElement.scrollTop || document.querySelector('.page')?.scrollTop || 0);
    console.log(`  -> About page scroll position on open: ${scrollYAbout}px`);
    assert.strictEqual(scrollYAbout, 0, 'About page must open from the absolute top (0px)');

    const aboutText = await page.textContent('body');
    assert(aboutText.includes('Across All HKBK Institutions'), 'Must state Across All HKBK Institutions');
    assert(!aboutText.includes('HKBK College of Engineering'), 'Must not list separate institutions or departments');
    assert(!aboutText.includes('CSE, ISE'), 'Must not list specific departments or branches');
    assert(!aboutText.includes('87068'), 'Must not contain contact phone numbers');
    assert(aboutText.includes('Abdul Sameer'), 'Must feature creator Abdul Sameer');

    const aboutScreenshot = path.join(evidenceDir, 'about-all-hkbk-institutions.png');
    await page.screenshot({ path: aboutScreenshot, fullPage: true });
    console.log(`✅ Saved About screenshot: ${aboutScreenshot}`);

    // 3. Navigate back to Settings then to Privacy Policy
    console.log('3. Navigating to Privacy Policy page...');
    await page.click('button[aria-label="Go back"], button.icon-button');
    await page.waitForTimeout(500);

    await page.click('button:has-text("Privacy & Auto-Deletion Policy")');
    await page.waitForTimeout(600);

    const scrollYPrivacy = await page.evaluate(() => window.scrollY || document.documentElement.scrollTop || document.querySelector('.page')?.scrollTop || 0);
    console.log(`  -> Privacy page scroll position on open: ${scrollYPrivacy}px`);
    assert.strictEqual(scrollYPrivacy, 0, 'Privacy page must open from the absolute top (0px)');

    const privacyText = await page.textContent('body');
    assert(privacyText.includes('Zero-Retention Guarantee'), 'Must feature Zero-Retention Guarantee');
    assert(privacyText.includes('Automated Privacy File Purge'), 'Must feature Automated File Purge');
    assert(!privacyText.includes('Call Counter'), 'Must not have call counter button with phone');
    assert(!privacyText.includes('87068'), 'Must not contain contact phone numbers');
    assert(privacyText.includes('Visit Counter · Ground Floor'), 'Must offer in-person counter verification');

    const privacyScreenshot = path.join(evidenceDir, 'privacy-policy-redesigned.png');
    await page.screenshot({ path: privacyScreenshot, fullPage: true });
    console.log(`✅ Saved Privacy Policy screenshot: ${privacyScreenshot}`);

    console.log('\n🎉 ALL SETTINGS, ABOUT & PRIVACY CHECKS PASSED EMPIRICALLY!');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
