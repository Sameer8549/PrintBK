#!/usr/bin/env node
/**
 * test-upilerify-e2e.mjs
 * 
 * End-to-end verification script for UPILerify Direct UPI Integration:
 * 1. Order Creation & Paise Offsetting (/api/checkout/create)
 * 2. Status Polling & 15-Minute Expiration (/api/checkout/status/:orderId)
 * 3. 12-Digit Numeric UTR Validation & Duplicate Prevention (/api/checkout/manual-utr)
 * 4. HMAC-SHA256 Webhook Verification & Single-Execution Fulfillment (/api/webhooks/upilerify)
 * 5. Staff Admin Verification (/api/admin/orders/verify)
 */

import http from 'http';
import crypto from 'crypto';

const TEST_SECRET = 'whsec_upilerify_test_secret_abc123xyz789';
const TEST_API_KEY = 'apikey_test_999988887777';
const TEST_MERCHANT_UPI = 'merchant@ybl';

process.env.NODE_ENV = 'test';
process.env.UPILERIFY_BASE_URL = 'http://127.0.0.1:4999';
process.env.UPILERIFY_API_KEY = TEST_API_KEY;
process.env.UPILERIFY_WEBHOOK_SECRET = TEST_SECRET;
process.env.MERCHANT_UPI_ID = TEST_MERCHANT_UPI;
process.env.UPI_ID = TEST_MERCHANT_UPI;
process.env.STAFF_TOKEN = 'test-staff-token-upilerify';

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${testName} ${details ? '(' + details + ')' : ''}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${testName} ${details ? '-- ' + details : ''}`);
  }
}

// 1. Start a mock UPILerify Engine on port 4999
let orderCallCount = 0;
const mockUpilerifyServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    if (req.url === '/api/orders/create' && req.method === 'POST') {
      orderCallCount++;
      const payload = JSON.parse(body || '{}');
      const baseAmount = Number(payload.baseAmount || payload.amount || 100);
      // UPILerify generates a unique decimal paise offset (e.g. 100.03)
      const payableAmount = Number((baseAmount + 0.03).toFixed(2));
      const orderId = payload.orderId;
      const upiIntentUrl = `upi://pay?pa=${encodeURIComponent(TEST_MERCHANT_UPI)}&pn=HKBK&am=${payableAmount.toFixed(2)}&cu=INR&tn=${orderId}`;
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        orderId,
        baseAmount,
        payableAmount,
        qrCodeData: upiIntentUrl,
        upiIntentUrl,
        expiresAt
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });
});

await new Promise(r => mockUpilerifyServer.listen(4999, '127.0.0.1', r));

// 2. Start PrintBK API server
const apiModule = await import('../functions/api/index.js');
const app = apiModule.default || apiModule;
const apiServer = http.createServer(app);
await new Promise(r => apiServer.listen(0, '127.0.0.1', r));
const { port } = apiServer.address();
const BASE = `http://127.0.0.1:${port}`;

console.log(`\n🧪 Running UPILerify E2E Test Suite against ${BASE}...`);

try {
  // Test 1: POST /api/checkout/create generates order with unique paise amount & 15m expiration
  console.log('\n--- 1. Order Creation & Paise Offsetting ---');
  const createRes = await fetch(`${BASE}/api/checkout/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-suite': 'true' },
    body: JSON.stringify({
      files: [{ id: 'f1', name: 'document.pdf', pages: 10, colorMode: 'bw', is_test: true }],
      services: [],
      userId: 'student_123',
      customerEmail: 'student@example.com'
    })
  });
  const createData = await createRes.json();
  assert(createRes.status === 200, 'Checkout create returns HTTP 200', `Got ${createRes.status}`);
  assert(Boolean(createData.orderId), 'Order ID returned', createData.orderId);
  assert(createData.status === 'PENDING', 'Initial status is PENDING', createData.status);
  assert(createData.baseAmount > 0, 'Base amount computed accurately', `Base: ₹${createData.baseAmount}`);
  assert(createData.payableAmount === Number((createData.baseAmount + 0.03).toFixed(2)), 'Payable amount includes unique paise offset', `Payable: ₹${createData.payableAmount}`);
  assert(Boolean(createData.qrCodeData && createData.upiIntentUrl), 'Dynamic UPI QR & Intent URL generated');
  assert(Boolean(createData.expiresAt), '15-minute expiration timestamp present', createData.expiresAt);

  const testOrderId = createData.orderId;
  const testPayable = createData.payableAmount;

  // Test 2: GET /api/checkout/status/:orderId fast polling
  console.log('\n--- 2. Status Polling ---');
  const statusRes = await fetch(`${BASE}/api/checkout/status/${testOrderId}`);
  const statusData = await statusRes.json();
  assert(statusRes.status === 200, 'Status poll returns HTTP 200', `Got ${statusRes.status}`);
  assert(statusData.status === 'PENDING', 'Polled status is PENDING', statusData.status);
  assert(statusData.payableAmount === testPayable, 'Polled payable matches reserved paise amount', `₹${statusData.payableAmount}`);

  // Test 3: Manual "I Have Paid" Fallback (/api/checkout/manual-utr)
  console.log('\n--- 3. Manual 12-Digit UTR Fallback & Anti-Fraud ---');
  // 3a: Non-12-digit rejected
  const badUtrRes = await fetch(`${BASE}/api/checkout/manual-utr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: testOrderId, utrNumber: '12345' })
  });
  assert(badUtrRes.status === 400, 'Rejects invalid non-12-digit UTR', `Got ${badUtrRes.status}`);

  // 3b: Alpha chars rejected
  const alphaUtrRes = await fetch(`${BASE}/api/checkout/manual-utr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: testOrderId, utrNumber: '12345678901A' })
  });
  assert(alphaUtrRes.status === 400, 'Rejects alphanumeric UTR (strictly 12 digits required)', `Got ${alphaUtrRes.status}`);

  // 3c: Valid 12 digits accepted -> UNDER_REVIEW
  const validUtr = '412345678901';
  const goodUtrRes = await fetch(`${BASE}/api/checkout/manual-utr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: testOrderId, utrNumber: validUtr })
  });
  const goodUtrData = await goodUtrRes.json();
  assert(goodUtrRes.status === 200, 'Valid 12-digit numeric UTR accepted', `Got ${goodUtrRes.status}`);
  assert(goodUtrData.status === 'UNDER_REVIEW', 'Status transitions to UNDER_REVIEW', goodUtrData.status);
  assert(goodUtrData.redirectUrl.includes('/order-pending'), 'Redirect URL points to /order-pending', goodUtrData.redirectUrl);

  // 3d: Duplicate UTR on second order rejected
  const secondCreateRes = await fetch(`${BASE}/api/checkout/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-suite': 'true' },
    body: JSON.stringify({
      files: [{ id: 'f2', name: 'paper2.pdf', pages: 4, colorMode: 'bw', is_test: true }]
    })
  });
  const secondOrder = await secondCreateRes.json();
  const dupUtrRes = await fetch(`${BASE}/api/checkout/manual-utr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: secondOrder.orderId, utrNumber: validUtr })
  });
  assert(dupUtrRes.status === 409, 'Anti-Fraud: Rejects duplicate/reused 12-digit UTR', `Got ${dupUtrRes.status}`);

  // Test 4: UPILerify Webhook (/api/webhooks/upilerify)
  console.log('\n--- 4. HMAC-SHA256 Webhook & Single-Execution Fulfillment ---');
  const webhookBody = JSON.stringify({
    event: 'payment.verified',
    data: {
      orderId: testOrderId,
      amount: testPayable,
      utrNumber: validUtr
    }
  });

  // 4a: Missing signature rejected
  const noSigRes = await fetch(`${BASE}/api/webhooks/upilerify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: webhookBody
  });
  assert(noSigRes.status === 401, 'Rejects webhook with missing signature (401)', `Got ${noSigRes.status}`);

  // 4b: Wrong signature rejected
  const wrongSigRes = await fetch(`${BASE}/api/webhooks/upilerify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-UPILerify-Signature': '0000000000000000000000000000000000000000000000000000000000000000'
    },
    body: webhookBody
  });
  assert(wrongSigRes.status === 401, 'Rejects webhook with invalid HMAC signature (401)', `Got ${wrongSigRes.status}`);

  // 4c: Valid HMAC-SHA256 signature accepted -> transitions to PAID & fulfills strictly once
  const validSig = crypto.createHmac('sha256', TEST_SECRET).update(Buffer.from(webhookBody, 'utf8')).digest('hex');
  const validHookRes = await fetch(`${BASE}/api/webhooks/upilerify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-UPILerify-Signature': validSig
    },
    body: webhookBody
  });
  const hookData = await validHookRes.json();
  assert(validHookRes.status === 200, 'Valid HMAC signature accepted (200)', `Got ${validHookRes.status}`);
  assert(hookData.status === 'PAID', 'Order transitions to PAID', hookData.status);
  assert(hookData.idempotent === false, 'First execution performs fulfillment', `idempotent=${hookData.idempotent}`);

  // 4d: Idempotent replay: Re-sending webhook returns 200 with idempotent: true (no duplicate fulfillment)
  const replayHookRes = await fetch(`${BASE}/api/webhooks/upilerify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-UPILerify-Signature': validSig
    },
    body: webhookBody
  });
  const replayData = await replayHookRes.json();
  assert(replayHookRes.status === 200, 'Webhook replay returns HTTP 200', `Got ${replayHookRes.status}`);
  assert(replayData.idempotent === true, 'Fulfillment is strictly idempotent (no double execution)', `idempotent=${replayData.idempotent}`);

  // Test 5: Verify status poll reflects verified PAID state
  console.log('\n--- 5. Status Poll Instant Paid Reflection ---');
  const finalStatusRes = await fetch(`${BASE}/api/checkout/status/${testOrderId}`);
  const finalStatusData = await finalStatusRes.json();
  assert(finalStatusData.status === 'PAID', 'Status poller reflects verified PAID state', finalStatusData.status);
  assert(Boolean(finalStatusData.pickupCode), 'Pickup code unlocked upon verified payment', finalStatusData.pickupCode);

  // Test 6: Admin Verification Endpoints
  console.log('\n--- 6. Staff Admin Verification Endpoints ---');
  // Create third order for manual staff approval
  const thirdCreateRes = await fetch(`${BASE}/api/checkout/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-suite': 'true' },
    body: JSON.stringify({
      files: [{ id: 'f3', name: 'paper3.pdf', pages: 2, colorMode: 'bw', is_test: true }]
    })
  });
  const thirdOrder = await thirdCreateRes.json();
  const staffUtr = '987654321098';
  await fetch(`${BASE}/api/checkout/manual-utr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: thirdOrder.orderId, utrNumber: staffUtr })
  });

  // 6a: Fetch under review orders with staff auth
  const underReviewRes = await fetch(`${BASE}/api/admin/orders/under-review`, {
    headers: { 'X-Staff-Token': 'test-staff-token-upilerify' }
  });
  const underReviewData = await underReviewRes.json();
  assert(underReviewRes.status === 200, 'Admin can fetch under-review orders (200)', `Found ${underReviewData.orders?.length || 0} orders`);
  const matched = (underReviewData.orders || []).find(o => o.id === thirdOrder.orderId);
  assert(Boolean(matched), 'Created under-review order appears in admin queue');
  assert(matched?.utrNumber === staffUtr, 'Under-review order shows submitted 12-digit UTR', matched?.utrNumber);

  // 6b: Staff approves order
  const approveRes = await fetch(`${BASE}/api/admin/orders/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Token': 'test-staff-token-upilerify'
    },
    body: JSON.stringify({
      orderId: thirdOrder.orderId,
      action: 'approve',
      notes: 'Verified in bank account manually'
    })
  });
  const approveData = await approveRes.json();
  assert(approveRes.status === 200, 'Staff admin approval returns HTTP 200', `Got ${approveRes.status}`);
  assert(approveData.status === 'PAID', 'Staff approval marks order PAID', approveData.status);

  // Test 7: Native Embedded UPILerify Engine (Zero 503 errors when external server is unconfigured)
  console.log('\n--- 7. Native Embedded UPILerify Engine (Missing Config Fallback) ---');
  const savedBaseUrl = process.env.UPILERIFY_BASE_URL;
  const savedApiKey = process.env.UPILERIFY_API_KEY;
  try {
    delete process.env.UPILERIFY_BASE_URL;
    delete process.env.UPILERIFY_API_KEY;

    const embedRes = await fetch(`${BASE}/api/checkout/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-suite': 'true' },
      body: JSON.stringify({
        files: [{ id: 'f4', name: 'embedded_doc.pdf', pages: 3, colorMode: 'bw', is_test: true }]
      })
    });
    const embedData = await embedRes.json();
    assert(embedRes.status === 200, 'Embedded checkout create returns HTTP 200 (never 503)', `Got ${embedRes.status}`);
    assert(embedData.engine === 'embedded', 'Engine mode is embedded', embedData.engine);
    assert(embedData.payableAmount === embedData.baseAmount, 'Embedded engine preserves exact source amount', `Base: ₹${embedData.baseAmount}, Payable: ₹${embedData.payableAmount}`);
    assert(Boolean(embedData.qrCodeData && embedData.upiIntentUrl), 'Embedded engine generates dynamic vector QR & intent URL');
    assert(embedData.status === 'PENDING', 'Embedded checkout order is PENDING', embedData.status);

    // Verify manual UTR works in embedded mode
    const embedUtr = '777888999111';
    const embedUtrRes = await fetch(`${BASE}/api/checkout/manual-utr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: embedData.orderId, utrNumber: embedUtr })
    });
    const embedUtrData = await embedUtrRes.json();
    assert(embedUtrRes.status === 200, 'Embedded manual UTR accepted (200)', `Got ${embedUtrRes.status}`);
    assert(embedUtrData.status === 'UNDER_REVIEW', 'Embedded order moves to UNDER_REVIEW', embedUtrData.status);
  } finally {
    process.env.UPILERIFY_BASE_URL = savedBaseUrl;
    process.env.UPILERIFY_API_KEY = savedApiKey;
  }

  // Test 8: Official UPILerify Spec Webhook Payload (req.body.order with metadata.orderId)
  console.log('\n--- 8. Official UPILerify README Spec Webhook Compatibility ---');
  const fourthCreateRes = await fetch(`${BASE}/api/checkout/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-suite': 'true' },
    body: JSON.stringify({
      files: [{ id: 'f5', name: 'paper5.pdf', pages: 1, colorMode: 'bw', is_test: true }]
    })
  });
  const fourthOrder = await fourthCreateRes.json();
  const officialUtr = '555666777888';
  const officialWebhookPayload = JSON.stringify({
    event: 'payment.verified',
    timestamp: Date.now(),
    order: {
      id: 'ord_official_test_spec_123',
      amount: fourthOrder.baseAmount,
      expectedAmount: fourthOrder.payableAmount,
      utr: officialUtr,
      bank: 'HDFC Bank',
      status: 'VERIFIED',
      metadata: {
        userId: 'student_xyz',
        orderId: fourthOrder.orderId
      }
    }
  });

  const officialSig = crypto.createHmac('sha256', TEST_SECRET).update(Buffer.from(officialWebhookPayload, 'utf8')).digest('hex');
  const officialHookRes = await fetch(`${BASE}/api/webhooks/upilerify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-UPILerify-Signature': officialSig,
      'X-UPILerify-Event': 'payment.verified'
    },
    body: officialWebhookPayload
  });
  const officialHookData = await officialHookRes.json();
  assert(officialHookRes.status === 200, 'Official UPILerify webhook format accepted (200)', `Got ${officialHookRes.status}`);
  assert(officialHookData.status === 'PAID', 'Official webhook marks order PAID', officialHookData.status);

  // Test 9: Staff UPILerify Connection Diagnostic Endpoint
  console.log('\n--- 9. Staff UPILerify Connection Test Utility ---');
  const testConnRes = await fetch(`${BASE}/api/upilerify/test-connection`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Token': 'test-staff-token-upilerify'
    },
    body: JSON.stringify({
      upilerifyBaseUrl: 'http://127.0.0.1:4999',
      upilerifyApiKey: TEST_API_KEY
    })
  });
  const testConnData = await testConnRes.json();
  assert(testConnRes.status === 200, 'Staff connection test returns HTTP 200', `Got ${testConnRes.status}`);
  assert(testConnData.ok === true, 'Staff connection test reports ok: true', `ok=${testConnData.ok}`);
  assert(testConnData.mode === 'external', 'Staff connection test detects external mode', testConnData.mode);

  console.log(`\n========================================`);
  console.log(`E2E UPILerify Test Results: ${passed} passed, ${failed} failed.`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
} finally {
  apiServer.close();
  mockUpilerifyServer.close();
}
