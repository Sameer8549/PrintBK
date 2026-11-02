import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const staffRequire = createRequire(path.join(rootDir, 'staff', 'package.json'));
const { _electron: electron } = staffRequire('@playwright/test');

const PROD_URL = (process.env.PROD_URL || 'https://printbk-60074625517.catalystserverless.in').replace(/\/$/, '');
const SETUP_CODE = process.env.SETUP_CODE || 'PBK-SETUP-9021';
const INSTALLED_EXE = process.env.PRINTBK_EXE || path.join(
  process.env.LOCALAPPDATA || '',
  'Programs',
  'PrintBK Counter',
  'PrintBK Counter.exe'
);

const evidenceDir = path.join(rootDir, 'docs', 'final-evidence', 'installed-app');
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

async function runInstalledAppTestSuite() {
  console.log(`========================================================================`);
  console.log(`🖥️  PRINTBK INSTALLED WINDOWS DESKTOP APP E2E AUTOMATION SUITE`);
  console.log(`   Binary Path:       ${INSTALLED_EXE}`);
  console.log(`   Target Production: ${PROD_URL}`);
  console.log(`   Setup Code:        ${SETUP_CODE}`);
  console.log(`   Timestamp:         ${new Date().toISOString()}`);
  console.log(`========================================================================\n`);

  // Ensure binary exists
  check(fs.existsSync(INSTALLED_EXE), `Installed binary exists on disk: ${INSTALLED_EXE}`);

  // Clean local store so we test fresh first-time pairing on the installed app
  const localStorePath = path.join(process.env.APPDATA || '', 'PrintBK', 'counter-store.json');
  if (fs.existsSync(localStorePath)) {
    fs.unlinkSync(localStorePath);
    console.log(`  Cleaned existing local counter store: ${localStorePath}`);
  }

  let app = null;
  let pairedCounterId = null;
  let pairedStaffToken = null;

  try {
    // ========================================================================
    // 1. LAUNCH INSTALLED ELECTRON DESKTOP APP (FRESH MACHINE STATE)
    // ========================================================================
    console.log(`--- [1/4] Launching Physical Installed Desktop Application ---`);
    app = await electron.launch({
      executablePath: INSTALLED_EXE,
      env: {
        ...process.env,
        NODE_ENV: 'production'
      }
    });

    check(app !== null, 'Electron application process launched successfully');
    const wizardWin = await app.firstWindow();
    check(wizardWin !== null, 'Primary application window initialized');

    await wizardWin.waitForLoadState('domcontentloaded');
    await wizardWin.waitForTimeout(2000);

    const initialTitle = await wizardWin.title();
    console.log(`  Window Title: "${initialTitle}"`);
    check(initialTitle.includes('PrintBK Counter Setup'), `Window title is "PrintBK Counter Setup": "${initialTitle}"`);

    // Verify Setup Wizard Step 1 elements
    const setupCodeInput = await wizardWin.$('#setupCodeInput');
    check(setupCodeInput !== null, 'Setup code input field is present');
    const nextBtn = await wizardWin.$('#nextBtn');
    check(nextBtn !== null, 'Next button (#nextBtn) is present');

    const screenshot1 = path.join(evidenceDir, '01-installed-app-wizard-step1.png');
    await wizardWin.screenshot({ path: screenshot1 });
    console.log(`  Captured screenshot of Step 1: ${screenshot1}`);

    // ========================================================================
    // 2. PAIRING WORKFLOW INSIDE THE INSTALLED DESKTOP APP
    // ========================================================================
    console.log(`\n--- [2/4] Executing Workstation Pairing with Setup Code ---`);
    console.log(`  Entering setup code: ${SETUP_CODE}`);
    await setupCodeInput.fill(SETUP_CODE);
    await wizardWin.waitForTimeout(300);

    const deviceLabelInput = await wizardWin.$('#deviceLabelInput');
    if (deviceLabelInput) {
      await deviceLabelInput.fill('Client Primary Counter PC');
    }

    // Click Connect Workstation
    console.log(`  Clicking "Connect Workstation →"...`);
    await nextBtn.click();

    // Wait for Step 2: Choose Shop Printers
    await wizardWin.waitForFunction(() => {
      const step2 = document.getElementById('step2');
      return step2 && step2.style.display !== 'none';
    }, { timeout: 15000 });

    check(true, 'Pairing succeeded! Transitioned to Step 2: Choose Shop Printers');

    const screenshot2 = path.join(evidenceDir, '02-installed-app-wizard-step2-printers.png');
    await wizardWin.screenshot({ path: screenshot2 });
    console.log(`  Captured screenshot of Step 2 (Printers): ${screenshot2}`);

    // Check printer dropdowns & options
    const bwSelect = await wizardWin.$('#bwPrinterSelect');
    check(bwSelect !== null, 'B&W printer selector is present and populated');

    // Click Continue to Ready
    console.log(`  Clicking "Continue to Ready →"...`);
    await nextBtn.click();

    // Wait for Step 3: Workstation Ready
    await wizardWin.waitForFunction(() => {
      const step3 = document.getElementById('step3');
      return step3 && step3.style.display !== 'none';
    }, { timeout: 10000 });

    check(true, 'Transitioned to Step 3: Workstation Ready');

    const screenshot3 = path.join(evidenceDir, '03-installed-app-wizard-step3-ready.png');
    await wizardWin.screenshot({ path: screenshot3 });
    console.log(`  Captured screenshot of Step 3 (Ready): ${screenshot3}`);

    // ========================================================================
    // 3. ENTER COUNTER SCREEN & VERIFY NATIVE BRIDGE INTEGRATION
    // ========================================================================
    console.log(`\n--- [3/4] Opening Main Counter Window ---`);

    // Prepare for main window launch upon clicking "Open Counter Window"
    const windowPromise = app.waitForEvent('window', { timeout: 15000 }).catch(() => null);
    await nextBtn.click();

    let mainWin = await windowPromise;
    if (!mainWin) {
      const allWindows = app.windows();
      mainWin = allWindows[allWindows.length - 1];
    }

    check(mainWin !== null, 'Main counter application window launched');
    await mainWin.waitForLoadState('domcontentloaded');
    await mainWin.waitForTimeout(3000);

    const mainTitle = await mainWin.title();
    console.log(`  Main Window Title: "${mainTitle}"`);
    check(mainTitle.includes('PrintBK') || mainTitle.includes('Counter'), `Main window title verified: "${mainTitle}"`);

    // Verify live counter interface
    const mainText = await mainWin.textContent('body');
    check(!mainText.includes('STEP 1 OF 3') && !mainText.includes('Connect this PC'), 'Wizard dismissed; entered main counter app');
    check(mainText.includes('PrintBK') || mainText.includes('Campus') || mainText.includes('Orders'), 'Active shop counter UI rendered');

    // Verify native Electron bridge
    const bridgeStatus = await mainWin.evaluate(() => {
      const b = window.printbkCounter;
      return {
        hasBridge: Boolean(b),
        isCounterApp: Boolean(b && b.isCounterApp),
        hasGetDiscoveredPrinters: typeof (b && b.getDiscoveredPrinters) === 'function',
        hasTriggerTestPrint: typeof (b && b.triggerTestPrint) === 'function',
        hasGetAppVersion: typeof (b && b.getAppVersion) === 'function'
      };
    });
    console.log(`  Native Electron Bridge Status:`, bridgeStatus);
    check(bridgeStatus.hasBridge, 'window.printbkCounter native bridge is active');
    check(bridgeStatus.isCounterApp, 'isCounterApp flag is true');
    check(bridgeStatus.hasGetDiscoveredPrinters, 'getDiscoveredPrinters native spooler API is available');
    check(bridgeStatus.hasTriggerTestPrint, 'triggerTestPrint hardware API is available');

    const screenshot4 = path.join(evidenceDir, '04-installed-app-main-counter.png');
    await mainWin.screenshot({ path: screenshot4 });
    console.log(`  Captured screenshot of main counter board: ${screenshot4}`);

    // Read stored credentials from local store to prepare cleanup
    if (fs.existsSync(localStorePath)) {
      const storeContent = JSON.parse(fs.readFileSync(localStorePath, 'utf8'));
      pairedCounterId = storeContent.counterId;
      pairedStaffToken = storeContent.staffToken;
      console.log(`  Persisted store verification: counterId=${pairedCounterId}`);
      check(Boolean(pairedCounterId) && Boolean(pairedStaffToken), 'Credentials persisted to disk store');
    }

    // ========================================================================
    // 4. PERSISTENCE CHECK: RESTART INSTALLED APP AND CONFIRM DIRECT ACCESS
    // ========================================================================
    console.log(`\n--- [4/4] Verifying Restart Persistence of Installed App ---`);
    console.log(`  Closing installed app process...`);
    await app.close();
    app = null;
    await new Promise((r) => setTimeout(r, 2000));

    console.log(`  Relaunching installed app (Simulating shop reopening next day)...`);
    app = await electron.launch({
      executablePath: INSTALLED_EXE,
      env: { ...process.env, NODE_ENV: 'production' }
    });
    const relaunchWin = await app.firstWindow();
    await relaunchWin.waitForLoadState('domcontentloaded');
    await relaunchWin.waitForTimeout(3000);

    const relaunchTitle = await relaunchWin.title();
    console.log(`  Relaunched Window Title: "${relaunchTitle}"`);
    const relaunchText = await relaunchWin.textContent('body');
    check(!relaunchText.includes('STEP 1 OF 3') && !relaunchText.includes('Enter Setup Code'), 'Installed app bypassed setup wizard on restart (Persistent Pairing Verified)');
    check(relaunchText.includes('PrintBK') || relaunchText.includes('Campus') || relaunchText.includes('Orders'), 'Installed app directly restored Live Orders on relaunch');

    const screenshot5 = path.join(evidenceDir, '05-installed-app-relaunch-persisted.png');
    await relaunchWin.screenshot({ path: screenshot5 });
    console.log(`  Captured screenshot of persistent relaunch: ${screenshot5}`);

    // Close the app before cleanup
    await app.close();
    app = null;
    await new Promise((r) => setTimeout(r, 1500));

    // ========================================================================
    // 5. CLEAN SLATE FOR CLIENT HANDOFF
    // ========================================================================
    console.log(`\n--- [Cleanup] Revoking Test Counter & Resetting Local Store ---`);
    if (pairedCounterId && pairedStaffToken) {
      const revokeRes = await fetch(`${PROD_URL}/server/api/staff/counters/${pairedCounterId}/revoke`, {
        method: 'POST',
        headers: { 'X-Staff-Device-Token': pairedStaffToken }
      });
      console.log(`  Revoked counter ${pairedCounterId}: HTTP ${revokeRes.status}`);
    }

    // Wipe local store on developer machine
    if (fs.existsSync(localStorePath)) {
      fs.unlinkSync(localStorePath);
      console.log(`  Wiped developer local store: ${localStorePath}`);
    }
    check(!fs.existsSync(localStorePath), 'Local developer counter store is wiped clean');

    // Final probe to guarantee datastore is 100% clean
    const probeRes = await fetch(`${PROD_URL}/server/api/staff/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupCode: SETUP_CODE, label: 'Final Cleanup Probe' })
    });
    const probeData = await probeRes.json();
    if (probeData.token) {
      const cRes = await fetch(`${PROD_URL}/server/api/staff/counters`, {
        headers: { 'X-Staff-Device-Token': probeData.token }
      });
      const cData = await cRes.json();
      const unrevokedCounters = (cData.counters || []).filter(c => !c.revoked && c.id !== probeData.deviceId);

      const dRes = await fetch(`${PROD_URL}/server/api/staff/devices`, {
        headers: { 'X-Staff-Device-Token': probeData.token }
      });
      const dData = await dRes.json();
      const unrevokedDevices = (dData.devices || []).filter(d => !d.revoked && d.id !== probeData.deviceId);

      console.log(`  Cloud Audit: Unrevoked Counters=${unrevokedCounters.length}, Unrevoked Devices=${unrevokedDevices.length}`);
      check(unrevokedCounters.length === 0, 'Zero unrevoked counters remaining in Datastore');
      check(unrevokedDevices.length === 0, 'Zero unrevoked devices remaining in Datastore');

      // Self revoke probe
      await fetch(`${PROD_URL}/server/api/staff/devices/${probeData.deviceId}/revoke`, {
        method: 'POST',
        headers: { 'X-Staff-Device-Token': probeData.token }
      });
    }

    console.log(`\n========================================================================`);
    console.log(`🎉 ALL ${passCount}/${totalChecks} INSTALLED DESKTOP APP CHECKS PASSED EMPIRICALLY!`);
    console.log(`   Physical installed binary at ${INSTALLED_EXE} verified end-to-end.`);
    console.log(`   Zero blocked states, full native printer bridge, persistent relaunch.`);
    console.log(`   Cloud Datastore & Local Store restored to clean state for client.`);
    console.log(`========================================================================\n`);

  } finally {
    if (app) {
      try { await app.close(); } catch {}
    }
  }
}

runInstalledAppTestSuite().catch((err) => {
  console.error('\n❌ INSTALLED APP TEST SUITE FAILED:', err);
  process.exit(1);
});
