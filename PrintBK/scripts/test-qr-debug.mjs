import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');

const require = createRequire(import.meta.url);
const { chromium } = require('../staff/node_modules/@playwright/test');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const clientDir = path.resolve(rootDir, 'client');
const evidenceDir = path.resolve(rootDir, 'docs/fix-evidence/after');
if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, 'http://localhost:4173');
  const pathname = urlObj.pathname;

  if (pathname.startsWith('/server/api')) {
    try {
      const liveBase = 'https://printbk-60074625517.development.catalystserverless.in';
      const targetUrl = liveBase + req.url;
      const headers = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (!['host', 'content-length', 'origin', 'referer'].includes(k.toLowerCase())) {
          headers[k] = v;
        }
      }
      headers.host = new URL(liveBase).host;

      const options = {
        method: req.method,
        headers,
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        if (chunks.length > 0) options.body = Buffer.concat(chunks);
      }

      const proxyRes = await fetch(targetUrl, options);
      const respHeaders = Object.fromEntries(proxyRes.headers.entries());
      delete respHeaders['content-encoding'];
      delete respHeaders['content-length'];
      delete respHeaders['transfer-encoding'];
      const ab = await proxyRes.arrayBuffer();

      res.writeHead(proxyRes.status, respHeaders);
      return res.end(Buffer.from(ab));
    } catch (err) {
      console.error('Proxy error:', err);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Proxy failed', message: err.message }));
    }
  }

  let filePath;
  if (pathname === '/staff/' || pathname === '/staff') {
    filePath = path.join(clientDir, 'staff/index.html');
  } else if (pathname.startsWith('/staff/assets/')) {
    filePath = path.join(clientDir, 'staff', pathname.replace('/staff/', ''));
  } else if (pathname.startsWith('/assets/')) {
    filePath = path.join(clientDir, pathname);
  } else if (pathname === '/' || pathname === '') {
    filePath = path.join(clientDir, 'index.html');
  } else {
    filePath = path.join(clientDir, pathname);
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    return res.end(fs.readFileSync(filePath));
  }

  res.writeHead(404);
  res.end('Not Found');
});

let staffToken = '';
const envPath = path.resolve(rootDir, 'functions/api/.env');
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  for (const line of env.split(/\r?\n/)) {
    if (line.startsWith('STAFF_TOKEN=')) staffToken = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  }
}

async function run() {
  await new Promise(r => server.listen(4173, r));
  console.log('Test server listening on http://localhost:4173');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER_LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('BROWSER_PAGEERROR:', err));

  // Load staff app
  await page.goto('http://localhost:4173/staff/');
  await page.evaluate((tok) => {
    localStorage.setItem('printbk-paired', 'true');
    localStorage.setItem('printbk_staff_paired', 'true');
    localStorage.setItem('printbk_staff_device_id', 'staff_master_pc');
    localStorage.setItem('printbk_staff_token', tok);
    localStorage.setItem('printbk_include_test', 'true');
  }, staffToken);
  await page.goto('http://localhost:4173/staff/');
  await page.waitForSelector('text=PrintBK', { timeout: 10000 });

  // Open settings
  await page.click('button:has-text("Settings")');
  await page.waitForSelector('text=SHOP QR POSTER', { timeout: 10000 });
  await page.screenshot({ path: path.join(evidenceDir, 'debug-qr-settings.png') });
  console.log('Saved debug-qr-settings.png');

  // Click "PRINT YOUR QR"
  await page.click('button:has-text("PRINT YOUR QR")');
  await page.waitForSelector('.qr-modal-container', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({ path: path.join(evidenceDir, 'debug-qr-modal.png') });
  console.log('Saved debug-qr-modal.png');

  // Test page.pdf
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
  });

  const pdfPath = path.join(evidenceDir, 'debug-browser-print.pdf');
  fs.writeFileSync(pdfPath, pdfBuffer);
  console.log('Saved debug-browser-print.pdf, size:', pdfBuffer.length);

  // Check how many pages debug-browser-print.pdf has using pdf-lib
  const { PDFDocument } = require('../staff/node_modules/pdf-lib');
  const loadedPdf = await PDFDocument.load(pdfBuffer);
  const pageCount = loadedPdf.getPageCount();
  console.log(`Debug browser print has ${pageCount} pages!`);

  // Rasterize page 1 using a new page with bypassCSP
  const renderPage = await browser.newPage({
    viewport: { width: 1240, height: 1754 },
    deviceScaleFactor: 2,
    bypassCSP: true
  });
  const base64Pdf = pdfBuffer.toString('base64');
  await renderPage.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <style>body { margin: 0; background: white; }</style>
      </head>
      <body>
        <div id="canvases"></div>
        <script>
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          const rawData = atob("${base64Pdf}");
          const uint8Array = new Uint8Array(rawData.length);
          for (let i = 0; i < rawData.length; i++) uint8Array[i] = rawData.charCodeAt(i);
          window.renderPages = async () => {
            const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
            for (let i = 1; i <= pdf.numPages; i++) {
              const p = await pdf.getPage(i);
              const viewport = p.getViewport({ scale: 2.0 });
              const canvas = document.createElement('canvas');
              canvas.id = 'print-page-' + i;
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              document.getElementById('canvases').appendChild(canvas);
              await p.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            }
            return pdf.numPages;
          };
        </script>
      </body>
    </html>
  `);

  await renderPage.waitForFunction(() => typeof window.renderPages === 'function');
  const renderedCount = await renderPage.evaluate(() => window.renderPages());
  console.log('Rasterized pages:', renderedCount);
  await renderPage.waitForTimeout(1000);

  for (let i = 1; i <= renderedCount; i++) {
    const c = renderPage.locator('#print-page-' + i);
    const out = path.join(evidenceDir, `debug-print-p${i}.png`);
    await c.screenshot({ path: out });
    console.log(`Saved ${out}`);
  }

  await browser.close();
  server.close();
}

run().catch(err => {
  console.error('Test run failed:', err);
  server.close();
  process.exit(1);
});
