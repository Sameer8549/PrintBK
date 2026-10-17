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
  const urlObj = new URL(req.url, 'http://localhost:4206');
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

  // SPA fallback
  const fallback = pathname.startsWith('/staff') ? path.join(clientDir, 'staff/index.html') : path.join(clientDir, 'index.html');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(fallback));
});

await new Promise(r => server.listen(4206, r));
console.log('[verify-phase4] Server running on http://localhost:4206');

const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2
  });

  const page = await context.newPage();
  await page.goto('http://localhost:4206/#/settings', { waitUntil: 'networkidle' });

  console.log('[verify-phase4] Testing Settings page at 390px viewport...');

  // 1. Verify header title
  const title = await page.textContent('header, .topbar, [role="banner"]');
  console.log('[verify-phase4] Page title/header:', title?.trim());

  // 2. Count gold badges
  const badgeCount = await page.locator('.gold-badge').count();
  console.log(`[verify-phase4] Found ${badgeCount} rendered .gold-badge elements.`);
  assert.ok(badgeCount >= 12, `Expected at least 12 gold badges, found ${badgeCount}`);

  // 3. Inspect SVG gradients inside badges
  const sampleBadgeSvg = await page.locator('.gold-badge').first().innerHTML();
  assert.ok(sampleBadgeSvg.includes('pbk-gold-ring'), 'Gold badge must define glossy metallic ring gradient');
  assert.ok(sampleBadgeSvg.includes('pbk-gold-disc'), 'Gold badge must define black glass disc');
  assert.ok(sampleBadgeSvg.includes('pbk-gold-gly'), 'Gold badge must define metallic gold glyph gradient');
  console.log('[verify-phase4] ✓ SVG gradients and filters confirmed inside rendered badges.');

  // 4. Verify ZERO emoji characters in entire page text
  const bodyText = await page.locator('body').innerText();
  const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}]/u;
  const hasEmoji = emojiRegex.test(bodyText);
  assert.equal(hasEmoji, false, 'Body text contains disallowed emoji characters!');
  console.log('[verify-phase4] ✓ Verified ZERO emoji characters in rendered Settings DOM.');

  // 5. Capture mobile screenshot
  const mobileScreenshotPath = path.join(evidenceDir, 'p1-settings-gold-badges-390px.png');
  await page.screenshot({ path: mobileScreenshotPath, fullPage: true });
  console.log(`[verify-phase4] Saved mobile screenshot to ${mobileScreenshotPath}`);

  // 6. Test on desktop 1280px viewport
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(300);
  const desktopScreenshotPath = path.join(evidenceDir, 'p1-settings-gold-badges-1280px.png');
  await page.screenshot({ path: desktopScreenshotPath, fullPage: true });
  console.log(`[verify-phase4] Saved desktop screenshot to ${desktopScreenshotPath}`);

  console.log('[verify-phase4] SUCCESS: All gold badges and zero-emoji assertions passed!');
} finally {
  await browser.close();
  server.close();
}
