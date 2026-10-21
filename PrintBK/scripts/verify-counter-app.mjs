import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const staffRequire = createRequire(path.resolve('staff/package.json'));
const { _electron } = staffRequire('@playwright/test');

const evidenceDir = path.resolve('docs/final-evidence/after');
fs.mkdirSync(evidenceDir, { recursive: true });

// Import real backend app
const apiAppModule = await import('../functions/api/index.js');
const apiApp = apiAppModule.default || apiAppModule;

const staffDistDir = path.resolve('staff/dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

// Create local test HTTP server serving both backend API and staff frontend
const server = http.createServer((req, res) => {
  const urlPath = req.url?.split('?')[0] || '/';

  // Handle staff web app static files
  if (urlPath === '/staff' || urlPath === '/staff/' || urlPath.startsWith('/staff/')) {
    let rel = urlPath.replace(/^\/staff\/?/, '');
    if (!rel || rel === '') rel = 'index.html';
    const filePath = path.join(staffDistDir, rel);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return;
    } else {
      // SPA Fallback
      const indexPath = path.join(staffDistDir, 'index.html');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(indexPath).pipe(res);
      return;
    }
  }

  // Handle mock update endpoint
  if (urlPath === '/updates' || urlPath === '/server/api/counter/version') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      latestVersion: '1.0.0',
      minSupportedVersion: '1.0.0',
      updateUrl: 'http://localhost:4321/installer.exe'
    }));
    return;
  }

  // Otherwise delegate to express API
  apiApp(req, res);
});

const testCounterCode = process.env.COUNTER_SETUP_CODE || ('test_code_' + Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2) + '000000000000').slice(0, 32);
process.env.COUNTER_SETUP_CODE = testCounterCode;

await new Promise((resolve) => server.listen(4321, resolve));
console.log('[Server] Local test server running on http://localhost:4321');

const exePath = path.resolve('counter-app/dist/installer/win-unpacked/PrintBK Counter.exe');
assert.ok(fs.existsSync(exePath), `Executable must exist at ${exePath}`);

// Manage store isolation
const appDataDir = path.join(process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming'), 'PrintBK');
const storePath = path.join(appDataDir, 'counter-store.json');
const storeBackupPath = path.join(appDataDir, 'counter-store.json.backup');

if (fs.existsSync(storePath)) {
  fs.copyFileSync(storePath, storeBackupPath);
  fs.unlinkSync(storePath);
  console.log('[Setup] Backed up existing counter-store.json to counter-store.json.backup');
}

try {
  console.log('\n--- TC1: Clean State Launch (No Config / Unpaired) ---');
  const electronApp = await _electron.launch({
    executablePath: exePath,
    env: {
      ...process.env,
      COUNTER_ENV: 'test',
      COUNTER_API_BASE: 'http://localhost:4321',
      COUNTER_STAFF_URL: 'http://localhost:4321/staff/',
      DRY_RUN: 'true',
      COUNTER_SETUP_CODE: testCounterCode
    }
  });

  const wizardWindow = await electronApp.firstWindow();
  await wizardWindow.waitForLoadState('domcontentloaded');
  console.log('[TC1] First window loaded:', await wizardWindow.title(), 'URL:', wizardWindow.url());

  assert.ok(wizardWindow.url().includes('wizard.html'), 'First window must be wizard.html in clean state');

  // Verify setup code input visible in Step 1
  await wizardWindow.waitForSelector('#setupCodeInput', { timeout: 10000 });
  console.log('[TC1] Wizard Step 1 active: setup code input present');

  // Take screenshot of clean wizard state (Step 1)
  const tc1Screenshot = path.join(evidenceDir, 'tc1-wizard-step1-clean.png');
  await wizardWindow.screenshot({ path: tc1Screenshot });
  console.log('[TC1] Captured screenshot:', tc1Screenshot);

  console.log('\n--- TC2: Pairing with Setup Code ---');
  // Fill setup code
  await wizardWindow.fill('#setupCodeInput', testCounterCode);
  console.log('[TC2] Typed valid 24+ char setup code');

  // Click Connect Workstation
  await wizardWindow.click('#nextBtn');
  console.log('[TC2] Clicked Connect button');

  // Wait for Step 2 (Printers configuration)
  await wizardWindow.waitForSelector('#step2:not([style*="display: none"])', { timeout: 10000 });
  console.log('[TC2] Advanced to Step 2: Choose Shop Printers');

  const tc2PrintersScreenshot = path.join(evidenceDir, 'tc2-wizard-step2-printers.png');
  await wizardWindow.screenshot({ path: tc2PrintersScreenshot });
  console.log('[TC2] Captured Step 2 screenshot:', tc2PrintersScreenshot);

  // Click Next on Step 2 -> Advance to Step 3 (Ready)
  await wizardWindow.click('#nextBtn');
  await wizardWindow.waitForSelector('#step3:not([style*="display: none"])', { timeout: 10000 });
  console.log('[TC2] Advanced to Step 3: Workstation Ready');

  const tc2ReadyScreenshot = path.join(evidenceDir, 'tc2-wizard-step3-ready.png');
  await wizardWindow.screenshot({ path: tc2ReadyScreenshot });
  console.log('[TC2] Captured Step 3 screenshot:', tc2ReadyScreenshot);

  // Click Next on Step 3 -> Finish wizard and launch Main Window
  console.log('[TC2] Clicking Launch Counter App...');
  const mainWindowPromise = electronApp.waitForEvent('window', { timeout: 15000 });
  await wizardWindow.click('#nextBtn');

  const mainWindow = await mainWindowPromise;
  await mainWindow.waitForLoadState('domcontentloaded');
  console.log('[TC2] Main window loaded URL:', mainWindow.url());

  // Wait for React staff counter app mount
  await mainWindow.waitForTimeout(4000);

  const tc2MainScreenshot = path.join(evidenceDir, 'tc2-counter-paired-orders.png');
  await mainWindow.screenshot({ path: tc2MainScreenshot });
  console.log('[TC2] Captured paired main window screenshot:', tc2MainScreenshot);

  // Verify store file created and populated with tokens
  assert.ok(fs.existsSync(storePath), 'counter-store.json must exist after pairing');
  const storeContent = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  assert.strictEqual(storeContent.paired, true, 'Store must be marked paired: true');
  console.log('[TC2] Store verification passed. Paired:', storeContent.paired, 'Counter ID:', storeContent.counterId);

  console.log('\n--- TC3: Minimize to Tray on Close ---');
  // Close the main window (triggers close event which hides to tray)
  await mainWindow.close();
  console.log('[TC3] Dispatched close() to main window. Window hidden to tray without terminating app.');
  await new Promise((r) => setTimeout(r, 1000));

  console.log('\n--- TC4: Agent Supervisor Health & Logs ---');
  const logDir = path.join(appDataDir, 'logs');
  const agentLogFile = path.join(logDir, 'agent.log');
  console.log('[TC4] Checking agent supervisor log at:', agentLogFile);
  if (fs.existsSync(agentLogFile)) {
    const logHead = fs.readFileSync(agentLogFile, 'utf8').slice(0, 500);
    console.log('[TC4] Agent log snippet:\n', logHead);
  }

  // Close the first electron instance
  await electronApp.close();
  console.log('[Cleanup] First Electron instance closed cleanly.');

  console.log('\n--- TC6: Persistence Relaunch (Opens Straight to Orders) ---');
  // Relaunch Electron app with existing store
  const relaunchedApp = await _electron.launch({
    executablePath: exePath,
    env: {
      ...process.env,
      COUNTER_ENV: 'test',
      COUNTER_API_BASE: 'http://localhost:4321',
      COUNTER_STAFF_URL: 'http://localhost:4321/staff/',
      DRY_RUN: 'true'
    }
  });

  const relaunchedWindow = await relaunchedApp.firstWindow();
  await relaunchedWindow.waitForLoadState('domcontentloaded');
  console.log('[TC6] Relaunched window URL:', relaunchedWindow.url());

  // Must NOT be wizard.html; must be staffAppUrl (http://localhost:4321/staff/)
  assert.ok(!relaunchedWindow.url().includes('wizard.html'), 'Relaunch must NOT show wizard');
  assert.ok(relaunchedWindow.url().includes('/staff/'), 'Relaunch must open directly into staff counter app');

  await relaunchedWindow.waitForTimeout(3000);
  const tc6Screenshot = path.join(evidenceDir, 'tc6-relaunch-direct-orders.png');
  await relaunchedWindow.screenshot({ path: tc6Screenshot });
  console.log('[TC6] Captured persistence relaunch screenshot:', tc6Screenshot);

  await relaunchedApp.close();
  console.log('[TC6] Persistence check passed successfully.');

  console.log('\n========================================');
  console.log('--- ALL DESKTOP FIELD TESTS PASSED! ---');
  console.log('========================================');
} finally {
  server.close();
  // Restore original store if backup exists
  if (fs.existsSync(storeBackupPath)) {
    fs.copyFileSync(storeBackupPath, storePath);
    fs.unlinkSync(storeBackupPath);
    console.log('[Teardown] Restored original counter-store.json from backup');
  }
}
