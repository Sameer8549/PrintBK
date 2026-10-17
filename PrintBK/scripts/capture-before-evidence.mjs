import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const staffRequire = createRequire(path.resolve('staff/package.json'));
const { chromium } = staffRequire('@playwright/test');

const evidenceDir = path.resolve('docs/final-evidence/before');
fs.mkdirSync(evidenceDir, { recursive: true });

const clientDir = path.resolve('client');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

// In-memory state for mock backend
let serverShopOpen = true;
let serverSettingsVersion = 1;

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, 'http://localhost:4199');
  let pathname = urlObj.pathname;

  // Mock server API
  if (pathname === '/server/api/config' || pathname === '/api/config' || pathname === '/config') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=5' });
    return res.end(JSON.stringify({
      version: serverSettingsVersion,
      open: serverShopOpen,
      shopName: 'HKBK Student Point',
      rates: { bw: 1.5, colour: 8.0, duplex: 0.85 },
      services: {},
      payments: { cash: true, upi: true },
      announcement: serverShopOpen ? '' : 'Shop is currently closed.',
      deleteDelayMinutes: 5,
      printerStatus: { online: true, summary: 'Online and ready' }
    }));
  }

  if (pathname === '/server/api/staff/settings' || pathname === '/api/staff/settings') {
    if (req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (typeof parsed.open !== 'undefined') {
            serverShopOpen = Boolean(parsed.open);
            serverSettingsVersion++;
          }
        } catch (_) {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, version: serverSettingsVersion, open: serverShopOpen }));
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ settings: { version: serverSettingsVersion, open: serverShopOpen } }));
  }

  if (pathname.startsWith('/server/api/staff/live') || pathname.startsWith('/api/staff/live')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      shop: { version: serverSettingsVersion, open: serverShopOpen },
      printers: [{ id: 'p1', name: 'HP LaserJet Pro', online: true, status: 'Ready' }],
      orders: [],
      items: [],
      counters: { pending: 0, printing: 0, ready: 0 },
      recentlyPrinted: []
    }));
  }

  if (pathname.startsWith('/server/api/') || pathname.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, orders: [] }));
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

  res.writeHead(404);
  res.end('Not Found');
});

async function run() {
  await new Promise(r => server.listen(4199, r));
  console.log('Capturing before-evidence on port 4199...');

  const browser = await chromium.launch({ headless: true });

  // 1. P1: Student Settings Page (Golden icons current state)
  const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const studentPage = await studentContext.newPage();
  await studentPage.goto('http://localhost:4199/#/settings');
  await studentPage.waitForTimeout(1000);
  await studentPage.screenshot({ path: path.join(evidenceDir, 'p1-settings-current-icons.png'), fullPage: true });
  console.log('Saved p1-settings-current-icons.png');

  // 2. P2: Scan for Emoji in rendered Settings DOM
  const emojiElements = await studentPage.evaluate(() => {
    const regex = /\p{Extended_Pictographic}/u;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const results = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (regex.test(node.nodeValue || '')) {
        results.push({ text: node.nodeValue?.trim(), parent: node.parentElement?.tagName });
      }
    }
    return results;
  });
  fs.writeFileSync(path.join(evidenceDir, 'p2-emoji-found.json'), JSON.stringify(emojiElements, null, 2));
  console.log('Saved p2-emoji-found.json, found emojis:', emojiElements.length);

  // 3. P3: Reproduce staff shop open/closed mismatch
  const staffContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const staffPage = await staffContext.newPage();
  await staffPage.goto('http://localhost:4199/staff/');
  await staffPage.evaluate(() => {
    localStorage.setItem('printbk-paired', 'true');
    localStorage.setItem('printbk_staff_paired', 'true');
    localStorage.setItem('printbk_staff_device_id', 'staff_master_pc');
    localStorage.setItem('printbk_staff_token', 'test_token');
  });
  await staffPage.goto('http://localhost:4199/staff/');
  await staffPage.waitForTimeout(1000);

  // In phone view or top bar, check open/closed switch
  await staffPage.screenshot({ path: path.join(evidenceDir, 'p3-staff-open-initial.png') });
  console.log('Saved p3-staff-open-initial.png');

  // 4. P4: Layout Congestion / Crowding at 360px & 390px
  const mobileContext360 = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page360 = await mobileContext360.newPage();
  await page360.goto('http://localhost:4199/#/');
  await page360.waitForTimeout(1000);
  await page360.screenshot({ path: path.join(evidenceDir, 'p4-student-entry-360px.png') });
  await page360.goto('http://localhost:4199/#/settings');
  await page360.waitForTimeout(1000);
  await page360.screenshot({ path: path.join(evidenceDir, 'p4-student-settings-360px.png'), fullPage: true });
  console.log('Saved p4-student-entry-360px.png and p4-student-settings-360px.png');

  // 5. P6: Student History with orders
  await studentPage.evaluate(() => {
    const mockOrder = {
      id: 'ord-test-p6',
      orderNumber: 1042,
      date: new Date().toISOString(),
      status: 'completed',
      payment_status: 'unpaid', // Stale or missing payment update
      paymentMethod: 'upi',
      total: 86,
      files: ['BCSL404_Lab.pdf']
    };
    localStorage.setItem('printbk-history', JSON.stringify([mockOrder]));
  });
  await studentPage.goto('http://localhost:4199/#/history');
  await studentPage.waitForTimeout(1000);
  await studentPage.screenshot({ path: path.join(evidenceDir, 'p6-history-payment-label-before.png') });
  console.log('Saved p6-history-payment-label-before.png');

  await studentContext.close();
  await staffContext.close();
  await mobileContext360.close();
  await browser.close();
  server.close();

  console.log('✅ Phase 0 Before-Evidence captured successfully in docs/final-evidence/before/');
}

run().catch(err => {
  console.error('Error in capture-before-evidence:', err);
  server.close();
  process.exit(1);
});
