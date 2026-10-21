import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const staffRequire = createRequire(path.join(rootDir, 'staff', 'package.json'));
const { chromium } = staffRequire('@playwright/test');

const clientDir = path.join(rootDir, 'client');
const evidenceDir = path.join(rootDir, 'docs', 'final-evidence', 'download-page');
fs.mkdirSync(evidenceDir, { recursive: true });

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
  const urlObj = new URL(req.url, 'http://localhost:4299');
  let pathname = urlObj.pathname;

  // Mock /server/api/counter/version
  if (pathname === '/server/api/counter/version' || pathname === '/counter/version') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      latestVersion: '1.0.0',
      minSupportedVersion: '1.0.0',
      fileSize: '118 MB',
      fileSizeBytes: 123731968,
      releaseDate: 'October 2026',
      sha256: '63768f5d0505a415a772ebc17fb1ff756e07b5ca31a44e5033fcb16751c6c579',
      downloadUrl: 'https://github.com/glittercowboy/PrintBK-releases/releases/latest/download/PrintBK-Counter-Setup-1.0.0.exe',
      stableDownloadUrl: 'https://github.com/glittercowboy/PrintBK-releases/releases/latest/download/PrintBK-Counter-Setup.exe',
      updateFeedUrl: 'https://github.com/glittercowboy/PrintBK-releases/releases/latest/download',
      releaseNotes: 'PrintBK Counter unified desktop application with embedded print agent and automated Windows printer management.',
      serverTime: Math.floor(Date.now() / 1000)
    }));
  }

  // General server/api mock
  if (pathname.startsWith('/server/api/') || pathname.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok' }));
  }

  let filePath;
  if (pathname === '/staff/' || pathname === '/staff') {
    filePath = path.join(clientDir, 'staff', 'index.html');
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

  res.writeHead(404);
  res.end('Not Found: ' + pathname);
});

async function main() {
  await new Promise(r => server.listen(4299, r));
  console.log('Static test server listening on http://localhost:4299');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  console.log('--- 1. Navigating to /staff/ as Unpaired Normal Browser ---');
  await page.goto('http://localhost:4299/staff/');
  await page.waitForTimeout(1000);

  // 1. Verify headline & subline
  const headline = await page.textContent('.download-headline');
  console.log(`Headline: "${headline}"`);
  if (!headline || !headline.includes('PrintBK Counter')) {
    throw new Error(`Expected headline to include "PrintBK Counter", got "${headline}"`);
  }

  const subline = await page.textContent('.download-subline');
  console.log(`Subline: "${subline}"`);
  if (!subline || !subline.includes('Install once on your shop PC. Everything is included.')) {
    throw new Error(`Expected subline match, got "${subline}"`);
  }

  // 2. Verify download button metadata
  const downloadBtn = await page.$('#download-windows-btn');
  if (!downloadBtn) throw new Error('Missing #download-windows-btn');
  const btnText = await downloadBtn.textContent();
  console.log(`Download button text: "${btnText?.trim()}"`);
  if (!btnText?.includes('DOWNLOAD FOR WINDOWS') || !btnText?.includes('118 MB')) {
    throw new Error(`Expected download button to display version and size, got "${btnText}"`);
  }

  // 3. Verify SHA-256 displayed
  const hashText = await page.textContent('.integrity-hash');
  console.log(`Displayed SHA-256: "${hashText}"`);
  if (!hashText?.includes('63768f5d0505a415a772ebc17fb1ff756e07b5ca31a44e5033fcb16751c6c579')) {
    throw new Error(`Expected exact SHA-256 match, got "${hashText}"`);
  }

  // Capture full download page screenshot
  const screenshotPath = path.join(evidenceDir, 'download-page-desktop.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`✅ Saved full desktop download page screenshot to: ${screenshotPath}`);

  // 4. Test "Owner on a phone? Pair this browser" toggle
  console.log('\n--- 2. Testing Owner Pairing Toggle ---');
  const pairToggleBtn = await page.$('.download-alt-link');
  if (!pairToggleBtn) throw new Error('Missing .download-alt-link');
  await pairToggleBtn.click();
  await page.waitForTimeout(500);

  const pairingSection = await page.$('#owner-pairing-section');
  if (!pairingSection) throw new Error('Owner pairing section did not appear on toggle click');
  console.log('✅ Owner mobile pairing section revealed successfully.');

  const pairScreenshotPath = path.join(evidenceDir, 'download-page-pairing-revealed.png');
  await page.screenshot({ path: pairScreenshotPath });
  console.log(`✅ Saved pairing panel screenshot to: ${pairScreenshotPath}`);

  // 5. Test Mobile Viewport
  console.log('\n--- 3. Testing Mobile Viewport Adaptation ---');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const mobileScreenshotPath = path.join(evidenceDir, 'download-page-mobile.png');
  await page.screenshot({ path: mobileScreenshotPath, fullPage: true });
  console.log(`✅ Saved mobile download page screenshot to: ${mobileScreenshotPath}`);

  await browser.close();
  server.close();
  console.log('\n========================================');
  console.log('🎉 ALL DOWNLOAD PAGE CHECKS PASSED!');
  console.log('========================================\n');
}

main().catch(err => {
  console.error('FAILED:', err);
  server.close();
  process.exit(1);
});
