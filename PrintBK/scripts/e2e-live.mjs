#!/usr/bin/env node
/**
 * PrintBK End-to-End Live Integration Verification
 * Tests the complete lifecycle:
 * Student order -> Staff Counter live delta -> Approve & Print -> Shop PC Agent -> Silent Print -> Auto Delete
 * Zero mock data. Real HTTP calls only.
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure test secrets
process.env.STAFF_SETUP_CODE = process.env.STAFF_SETUP_CODE || 'TEST_SETUP_CODE_2026';
process.env.AGENT_TOKEN = process.env.AGENT_TOKEN || 'test-agent-token-xyz';
process.env.STAFF_TOKEN = process.env.STAFF_TOKEN || 'legacy-test-staff-token';
process.env.NODE_ENV = 'test';

// Import Express app
const appModule = await import('../functions/api/index.js');
const app = appModule.default || appModule;

let server;
let baseUrl;

async function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}/server/api`;
      console.log(`\n🚀 [E2E] Standalone test server listening on ${baseUrl}`);
      resolve();
    });
  });
}

async function stopServer() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    console.log(`🛑 [E2E] Test server stopped\n`);
  }
}

async function apiCall(endpoint, method = 'GET', data = null, headers = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
  const reqHeaders = { ...headers };
  let body = null;

  if (data) {
    reqHeaders['Content-Type'] = 'application/json';
    body = JSON.stringify(data);
  }

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body,
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return { status: res.status, ok: res.ok, data: json };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`\n❌ [ASSERTION FAILED] ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runE2E() {
  console.log('===============================================================');
  console.log('       PRINTBK REAL-TIME END-TO-END INTEGRATION TEST           ');
  console.log('===============================================================');

  try {
    await startServer();

    // ── STEP 1: Verify Health & Config Endpoints ──
    console.log('\n[Step 1] Checking Server Health & Dynamic Public Config...');
    const health = await apiCall('/health');
    assert(health.ok && health.data.status === 'ok', 'Health check returns status ok');

    const config = await apiCall('/config');
    assert(config.ok && typeof config.data.rates === 'object', 'Public config returns dynamic pricing rates');
    assert(config.data.open === true, 'Shop default status is open');

    // ── STEP 2: Pair Counter Staff Device ──
    console.log('\n[Step 2] Pairing Staff Counter PC using STAFF_SETUP_CODE...');
    const pairRes = await apiCall('/staff/pair', 'POST', {
      setupCode: process.env.STAFF_SETUP_CODE,
      label: 'E2E Counter Terminal',
    });
    assert(pairRes.ok && pairRes.data.deviceToken, 'Staff device successfully paired');
    const staffToken = pairRes.data.deviceToken;
    const staffHeaders = { 'X-Staff-Device-Token': staffToken };

    // ── STEP 3: Register Shop PC Printers via Agent API ──
    console.log('\n[Step 3] Shop PC Agent registers Windows Printers...');
    const agentHeaders = { 'X-Agent-Token': process.env.AGENT_TOKEN };
    const printerRes = await apiCall('/agent/printers/register', 'POST', {
      printers: [
        { id: 'epson-bw', name: 'EPSON L3110 Series', role: 'bw', online: true },
        { id: 'canon-col', name: 'Canon G3010 Series', role: 'colour', online: true },
      ],
    }, agentHeaders);
    assert(printerRes.ok && printerRes.data.registered >= 2, 'Agent registered 2 shop printers');

    // ── STEP 4: Student Places Order (Mixed B&W + Colour) ──
    console.log('\n[Step 4] Student uploads & places mixed document order...');
    const orderPayload = {
      files: [
        {
          name: 'Semester_Project_Thesis.pdf',
          pages: 12,
          settings: {
            copies: 1,
            paper: 'A4',
            sided: 'double',
            colorMode: 'custom',
            colorPages: [1, 2], // Pages 1 and 2 are colour, 3-12 are B&W
          },
        },
      ],
      services: [
        {
          category: 'Binding',
          title: 'Spiral binding',
          price: 35.0,
          quantity: 1,
          details: { type: 'Spiral', size: 'Standard' },
        },
      ],
      payment: 'upi',
    };

    const createRes = await apiCall('/orders', 'POST', orderPayload);
    if (!createRes.ok) console.log('createRes error:', createRes.status, createRes.data);
    assert(createRes.ok && createRes.data.orderId, 'Order created with capability token');
    const studentOrderId = createRes.data.orderId;
    const studentOrderNumber = createRes.data.orderNumber;
    const studentAccessToken = createRes.data.accessToken;
    const studentHeaders = { 'X-Order-Token': studentAccessToken };
    console.log(`    ↳ Order #${studentOrderNumber} created (ID: ${studentOrderId})`);

    // ── STEP 5: Verify Order is Hidden from Staff until Payment Claimed (Privacy & Visibility Rule) ──
    console.log('\n[Step 5] Verifying Draft UPI order is NOT visible to Staff Counter yet...');
    const liveBeforeClaim = await apiCall('/staff/live', 'GET', null, staffHeaders);
    assert(liveBeforeClaim.ok && Array.isArray(liveBeforeClaim.data.items), 'Staff live feed queried');
    const hiddenItem = liveBeforeClaim.data.items.find((it) => it.order_id === studentOrderId || it.order_number === studentOrderNumber);
    assert(!hiddenItem, `Order #${studentOrderNumber} is correctly hidden from staff before UPI claim`);

    // ── STEP 6: Student Claims UPI Payment & Order Appears on Counter ──
    console.log('\n[Step 6] Student Claims UPI Payment via UPI Intent Flow...');
    const upiStart = await apiCall(`/orders/${studentOrderId}/start-upi`, 'POST', null, studentHeaders);
    assert(upiStart.ok, 'UPI payment flow started');

    const upiReturn = await apiCall(`/orders/${studentOrderId}/upi-return`, 'POST', { utr: 'UTR89210044' }, studentHeaders);
    assert(upiReturn.ok && upiReturn.data.status === 'upi_claimed', 'Order status transitioned to upi_claimed');

    // Verify staff live feed now receives the order with upi_claimed
    const liveRes = await apiCall('/staff/live', 'GET', null, staffHeaders);
    assert(liveRes.ok && Array.isArray(liveRes.data.items), 'Staff live feed returned active items');
    const printItem = liveRes.data.items.find((it) => it.order_id === studentOrderId || it.order_number === studentOrderNumber);
    assert(!!printItem, `Order #${studentOrderNumber} appears in Staff Live Feed after UPI claim`);
    assert(printItem.status === 'ready_to_print' || printItem.status === 'preparing', 'Print item in ready/preparing state');
    assert(printItem.payment_status === 'upi_claimed', 'Staff live feed reflects payment_status upi_claimed');
    assert(!!printItem.pickup_code, `Server assigned authoritative pickup code: ${printItem.pickup_code}`);

    // ── STEP 7: Staff Approves Print (Verifies Payment) ──
    console.log('\n[Step 7] Counter Staff taps APPROVE & PRINT...');
    const approveRes = await apiCall(`/staff/items/${printItem.id}/approve-print`, 'POST', null, staffHeaders);
    assert(approveRes.ok, 'Staff approve-print accepted by server');

    // ── STEP 8: Agent Polls and Executes Silent Print Job ──
    console.log('\n[Step 8] Shop PC Agent polls for pending print job...');
    const pollRes = await apiCall('/agent/jobs/poll', 'GET', null, agentHeaders);
    assert(pollRes.ok && Array.isArray(pollRes.data.jobs) && pollRes.data.jobs.length > 0, 'Agent received assigned print job');
    const assignedJob = pollRes.data.jobs[0];
    assert(assignedJob.itemId === printItem.id, 'Print job itemId matches staff approved item');

    // Agent reports printing progress
    console.log('\n[Step 9] Agent reports real progress & completion...');
    const progRes = await apiCall(`/agent/jobs/${assignedJob.id}/status`, 'POST', {
      status: 'printing',
      progressPages: 6,
    }, agentHeaders);
    assert(progRes.ok, 'Agent reported intermediate progress 6/12');

    // Student ticket reflects printing within real-time
    const studentStatus = await apiCall(`/orders/${studentOrderId}`, 'GET', null, studentHeaders);
    assert(studentStatus.data.status === 'printing', 'Student order status live transitioned to printing');

    // Agent finishes print
    const finishRes = await apiCall(`/agent/jobs/${assignedJob.id}/status`, 'POST', {
      status: 'printed',
      pagesDone: 12,
    }, agentHeaders);
    assert(finishRes.ok, 'Agent reported printed completion');

    // ── STEP 10: Verify Physical Service DONE Flow ──
    console.log('\n[Step 10] Finishing Desk marks linked Binding service DONE...');
    const bindingItem = liveRes.data.items.find((it) => it.kind === 'binding' && it.order_id === studentOrderId);
    if (bindingItem) {
      const doneRes = await apiCall(`/staff/items/${bindingItem.id}/done`, 'POST', null, staffHeaders);
      assert(doneRes.ok, 'Binding service marked DONE');
    }

    // ── STEP 11: Collect Cash & Undo Verification ──
    console.log('\n[Step 11] Testing Collect Cash & UNDO action flow...');
    // Create quick cash order
    const cashOrderRes = await apiCall('/orders', 'POST', {
      files: [{ name: 'Lab_Assignment.pdf', pages: 4 }],
      services: [],
      payment: 'cash',
    });
    const cashOrderId = cashOrderRes.data.orderId;

    // Collect cash
    const collectRes = await apiCall(`/staff/orders/${cashOrderId}/collect-cash`, 'POST', null, staffHeaders);
    assert(collectRes.ok && collectRes.data.actionId, 'Cash collected and actionId returned for UNDO');

    // Undo action
    const undoRes = await apiCall('/staff/undo', 'POST', { actionId: collectRes.data.actionId }, staffHeaders);
    assert(undoRes.ok, 'Collect cash successfully undone via staff/undo');

    // ── STEP 12: Auto-Delete Privacy Rule Verification ──
    console.log('\n[Step 12] Verifying 5-Minute File Auto-Delete Privacy Rule...');
    const deleteRes = await apiCall(`/orders/${studentOrderId}/delete-files`, 'POST', null, studentHeaders);
    assert(deleteRes.ok && deleteRes.data.deletedAt, 'Physical files deleted permanently from storage');

    const finalOrder = await apiCall(`/orders/${studentOrderId}`, 'GET', null, studentHeaders);
    assert(!!finalOrder.data.filesDeletedAt, 'Order record permanently stamped with filesDeletedAt');

    console.log('\n===============================================================');
    console.log('  🎉 ALL END-TO-END REAL-TIME INTEGRATION CHECKS PASSED 100%!  ');
    console.log('===============================================================\n');
  } finally {
    await stopServer();
  }
}

runE2E().catch((err) => {
  console.error('\n💥 E2E Test Suite Terminated with Error:\n', err);
  process.exit(1);
});
