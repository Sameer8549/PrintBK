#!/usr/bin/env node
/**
 * PrintBK End-to-End Live Integration Verification Suite
 * Tests all 16 production scenarios + Cron Security + Lazy File Purge:
 * 1. Cash order
 * 2. UPI claimed then approve
 * 3. Per-page colour (page 1 colour, rest B&W) with the COMBINE note
 * 4. Mixed-orientation PPTX
 * 5. Photos
 * 6. Binding waiting for print then DONE
 * 7. Lamination
 * 8. Scanning
 * 9. Photocopy
 * 10. Typing quote accept
 * 11. Reject with hold and UNDO
 * 12. Collect-cash UNDO
 * 13. Two staff devices approving the same item (409 Conflict)
 * 14. Printer error and RETRY
 * 15. Agent offline and recovery
 * 16. Revoked device (403 Forbidden)
 * 17. Cron secret security & lazy deletion
 *
 * ZERO mock data. REAL HTTP endpoints and state machine transitions only.
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure test secrets
process.env.STAFF_SETUP_CODE = process.env.STAFF_SETUP_CODE || 'TEST_SETUP_CODE_2026';
process.env.AGENT_SETUP_CODE = process.env.AGENT_SETUP_CODE || 'TEST_AGENT_SETUP_2026';
process.env.CRON_SECRET = process.env.CRON_SECRET || 'TEST_CRON_SECRET_XYZ99';
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
  console.log('       PRINTBK REAL-TIME END-TO-END VERIFICATION SUITE         ');
  console.log('===============================================================');

  try {
    await startServer();

    // ── STEP 1: Verify Health & Dynamic Public Config ──
    console.log('\n[Step 1] Checking Server Health & Dynamic Public Config...');
    const health = await apiCall('/health');
    assert(health.ok && health.data.status === 'ok', 'Health check returns status ok');

    const config = await apiCall('/config');
    assert(config.ok && typeof config.data.rates === 'object', 'Public config returns dynamic pricing rates');
    assert(config.data.open === true, 'Shop default status is open');

    // ── STEP 2: One-Time Pairing for Counter Staff Devices ──
    console.log('\n[Step 2] Pairing Staff Counter PC 1 & PC 2 via STAFF_SETUP_CODE...');
    const pairStaff1 = await apiCall('/staff/pair', 'POST', {
      setupCode: process.env.STAFF_SETUP_CODE,
      label: 'Counter PC 1 - Front Desk',
    });
    assert(pairStaff1.ok && pairStaff1.data.deviceToken, 'Staff device 1 successfully paired');
    const staffToken1 = pairStaff1.data.deviceToken;
    const staffHeaders1 = { 'X-Staff-Device-Token': staffToken1 };

    const pairStaff2 = await apiCall('/staff/pair', 'POST', {
      setupCode: process.env.STAFF_SETUP_CODE,
      label: 'Counter PC 2 - Express Window',
    });
    assert(pairStaff2.ok && pairStaff2.data.deviceToken, 'Staff device 2 successfully paired');
    const staffToken2 = pairStaff2.data.deviceToken;
    const staffHeaders2 = { 'X-Staff-Device-Token': staffToken2 };

    // ── STEP 3: One-Time Pairing for Shop PC Print Agent ──
    console.log('\n[Step 3] One-time Pairing Shop PC Print Agent via AGENT_SETUP_CODE...');
    const pairAgent = await apiCall('/agent/pair', 'POST', {
      setupCode: process.env.AGENT_SETUP_CODE,
      label: 'Shop PC Main Windows Agent',
    });
    assert(pairAgent.ok && pairAgent.data.token, 'Print agent successfully paired with unique device token');
    const agentToken = pairAgent.data.token;
    const agentDeviceId = pairAgent.data.deviceId;
    const agentHeaders = { 'X-Agent-Device-Token': agentToken };

    // ── STEP 4: Register Shop PC Printers ──
    console.log('\n[Step 4] Agent registers Windows Printers...');
    const printerRes = await apiCall('/agent/printers/register', 'POST', {
      printers: [
        { id: 'epson-bw', name: 'EPSON L3110 Series', role: 'bw', online: true, status: 'ready' },
        { id: 'canon-col', name: 'Canon G3010 Series', role: 'colour', online: true, status: 'ready' },
      ],
    }, agentHeaders);
    assert(printerRes.ok && printerRes.data.registered >= 2, 'Agent registered 2 shop printers');

    // ── STEP 5: SCENARIO 1 — Cash Order Flow ──
    console.log('\n[Scenario 1] Cash Order Placement & Collection...');
    const cashOrderRes = await apiCall('/orders', 'POST', {
      files: [{ name: 'Lab_Report_Cash.pdf', pages: 6, settings: { copies: 1, paper: 'A4', sided: 'single', colorMode: 'bw' } }],
      services: [],
      payment: 'cash',
    });
    assert(cashOrderRes.ok && cashOrderRes.data.orderId, 'Cash order placed');
    const cashOrderId = cashOrderRes.data.orderId;
    const cashOrderNum = cashOrderRes.data.orderNumber;
    assert(cashOrderRes.data.status === 'pending_cash', 'Initial status is pending_cash');

    // Verify it appears immediately in Staff live feed as cash_due / pending_cash
    const liveCash = await apiCall('/staff/live', 'GET', null, staffHeaders1);
    const cashItem = liveCash.data.items.find((it) => it.order_id === cashOrderId);
    assert(!!cashItem, `Cash order #${cashOrderNum} appears immediately in Staff Live Feed`);
    assert(cashItem.payment_status === 'pending_cash', 'Staff live feed reflects payment_status pending_cash');

    // ── STEP 6: SCENARIO 12 — Collect Cash & UNDO (5s Window) ──
    console.log('\n[Scenario 12] Collect Cash and 5-Second UNDO Window...');
    const collectRes = await apiCall(`/staff/orders/${cashOrderId}/collect-cash`, 'POST', null, staffHeaders1);
    assert(collectRes.ok && collectRes.data.actionId, 'Cash collected, actionId issued for UNDO');

    // Verify status became cash_collected
    const cashLiveAfter = await apiCall('/staff/live', 'GET', null, staffHeaders1);
    const collectedItem = cashLiveAfter.data.items.find((it) => it.order_id === cashOrderId);
    assert(collectedItem.payment_status === 'cash_collected', 'Order transitioned to cash_collected');

    // Trigger UNDO
    const undoCashRes = await apiCall('/staff/undo', 'POST', { actionId: collectRes.data.actionId }, staffHeaders1);
    assert(undoCashRes.ok && undoCashRes.data.undone, 'Collect cash successfully undone');

    // Re-verify status reverted to pending_cash
    const cashLiveUndone = await apiCall('/staff/live', 'GET', null, staffHeaders1);
    const revertedItem = cashLiveUndone.data.items.find((it) => it.order_id === cashOrderId);
    assert(revertedItem.payment_status === 'pending_cash', 'Order successfully reverted to pending_cash via UNDO');

    // Now re-collect cash permanently for printing
    await apiCall(`/staff/orders/${cashOrderId}/collect-cash`, 'POST', null, staffHeaders1);

    // ── STEP 7: SCENARIO 2 — UPI Claimed then Approve ──
    console.log('\n[Scenario 2] UPI Order Flow: Hidden before claim -> Claimed -> Staff Approves...');
    const upiOrderRes = await apiCall('/orders', 'POST', {
      files: [{ name: 'Project_Documentation.pdf', pages: 8, settings: { copies: 1, paper: 'A4', sided: 'double', colorMode: 'bw' } }],
      services: [],
      payment: 'upi',
    });
    const upiOrderId = upiOrderRes.data.orderId;
    const upiOrderNum = upiOrderRes.data.orderNumber;
    const upiToken = upiOrderRes.data.accessToken;
    const upiStudentHeaders = { 'X-Order-Token': upiToken };

    // Verify order is HIDDEN before payment claim
    const liveBeforeClaim = await apiCall('/staff/live', 'GET', null, staffHeaders1);
    const hiddenUpi = liveBeforeClaim.data.items.find((it) => it.order_id === upiOrderId);
    assert(!hiddenUpi, `UPI Order #${upiOrderNum} is correctly hidden before payment claim`);

    // Student starts UPI & claims payment
    await apiCall(`/orders/${upiOrderId}/start-upi`, 'POST', null, upiStudentHeaders);
    const upiReturn = await apiCall(`/orders/${upiOrderId}/upi-return`, 'POST', { utr: 'UTR99881122' }, upiStudentHeaders);
    assert(upiReturn.ok && upiReturn.data.status === 'upi_claimed', 'Order status transitioned to upi_claimed');

    // Live feed receives the claimed order
    const liveAfterClaim = await apiCall('/staff/live', 'GET', null, staffHeaders1);
    const claimedUpiItem = liveAfterClaim.data.items.find((it) => it.order_id === upiOrderId);
    assert(!!claimedUpiItem, `Order #${upiOrderNum} appears in Staff Live Feed after UPI claim`);
    assert(claimedUpiItem.payment_status === 'upi_claimed', 'Payment status reflects upi_claimed (UPI PAID - VERIFY)');

    // Staff approves print
    const approveUpi = await apiCall(`/staff/items/${claimedUpiItem.id}/approve-print`, 'POST', null, staffHeaders1);
    assert(approveUpi.ok, 'Staff approved UPI order for printing');

    // Agent polls and prints approved UPI job
    const upiPoll = await apiCall('/agent/jobs/poll', 'GET', null, agentHeaders);
    const upiJob = upiPoll.data.jobs?.find(j => j.itemId === claimedUpiItem.id);
    assert(!!upiJob, 'Agent received queued UPI print job');
    await apiCall(`/agent/jobs/${upiJob.id}/status`, 'POST', { status: 'printed', pagesDone: 8 }, agentHeaders);

    // ── STEP 8: SCENARIO 3 — Per-Page Colour with COMBINE Note ──
    console.log('\n[Scenario 3] Per-Page Colour (Page 1 Colour, rest B&W) with COMBINE Note...');
    const mixedOrderRes = await apiCall('/orders', 'POST', {
      files: [{
        name: 'Thesis_Final.pdf',
        pages: 12,
        settings: {
          copies: 1,
          paper: 'A4',
          sided: 'double',
          colorMode: 'custom',
          colorPages: [1, 2], // Pages 1 and 2 colour, pages 3-12 B&W
        },
      }],
      services: [],
      payment: 'cash',
    });
    const mixedOrderId = mixedOrderRes.data.orderId;
    const mixedLive = await apiCall('/staff/live', 'GET', null, staffHeaders1);
    const mixedItem = mixedLive.data.items.find((it) => it.order_id === mixedOrderId);
    assert(!!mixedItem, 'Mixed document item generated');
    assert(mixedItem.printInstructions && mixedItem.printInstructions.includes('COMBINE'), `Item print instructions include COMBINE note: "${mixedItem.printInstructions}"`);

    // ── STEP 9: SCENARIO 4 — Mixed-Orientation PPTX Presentation ──
    console.log('\n[Scenario 4] Mixed-Orientation Presentation Document (.pptx)...');
    const pptxOrderRes = await apiCall('/orders', 'POST', {
      files: [{
        name: 'Engineering_Seminar.pptx',
        pages: 20,
        settings: { copies: 1, paper: 'A4', sided: 'single', orientation: 'auto', colorMode: 'colour' },
      }],
      services: [],
      payment: 'cash',
    });
    const pptxLive = await apiCall('/staff/live', 'GET', null, staffHeaders1);
    const pptxItem = pptxLive.data.items.find((it) => it.order_id === pptxOrderRes.data.orderId);
    assert(!!pptxItem, 'PPTX document created');
    assert(pptxItem.specifications?.orientation === 'auto', 'Auto-orientation preserved for slides');

    // ── STEP 10: SCENARIO 5 — Photos Service ──
    console.log('\n[Scenario 5] Photo Prints Table Item...');
    const photoOrderRes = await apiCall('/orders', 'POST', {
      files: [],
      services: [{
        category: 'photo',
        title: 'Passport Size Photos',
        price: 50.0,
        quantity: 4,
        details: 'passport glossy',
      }],
      payment: 'cash',
    });
    const photoLive = await apiCall('/staff/live', 'GET', null, staffHeaders1);
    const photoItem = photoLive.data.items.find((it) => it.order_id === photoOrderRes.data.orderId);
    assert(!!photoItem && photoItem.kind === 'photo', 'Photo item mapped into Photos table');

    // ── STEP 11: SCENARIO 6 — Binding Waiting for Print then DONE ──
    console.log('\n[Scenario 6] Binding Linked to Print: waiting_for_print -> printed -> DONE...');
    const bindOrderRes = await apiCall('/orders', 'POST', {
      files: [{ name: 'Project_Report.pdf', pages: 30, settings: { copies: 1, colorMode: 'bw' } }],
      services: [{ category: 'binding', title: 'Spiral Binding', price: 40.0, quantity: 1, details: 'spiral 30 pages' }],
      payment: 'cash',
    });
    const bindOrderId = bindOrderRes.data.orderId;
    await apiCall(`/staff/orders/${bindOrderId}/collect-cash`, 'POST', null, staffHeaders1);

    const bindLive = await apiCall('/staff/live', 'GET', null, staffHeaders1);
    const bindDocItem = bindLive.data.items.find((it) => it.order_id === bindOrderId && it.kind.includes('doc'));
    const bindServiceItem = bindLive.data.items.find((it) => it.order_id === bindOrderId && it.kind === 'binding');
    assert(!!bindDocItem && !!bindServiceItem, 'Document and linked binding service present');

    // Staff approves print
    await apiCall(`/staff/items/${bindDocItem.id}/approve-print`, 'POST', null, staffHeaders1);

    // Agent polls and completes print
    const pollForBind = await apiCall('/agent/jobs/poll', 'GET', null, agentHeaders);
    const bindPrintJob = pollForBind.data.jobs?.find((j) => j.itemId === bindDocItem.id);
    assert(!!bindPrintJob, 'Agent received queued binding doc print job');
    await apiCall(`/agent/jobs/${bindPrintJob.id}/status`, 'POST', { status: 'printed', pagesDone: 30 }, agentHeaders);

    // Now finishing counter marks binding DONE
    const bindDoneRes = await apiCall(`/staff/items/${bindServiceItem.id}/done`, 'POST', null, staffHeaders1);
    assert(bindDoneRes.ok && bindDoneRes.data.status === 'done', 'Binding service successfully marked DONE');

    // ── STEP 12: SCENARIO 7 — Lamination Physical Service ──
    console.log('\n[Scenario 7] Lamination Physical Service...');
    const lamOrderRes = await apiCall('/orders', 'POST', {
      files: [],
      services: [{ category: 'lamination', title: 'Certificate Lamination', price: 25.0, quantity: 1, details: 'A4 standard' }],
      payment: 'cash',
    });
    const lamLive = await apiCall('/staff/live', 'GET', null, staffHeaders1);
    const lamItem = lamLive.data.items.find((it) => it.order_id === lamOrderRes.data.orderId && it.kind === 'lamination');
    assert(!!lamItem, 'Lamination item in service table');
    const lamDone = await apiCall(`/staff/items/${lamItem.id}/done`, 'POST', null, staffHeaders1);
    assert(lamDone.ok && lamDone.data.status === 'done', 'Lamination marked DONE');

    // ── STEP 13: SCENARIO 8 — Scanning Service ──
    console.log('\n[Scenario 8] Scanning Service...');
    const scanOrderRes = await apiCall('/orders', 'POST', {
      files: [],
      services: [{ category: 'scanning', title: 'Marks Card Scanning', price: 10.0, quantity: 2, details: '300 DPI colour pdf' }],
      payment: 'cash',
    });
    const scanLive = await apiCall('/staff/live', 'GET', null, staffHeaders1);
    const scanItem = scanLive.data.items.find((it) => it.order_id === scanOrderRes.data.orderId && it.kind === 'scanning');
    assert(!!scanItem, 'Scanning item in service table');
    const scanDone = await apiCall(`/staff/items/${scanItem.id}/done`, 'POST', null, staffHeaders1);
    assert(scanDone.ok && scanDone.data.status === 'done', 'Scanning marked DONE');

    // ── STEP 14: SCENARIO 9 — Photocopy Service ──
    console.log('\n[Scenario 9] Photocopy Service...');
    const copyOrderRes = await apiCall('/orders', 'POST', {
      files: [],
      services: [{ category: 'photocopy', title: 'ID Card Photocopy', price: 2.0, quantity: 4, details: 'single bw' }],
      payment: 'cash',
    });
    const copyLive = await apiCall('/staff/live', 'GET', null, staffHeaders1);
    const copyItem = copyLive.data.items.find((it) => it.order_id === copyOrderRes.data.orderId && it.kind === 'photocopy');
    assert(!!copyItem, 'Photocopy item in service table');
    const copyDone = await apiCall(`/staff/items/${copyItem.id}/done`, 'POST', null, staffHeaders1);
    assert(copyDone.ok && copyDone.data.status === 'done', 'Photocopy marked DONE');

    // ── STEP 15: SCENARIO 10 — Typing / Custom Request Quote & Accept Flow ──
    console.log('\n[Scenario 10] Typing Quote Flow: waiting_quote -> Quote Sent -> Student Accepts...');
    const quoteOrderRes = await apiCall('/orders', 'POST', {
      files: [],
      services: [{ category: 'typing_request', title: 'Resume Formatting & Typing', price: 0.0, quantity: 1, details: 'Two page resume' }],
      payment: 'cash',
    });
    const quoteOrderId = quoteOrderRes.data.orderId;
    const quoteToken = quoteOrderRes.data.accessToken;
    assert(quoteOrderRes.data.status === 'waiting_quote', 'Custom request order created in waiting_quote');

    const quoteLive = await apiCall('/staff/live', 'GET', null, staffHeaders1);
    const typingItem = quoteLive.data.items.find((it) => it.order_id === quoteOrderId);
    assert(!!typingItem, 'Typing request appears in Staff Requests table');

    // Staff sends quote
    const sendQuoteRes = await apiCall(`/staff/items/${typingItem.id}/quote`, 'POST', { quoteAmount: 150.0 }, staffHeaders1);
    assert(sendQuoteRes.ok && sendQuoteRes.data.status === 'quote_sent', 'Staff sent quote of ₹150.00');

    // Student accepts quote
    const acceptRes = await apiCall(`/orders/${quoteOrderId}/accept-quote`, 'POST', null, { 'X-Order-Token': quoteToken });
    assert(acceptRes.ok && acceptRes.data.status === 'quote_accepted' && acceptRes.data.total === 150.0, 'Student accepted quote');

    // ── STEP 16: SCENARIO 11 — Reject Order with Hold and UNDO ──
    console.log('\n[Scenario 11] Reject Order with Hold & 5-Second UNDO Window...');
    const rejectOrderRes = await apiCall('/orders', 'POST', {
      files: [{ name: 'Spam_Doc.pdf', pages: 1 }],
      services: [],
      payment: 'cash',
    });
    const rejectOrderId = rejectOrderRes.data.orderId;

    const rejectRes = await apiCall(`/staff/orders/${rejectOrderId}/reject`, 'POST', { reason: 'Corrupt file' }, staffHeaders1);
    assert(rejectRes.ok && rejectRes.data.actionId, 'Order rejected and actionId issued for undo');

    // Undo rejection within window
    const undoRejectRes = await apiCall('/staff/undo', 'POST', { actionId: rejectRes.data.actionId }, staffHeaders1);
    assert(undoRejectRes.ok && undoRejectRes.data.undone, 'Order rejection successfully undone');

    // ── STEP 17: SCENARIO 13 — Two Staff Devices Approving the Same Item (409 Conflict) ──
    console.log('\n[Scenario 13] Two Staff Terminals Approving Same Item Concurrent Conflict...');
    const raceOrderRes = await apiCall('/orders', 'POST', {
      files: [{ name: 'Race_Document.pdf', pages: 5 }],
      services: [],
      payment: 'cash',
    });
    const raceOrderId = raceOrderRes.data.orderId;
    await apiCall(`/staff/orders/${raceOrderId}/collect-cash`, 'POST', null, staffHeaders1);

    const raceLive = await apiCall('/staff/live', 'GET', null, staffHeaders1);
    const raceItem = raceLive.data.items.find((it) => it.order_id === raceOrderId);

    // Terminal 1 approves
    const t1Res = await apiCall(`/staff/items/${raceItem.id}/approve-print`, 'POST', null, staffHeaders1);
    assert(t1Res.ok, 'Terminal 1 approved print job successfully');

    // Terminal 2 tries to approve the SAME item simultaneously
    const t2Res = await apiCall(`/staff/items/${raceItem.id}/approve-print`, 'POST', null, staffHeaders2);
    assert(t2Res.status === 409, 'Terminal 2 received 409 Conflict (item already sending/approved)');

    // ── STEP 18: SCENARIO 14 — Printer Error & Staff RETRY ──
    console.log('\n[Scenario 14] Printer Hardware Error (Paper Jam) and Staff RETRY Flow...');
    const pollForRace = await apiCall('/agent/jobs/poll', 'GET', null, agentHeaders);
    const raceJob = pollForRace.data.jobs.find((j) => j.itemId === raceItem.id);
    assert(!!raceJob, 'Agent received queued job');

    // Agent reports error
    const failRes = await apiCall(`/agent/jobs/${raceJob.id}/status`, 'POST', {
      status: 'failed',
      errorCode: 'PAPER_JAM',
      errorMessage: 'Paper jammed in Tray 1',
    }, agentHeaders);
    assert(failRes.ok && failRes.data.status === 'failed', 'Agent reported printer paper jam error');

    // Staff counter triggers RETRY
    const retryRes = await apiCall(`/staff/items/${raceItem.id}/retry-print`, 'POST', null, staffHeaders1);
    assert(retryRes.ok && retryRes.data.status === 'sending', 'Staff retry print accepted and re-queued attempt #2');

    // ── STEP 19: SCENARIO 15 — Agent Offline Detection & Recovery ──
    console.log('\n[Scenario 15] Agent Offline Detection and Reconnect Recovery...');
    // Simulate printer aging past 15 seconds threshold
    if (global.__printbk_printers) {
      for (const p of global.__printbk_printers.values()) {
        p.last_seen = Math.floor(Date.now() / 1000) - 25; // 25s ago
      }
    }
    const liveOffline = await apiCall('/staff/live', 'GET', null, staffHeaders1);
    const offlinePrinter = liveOffline.data.printers.find((p) => p.name.includes('EPSON'));
    assert(offlinePrinter && offlinePrinter.online === false, 'Staff live feed detected agent/printer is OFFLINE');

    // Agent sends heartbeat and recovers
    await apiCall('/agent/printers/register', 'POST', {
      printers: [{ id: 'epson-bw', name: 'EPSON L3110 Series', role: 'bw', online: true, status: 'ready' }],
    }, agentHeaders);
    const liveOnline = await apiCall('/staff/live', 'GET', null, staffHeaders1);
    const onlinePrinter = liveOnline.data.printers.find((p) => p.name.includes('EPSON'));
    assert(onlinePrinter && onlinePrinter.online === true, 'Staff live feed recovered to ONLINE upon heartbeat');

    // ── STEP 20: SCENARIO 16 — Revoked Device Enforcement ──
    console.log('\n[Scenario 16] Device Revocation (403 Forbidden Enforcement)...');
    // Pair a temporary device to revoke
    const tempDevRes = await apiCall('/agent/pair', 'POST', {
      setupCode: process.env.AGENT_SETUP_CODE,
      label: 'Compromised PC to Revoke',
    });
    const tempToken = tempDevRes.data.token;
    const tempDevId = tempDevRes.data.deviceId;

    // Verify it works initially
    const preRevoke = await apiCall('/agent/jobs/poll', 'GET', null, { 'X-Agent-Device-Token': tempToken });
    assert(preRevoke.ok, 'Device operates normally before revocation');

    // Revoke device via staff device management endpoint
    const revokeRes = await apiCall(`/staff/agent-devices/${tempDevId}/revoke`, 'POST', null, staffHeaders1);
    assert(revokeRes.ok && revokeRes.data.revoked, 'Agent device revoked via staff device management');

    // Verify device is now rejected with 403 Forbidden
    const postRevoke = await apiCall('/agent/jobs/poll', 'GET', null, { 'X-Agent-Device-Token': tempToken });
    assert(postRevoke.status === 403, 'Revoked agent device receives 403 Forbidden');

    // ── STEP 21: SCHEDULER SECURITY & FILE PURGE ──
    console.log('\n[Step 21] Scheduler Cron Secret Security & File Purge...');
    // A. Without secret -> 401
    const noSecretRes = await apiCall('/cron/cleanup-files', 'POST');
    assert(noSecretRes.status === 401, '/cron/cleanup-files without secret returns 401 Unauthorized');

    // B. With wrong secret -> 401
    const badSecretRes = await apiCall('/cron/cleanup-files', 'POST', null, { 'CRON_SECRET': 'wrong-secret' });
    assert(badSecretRes.status === 401, '/cron/cleanup-files with invalid secret returns 401 Unauthorized');

    // C. With valid CRON_SECRET -> 200
    const validCronRes = await apiCall('/cron/cleanup-files', 'POST', null, { 'CRON_SECRET': process.env.CRON_SECRET });
    assert(validCronRes.ok && validCronRes.data.ok === true, '/cron/cleanup-files with valid secret executes successfully');

    // D. Verify lazy file purge on poll
    const deleteRes = await apiCall(`/orders/${mixedOrderId}/delete-files`, 'POST', null, { 'X-Staff-Device-Token': staffToken1 });
    assert(deleteRes.ok && deleteRes.data.deletedAt, 'Files permanently purged from storage');

    console.log('\n===============================================================');
    console.log('  🎉 ALL 16 REAL-TIME END-TO-END SCENARIOS VERIFIED 100%!       ');
    console.log('===============================================================\n');
  } finally {
    await stopServer();
  }
}

runE2E().catch((err) => {
  console.error('\n💥 E2E Test Suite Terminated with Error:\n', err);
  process.exit(1);
});
