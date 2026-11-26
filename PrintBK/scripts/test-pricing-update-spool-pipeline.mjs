#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const agentRequire = createRequire(path.join(rootDir, 'agent', 'package.json'));
const { PDFDocument, rgb } = agentRequire('pdf-lib');
const { executeSumatraPrint } = await import('../agent/dist/src/sumatra.js');

// Import the main express app
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
  console.log('🚀 Starting Pricing Updates, Fast Options, Test Spool & Real Order Spool Verification...\n');

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
    // 1. VERIFY INITIAL PRICING CONFIG
    // ════════════════════════════════════════════════════════════════════
    console.log('--- 1. Initial Pricing & Rates Check ---');
    const initCfgRes = await fetch(`${BASE}/config`);
    assert(initCfgRes.status === 200, 'Initial /config returns 200 OK');
    const initCfg = await initCfgRes.json();
    console.log(`   Initial rates: B&W = ₹${initCfg.rates?.bw}, Colour = ₹${initCfg.rates?.colour}`);

    // ════════════════════════════════════════════════════════════════════
    // 2. STAFF UPDATES PRICES & STUDENT REFLECTS UPDATED PRICE
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 2. Staff Updates Prices & Student Pricing Reflection ---');
    const updatedRates = {
      ...initCfg.rates,
      bw: 2.50,
      colour: 10.00,
      bindingSpiral: 45.00
    };

    const updateRes = await fetch(`${BASE}/staff/settings`, {
      method: 'PUT',
      headers: staffHeaders,
      body: JSON.stringify({
        expected_version: initCfg.version || 1,
        rates: updatedRates
      })
    });
    assert(updateRes.status === 200, 'Staff PUT /staff/settings returns 200 OK');
    const updateData = await updateRes.json();
    assert(updateData.ok === true, 'Settings update returns ok: true');

    // Fetch config as student
    const studentCfgRes = await fetch(`${BASE}/config`);
    assert(studentCfgRes.status === 200, 'Student GET /config returns 200 OK');
    const studentCfg = await studentCfgRes.json();
    assert(Number(studentCfg.rates?.bw) === 2.50, `Student sees updated B&W rate: ₹${studentCfg.rates?.bw}`);
    assert(Number(studentCfg.rates?.colour) === 10.00, `Student sees updated Colour rate: ₹${studentCfg.rates?.colour}`);
    assert(Number(studentCfg.rates?.bindingSpiral) === 45.00, `Student sees updated Spiral rate: ₹${studentCfg.rates?.bindingSpiral}`);

    // Test order with updated rate (10 B&W pages @ ₹2.50 = ₹25.00)
    const testOrderPayload = {
      files: [
        { id: 'file-bw-updated', name: 'Thesis_UpdatedRate.pdf', pages: 10, colorMode: 'bw', is_test: true }
      ],
      rush: false
    };

    const checkoutRes = await fetch(`${BASE}/checkout/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-suite': 'true' },
      body: JSON.stringify(testOrderPayload)
    });
    assert(checkoutRes.status === 200, 'Checkout create returns 200 OK');
    const checkoutData = await checkoutRes.json();
    assert(checkoutData.baseAmount === 25.00, `Checkout computed exact updated price: ₹${checkoutData.baseAmount} (10 × 2.50 = ₹25.00)`);
    assert(checkoutData.payableAmount === 25.00, `Payable amount matches updated price: ₹${checkoutData.payableAmount}`);

    // Student declares payment via 1-click "I Have Paid"
    const payRes = await fetch(`${BASE}/checkout/manual-utr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-suite': 'true' },
      body: JSON.stringify({ orderId: checkoutData.orderId, utrNumber: 'PAID_DECLARED' })
    });
    assert(payRes.status === 200, '1-Click I Have Paid accepted with updated price (200 OK)');

    // ════════════════════════════════════════════════════════════════════
    // 3. STAFF QUEUE SPEED & APPROVAL
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 3. Staff Counter Queue Speed & Instant Order Delivery ---');
    const t0 = Date.now();
    const liveRes = await fetch(`${BASE}/staff/live`, { headers: staffHeaders });
    const liveLatency = Date.now() - t0;
    assert(liveRes.status === 200, 'Staff live feed returns 200 OK');
    assert(liveLatency < 750, `Sub-second live feed response: ${liveLatency}ms (< 750ms)`);
    const liveData = await liveRes.json();
    const foundOrder = (liveData.items || []).find(i => i.order_id === checkoutData.orderId);
    assert(Boolean(foundOrder), 'Order with updated price immediately visible in staff feed');

    // ════════════════════════════════════════════════════════════════════
    // 4. TEST PRINTS SPOOL TO DESIGNATED PRINTER
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 4. Printer Test Print Spooling ---');
    const testPrintRes = await fetch(`${BASE}/staff/printers/PrintBK-BW-Virtual/test-print`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({ printerName: 'PrintBK-BW-Virtual' })
    });
    assert(testPrintRes.status === 200, 'Staff triggers test-print to PrintBK-BW-Virtual (200 OK)');
    const testPrintData = await testPrintRes.json();
    assert(testPrintData.ok === true, 'Test print queued successfully');
    assert(testPrintData.printer === 'PrintBK-BW-Virtual', 'Test print designated to PrintBK-BW-Virtual');

    // Agent acquires next job
    const agentNextRes = await fetch(`${BASE}/agent/jobs/next`, { headers: agentHeaders });
    assert(agentNextRes.status === 200, 'Agent acquires next job (200 OK)');
    const agentJobPayload = await agentNextRes.json();
    assert(agentJobPayload.type === 'test_print', 'Agent received job type: test_print');
    assert(agentJobPayload.targetPrinter === 'PrintBK-BW-Virtual', 'Agent targeted exact printer: PrintBK-BW-Virtual');

    // Physical spool test via SumatraPDF to virtual printer
    console.log('   Executing physical spool to Windows Print Spooler...');
    const testDoc = await PDFDocument.create();
    const page = testDoc.addPage([595.28, 841.89]);
    page.drawText('PrintBK Real Spooler Test Page - PrintBK-BW-Virtual', { x: 50, y: 750, size: 16 });
    const pdfBuf = Buffer.from(await testDoc.save());
    const tempTestPdf = path.join(rootDir, 'work_test_spool.pdf');
    fs.writeFileSync(tempTestPdf, pdfBuf);

    try {
      await executeSumatraPrint(tempTestPdf, 'PrintBK-BW-Virtual', { copies: 1, paper: 'A4' });
      assert(true, 'SumatraPDF spooled test print to PrintBK-BW-Virtual with 0 errors');
    } finally {
      if (fs.existsSync(tempTestPdf)) fs.unlinkSync(tempTestPdf);
    }

    // Agent reports complete
    const completeRes = await fetch(`${BASE}/agent/jobs/${agentJobPayload.job.id}/complete`, {
      method: 'POST',
      headers: agentHeaders,
      body: JSON.stringify({ pagesPrinted: 1 })
    });
    assert(completeRes.status === 200, 'Agent reported test-print complete (200 OK)');

    // ════════════════════════════════════════════════════════════════════
    // 5. APPROVE & PRINT REAL ORDER TO DESIGNATED PRINTER
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 5. Approve & Spool Real Student Order ---');
    if (foundOrder) {
      const approveRes = await fetch(`${BASE}/staff/orders/${foundOrder.id}/approve`, {
        method: 'POST',
        headers: staffHeaders,
        body: JSON.stringify({ targetPrinter: 'PrintBK-BW-Virtual' })
      });
      assert(approveRes.status === 200, 'Staff approves real order item (200 OK)');
      const approveData = await approveRes.json();
      assert(approveData.ok === true, 'Approve returned ok: true');
      assert(approveData.printer === 'PrintBK-BW-Virtual', 'Spool assigned to PrintBK-BW-Virtual');

      // Agent leases real print job
      const realJobRes = await fetch(`${BASE}/agent/jobs/next`, { headers: agentHeaders });
      assert(realJobRes.status === 200, 'Agent acquires real print job (200 OK)');
      const realJobData = await realJobRes.json();
      assert(realJobData.type === 'print', 'Agent received job type: print');
      assert(realJobData.job.printer === 'PrintBK-BW-Virtual', 'Designated printer matches PrintBK-BW-Virtual');

      // Physical spool of real order file
      const realDoc = await PDFDocument.create();
      const p1 = realDoc.addPage([595.28, 841.89]);
      p1.drawText('Student Real Order Document Page 1', { x: 50, y: 750, size: 14 });
      const realDocBuf = Buffer.from(await realDoc.save());
      const tempRealPdf = path.join(rootDir, 'work_real_order.pdf');
      fs.writeFileSync(tempRealPdf, realDocBuf);

      try {
        await executeSumatraPrint(tempRealPdf, 'PrintBK-BW-Virtual', { copies: 1, paper: 'A4' });
        assert(true, 'SumatraPDF spooled real order document to PrintBK-BW-Virtual with 0 errors');
      } finally {
        if (fs.existsSync(tempRealPdf)) fs.unlinkSync(tempRealPdf);
      }

      // Agent marks real job complete
      const realCompleteRes = await fetch(`${BASE}/agent/jobs/${realJobData.job.id}/complete`, {
        method: 'POST',
        headers: agentHeaders,
        body: JSON.stringify({ pagesPrinted: 10 })
      });
      assert(realCompleteRes.status === 200, 'Agent completed real order spool (200 OK)');
    }

    // ════════════════════════════════════════════════════════════════════
    // 6. REVERT RATES TO STANDARD PRODUCTION RATES & PURGE ALL
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 6. Revert Production Rates & Purge Queue ---');
    const revertRes = await fetch(`${BASE}/staff/settings`, {
      method: 'PUT',
      headers: staffHeaders,
      body: JSON.stringify({
        rates: {
          ...initCfg.rates,
          bw: 1.50,
          colour: 8.00,
          bindingSpiral: 35.00
        }
      })
    });
    assert(revertRes.status === 200, 'Reverted production rates cleanly (200 OK)');

    const purgeRes = await fetch(`${BASE}/staff/orders/purge-all`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({ all: true })
    });
    assert(purgeRes.status === 200, 'Purged all test queue orders (200 OK)');
    const purgeData = await purgeRes.json();
    assert(purgeData.ok === true, 'Purge result ok: true');

    const finalFeedRes = await fetch(`${BASE}/staff/live`, { headers: staffHeaders });
    const finalFeed = await finalFeedRes.json();
    assert((finalFeed.items || []).length === 0, 'Queue is completely fresh (0 active orders)');

    console.log(`\n======================================================`);
    console.log(`Pipeline Verification Summary: ${passed} passed, ${failed} failed.`);
    console.log(`======================================================\n`);
  } finally {
    if (server) server.close();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
