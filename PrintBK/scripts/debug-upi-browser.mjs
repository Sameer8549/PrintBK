import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('../staff/node_modules/@playwright/test');
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const clientDir = path.resolve('client');
const liveBase = 'https://printbk-60074625517.development.catalystserverless.in';

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
        const bodyChunks = [];
        for await (const chunk of req) bodyChunks.push(chunk);
        if (bodyChunks.length > 0) {
          options.body = Buffer.concat(bodyChunks);
        }
      }

      const proxyRes = await fetch(targetUrl, options);
      const respHeaders = Object.fromEntries(proxyRes.headers.entries());
      delete respHeaders['content-encoding'];
      delete respHeaders['content-length'];
      delete respHeaders['transfer-encoding'];
      const ab = await proxyRes.arrayBuffer();
      if (proxyRes.status >= 400) {
        console.error('Target returned error:', proxyRes.status, Buffer.from(ab).toString('utf8'));
      }
      res.writeHead(proxyRes.status, respHeaders);
      res.end(Buffer.from(ab));
      return;
    } catch (e) {
      console.error('Proxy error:', e);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
      return;
    }
  }

  let filePath = path.join(clientDir, pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    filePath = path.join(clientDir, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(4174, async () => {
  console.log('Testing UPI page on port 4174...');
  const oRes = await fetch(liveBase + '/server/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: [{ id: 'f1', name: 'doc.pdf', size: 1024, type: 'pdf', pages: 1, colorPages: 0, colorDetection: 'completed', settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4', orientation: 'portrait', range: 'all' } }],
      services: [],
      payment: 'upi'
    })
  });
  const oData = await oRes.json();
  console.log('Order created:', oData.orderId, oData.orderNumber);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('response', res => {
    if (res.url().includes('/server/api')) {
      console.log('API RESPONSE:', res.url(), res.status());
    }
  });

  await page.goto('http://localhost:4174/index.html');
  await page.evaluate((orderInfo) => {
    const record = {
      id: orderInfo.orderId,
      orderNumber: orderInfo.orderNumber,
      date: Date.now(),
      files: ['doc.pdf'],
      total: orderInfo.total || 1.5,
      pickupCode: orderInfo.pickupCode,
      status: 'pending_payment',
      accessToken: orderInfo.accessToken,
      paymentMethod: 'upi'
    };
    localStorage.setItem('printbk-history-v1', JSON.stringify({ state: { orders: [record] } }));
  }, oData);

  await page.goto(`http://localhost:4174/index.html#/pay/${oData.orderId}`);
  await page.waitForTimeout(2500);

  const outDir = path.resolve('docs/fix-evidence/after/viewports');
  await page.screenshot({ path: path.join(outDir, 'student-upi-p7-gated-hidden-390x844.png') });
  console.log('Saved hidden screenshot');

  const payLink = page.locator('text=Pay with Installed UPI Apps').first();
  console.log('Pay link visible:', await payLink.isVisible());
  if (await payLink.isVisible()) {
    // Click the pay link
    await payLink.click();
    await page.waitForTimeout(500);

    // Simulate switching back to tab (visibilitychange / focus)
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(outDir, 'student-upi-p7-gated-revealed-390x844.png') });
    console.log('Saved revealed screenshot');
  }

  await browser.close();
  server.close();
});
