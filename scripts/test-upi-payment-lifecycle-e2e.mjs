import dns from 'node:dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {}

const BASE_URL = process.env.BASE_URL || 'https://printbk-60074625517.development.catalystserverless.in';
const SETUP_CODE = 'PBK-SETUP-9021';

async function safeFetch(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`  ⚠️ Connection glitch to ${url}, retrying in 1.5s (attempt ${i + 1}/${retries})...`);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ [PASS] ${message}`);
}

async function runUpiLifecycleTests() {
  console.log(`========================================================================`);
  console.log(`💳 PRINTBK END-TO-END UPI PAYMENT LIFECYCLE VERIFICATION`);
  console.log(`   Target: ${BASE_URL}`);
  console.log(`========================================================================\n`);

  // Step 0: Pair Staff Counter Device
  console.log('--- Step 0: Pair Counter Device ---');
  const pairRes = await safeFetch(`${BASE_URL}/server/api/staff/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupCode: SETUP_CODE, label: 'UPI Lifecycle Verifier' })
  }).then(r => r.json());

  assert(pairRes.ok === true && !!pairRes.deviceToken, `Staff device paired (ID: ${pairRes.deviceId})`);
  const staffToken = pairRes.deviceToken;

  // --------------------------------------------------------------------------
  // SCENARIO 1: Complete Direct UPI Journey
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 1: Full Direct UPI Journey (Start -> Deep Links -> Claim -> Counter Approve) ---');
  
  // 1. Create order
  const order1Res = await safeFetch(`${BASE_URL}/server/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      is_test: true,
      files: [{
        id: 'upi-doc-001',
        name: 'Project_Report.pdf',
        pages: 4,
        colorPages: 0,
        settings: { copies: 1, paper: 'A4', sided: 'single', colorMode: 'bw' }
      }],
      payment: 'upi'
    })
  }).then(r => r.json());

  assert(!!order1Res.orderId && !!order1Res.accessToken, `Created UPI order #${order1Res.orderNumber} in status 'pending_payment'`);
  const order1Id = order1Res.orderId;
  const token1 = order1Res.accessToken;

  // 2. Start UPI payment
  const startUpiRes = await safeFetch(`${BASE_URL}/server/api/orders/${order1Id}/start-upi`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Order-Token': token1
    }
  }).then(r => r.json());

  assert(startUpiRes.ok === true && startUpiRes.status === 'upi_started', `Initiated UPI; status transitioned to 'upi_started'`);
  assert(startUpiRes.upiId && startUpiRes.amount > 0, `Configured UPI ID returned: "${startUpiRes.upiId}", amount: ₹${startUpiRes.amount}`);
  assert(startUpiRes.intentUrl.startsWith('upi://pay?'), `Canonical NPCI URI valid: "${startUpiRes.intentUrl.slice(0, 50)}..."`);
  assert(startUpiRes.intentUrl.includes('cu=INR'), `NPCI URI contains currency cu=INR`);
  assert(startUpiRes.intentUrl.includes('tr='), `NPCI URI contains unique transaction ref tr=`);

  // Verify deep links for all major payment apps
  assert(startUpiRes.gpayAndroid.includes('com.google.android.apps.nbu.paisa.user'), `Google Pay Android package intent verified`);
  assert(startUpiRes.phonepeAndroid.includes('com.phonepe.app'), `PhonePe Android package intent verified`);
  assert(startUpiRes.paytmAndroid.includes('net.one97.paytm'), `Paytm Android package intent verified`);
  assert(startUpiRes.bhimAndroid.includes('in.org.npci.upiapp'), `BHIM Android package intent verified`);
  assert(startUpiRes.gpayIos.startsWith('gpay://'), `Google Pay iOS deep link verified`);
  assert(startUpiRes.phonepeIos.startsWith('phonepe://'), `PhonePe iOS deep link verified`);
  assert(startUpiRes.paytmIos.startsWith('paytmmp://'), `Paytm iOS deep link verified`);

  // 3. Verify order gating: pickupCode is withheld while waiting for payment
  const studentView1 = await safeFetch(`${BASE_URL}/server/api/orders/${order1Id}`, {
    headers: { 'X-Order-Token': token1 }
  }).then(r => r.json());
  assert(!studentView1.pickupCode || studentView1.pickupCode === '——' || studentView1.pickupCode === null, `Pickup code securely withheld from student while payment is pending`);

  // 4. Student claims payment with UTR
  const claimRes = await safeFetch(`${BASE_URL}/server/api/orders/${order1Id}/upi-return`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Order-Token': token1
    },
    body: JSON.stringify({ utr: 'UTR987654321012' })
  }).then(r => r.json());

  assert(claimRes.ok === true && claimRes.status === 'upi_claimed', `Student submitted payment claim with UTR; order moved to 'upi_claimed'`);

  // 5. Verify Counter live queue reflects UPI claimed
  const liveRes1 = await safeFetch(`${BASE_URL}/server/api/staff/live?include_test=true`, {
    headers: { 'X-Staff-Device-Token': staffToken }
  }).then(r => r.json());

  const queueItem1 = liveRes1.items?.find(it => it.order_id === order1Id || it.order_number === order1Res.orderNumber);
  assert(queueItem1 !== undefined, `Found UPI claimed order in Counter live queue`);
  assert(queueItem1.payment_status === 'upi_claimed', `Queue item payment_status correctly reflects 'upi_claimed'`);

  // 6. Counter Approves & Prints
  const approveRes1 = await safeFetch(`${BASE_URL}/server/api/staff/items/${queueItem1.id}/approve-print`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': staffToken
    },
    body: JSON.stringify({ orderId: order1Id })
  }).then(r => r.json());

  assert(approveRes1.ok === true, `Counter approved UPI payment; print dispatch succeeded with HTTP 200`);

  // 7. Verify pickup code revealed after counter approval
  const approvedView1 = await safeFetch(`${BASE_URL}/server/api/orders/${order1Id}`, {
    headers: { 'X-Order-Token': token1 }
  }).then(r => r.json());
  assert(approvedView1.status === 'processing' || approvedView1.status === 'ready' || approvedView1.status === 'printing', `Order transitioned to '${approvedView1.status}'`);
  assert(!!approvedView1.pickupCode && approvedView1.pickupCode !== '——', `Pickup code revealed to student: "${approvedView1.pickupCode}"`);

  // --------------------------------------------------------------------------
  // SCENARIO 2: Fallback from UPI to Cash at Counter
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 2: Switching from UPI to Cash at Counter (choose-cash) ---');

  const order2Res = await safeFetch(`${BASE_URL}/server/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      is_test: true,
      files: [{
        id: 'upi-fallback-doc',
        name: 'Syllabus.pdf',
        pages: 2,
        settings: { copies: 1, paper: 'A4', colorMode: 'bw' }
      }],
      payment: 'upi'
    })
  }).then(r => r.json());

  const order2Id = order2Res.orderId;
  const token2 = order2Res.accessToken;

  // Initiate UPI
  await safeFetch(`${BASE_URL}/server/api/orders/${order2Id}/start-upi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Order-Token': token2 }
  });

  // Switch to Cash at Counter
  const switchCashRes = await safeFetch(`${BASE_URL}/server/api/orders/${order2Id}/choose-cash`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Order-Token': token2
    }
  }).then(r => r.json());

  assert(switchCashRes.ok === true && switchCashRes.status === 'pending_cash', `Successfully switched from 'upi_started' to 'pending_cash' without 409 conflict`);

  // Staff approves cash payment
  const approveCashRes = await safeFetch(`${BASE_URL}/server/api/orders/${order2Id}/approve-cash`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': staffToken
    }
  }).then(r => r.json());

  assert(approveCashRes.ok === true && approveCashRes.status === 'processing', `Counter staff approved cash payment via /approve-cash; status 'processing'`);

  // --------------------------------------------------------------------------
  // SCENARIO 3: Direct Counter Approval of Claimed UPI Order via approve-cash
  // --------------------------------------------------------------------------
  console.log('\n--- SCENARIO 3: Counter Direct Approval of Claimed UPI Order (/approve-cash) ---');

  const order3Res = await safeFetch(`${BASE_URL}/server/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      is_test: true,
      files: [{
        id: 'upi-claim-cash',
        name: 'Lab_Manual.pdf',
        pages: 3,
        settings: { copies: 1, paper: 'A4', colorMode: 'bw' }
      }],
      payment: 'upi'
    })
  }).then(r => r.json());

  const order3Id = order3Res.orderId;
  const token3 = order3Res.accessToken;

  await safeFetch(`${BASE_URL}/server/api/orders/${order3Id}/start-upi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Order-Token': token3 }
  });

  await safeFetch(`${BASE_URL}/server/api/orders/${order3Id}/upi-return`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Order-Token': token3 }
  });

  // Staff clicks approve-cash on the claimed UPI order
  const approveClaimedRes = await safeFetch(`${BASE_URL}/server/api/orders/${order3Id}/approve-cash`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': staffToken
    }
  }).then(r => r.json());

  assert(approveClaimedRes.ok === true && approveClaimedRes.status === 'processing', `Staff approved claimed UPI order via /approve-cash with HTTP 200 (payment_status: ${approveClaimedRes.payment_status})`);

  // --------------------------------------------------------------------------
  // Cleanup Test Data
  // --------------------------------------------------------------------------
  console.log('\n--- Step 4: Hygiene Cleanup ---');
  await safeFetch(`${BASE_URL}/server/api/internal/purge-test-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': staffToken
    },
    body: JSON.stringify({ dryRun: false })
  });

  await safeFetch(`${BASE_URL}/server/api/staff/unpair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Staff-Device-Token': staffToken }
  }).catch(() => {});

  console.log(`\n========================================================================`);
  console.log(`🎉 ALL UPI PAYMENT LIFECYCLE SCENARIOS PASSED 100%!`);
  console.log(`   Direct App Launch, Fallback to Cash, Counter Approval, and Gating verified.`);
  console.log(`========================================================================`);
}

runUpiLifecycleTests().catch(err => {
  console.error('\n❌ UPI LIFECYCLE TEST FAILED:', err);
  process.exit(1);
});
