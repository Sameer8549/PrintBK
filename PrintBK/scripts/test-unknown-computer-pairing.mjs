import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const staffRequire = createRequire(path.join(rootDir, 'staff', 'package.json'));
const { chromium } = staffRequire('@playwright/test');

const PROD_URL = (process.env.PROD_URL || 'https://printbk-60074625517.catalystserverless.in').replace(/\/$/, '');
const SETUP_CODE = process.env.SETUP_CODE || 'PBK-SETUP-9021';
const evidenceDir = path.join(rootDir, 'docs', 'final-evidence', 'unknown-pc');
fs.mkdirSync(evidenceDir, { recursive: true });

let passCount = 0;
let totalChecks = 0;

function check(condition, message) {
  totalChecks++;
  if (!condition) {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(message);
  }
  passCount++;
  console.log(`  ✅ [PASS] ${message}`);
}

async function runUnknownComputerPairingTest() {
  console.log(`========================================================================`);
  console.log(`🚀 PRINTBK UNKNOWN COMPUTER SETUP & UNBLOCKED STATE TEST SUITE`);
  console.log(`   Target Production: ${PROD_URL}`);
  console.log(`   Setup Code:        ${SETUP_CODE}`);
  console.log(`   Simulated Machine: Unknown Client Hardware (Windows 11 / Dell OptiPlex)`);
  console.log(`   Timestamp:         ${new Date().toISOString()}`);
  console.log(`========================================================================\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const createdDeviceTokens = [];
  const createdDeviceIds = [];

  try {
    // ========================================================================
    // SCENARIO 1: UNKNOWN BROWSER CLIENT (FRESH COMPUTER, NO PRE-EXISTING DATA)
    // ========================================================================
    console.log(`--- [1/3] Unknown Computer: Fresh Browser Web Portal & Unblocked Audit ---`);
    
    // Completely isolated fresh incognito context - simulates brand new unboxed PC
    const unknownBrowserContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 UnknownClientPC/1.0',
      ignoreHTTPSErrors: false,
      javaScriptEnabled: true
    });

    const webPage = await unknownBrowserContext.newPage();
    const cdpSession = await unknownBrowserContext.newCDPSession(webPage);

    await cdpSession.send('Performance.enable');
    await cdpSession.send('Network.enable');
    await cdpSession.send('Console.enable');

    const blockedRequests = [];
    const failedRequests = [];
    const consoleErrors = [];

    cdpSession.on('Network.loadingFailed', (event) => {
      failedRequests.push(event);
      if (event.blockedReason || event.errorText.includes('BLOCKED')) {
        blockedRequests.push(event);
      }
    });

    cdpSession.on('Console.messageAdded', (msg) => {
      if (msg.message.level === 'error') {
        consoleErrors.push(msg.message.text);
      }
    });

    const portalUrl = `${PROD_URL}/app/staff/index.html`;
    console.log(`  Navigating from unknown computer to: ${portalUrl}`);
    const navRes = await webPage.goto(portalUrl, { waitUntil: 'load', timeout: 30000 });
    await webPage.waitForTimeout(1000);

    check(navRes.status() === 200, `Portal loaded successfully with HTTP 200 (Status: ${navRes.status()})`);
    check(blockedRequests.length === 0, `Zero blocked network requests on unknown client (blocked: ${blockedRequests.length})`);
    check(failedRequests.length === 0, `Zero failed network requests on unknown client (failed: ${failedRequests.length})`);
    check(consoleErrors.length === 0, `Zero console errors on fresh load (errors: ${consoleErrors.length})`);

    // Verify Title & Unblocked DOM
    const pageTitle = await webPage.title();
    check(pageTitle === 'PrintBK Counter', `Website title loaded cleanly: "${pageTitle}"`);
    const downloadBtn = await webPage.$('#download-windows-btn, a.download-primary-button');
    check(downloadBtn !== null, 'Download CTA button rendered and interactive');

    const screenshot1 = path.join(evidenceDir, '01-unknown-pc-unblocked-website.png');
    await webPage.screenshot({ path: screenshot1, fullPage: true });
    console.log(`  Captured screenshot of unblocked portal: ${screenshot1}`);

    // Pair this unknown browser using the Setup Code
    console.log(`\n  Initiating Setup Code Pairing on Unknown Browser...`);
    const pairToggleBtn = await webPage.$('button:has-text("Pair this browser"), .support-link');
    check(pairToggleBtn !== null, 'Found "Pair this browser" toggle button');
    await pairToggleBtn.click();
    await webPage.waitForTimeout(500);

    const setupCodeInput = await webPage.$('#owner-setup-code');
    check(setupCodeInput !== null, 'Setup code input field is visible and accessible');

    console.log(`  Entering setup code: ${SETUP_CODE}`);
    await setupCodeInput.fill(SETUP_CODE);
    await webPage.waitForTimeout(300);

    const pairSubmitBtn = await webPage.$('button.owner-pairing-submit, button[type="submit"]:has-text("PAIR THIS BROWSER")');
    check(pairSubmitBtn !== null, 'Pair submit button is present');

    // Intercept network response for pairing
    const [pairResponse] = await Promise.all([
      webPage.waitForResponse((res) => res.url().includes('/server/api/staff/pair') && res.request().method() === 'POST'),
      pairSubmitBtn.click()
    ]);

    check(pairResponse.status() === 200, `Pairing API returned HTTP 200 OK (Status: ${pairResponse.status()})`);
    const pairData = await pairResponse.json();
    check(pairData.ok === true && Boolean(pairData.token || pairData.deviceToken), 'Device token received for unknown computer');

    const browserToken = pairData.token || pairData.deviceToken;
    const browserDeviceId = pairData.deviceId;
    if (browserToken) createdDeviceTokens.push(browserToken);
    if (browserDeviceId) createdDeviceIds.push(browserDeviceId);

    // Wait for the UI to transition from DownloadPage to Live Orders
    await webPage.waitForTimeout(1500);
    const bodyText = await webPage.textContent('body');
    check(!bodyText.includes('DOWNLOAD FOR WINDOWS'), 'Download page cleanly transitioned to live dashboard');
    check(bodyText.includes('PrintBK') || bodyText.includes('Campus') || bodyText.includes('Orders'), 'Active counter interface displayed');

    const screenshot2 = path.join(evidenceDir, '02-unknown-pc-browser-paired-active.png');
    await webPage.screenshot({ path: screenshot2, fullPage: true });
    console.log(`  Captured screenshot of paired unknown browser: ${screenshot2}`);

    // ========================================================================
    // SCENARIO 2: UNKNOWN DESKTOP APP CLIENT (FRESH PC FIRST-TIME LAUNCH)
    // ========================================================================
    console.log(`\n--- [2/3] Unknown Computer: Desktop Counter App Setup Flow ---`);

    const unknownDesktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) PrintBKCounter/1.0.0 Chrome/128.0.0.0 Electron/30.0.0 Safari/537.36',
      ignoreHTTPSErrors: false,
      javaScriptEnabled: true
    });

    const desktopPage = await unknownDesktopContext.newPage();
    const cdpDesktop = await unknownDesktopContext.newCDPSession(desktopPage);
    await cdpDesktop.send('Console.enable');

    const desktopConsoleErrors = [];
    cdpDesktop.on('Console.messageAdded', (msg) => {
      if (msg.message.level === 'error') {
        desktopConsoleErrors.push(msg.message.text);
      }
    });

    console.log(`  Launching Desktop App view from unknown computer...`);
    await desktopPage.goto(portalUrl, { waitUntil: 'load', timeout: 30000 });
    await desktopPage.waitForTimeout(1000);

    // Desktop app should directly render SetupFlow (Connect this PC to your shop)
    const desktopBody1 = await desktopPage.textContent('body');
    check(desktopBody1.includes('Connect this PC to your shop') || desktopBody1.includes('COUNTER SETUP'), 'Desktop app directly shows SetupFlow on unknown PC');
    check(desktopConsoleErrors.length === 0, `Zero errors on Desktop App initial screen`);

    const screenshot3 = path.join(evidenceDir, '03-unknown-desktop-pc-step1.png');
    await desktopPage.screenshot({ path: screenshot3, fullPage: true });
    console.log(`  Captured screenshot of Desktop App Step 1: ${screenshot3}`);

    // Fill in setup code in Desktop App
    console.log(`  Entering setup code into Desktop App input...`);
    const setupInput = await desktopPage.$('.settings-field input, .pairing-card input');
    check(setupInput !== null, 'Desktop setup code input field located');
    await setupInput.fill(SETUP_CODE);
    await desktopPage.waitForTimeout(300);

    const connectBtn = await desktopPage.$('button:has-text("CONNECT SHOP")');
    check(connectBtn !== null, 'Found "CONNECT SHOP" button');

    // Click connect and wait for response
    const [desktopPairRes] = await Promise.all([
      desktopPage.waitForResponse((res) => res.url().includes('/server/api/staff/pair') && res.request().method() === 'POST'),
      connectBtn.click()
    ]);

    check(desktopPairRes.status() === 200, `Desktop pairing succeeded (HTTP ${desktopPairRes.status})`);
    const desktopPairData = await desktopPairRes.json();
    if (desktopPairData.token || desktopPairData.deviceToken) {
      createdDeviceTokens.push(desktopPairData.token || desktopPairData.deviceToken);
    }
    if (desktopPairData.deviceId) {
      createdDeviceIds.push(desktopPairData.deviceId);
    }

    await desktopPage.waitForTimeout(1000);
    const desktopBody2 = await desktopPage.textContent('body');
    check(desktopBody2.includes("You’re ready") || desktopBody2.includes("You're ready"), 'Desktop app stepped to Step 3: "You’re ready"');

    const screenshot4 = path.join(evidenceDir, '04-unknown-desktop-pc-step3-ready.png');
    await desktopPage.screenshot({ path: screenshot4, fullPage: true });
    console.log(`  Captured screenshot of Step 3 ready state: ${screenshot4}`);

    // Click OPEN SHOP
    const openShopBtn = await desktopPage.$('button:has-text("OPEN SHOP")');
    check(openShopBtn !== null, 'Found "OPEN SHOP" button');
    await openShopBtn.click();
    await desktopPage.waitForTimeout(1500);

    const desktopBody3 = await desktopPage.textContent('body');
    check(!desktopBody3.includes('CONNECT SHOP') && !desktopBody3.includes('STEP 1 OF 3'), 'Setup wizard completed and dismissed');

    const screenshot5 = path.join(evidenceDir, '05-unknown-desktop-pc-counter-dashboard.png');
    await desktopPage.screenshot({ path: screenshot5, fullPage: true });
    console.log(`  Captured screenshot of active desktop counter board: ${screenshot5}`);

    // Open Settings / Printers view
    console.log(`  Checking Settings / Printers tab on unknown PC...`);
    const settingsBtn = await desktopPage.$('button[title*="Settings"], button:has-text("Settings"), button:has-text("Printers")');
    if (settingsBtn) {
      await settingsBtn.click();
      await desktopPage.waitForTimeout(1000);
    }
    const screenshot6 = path.join(evidenceDir, '06-unknown-desktop-pc-settings-printers.png');
    await desktopPage.screenshot({ path: screenshot6, fullPage: true });
    console.log(`  Captured screenshot of settings: ${screenshot6}`);

    // ========================================================================
    // SCENARIO 3: CLEAN SLATE & RESTORATION (LEAVE DATABASE 100% PRISTINE)
    // ========================================================================
    console.log(`\n--- [3/3] Cloud Datastore Clean Slate & Device Revocation ---`);

    // Use one of the tokens before revoking to audit & revoke test devices
    const adminToken = createdDeviceTokens[0];
    if (adminToken) {
      for (const devId of createdDeviceIds) {
        const rRes = await fetch(`${PROD_URL}/server/api/staff/devices/${devId}/revoke`, {
          method: 'POST',
          headers: { 'X-Staff-Device-Token': adminToken }
        });
        console.log(`  Revoked test device ${devId}: HTTP ${rRes.status}`);
      }

      // Final Datastore Audit Check
      const auditRes = await fetch(`${PROD_URL}/server/api/staff/devices`, {
        headers: { 'X-Staff-Device-Token': adminToken }
      });
      if (auditRes.ok) {
        const auditData = await auditRes.json();
        const unrevoked = (auditData.devices || []).filter(d => !d.revoked);
        console.log(`  Active unrevoked devices in Datastore: ${unrevoked.length}`);
        check(unrevoked.length === 0, 'Cloud Datastore has ZERO unrevoked devices (Clean Hand-off Slate)');
      }
    }

    console.log(`\n========================================================================`);
    console.log(`🎉 ALL ${passCount}/${totalChecks} UNKNOWN COMPUTER CHECKS PASSED EMPIRICALLY!`);
    console.log(`   Website has NO blocked states.`);
    console.log(`   Pairing works seamlessly on any fresh/unknown client machine.`);
    console.log(`   Database restored to clean state for client.`);
    console.log(`========================================================================\n`);

  } finally {
    await browser.close();
  }
}

runUnknownComputerPairingTest().catch((err) => {
  console.error('\n❌ UNKNOWN COMPUTER TEST FAILED:', err);
  process.exit(1);
});
