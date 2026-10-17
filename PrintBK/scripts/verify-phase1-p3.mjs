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

// Unified test server: API requests go to Express apiApp, static requests go to client/
const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, 'http://localhost:4201');
  const pathname = urlObj.pathname;

  if (pathname.startsWith('/server/api') || pathname.startsWith('/api') || pathname === '/config' || pathname.startsWith('/orders') || pathname.startsWith('/upload')) {
    return apiApp(req, res);
  }

  // Static file serving
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

  // Fallback to index.html for SPA routes
  if (pathname.startsWith('/staff')) {
    const staffIndex = path.join(clientDir, 'staff/index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(staffIndex));
  }

  const studentIndex = path.join(clientDir, 'index.html');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  return res.end(fs.readFileSync(studentIndex));
});

async function main() {
  await new Promise(r => server.listen(4201, r));
  console.log('Running Phase 1 (P3) verification on port 4201...');

  const STAFF_TOKEN = 'fafeee08f195644f79d5dc333533fe7f82b226a05b6748b0072d9a6a04644485';

  // Ensure shop starts in OPEN state via backend API
  await fetch('http://localhost:4201/server/api/staff/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Token': STAFF_TOKEN
    },
    body: JSON.stringify({
      open: true,
      announcement: ''
    })
  });

  const browser = await chromium.launch({ headless: true });

  try {
    // 1. Staff Context
    const staffContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const staffPage = await staffContext.newPage();

    // Set staff credentials
    await staffPage.goto('http://localhost:4201/staff/');
    await staffPage.evaluate((token) => {
      localStorage.setItem('printbk-paired', 'true');
      localStorage.setItem('printbk_staff_paired', 'true');
      localStorage.setItem('printbk_staff_device_id', 'staff_master_pc');
      localStorage.setItem('printbk_staff_token', token);
    }, STAFF_TOKEN);
    await staffPage.reload();
    await staffPage.waitForTimeout(1000);

    // 2. Student Context
    const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const studentPage = await studentContext.newPage();
    await studentPage.goto('http://localhost:4201/#/');
    await studentPage.waitForTimeout(1500);

    // Check student initial status chip: Open
    const studentInitialChip = await studentPage.textContent('.status-chip');
    console.log(`[Student Initial] Status chip: "${studentInitialChip?.trim()}"`);
    assert.match(studentInitialChip || '', /Open/i, 'Student status chip must initially show Open');

    // 3. Staff toggles shop to CLOSED
    console.log('[Staff] Finding shop toggle switch...');
    const toggleButton = staffPage.locator('button.shop-switch');
    await toggleButton.first().click();
    await staffPage.waitForTimeout(1000);

    // Screenshot staff app closed state
    const staffClosedScreenshot = path.join(evidenceDir, 'p3-staff-closed.png');
    await staffPage.screenshot({ path: staffClosedScreenshot, fullPage: true });
    console.log(`[Staff] Saved ${staffClosedScreenshot}`);

    // Verify staff header shows CLOSED
    const staffHeaderText = await staffPage.textContent('header');
    assert.match(staffHeaderText || '', /CLOSED/i, 'Staff header must show CLOSED');

    // 4. Student app receives sync within 5s
    console.log('[Student] Waiting for student app to reflect CLOSED status...');
    await studentPage.waitForFunction(() => {
      const chip = document.querySelector('.status-chip');
      return chip && chip.textContent && chip.textContent.includes('Closed');
    }, { timeout: 6000 });

    const studentClosedChip = await studentPage.textContent('.status-chip');
    console.log(`[Student Closed] Status chip: "${studentClosedChip?.trim()}"`);
    assert.match(studentClosedChip || '', /Closed/i, 'Student status chip must show Closed');

    // Screenshot student app closed banner
    const studentClosedScreenshot = path.join(evidenceDir, 'p3-student-closed-banner.png');
    await studentPage.screenshot({ path: studentClosedScreenshot, fullPage: true });
    console.log(`[Student] Saved ${studentClosedScreenshot}`);

    // Verify upload action is blocked
    console.log('[Student] Testing upload block when shop is closed...');
    const uploadBtn = studentPage.locator('button:has-text("Browse Files"), button:has-text("Upload")');
    if (await uploadBtn.count() > 0) {
      await uploadBtn.first().click();
      await studentPage.waitForTimeout(500);
      // Verify notification shows shop closed
      const notificationText = await studentPage.textContent('body');
      assert.match(notificationText || '', /closed/i, 'Student must be alerted that shop is closed');
    }

    // 5. Test direct checkout API call is rejected with 503
    console.log('[API] Verifying checkout rejection (503) when closed...');
    const checkoutRes = await fetch('http://localhost:4201/server/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { name: 'E2E Student', phone: '9876543210' },
        service: 'bw',
        items: [{ type: 'document', pages: 1, copies: 1 }]
      })
    });
    assert.equal(checkoutRes.status, 503, 'Checkout must return 503 Service Unavailable when closed');
    const checkoutData = await checkoutRes.json();
    assert.equal(checkoutData.shopClosed, true, 'Checkout response must specify shopClosed: true');
    console.log('  ✓ POST /orders returned 503 with shopClosed: true');

    // 6. Staff toggles shop back to OPEN
    console.log('[Staff] Toggling shop back to OPEN...');
    await toggleButton.first().click();
    await staffPage.waitForTimeout(1000);

    // Wait for student app to return to OPEN
    console.log('[Student] Waiting for student app to reflect OPEN status...');
    await studentPage.waitForFunction(() => {
      const chip = document.querySelector('.status-chip');
      return chip && chip.textContent && chip.textContent.includes('Open');
    }, { timeout: 6000 });

    const studentReopenedChip = await studentPage.textContent('.status-chip');
    console.log(`[Student Reopened] Status chip: "${studentReopenedChip?.trim()}"`);
    assert.match(studentReopenedChip || '', /Open/i, 'Student status chip must show Open');

    const studentReopenedScreenshot = path.join(evidenceDir, 'p3-student-reopened.png');
    await studentPage.screenshot({ path: studentReopenedScreenshot, fullPage: true });
    console.log(`[Student] Saved ${studentReopenedScreenshot}`);

    console.log('\n🎉 Phase 1 (P3) Two-Context Playwright verification PASSED with empirical visual evidence!');
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
}

main().catch(err => {
  console.error('❌ Phase 1 verification failed:', err);
  process.exit(1);
});
