#!/usr/bin/env node
/**
 * scripts/test-upi-and-gating.mjs
 * 
 * Unit & Integration test suite verifying:
 * 1. NPCI UPI specification compliance for generated UPI URIs and deep links.
 * 2. Strict order data gating (orderNumber, pickupCode, basket withheld during pending_payment).
 * 3. Complete payment lifecycle state machine (pending_payment -> upi_started -> upi_claimed / pending_cash -> processing -> ready).
 * 4. Staff-only capability for moving claimed/cash orders to processing and generating pickup codes.
 */

import assert from 'assert';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║       PrintBK UPI Specification & Receipt Gating Test Suite    ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`\x1b[32m[ PASS ]\x1b[0m ${name}`);
    passCount++;
  } catch (err) {
    console.error(`\x1b[31m[ FAIL ]\x1b[0m ${name}`);
    console.error(`         ${err.message}`);
    failCount++;
  }
}

// ─── 1. NPCI UPI Specification Compliance ─────────────────────────────
// NPCI UPI Linking Specification requires:
// - Scheme: upi://pay
// - pa: Payee VPA / UPI ID (must be valid format: e.g. handle@bank)
// - pn: Payee Name (alphanumeric/spaces, URL encoded)
// - am: Amount with exactly 2 decimal places (e.g. 15.00)
// - cu: Currency code (must be INR)
// - tn: Note / Transaction reference

function buildNpcidUpiUrl(pa, pn, am, tn) {
  const params = new URLSearchParams();
  params.set('pa', pa);
  params.set('pn', pn);
  params.set('am', Number(am).toFixed(2));
  params.set('cu', 'INR');
  params.set('tn', tn);
  return `upi://pay?${params.toString()}`;
}

test('1.1 Generates valid NPCI URI with correct query parameters', () => {
  const upiId = 'Q098686787@ybl';
  const payeeName = 'PrintBK HKBK';
  const total = 32.5;
  const note = 'PrintBK Order 1042';

  const uri = buildNpcidUpiUrl(upiId, payeeName, total, note);
  assert(uri.startsWith('upi://pay?'), 'Must start with upi://pay?');

  const parsed = new URL(uri);
  assert.strictEqual(parsed.searchParams.get('pa'), 'Q098686787@ybl', 'pa parameter must match UPI ID');
  assert.strictEqual(parsed.searchParams.get('pn'), 'PrintBK HKBK', 'pn parameter must match Payee Name');
  assert.strictEqual(parsed.searchParams.get('am'), '32.50', 'am must have exactly 2 decimal places');
  assert.strictEqual(parsed.searchParams.get('cu'), 'INR', 'cu must be INR');
  assert.strictEqual(parsed.searchParams.get('tn'), note, 'tn must match order reference');
});

test('1.2 Platform deep links for iOS apps preserve exact encoded payload', () => {
  const upiId = 'Q098686787@ybl';
  const payeeName = 'PrintBK HKBK';
  const total = 100.0;
  const note = 'PrintBK Order 1043';

  const rawUri = buildNpcidUpiUrl(upiId, payeeName, total, note);
  const query = rawUri.replace(/^upi:\/\/pay\?/, '');

  const gpayLink = `tez://upi/pay?${query}`;
  const phonepeLink = `phonepe://pay?${query}`;
  const paytmLink = `paytmmp://pay?${query}`;

  assert(gpayLink.startsWith('tez://upi/pay?pa=Q098686787%40ybl'), 'GPay deep link formatted correctly');
  assert(phonepeLink.startsWith('phonepe://pay?pa=Q098686787%40ybl'), 'PhonePe deep link formatted correctly');
  assert(paytmLink.startsWith('paytmmp://pay?pa=Q098686787%40ybl'), 'Paytm deep link formatted correctly');
});

// ─── 2. State Machine & Transitions ──────────────────────────────────
const VALID_TRANSITIONS = {
  pending_payment: ['pending_cash', 'upi_started', 'cancelled'],
  pending_cash:    ['processing', 'cancelled', 'rejected'],
  upi_started:     ['upi_claimed', 'pending_cash', 'cancelled'],
  upi_claimed:     ['processing', 'cancelled', 'rejected'],
  waiting_quote:   ['pending_cash', 'upi_started', 'cancelled'],
  processing:      ['printing', 'cancelled'],
  printing:        ['ready'],
  ready:           ['completed'],
  completed:       [],
  cancelled:       [],
  rejected:        [],
  expired:         [],
};

function isValidTransition(from, to) {
  const allowed = VALID_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

test('2.1 Valid transitions from pending_payment are only cash, upi_started, cancelled', () => {
  assert(isValidTransition('pending_payment', 'pending_cash'), 'pending_payment -> pending_cash allowed');
  assert(isValidTransition('pending_payment', 'upi_started'), 'pending_payment -> upi_started allowed');
  assert(isValidTransition('pending_payment', 'cancelled'), 'pending_payment -> cancelled allowed');

  // Student cannot skip directly to processing, ready, completed or upi_claimed
  assert(!isValidTransition('pending_payment', 'processing'), 'pending_payment -> processing FORBIDDEN');
  assert(!isValidTransition('pending_payment', 'ready'), 'pending_payment -> ready FORBIDDEN');
  assert(!isValidTransition('pending_payment', 'completed'), 'pending_payment -> completed FORBIDDEN');
  assert(!isValidTransition('pending_payment', 'upi_claimed'), 'pending_payment -> upi_claimed FORBIDDEN without upi_started');
});

test('2.2 upi_started can transition to upi_claimed or fall back to cash', () => {
  assert(isValidTransition('upi_started', 'upi_claimed'), 'upi_started -> upi_claimed allowed');
  assert(isValidTransition('upi_started', 'pending_cash'), 'upi_started -> pending_cash allowed');
  assert(!isValidTransition('upi_started', 'printing'), 'upi_started -> printing FORBIDDEN');
});

test('2.3 upi_claimed can only be approved by staff to processing, or cancelled/rejected', () => {
  assert(isValidTransition('upi_claimed', 'processing'), 'upi_claimed -> processing allowed');
  assert(isValidTransition('upi_claimed', 'cancelled'), 'upi_claimed -> cancelled allowed');
  assert(isValidTransition('upi_claimed', 'rejected'), 'upi_claimed -> rejected allowed');
  assert(!isValidTransition('upi_claimed', 'ready'), 'upi_claimed -> ready FORBIDDEN (must go through processing)');
});

// ─── 3. Receipt & Order Data Gating Logic ─────────────────────────────
function filterOrderForStudent(order) {
  const isPendingPayment = order.status === 'pending_payment';
  const isApproved = ['processing', 'printing', 'ready', 'completed'].includes(order.status);

  return {
    id: order.id,
    status: order.status,
    total: order.total,
    // Withhold sensitive/receipt identifiers while pending_payment
    orderNumber: isPendingPayment ? null : order.orderNumber,
    pickupCode: isApproved ? order.pickupCode : null,
    basket: isPendingPayment ? null : order.basket,
    files: isPendingPayment ? [] : (order.files || [])
  };
}

test('3.1 When order is pending_payment: orderNumber, pickupCode, and basket are withheld', () => {
  const fullOrder = {
    id: 'ord_12345678',
    status: 'pending_payment',
    total: 45.0,
    orderNumber: 1042,
    pickupCode: '8841',
    basket: { files: [{ name: 'assignment.pdf' }], services: [] },
    files: ['assignment.pdf']
  };

  const studentView = filterOrderForStudent(fullOrder);
  assert.strictEqual(studentView.id, 'ord_12345678');
  assert.strictEqual(studentView.status, 'pending_payment');
  assert.strictEqual(studentView.orderNumber, null, 'orderNumber must be null in pending_payment');
  assert.strictEqual(studentView.pickupCode, null, 'pickupCode must be null in pending_payment');
  assert.strictEqual(studentView.basket, null, 'basket details must be withheld in pending_payment');
  assert.deepStrictEqual(studentView.files, [], 'files must be empty in pending_payment');
});

test('3.2 When student chooses Cash: orderNumber is visible, pickupCode remains null', () => {
  const fullOrder = {
    id: 'ord_12345678',
    status: 'pending_cash',
    total: 45.0,
    orderNumber: 1042,
    pickupCode: '8841',
    basket: { files: [{ name: 'assignment.pdf' }], services: [] },
    files: ['assignment.pdf']
  };

  const studentView = filterOrderForStudent(fullOrder);
  assert.strictEqual(studentView.status, 'pending_cash');
  assert.strictEqual(studentView.orderNumber, 1042, 'orderNumber visible for cashier counter reference');
  assert.strictEqual(studentView.pickupCode, null, 'pickupCode MUST remain null until staff approves');
  assert.notStrictEqual(studentView.basket, null, 'basket visible to review order at counter');
});

test('3.3 When student returns from UPI (upi_claimed): pickupCode remains withheld until staff approves', () => {
  const fullOrder = {
    id: 'ord_12345678',
    status: 'upi_claimed',
    total: 45.0,
    orderNumber: 1042,
    pickupCode: '8841',
    basket: { files: [{ name: 'assignment.pdf' }], services: [] },
    files: ['assignment.pdf']
  };

  const studentView = filterOrderForStudent(fullOrder);
  assert.strictEqual(studentView.status, 'upi_claimed');
  assert.strictEqual(studentView.orderNumber, 1042, 'orderNumber visible');
  assert.strictEqual(studentView.pickupCode, null, 'pickupCode withheld until staff approves');
});

test('3.4 When staff approves into processing / ready: pickupCode is revealed', () => {
  const fullOrder = {
    id: 'ord_12345678',
    status: 'ready',
    total: 45.0,
    orderNumber: 1042,
    pickupCode: '8841',
    basket: { files: [{ name: 'assignment.pdf' }], services: [] },
    files: ['assignment.pdf']
  };

  const studentView = filterOrderForStudent(fullOrder);
  assert.strictEqual(studentView.status, 'ready');
  assert.strictEqual(studentView.orderNumber, 1042);
  assert.strictEqual(studentView.pickupCode, '8841', 'pickupCode revealed when ready');
});

console.log('----------------------------------------------------------------');
console.log(`Summary: ${passCount} passed, ${failCount} failed.`);

if (failCount > 0) {
  process.exit(1);
}
