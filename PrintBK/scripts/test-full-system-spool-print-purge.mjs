#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Import the main express app from functions/api
const app = (await import('../functions/api/index.js')).default || (await import('../functions/api/index.js'));

let server;
let BASE;
let passed = 0;
let failed = 0;

function assert(cond, name, details = '') {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${name} -- ${details}`);
    failed++;
  }
}

async function run() {
  console.log('🚀 Starting Full System Spool, Print, Purge & Agent Files Verification...\n');

  // Start local ephemeral HTTP server
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      BASE = `http://127.0.0.1:${port}/server/api`;
      resolve();
    });
  });

  const staffHeaders = {
    'Content-Type': 'application/json',
    'x-staff-token': 'PBK-SETUP-9021',
    'x-test-suite': 'true'
  };

  const agentHeaders = {
    'Content-Type': 'application/json',
    'x-agent-token': 'PBK-SETUP-9021',
    'x-test-suite': 'true'
  };

  try {
    // ════════════════════════════════════════════════════════════════════
    // 1. VERIFY AGENT FILES & DOWNLOADS
    // ════════════════════════════════════════════════════════════════════
    console.log('--- 1. Agent Files & Staff Download Hub ---');
    const allInOneRes = await fetch(`${BASE}/counter/agent/download/PrintBK-Counter-AllInOne.bat`);
    assert(allInOneRes.status === 200, 'PrintBK-Counter-AllInOne.bat is downloadable (200 OK)');
    const allInOneText = await allInOneRes.text();
    assert(allInOneText.includes('PrintBK Counter Station & Print Spooler Agent'), 'PrintBK-Counter-AllInOne.bat has unified header');
    assert(allInOneText.includes('PBK-SETUP-9021'), 'PrintBK-Counter-AllInOne.bat includes setup code PBK-SETUP-9021');
    assert(allInOneText.includes('app/staff/index.html'), 'PrintBK-Counter-AllInOne.bat launches staff counter app');

    const agentZipRes = await fetch(`${BASE}/counter/agent/download/printbk-agent-standalone.zip`);
    assert(agentZipRes.status === 200, 'Agent standalone zip bundle is downloadable (200 OK)', `Got ${agentZipRes.status}`);
    const zipBuf = Buffer.from(await agentZipRes.arrayBuffer());
    assert(zipBuf.length > 5000, `Agent bundle has valid size (${zipBuf.length} bytes)`, `Got ${zipBuf.length}`);
    assert(zipBuf[0] === 0x50 && zipBuf[1] === 0x4B, 'Agent bundle has valid PK zip magic header');

    const startBatRes = await fetch(`${BASE}/counter/agent/download/start-agent.bat`);
    assert(startBatRes.status === 200, 'start-agent.bat is downloadable (200 OK)');
    const startBatText = await startBatRes.text();
    assert(startBatText.includes('PrintBK Windows Print Agent'), 'start-agent.bat contains agent startup script');

    const installServiceRes = await fetch(`${BASE}/counter/agent/download/install-service.bat`);
    assert(installServiceRes.status === 200, 'install-service.bat is downloadable (200 OK)');

    const configRes = await fetch(`${BASE}/counter/agent/download/config.sample.json`);
    assert(configRes.status === 200, 'config.sample.json is downloadable (200 OK)');
    const configData = JSON.parse(await configRes.text());
    assert(configData.setupCode === 'PBK-SETUP-9021', 'config.sample.json contains PBK-SETUP-9021 setup code');

    // Also verify static client copies
    const clientAgentZipPath = path.join(rootDir, 'client', 'agent', 'printbk-agent-standalone.zip');
    assert(fs.existsSync(clientAgentZipPath), 'printbk-agent-standalone.zip exists in client/agent directory');

    // ════════════════════════════════════════════════════════════════════
    // 2. VERIFY EXACT AMOUNT IN CHECKOUT & NO UPI VERIFICATION PAGE
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 2. Exact Amount & 1-Click "I Have Paid" Flow ---');
    const orderPayload = {
      files: [
        { id: 'file-bw-1', name: 'Thesis_Final_BW.pdf', pages: 10, colorMode: 'bw', is_test: true },
        { id: 'file-col-1', name: 'Cover_Art_Colour.pdf', pages: 2, colorMode: 'colour', is_test: true }
      ],
      rush: false
    };

    const checkoutRes = await fetch(`${BASE}/checkout/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-suite': 'true' },
      body: JSON.stringify(orderPayload)
    });
    assert(checkoutRes.status === 200, 'Checkout session created (200 OK)');
    const checkoutData = await checkoutRes.json();
    const orderId = checkoutData.orderId;
    assert(Boolean(orderId), `Order ID returned: ${orderId}`);
    assert(checkoutData.baseAmount > 0, `Base amount computed: ₹${checkoutData.baseAmount}`);
    assert(checkoutData.payableAmount === checkoutData.baseAmount, `Payable amount is EXACT source amount (₹${checkoutData.payableAmount}) with NO paise offset`);

    // Verify QR code data and UPI intent URL encode the exact source amount
    assert(checkoutData.upiIntentUrl.includes(`am=${checkoutData.baseAmount.toFixed(2)}`), `UPI Intent URL encodes exact amount (am=${checkoutData.baseAmount.toFixed(2)})`);
    assert(checkoutData.qrCodeData.includes(`am=${checkoutData.baseAmount.toFixed(2)}`), `QR Code encodes exact amount (am=${checkoutData.baseAmount.toFixed(2)})`);

    // Verify student 1-click "I Have Paid" (no verification form)
    const paidClickRes = await fetch(`${BASE}/checkout/manual-utr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, utrNumber: 'PAID_DECLARED' })
    });
    assert(paidClickRes.status === 200, '"I Have Paid" button click succeeds with 200 OK (no UTR required)');
    const paidClickData = await paidClickRes.json();
    assert(paidClickData.status === 'UNDER_REVIEW', 'Order moves to UNDER_REVIEW on payment declaration');

    // ════════════════════════════════════════════════════════════════════
    // 3. VERIFY LIGHTNING FAST STAFF RECEPTION
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 3. Staff Workbench Reception ---');
    const t0 = Date.now();
    const liveRes = await fetch(`${BASE}/staff/live`, { headers: staffHeaders });
    const liveTimeMs = Date.now() - t0;
    assert(liveRes.status === 200, `Staff live feed returns 200 OK in ${liveTimeMs}ms`);
    assert(liveTimeMs < 750, `Sub-second response time (${liveTimeMs}ms < 750ms)`);
    const liveData = await liveRes.json();
    const targetItem = liveData.items.find(it => it.order_id === orderId);
    assert(Boolean(targetItem), `Order #${checkoutData.orderNumber} immediately visible on staff counter workbench`);
    const itemId = targetItem.id;

    // ════════════════════════════════════════════════════════════════════
    // 4. VERIFY SPOOL TO DESIGNATED PRINTER (B/W & COLOUR)
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 4. Spool & Approve to Designated Physical/Virtual Printer ---');
    // Register printers
    await fetch(`${BASE}/agent/printers`, {
      method: 'POST',
      headers: agentHeaders,
      body: JSON.stringify({
        printers: [
          { name: 'PrintBK-BW-Virtual', role: 'bw', isDefault: true },
          { name: 'PrintBK-Colour-Virtual', role: 'colour', isDefault: false },
          { name: 'PrintBK-Photo-Virtual', role: 'photo', isDefault: false }
        ]
      })
    });

    const approveRes = await fetch(`${BASE}/staff/items/${itemId}/approve-print`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({ orderId, targetPrinter: 'PrintBK-BW-Virtual' })
    });
    assert(approveRes.status === 200, 'Staff approves print job without errors (200 OK)', `Status: ${approveRes.status}`);
    const approveData = await approveRes.json();
    assert(approveData.ok === true, 'Approve returns ok: true');
    assert(approveData.targetPrinter === 'PrintBK-BW-Virtual', `Job spooled to designated printer: ${approveData.targetPrinter}`);
    const printJobId = approveData.printJobId;
    assert(Boolean(printJobId), `Print job ID generated: ${printJobId}`);

    // ════════════════════════════════════════════════════════════════════
    // 5. AGENT EXECUTION & PROGRESS DISPATCH
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 5. Print Agent Pick-up & Dispatch ---');
    const agentJobRes = await fetch(`${BASE}/agent/jobs/next`, { headers: agentHeaders });
    assert(agentJobRes.status === 200, 'Agent polls next job (200 OK)');
    const agentJobData = await agentJobRes.json();
    assert(agentJobData.type === 'print', `Agent receives job type: ${agentJobData.type}`);
    assert(agentJobData.job.id === printJobId, `Agent leases exact print job #${printJobId}`);
    assert(agentJobData.job.printer === 'PrintBK-BW-Virtual', `Agent receives designated target printer: ${agentJobData.job.printer}`);

    // Agent reports progress (1/10 pages)
    const progRes = await fetch(`${BASE}/agent/jobs/${printJobId}/progress`, {
      method: 'POST',
      headers: agentHeaders,
      body: JSON.stringify({ pagesDone: 5, pagesTotal: 10 })
    });
    assert(progRes.status === 200, 'Agent reports progress (200 OK)');

    // Agent reports completion
    const completeRes = await fetch(`${BASE}/agent/jobs/${printJobId}/complete`, {
      method: 'POST',
      headers: agentHeaders,
      body: JSON.stringify({ totalPages: 10 })
    });
    assert(completeRes.status === 200, 'Agent reports completion (200 OK)');

    // Verify order item is marked printed
    const postPrintLive = await (await fetch(`${BASE}/staff/live`, { headers: staffHeaders })).json();
    const itemAfterPrint = postPrintLive.items.find(it => it.id === itemId);
    assert(!itemAfterPrint || itemAfterPrint.status === 'printed' || itemAfterPrint.status === 'completed', 'Order item marked completed / printed cleanly');

    // ════════════════════════════════════════════════════════════════════
    // 6. PURGE EVERYTHING & MAKE IT NEW
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 6. Purge Everything — Make It New ---');
    const purgeRes = await fetch(`${BASE}/staff/orders/purge-all`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({ all: true })
    });
    assert(purgeRes.status === 200, 'Purge-all returns 200 OK');
    const purgeData = await purgeRes.json();
    assert(purgeData.ok === true, `Purged queue successfully (message: ${purgeData.message})`);

    // Verify queue is completely clean
    const cleanLive = await (await fetch(`${BASE}/staff/live`, { headers: staffHeaders })).json();
    assert(cleanLive.items.length === 0, `Queue is completely fresh (0 active items remaining)`);

    console.log('\n======================================================');
    console.log(`System Verification Summary: ${passed} passed, ${failed} failed.`);
    console.log('======================================================');

    if (failed > 0) process.exit(1);
  } finally {
    if (server) server.close();
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
