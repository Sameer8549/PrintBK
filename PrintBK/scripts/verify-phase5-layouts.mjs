import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const staffRequire = createRequire(path.resolve('staff/package.json'));
const { chromium } = staffRequire('@playwright/test');

const evidenceDir = path.resolve('docs/final-evidence/after/viewports');
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
  const urlObj = new URL(req.url, 'http://localhost:4208');
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

await new Promise(r => server.listen(4208, r));
console.log('[verify-phase5] Server running on http://localhost:4208');

const VIEWPORT_TESTS = [
  { width: 360, height: 800, label: '360px-small-mobile' },
  { width: 390, height: 844, label: '390px-standard-mobile' },
  { width: 430, height: 932, label: '430px-large-mobile' },
  { width: 768, height: 1024, label: '768px-tablet' },
  { width: 1280, height: 800, label: '1280px-laptop' },
  { width: 1440, height: 900, label: '1440px-desktop' },
  { width: 1920, height: 1080, label: '1920px-widescreen' },
];

const browser = await chromium.launch({ headless: true });

try {
  for (const vp of VIEWPORT_TESTS) {
    console.log(`\n[verify-phase5] Auditing Viewport: ${vp.label} (${vp.width}x${vp.height})...`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1
    });

    const page = await context.newPage();

    // 1. Audit Student Entry Page
    await page.goto('http://localhost:4208/#/', { waitUntil: 'networkidle' });
    let hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    assert.equal(hasHScroll, false, `Horizontal overflow detected on Student Entry at ${vp.width}px!`);
    await page.screenshot({ path: path.join(evidenceDir, `student-entry-${vp.label}.png`) });

    // 2. Audit Student Settings Page
    await page.goto('http://localhost:4208/#/settings', { waitUntil: 'networkidle' });
    hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    assert.equal(hasHScroll, false, `Horizontal overflow detected on Student Settings at ${vp.width}px!`);
    await page.screenshot({ path: path.join(evidenceDir, `student-settings-${vp.label}.png`) });

    // 3. Audit Student History Page
    await page.goto('http://localhost:4208/#/history', { waitUntil: 'networkidle' });
    hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    assert.equal(hasHScroll, false, `Horizontal overflow detected on Student History at ${vp.width}px!`);
    await page.screenshot({ path: path.join(evidenceDir, `student-history-${vp.label}.png`) });

    // 4. Audit Staff Counter App
    const STAFF_TOKEN = 'fafeee08f195644f79d5dc333533fe7f82b226a05b6748b0072d9a6a04644485';
    await page.goto('http://localhost:4208/staff/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((token) => {
      localStorage.setItem('printbk-paired', 'true');
      localStorage.setItem('printbk_staff_paired', 'true');
      localStorage.setItem('printbk_staff_device_id', 'staff_master_pc');
      localStorage.setItem('printbk_staff_token', token);
    }, STAFF_TOKEN);
    await page.goto('http://localhost:4208/staff/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    assert.equal(hasHScroll, false, `Horizontal overflow detected on Staff Counter at ${vp.width}px!`);
    await page.screenshot({ path: path.join(evidenceDir, `staff-counter-${vp.label}.png`) });

    console.log(`[verify-phase5] ✓ Passed 0 overflow, clean responsive layout at ${vp.width}px.`);
    await context.close();
  }

  console.log('\n[verify-phase5] ALL 7 VIEWPORTS PASSED WITH ZERO OVERFLOW OR CONGESTION!');
} finally {
  await browser.close();
  server.close();
}
