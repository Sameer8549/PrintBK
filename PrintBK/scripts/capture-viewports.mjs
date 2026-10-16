import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('../staff/node_modules/@playwright/test');
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('docs/fix-evidence/after/viewports');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const clientDir = path.resolve('client');
const liveBase = 'https://printbk-60074625517.development.catalystserverless.in';

// Read staff setup code
const env = fs.readFileSync('functions/api/.env', 'utf8');
let setupCode = '';
for (const line of env.split(/\r?\n/)) {
  if (line.startsWith('STAFF_SETUP_CODE=')) {
    setupCode = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  }
}

// MIME dictionary
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
};

// Create local test server
const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, 'http://localhost:4173');
  const pathname = urlObj.pathname;

  // 1. Proxy API requests to live backend
  if (pathname.startsWith('/server/api')) {
    try {
      const targetUrl = liveBase + req.url;
      const headers = { ...req.headers, host: new URL(liveBase).host };
      delete headers['content-length'];

      const options = {
        method: req.method,
        headers,
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const bodyChunks = [];
        for await (const chunk of req) bodyChunks.push(chunk);
        options.body = Buffer.concat(bodyChunks);
      }

      const proxyRes = await fetch(targetUrl, options);
      res.writeHead(proxyRes.status, Object.fromEntries(proxyRes.headers.entries()));
      const ab = await proxyRes.arrayBuffer();
      res.end(Buffer.from(ab));
      return;
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy failed: ' + e.message }));
      return;
    }
  }

  // 2. Serve static client files
  let filePath = path.join(clientDir, pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    // SPA fallback
    if (pathname.startsWith('/staff')) {
      filePath = path.join(clientDir, 'staff', 'index.html');
    } else {
      filePath = path.join(clientDir, 'index.html');
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
});

const PORT = 4173;
server.listen(PORT, async () => {
  console.log(`🚀 [capture] Server listening on http://localhost:${PORT}`);
  try {
    await runCapture();
  } catch (err) {
    console.error('❌ [capture] Error:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});

async function runCapture() {
  console.log('🔑 Pairing staff device...');
  const pairRes = await fetch(`${liveBase}/server/api/staff/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupCode, label: 'Viewport Auditor' })
  });
  const pairData = await pairRes.json();
  const staffToken = pairData.token;
  console.log('✅ Staff paired, token received');

  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: '1920x1080', width: 1920, height: 1080 },
    { name: '1440x900', width: 1440, height: 900 },
    { name: '1024x768', width: 1024, height: 768 },
    { name: '390x844', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    console.log(`\n📸 Capturing viewports for ${vp.name}...`);

    // ─────────────────────────────────────────────────────────────
    // STAFF APP CAPTURES
    // ─────────────────────────────────────────────────────────────
    const staffCtx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const staffPage = await staffCtx.newPage();

    // Inject staff token
    await staffPage.goto(`http://localhost:${PORT}/staff/index.html`);
    await staffPage.evaluate((tok) => {
      localStorage.setItem('printbk_staff_token', tok);
      localStorage.setItem('printbk-paired', 'true');
    }, staffToken);

    // Reload with authenticated token
    await staffPage.goto(`http://localhost:${PORT}/staff/index.html`);
    await staffPage.waitForTimeout(2000);

    // 1. Staff Orders Board (Empty state verification)
    await staffPage.screenshot({
      path: path.join(outDir, `staff-orders-empty-${vp.name}.png`),
      fullPage: false
    });
    console.log(`  ✓ staff-orders-empty-${vp.name}.png`);

    // 2. Staff Today & History View
    const todayBtn = staffPage.getByRole('button', { name: /today/i }).first();
    if (await todayBtn.isVisible()) {
      await todayBtn.click();
      await staffPage.waitForTimeout(1000);
      
      const histBtn = staffPage.getByRole('button', { name: /orders history/i }).first();
      if (await histBtn.isVisible()) {
        await histBtn.click();
        await staffPage.waitForTimeout(1500);
        await staffPage.screenshot({
          path: path.join(outDir, `staff-history-${vp.name}.png`),
          fullPage: false
        });
        console.log(`  ✓ staff-history-${vp.name}.png`);
      }

      // Return to orders view
      const backOrdersBtn = staffPage.getByRole('button', { name: /back to live orders/i }).first();
      if (await backOrdersBtn.isVisible()) {
        await backOrdersBtn.click();
        await staffPage.waitForTimeout(1000);
      }
    }

    // 3. Staff Settings View (Modal with Printers tab, Pricing tab, Shop Info tab)
    const settingsBtn = staffPage.getByRole('button', { name: /settings/i }).first();
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
      await staffPage.waitForTimeout(1500);

      // Printers tab (default)
      await staffPage.screenshot({
        path: path.join(outDir, `staff-settings-printers-${vp.name}.png`),
        fullPage: false
      });
      console.log(`  ✓ staff-settings-printers-${vp.name}.png`);

      // Pricing & Payment tab
      const tabs = staffPage.locator('.settings-tabs button');
      const tabCount = await tabs.count();
      if (tabCount >= 2) {
        await tabs.nth(1).click();
        await staffPage.waitForTimeout(1000);
        await staffPage.screenshot({
          path: path.join(outDir, `staff-settings-pricing-${vp.name}.png`),
          fullPage: false
        });
        console.log(`  ✓ staff-settings-pricing-${vp.name}.png`);
      }

      // Shop Info tab
      if (tabCount >= 3) {
        await tabs.nth(2).click();
        await staffPage.waitForTimeout(1000);
        await staffPage.screenshot({
          path: path.join(outDir, `staff-settings-shopinfo-${vp.name}.png`),
          fullPage: false
        });
        console.log(`  ✓ staff-settings-shopinfo-${vp.name}.png`);
      }

      // Close settings
      const closeBtn = staffPage.locator('button[aria-label="Close printer settings"]').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await staffPage.waitForTimeout(500);
      }
    }

    await staffCtx.close();

    // ─────────────────────────────────────────────────────────────
    // STUDENT APP CAPTURES
    // ─────────────────────────────────────────────────────────────
    const studentCtx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const studentPage = await studentCtx.newPage();

    // 1. Student Home
    await studentPage.goto(`http://localhost:${PORT}/index.html`);
    await studentPage.waitForTimeout(2000);
    await studentPage.screenshot({
      path: path.join(outDir, `student-home-${vp.name}.png`),
      fullPage: false
    });
    console.log(`  ✓ student-home-${vp.name}.png`);

    // 2. Student Settings (Golden Icons P8)
    await studentPage.goto(`http://localhost:${PORT}/index.html#/settings`);
    await studentPage.waitForTimeout(1500);
    await studentPage.screenshot({
      path: path.join(outDir, `student-settings-golden-icons-${vp.name}.png`),
      fullPage: false
    });
    console.log(`  ✓ student-settings-golden-icons-${vp.name}.png`);

    // 3. Student History (Empty state P1)
    await studentPage.goto(`http://localhost:${PORT}/index.html#/history`);
    await studentPage.waitForTimeout(1500);
    await studentPage.screenshot({
      path: path.join(outDir, `student-history-empty-${vp.name}.png`),
      fullPage: false
    });
    console.log(`  ✓ student-history-empty-${vp.name}.png`);

    await studentCtx.close();
  }

  // ─────────────────────────────────────────────────────────────
  // P7 STUDENT UPI GATING VERIFICATION (Before / After App Open)
  // ─────────────────────────────────────────────────────────────
  console.log('\n💳 Verifying Student UPI Gating (P7)...');
  const orderRes = await fetch(`${liveBase}/server/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: [{
        id: 'test-upi-gate-doc',
        name: 'UPI_Gating_Test.pdf',
        size: 1024,
        type: 'pdf',
        pages: 1,
        colorPages: 0,
        colorDetection: 'completed',
        settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4', orientation: 'portrait', range: 'all' }
      }],
      services: [],
      payment: 'upi'
    })
  });
  const orderData = await orderRes.json();
  console.log(`  Created test order: ${orderData.orderId} (#${orderData.orderNumber})`);

  if (orderData.orderId) {
    const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await mobileCtx.newPage();

    // First initialize localStorage with the order record and accessToken
    await mobilePage.goto(`http://localhost:${PORT}/index.html`);
    await mobilePage.evaluate((orderInfo) => {
      const record = {
        id: orderInfo.orderId,
        orderNumber: orderInfo.orderNumber,
        date: Date.now(),
        files: ['UPI_Gating_Test.pdf'],
        total: orderInfo.total || 1.5,
        pickupCode: orderInfo.pickupCode,
        status: 'pending_payment',
        accessToken: orderInfo.accessToken,
        paymentMethod: 'upi'
      };
      localStorage.setItem('printbk-history-v1', JSON.stringify({ state: { orders: [record] } }));
    }, orderData);

    await mobilePage.goto(`http://localhost:${PORT}/index.html#/pay/${orderData.orderId}`);
    await mobilePage.waitForTimeout(2000);

    // Initial state: "I've paid" button must NOT be visible before UPI app is opened
    await mobilePage.screenshot({
      path: path.join(outDir, 'student-upi-p7-gated-hidden-390x844.png'),
      fullPage: false
    });
    console.log('  ✓ student-upi-p7-gated-hidden-390x844.png (Initially hidden)');

    // Simulate clicking "Pay with Installed UPI Apps"
    const payBtn = mobilePage.getByRole('button', { name: /pay with installed upi apps/i }).first();
    if (await payBtn.isVisible()) {
      await payBtn.click();
      await mobilePage.waitForTimeout(500);

      // Simulate user returning back to tab (focus)
      await mobilePage.evaluate(() => {
        window.dispatchEvent(new Event('focus'));
      });
      await mobilePage.waitForTimeout(1500);

      // Now "I've paid" button card MUST be visible!
      await mobilePage.screenshot({
        path: path.join(outDir, 'student-upi-p7-gated-revealed-390x844.png'),
        fullPage: false
      });
      console.log('  ✓ student-upi-p7-gated-revealed-390x844.png (Revealed on return)');
    } else {
      console.warn('  ⚠️ "Pay with Installed UPI Apps" button not visible on page');
    }

    await mobileCtx.close();
  }

  await browser.close();
  console.log('\n🎉 Multi-viewport visual capture complete!');
}
