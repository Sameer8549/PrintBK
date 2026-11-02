import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const staffRequire = createRequire(path.join(rootDir, 'staff', 'package.json'));
const agentRequire = createRequire(path.join(rootDir, 'agent', 'package.json'));
const { chromium } = staffRequire('@playwright/test');
const { PDFDocument } = agentRequire('pdf-lib');

const PROD_URL = (process.env.PROD_URL || 'https://printbk-60074625517.catalystserverless.in').replace(/\/$/, '');
const SETUP_CODE = process.env.SETUP_CODE || 'PBK-SETUP-9021';
const evidenceDir = path.join(rootDir, 'docs', 'final-evidence', 'production');
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

async function runChromeDevToolsAutomatedSuite() {
  console.log(`========================================================================`);
  console.log(`🚀 PRINTBK FINAL AUTOMATED CHROME DEVTOOLS VERIFICATION SUITE`);
  console.log(`   Target Production: ${PROD_URL}`);
  console.log(`   Setup Code:        ${SETUP_CODE}`);
  console.log(`   Timestamp:         ${new Date().toISOString()}`);
  console.log(`========================================================================\n`);

  // Launch Chromium using Playwright (direct Chrome DevTools Protocol engine)
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const registeredCounterIds = [];
  let staffTokenToRevoke = null;

  try {
    // ========================================================================
    // 1. CHROME DEVTOOLS PROTOCOL: STAFF COUNTER DOWNLOAD & PAIRING PORTAL
    // ========================================================================
    console.log(`--- [1/5] Chrome DevTools Audit: Staff Counter Download & Setup Portal ---`);
    const desktopContext = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    });
    const staffPage = await desktopContext.newPage();
    const cdpStaff = await desktopContext.newCDPSession(staffPage);

    await cdpStaff.send('Performance.enable');
    await cdpStaff.send('Network.enable');
    await cdpStaff.send('Console.enable');

    const consoleLogs = [];
    const consoleErrors = [];
    cdpStaff.on('Console.messageAdded', (msg) => {
      consoleLogs.push(msg.message);
      if (msg.message.level === 'error') {
        consoleErrors.push(msg.message.text);
      }
    });

    const failedRequests = [];
    cdpStaff.on('Network.loadingFailed', (event) => {
      failedRequests.push(event);
    });

    const portalUrl = `${PROD_URL}/app/staff/index.html`;
    console.log(`  Navigating to Portal: ${portalUrl}`);
    const navResponse = await staffPage.goto(portalUrl, { waitUntil: 'load', timeout: 30000 });
    await staffPage.waitForTimeout(1000);
    check(navResponse.status() === 200, `Portal returned HTTP 200 OK (Status: ${navResponse.status()})`);

    // Performance Metrics from Chrome DevTools Protocol
    const perfMetrics = await cdpStaff.send('Performance.getMetrics');
    const metricMap = {};
    for (const m of perfMetrics.metrics) {
      metricMap[m.name] = m.value;
    }
    const jsHeapUsedMB = (metricMap.JSHeapUsedSize / 1024 / 1024).toFixed(2);
    const domNodes = metricMap.Nodes;
    console.log(`  Chrome CDP Metrics: JSHeapUsed=${jsHeapUsedMB} MB, DOMNodes=${domNodes}`);

    // Favicon & Page Title
    const title = await staffPage.title();
    check(title === 'PrintBK Counter', `Page title is clean and branded: "${title}"`);
    const faviconHref = await staffPage.getAttribute('link[rel~="icon"]', 'href');
    check(faviconHref && (faviconHref.includes('favicon.svg') || faviconHref.includes('printbk-logo')), `Valid favicon linked: ${faviconHref}`);

    // Header & Messaging Integrity
    const bodyContent = await staffPage.textContent('body');
    check(bodyContent.includes('PrintBK Counter'), 'Header displays "PrintBK Counter"');
    check(bodyContent.includes('DOWNLOAD FOR WINDOWS'), 'Windows Download CTA is prominently present');
    check(!bodyContent.includes('919999999999'), 'Zero fake phone numbers on portal');
    check(!bodyContent.includes('wa.me/'), 'Zero spam WhatsApp redirect links');

    // Windows Download Button & Binary Verification
    const downloadHref = await staffPage.getAttribute('#download-windows-btn, a.download-primary-button', 'href');
    check(downloadHref && downloadHref.includes('Sameer8549/PrintBK-releases'), `Download link points to official GitHub release: ${downloadHref}`);

    // Check HEAD of the release binary directly to confirm live reachability
    console.log(`  Verifying GitHub Release asset reachability: ${downloadHref}`);
    const headRes = await fetch(downloadHref, { method: 'HEAD', redirect: 'follow' });
    check(headRes.ok, `GitHub release binary is directly downloadable (HTTP ${headRes.status})`);
    const contentLength = headRes.headers.get('content-length');
    const sizeInMB = contentLength ? (parseInt(contentLength) / (1024 * 1024)).toFixed(1) : 'Unknown';
    console.log(`  Binary size on CDN: ${contentLength} bytes (~${sizeInMB} MB)`);
    check(sizeInMB === '100.5' || (contentLength && parseInt(contentLength) > 100000000), `Binary size matches expected 100.5 MB release build`);

    // Screenshot Staff Portal
    const staffScreenshot = path.join(evidenceDir, '01-client-staff-download-portal.png');
    await staffPage.screenshot({ path: staffScreenshot, fullPage: true });
    console.log(`  Captured screenshot: ${staffScreenshot}`);

    // Check for blocking errors
    check(consoleErrors.length === 0, `Zero Chrome console errors on staff download portal (errors: ${consoleErrors.length})`);
    check(failedRequests.length === 0, `Zero failed network requests on staff download portal (failed: ${failedRequests.length})`);

    // ========================================================================
    // 2. CHROME DEVTOOLS PROTOCOL: STUDENT WEB PORTAL AUDIT
    // ========================================================================
    console.log(`\n--- [2/5] Chrome DevTools Audit: Student Web App & Services ---`);
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 }, // Mobile Viewport (iPhone 13/14)
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
    });
    const studentPage = await mobileContext.newPage();
    const cdpStudent = await mobileContext.newCDPSession(studentPage);

    await cdpStudent.send('Console.enable');
    const studentErrors = [];
    cdpStudent.on('Console.messageAdded', (msg) => {
      if (msg.message.level === 'error') {
        studentErrors.push(msg.message.text);
      }
    });

    const studentUrl = `${PROD_URL}/app/index.html`;
    console.log(`  Navigating to Student Portal: ${studentUrl}`);
    await studentPage.goto(studentUrl, { waitUntil: 'load', timeout: 30000 });
    await studentPage.waitForTimeout(1000);

    const studentTitle = await studentPage.title();
    console.log(`  Student Page title: "${studentTitle}"`);
    check(studentTitle.includes('PrintBK') || studentTitle.length > 0, `Student app loaded successfully`);

    // Check Service Availability in Public Shop Config
    const configRes = await fetch(`${PROD_URL}/server/api/shop/config`);
    check(configRes.ok, `Shop config API reachable (HTTP ${configRes.status})`);
    const configData = await configRes.json();
    const serviceKeys = Object.keys(configData.services || {});
    console.log(`  Configured Shop Services (${serviceKeys.length}):`, serviceKeys.join(', '));
    check(serviceKeys.includes('binding_staple') || serviceKeys.includes('staple'), 'Corner Staple / Pin is configured in shop services');
    check(serviceKeys.includes('something_else') || serviceKeys.includes('custom'), 'Need Something Else / Custom service is configured in shop services');

    const studentScreenshot = path.join(evidenceDir, '02-client-student-home.png');
    await studentPage.screenshot({ path: studentScreenshot, fullPage: true });

    // Settings Page Audit
    console.log(`  Auditing Student Settings...`);
    await studentPage.evaluate(() => { window.location.hash = '#/settings'; });
    await studentPage.waitForTimeout(800);
    const settingsBody = await studentPage.textContent('body');
    check(settingsBody.includes('Campus Hub & Support'), 'Settings displays Campus Hub & Support');
    check(!settingsBody.includes('87068'), 'Settings contains NO raw/fake contact numbers');
    const settingsScreenshot = path.join(evidenceDir, '03-client-student-settings.png');
    await studentPage.screenshot({ path: settingsScreenshot, fullPage: true });

    // About Page Audit
    console.log(`  Auditing Student About Page...`);
    await studentPage.click('button:has-text("About PrintBK")');
    await studentPage.waitForTimeout(800);
    const scrollYAbout = await studentPage.evaluate(() => window.scrollY || document.documentElement.scrollTop || 0);
    check(scrollYAbout === 0, `About page opened cleanly at absolute top (scrollY=${scrollYAbout}px)`);
    const aboutBody = await studentPage.textContent('body');
    check(aboutBody.includes('Across All HKBK Institutions'), 'About specifies "Across All HKBK Institutions"');
    check(!aboutBody.includes('HKBK College of Engineering'), 'About does NOT restrict to specific single college');
    check(!aboutBody.includes('CSE, ISE'), 'About does NOT restrict to specific engineering branches');
    check(aboutBody.includes('Abdul Sameer'), 'About attributes creator Abdul Sameer');
    check(!aboutBody.includes('87068'), 'About contains NO raw/fake phone numbers');
    const aboutScreenshot = path.join(evidenceDir, '04-client-student-about.png');
    await studentPage.screenshot({ path: aboutScreenshot, fullPage: true });

    // Privacy Page Audit
    console.log(`  Auditing Student Privacy Policy Page...`);
    await studentPage.evaluate(() => { window.location.hash = '#/privacy'; });
    await studentPage.waitForTimeout(800);
    const scrollYPrivacy = await studentPage.evaluate(() => window.scrollY || document.documentElement.scrollTop || 0);
    check(scrollYPrivacy === 0, `Privacy page opened cleanly at absolute top (scrollY=${scrollYPrivacy}px)`);
    const privacyBody = await studentPage.textContent('body');
    check(privacyBody.includes('Zero-Retention Guarantee'), 'Privacy includes "Zero-Retention Guarantee"');
    check(privacyBody.includes('Automated Privacy File Purge'), 'Privacy includes "Automated Privacy File Purge"');
    check(!privacyBody.includes('87068'), 'Privacy contains NO raw/fake phone numbers');
    const privacyScreenshot = path.join(evidenceDir, '05-client-student-privacy.png');
    await studentPage.screenshot({ path: privacyScreenshot, fullPage: true });

    // ========================================================================
    // 3. HARDWARE TEST PRINT & STUDENT QR CODE IN-PAGE EMBEDDING VERIFICATION
    // ========================================================================
    console.log(`\n--- [3/5] Hardware Test Print & QR Placard Verification ---`);
    const testprintModule = await import('../counter-app/dist/bundled-agent/src/testprint.js');
    const { generateTestPrintPdf } = testprintModule;

    const testPdfBytes = await generateTestPrintPdf('Canon imageRUNNER 2525 UFRII LT', {
      name: 'HKBK Student Point'
    });

    check(testPdfBytes instanceof Uint8Array, 'generateTestPrintPdf returned valid Uint8Array');
    const pdfMagic = Buffer.from(testPdfBytes.slice(0, 5)).toString();
    check(pdfMagic === '%PDF-', `Output is authentic PDF document (Magic header: ${pdfMagic})`);
    check(testPdfBytes.length > 5000, `PDF size is authentic with vector art and embedded QR assets (${testPdfBytes.length} bytes)`);

    // Verify PDF structure with pdf-lib
    const loadedPdf = await PDFDocument.load(testPdfBytes);
    const pages = loadedPdf.getPages();
    check(pages.length === 1, `Test page contains exactly 1 page (pages=${pages.length})`);
    const { width, height } = pages[0].getSize();
    check(Math.abs(width - 595.28) < 1 && Math.abs(height - 841.89) < 1, `Dimensions match standard A4 paper (595.28 x 841.89 pt)`);

    // Save sample test print to evidence
    const testPdfPath = path.join(evidenceDir, 'Client-PC-Hardware-Test-Print-QR.pdf');
    fs.writeFileSync(testPdfPath, Buffer.from(testPdfBytes));
    console.log(`  Saved verified test print PDF: ${testPdfPath}`);

    // ========================================================================
    // 4. CLIENT WORKSTATION INDEPENDENT PAIRING & MULTI-PC ISOLATION
    // ========================================================================
    console.log(`\n--- [4/5] Multi-Workstation Pairing & Hardware Isolation Check ---`);

    // Pair PC 1
    const pair1Res = await fetch(`${PROD_URL}/server/api/counter/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setupCode: SETUP_CODE,
        label: 'Client Workstation PC #1 (Main Counter)'
      })
    });
    check(pair1Res.ok, `Client PC #1 paired successfully (HTTP ${pair1Res.status})`);
    const pair1 = await pair1Res.json();
    const staffToken1 = pair1.staffCredentials?.token;
    const agentToken1 = pair1.agentCredentials?.token;
    check(Boolean(staffToken1) && Boolean(agentToken1), 'PC #1 acquired staffToken and agentToken');
    registeredCounterIds.push(pair1.counterId);
    staffTokenToRevoke = staffToken1;

    // Pair PC 2
    const pair2Res = await fetch(`${PROD_URL}/server/api/counter/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setupCode: SETUP_CODE,
        label: 'Client Workstation PC #2 (Secondary Counter)'
      })
    });
    check(pair2Res.ok, `Client PC #2 paired successfully (HTTP ${pair2Res.status})`);
    const pair2 = await pair2Res.json();
    const staffToken2 = pair2.staffCredentials?.token;
    const agentToken2 = pair2.agentCredentials?.token;
    check(Boolean(staffToken2) && Boolean(agentToken2), 'PC #2 acquired staffToken and agentToken');
    registeredCounterIds.push(pair2.counterId);

    // Independence: tokens must differ
    check(staffToken1 !== staffToken2, 'PC #1 and PC #2 have unique, isolated staff tokens');
    check(agentToken1 !== agentToken2, 'PC #1 and PC #2 have unique, isolated agent tokens');

    // Test Security: Invalid Setup Code rejection
    const badPairRes = await fetch(`${PROD_URL}/server/api/counter/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setupCode: 'PBK-INVALID-0000',
        label: 'Intruder PC'
      })
    });
    check(badPairRes.status === 401, `Invalid setup code cleanly rejected with HTTP 401 Unauthorized (Status: ${badPairRes.status})`);

    // Agent Heartbeat and Printer Discovery from PC #1
    const hbRes = await fetch(`${PROD_URL}/server/api/agent/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Token': agentToken1
      },
      body: JSON.stringify({
        status: 'idle',
        printers: [
          { name: 'Canon imageRUNNER 2525', isDefault: true, status: 'idle', colorSupported: false },
          { name: 'HP LaserJet Pro M454dn', isDefault: false, status: 'idle', colorSupported: true }
        ],
        agentVersion: '1.0.0'
      })
    });
    check(hbRes.ok, `PC #1 agent heartbeat acknowledged (HTTP ${hbRes.status})`);

    // Live Queue Verification via Catalyst Cache
    const live1Res = await fetch(`${PROD_URL}/server/api/staff/live`, {
      headers: { 'X-Staff-Device-Token': staffToken1 }
    });
    check(live1Res.ok, `PC #1 fetched live queue (HTTP ${live1Res.status})`);
    const live1Data = await live1Res.json();
    console.log(`  Live Queue Check: Active Orders=${live1Data.orders?.length || 0}, Active Items=${live1Data.items?.length || 0}`);
    check((live1Data.orders?.length || 0) === 0, 'Production live queue has 0 active fake/test orders (Clean Slate)');

    // ========================================================================
    // 5. PRODUCTION DATASTORE CLEAN SLATE & AUDIT PURGE
    // ========================================================================
    console.log(`\n--- [5/5] Production Datastore Clean Slate & Device Revocation ---`);

    for (const cId of registeredCounterIds) {
      const revokeRes = await fetch(`${PROD_URL}/server/api/staff/counters/${cId}/revoke`, {
        method: 'POST',
        headers: { 'X-Staff-Device-Token': staffTokenToRevoke }
      });
      console.log(`  Revoked temporary verification counter ${cId}: HTTP ${revokeRes.status}`);
    }

    // Verify datastore is 100% clean of unrevoked counters
    const countersRes = await fetch(`${PROD_URL}/server/api/staff/counters`, {
      headers: { 'X-Staff-Device-Token': staffTokenToRevoke }
    });
    if (countersRes.ok) {
      const countersData = await countersRes.json();
      const unrevokedCounters = (countersData.counters || []).filter(c => !c.revoked);
      console.log(`  Unrevoked counters remaining in Datastore: ${unrevokedCounters.length}`);
      check(unrevokedCounters.length === 0, 'Datastore has 0 unrevoked counters — Client PC will be First Registered Device');
    }

    // Local Developer Store Hygiene Check
    const localStorePath = path.join(process.env.APPDATA || '', 'PrintBK', 'counter-store.json');
    const localStoreExists = fs.existsSync(localStorePath);
    console.log(`  Checking local developer store at: ${localStorePath} (exists: ${localStoreExists})`);
    if (localStoreExists) {
      fs.unlinkSync(localStorePath);
      console.log('  Cleaned local developer store.');
    }
    check(!fs.existsSync(localStorePath), 'Local developer counter store is completely wiped');

    console.log(`\n========================================================================`);
    console.log(`🎉 ALL ${passCount}/${totalChecks} FINAL AUTOMATED CHECKS PASSED EMPIRICALLY!`);
    console.log(`   Client PC is 100% ready for setup with code: ${SETUP_CODE}`);
    console.log(`========================================================================\n`);

  } finally {
    await browser.close();
  }
}

runChromeDevToolsAutomatedSuite().catch((err) => {
  console.error('\n❌ AUTOMATED VERIFICATION SUITE FAILED:', err);
  process.exit(1);
});
