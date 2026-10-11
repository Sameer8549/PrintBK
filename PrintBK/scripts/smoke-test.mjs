#!/usr/bin/env node
/**
 * scripts/smoke-test.mjs
 * 
 * End-to-end staff counter workflow verification suite for PrintBK.
 * Zero external dependencies (uses native Node 18+ fetch).
 * 
 * Usage:
 *   node scripts/smoke-test.mjs [BASE_URL] [STAFF_TOKEN]
 */

const BASE_URL = (process.argv[2] || process.env.BASE_URL || 'https://printbk-60074625517.development.catalystserverless.in/server/api').replace(/\/+$/, '');
const STAFF_TOKEN = process.argv[3] || process.env.STAFF_TOKEN || '';

if (!STAFF_TOKEN) {
  console.error('\x1b[31mError: STAFF_TOKEN is required for smoke tests.\x1b[0m');
  console.error('Usage: node scripts/smoke-test.mjs [BASE_URL] [STAFF_TOKEN]');
  process.exit(1);
}

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║       PrintBK Staff Counter End-to-End Smoke Test Suite        ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log(`Target Base URL: ${BASE_URL}`);
console.log(`Staff Token:     [PROVIDED (${STAFF_TOKEN.slice(0, 4)}...)]`);
console.log('----------------------------------------------------------------\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`\x1b[32m[ PASS ]\x1b[0m ${message}`);
    passCount++;
  } else {
    console.error(`\x1b[31m[ FAIL ]\x1b[0m ${message}`);
    failCount++;
  }
}

async function run() {
  let createdOrderId = null;
  let studentToken = null;
  let orderNumber = null;

  try {
    // 1. Health check
    const healthRes = await fetch(`${BASE_URL}/health`);
    assert(healthRes.ok, '1. GET /health responds with 200 OK');

    // 2. Shop status
    const shopRes = await fetch(`${BASE_URL}/shop/status`);
    const shopData = await shopRes.json();
    assert(shopRes.ok && shopData.open === true, '2. GET /shop/status reports shop is open');

    // 3. Student creates cash order
    const createRes = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment: 'Cash',
        files: [{
          id: 'test-smoke-file-1',
          name: 'SMOKE_TEST_DOC.pdf',
          pages: 4,
          settings: { copies: 1, colorMode: 'bw', sided: 'double', paper: 'A4' }
        }],
        services: [],
        rush: false
      })
    });
    assert(createRes.ok, '3. Student can place a cash order (POST /orders)');
    const createData = await createRes.json();
    createdOrderId = createData.orderId;
    studentToken = createData.accessToken;
    orderNumber = createData.orderNumber;

    assert(Boolean(createdOrderId), `   Order ID assigned: ${createdOrderId}`);
    assert(typeof orderNumber === 'number', `   Order number assigned: #${orderNumber}`);
    assert(createData.pickupCode === null, '   Pickup code is hidden from student while pre-payment');
    assert(Boolean(studentToken), '   Cryptographic capability token received by student');

    // 4. Student cannot self-approve payment via /pay
    const payAttempt = await fetch(`${BASE_URL}/orders/${createdOrderId}/pay`, { method: 'POST' });
    assert(payAttempt.status === 410, '4. Student cannot self-approve payment (POST /orders/:id/pay returns 410 Gone)');

    const staffHeaders = {
      'X-Staff-Token': STAFF_TOKEN,
      'X-Authorization': `Bearer ${STAFF_TOKEN}`
    };

    // 5. Staff lists orders and finds the order
    const listRes = await fetch(`${BASE_URL}/orders?limit=20`, {
      headers: staffHeaders
    });
    assert(listRes.ok, '5. Staff can list orders (GET /orders with STAFF_TOKEN)');
    const listData = await listRes.json();
    const foundOrder = Array.isArray(listData) ? listData.find(o => o.id === createdOrderId) : null;
    assert(Boolean(foundOrder), `   Order #${orderNumber} found in staff queue`);

    // 6. Staff approves cash order
    const approveRes = await fetch(`${BASE_URL}/orders/${createdOrderId}/approve-cash`, {
      method: 'POST',
      headers: staffHeaders
    });
    assert(approveRes.ok, '6. Staff can approve cash order (POST /orders/:id/approve-cash)');
    const approveData = await approveRes.json();
    assert(approveData.status === 'processing', '   Order transitioned to "processing" state');

    // 7. Student checks order ticket: pickup code now revealed!
    const studentGet = await fetch(`${BASE_URL}/orders/${createdOrderId}`, {
      headers: { 'X-Order-Token': studentToken }
    });
    const studentData = await studentGet.json();
    assert(Boolean(studentData.pickupCode && studentData.pickupCode !== '——'), `7. Student ticket reveals pickup code after approval: ${studentData.pickupCode}`);

    // 8. Staff transitions state: processing -> printing
    const printRes = await fetch(`${BASE_URL}/orders/${createdOrderId}/status`, {
      method: 'POST',
      headers: {
        ...staffHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'printing' })
    });
    assert(printRes.ok, '8. Staff updates status to "printing" (POST /orders/:id/status)');

    // 9. Staff transitions state: printing -> ready
    const readyRes = await fetch(`${BASE_URL}/orders/${createdOrderId}/status`, {
      method: 'POST',
      headers: {
        ...staffHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'ready' })
    });
    assert(readyRes.ok, '9. Staff updates status to "ready"');

    // 10. Check that delete_after is scheduled on ready
    const readyCheck = await fetch(`${BASE_URL}/orders/${createdOrderId}`, {
      headers: { 'X-Order-Token': studentToken }
    });
    const readyData = await readyCheck.json();
    assert(Boolean(readyData.deleteAfter), `10. delete_after retention timestamp scheduled: ${readyData.deleteAfter}`);

    // 11. Staff transitions state: ready -> completed
    const completeRes = await fetch(`${BASE_URL}/orders/${createdOrderId}/status`, {
      method: 'POST',
      headers: {
        ...staffHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'completed' })
    });
    assert(completeRes.ok, '11. Staff marks order "completed"');

    // 12. Student immediate file deletion
    const deleteRes = await fetch(`${BASE_URL}/orders/${createdOrderId}/delete-files`, {
      method: 'POST',
      headers: { 'X-Order-Token': studentToken }
    });
    assert(deleteRes.ok, '12. Student can purge files on demand (POST /orders/:id/delete-files)');
    const deleteData = await deleteRes.json();
    assert(deleteData.ok === true, '   Files permanently deleted');

  } catch (err) {
    console.error('Smoke test exception:', err);
    failCount++;
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`Smoke Test Summary: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (failCount > 0) process.exit(1);
}

run();
