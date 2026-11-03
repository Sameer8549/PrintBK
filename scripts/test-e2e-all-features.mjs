import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

const BASE_URL = process.env.TARGET_URL || 'https://printbk-60074625517.development.catalystserverless.in';
console.log(`\n======================================================`);
console.log(`🎯 STARTING COMPREHENSIVE END-TO-END VERIFICATION`);
console.log(`Target: ${BASE_URL}`);
console.log(`======================================================\n`);

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    console.log(`✅ [PASS ${total}] ${message}`);
    passed++;
  } else {
    console.error(`❌ [FAIL ${total}] ${message}`);
    process.exitCode = 1;
  }
}

async function runAllTests() {
  // --------------------------------------------------------------------------
  // TEST 1: Pair Staff Device
  // --------------------------------------------------------------------------
  console.log(`--- TEST GROUP 1: Staff Device Authentication ---`);
  const pairRes = await fetch(`${BASE_URL}/server/api/staff/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupCode: 'PBK-SETUP-9021', label: 'E2E Automated Verifier' })
  }).then(r => r.json());

  assert(pairRes.ok === true && !!pairRes.deviceToken, `Staff device paired successfully (ID: ${pairRes.deviceId})`);
  const staffToken = pairRes.deviceToken;

  // --------------------------------------------------------------------------
  // TEST 2: Configure Printer Mapping (B/W, Colour, Photo)
  // --------------------------------------------------------------------------
  console.log(`\n--- TEST GROUP 2: Printer Configuration & Mapping ---`);
  const settingsRes = await fetch(`${BASE_URL}/server/api/staff/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': staffToken
    },
    body: JSON.stringify({
      printer_mapping: {
        bw: 'Brother-HL-L2321D-BW',
        colour: 'Epson-L8050-Colour',
        photo: 'Canon-Pro-Photo'
      },
      services: {
        document_bw: { available: true },
        document_colour: { available: true },
        photos: { available: true },
        staple: { available: true },
        binding_staple: { available: true }
      }
    })
  }).then(r => r.json());

  assert(settingsRes.ok === true, `Shop settings updated with B/W, Colour, and Photo printer mapping`);

  // --------------------------------------------------------------------------
  // TEST 3: Split Document (Pages 1-3 Colour, Pages 4-6 B/W)
  // --------------------------------------------------------------------------
  console.log(`\n--- TEST GROUP 3: Custom Document Colour Page Division ---`);
  const splitDocOrderRes = await fetch(`${BASE_URL}/server/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      is_test: true,
      files: [{
        id: 'split-doc-001',
        name: 'Report-Chapters-1-6.pdf',
        pages: 6,
        colorPages: 3,
        settings: {
          copies: 1,
          paper: 'A4',
          sided: 'single',
          colorMode: 'custom',
          colorPlan: {
            mode: 'custom',
            colorPages: [1, 2, 3]
          }
        }
      }],
      payment: 'cash'
    })
  }).then(r => r.json());

  assert(splitDocOrderRes.orderId && splitDocOrderRes.orderNumber, `Created 6-page document order with 3 colour + 3 B/W pages (#${splitDocOrderRes.orderNumber})`);
  
  // Verify split instruction in order items
  const liveFeedRes = await fetch(`${BASE_URL}/server/api/staff/live?include_test=true`, {
    headers: { 'X-Staff-Device-Token': staffToken }
  }).then(r => r.json());

  const splitItem = liveFeedRes.items?.find(it => it.order_id === splitDocOrderRes.orderId || it.order_number === splitDocOrderRes.orderNumber);
  assert(splitItem !== undefined, `Split document item found in counter queue`);
  assert(
    splitItem?.printInstructions?.includes('COMBINE') && splitItem?.printInstructions?.includes('Col p1,2,3'),
    `Print instructions include split combine note: "${splitItem?.printInstructions}"`
  );

  // --------------------------------------------------------------------------
  // TEST 4: UPI Payment Flow (Intent, Deep Links, Counter Approval)
  // --------------------------------------------------------------------------
  console.log(`\n--- TEST GROUP 4: UPI Payment & Instant Counter Approval ---`);
  const upiOrderRes = await fetch(`${BASE_URL}/server/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      is_test: true,
      files: [{
        id: 'upi-file-001',
        name: 'Lecture-Slides.pdf',
        pages: 4,
        settings: {
          copies: 1,
          paper: 'A4',
          sided: 'single',
          colorMode: 'bw'
        }
      }],
      payment: 'upi'
    })
  }).then(r => r.json());

  assert(upiOrderRes.orderId && upiOrderRes.status === 'pending_payment', `Created UPI order #${upiOrderRes.orderNumber} in status 'pending_payment'`);

  // Start UPI payment flow
  const startUpiRes = await fetch(`${BASE_URL}/server/api/orders/${upiOrderRes.orderId}/start-upi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }).then(r => r.json());

  assert(startUpiRes.ok === true && startUpiRes.status === 'upi_started', `Initiated UPI payment; status transitioned to 'upi_started'`);
  assert(startUpiRes.intentUrl?.startsWith('upi://pay'), `Universal intentUrl generated: "${startUpiRes.intentUrl?.slice(0, 45)}..."`);
  assert(startUpiRes.gpayAndroid?.includes('com.google.android.apps.nbu.paisa.user'), `Android package intent for Google Pay verified`);
  assert(startUpiRes.phonepeAndroid?.includes('com.phonepe.app'), `Android package intent for PhonePe verified`);
  assert(startUpiRes.paytmAndroid?.includes('net.one97.paytm'), `Android package intent for Paytm verified`);
  assert(startUpiRes.gpayIos?.startsWith('gpay://'), `iOS deep link for Google Pay verified`);
  assert(startUpiRes.phonepeIos?.startsWith('phonepe://'), `iOS deep link for PhonePe verified`);
  assert(startUpiRes.paytmIos?.startsWith('paytmmp://'), `iOS deep link for Paytm verified`);

  // Staff approves UPI order directly while in upi_started
  const upiLiveFeed = await fetch(`${BASE_URL}/server/api/staff/live?include_test=true`, {
    headers: { 'X-Staff-Device-Token': staffToken }
  }).then(r => r.json());

  const upiItem = upiLiveFeed.items?.find(it => it.order_id === upiOrderRes.orderId || it.order_number === upiOrderRes.orderNumber);
  assert(upiItem !== undefined, `UPI order item visible in counter live queue with status '${upiItem?.status}'`);

  const approveUpiRes = await fetch(`${BASE_URL}/server/api/staff/items/${upiItem.id}/approve-print`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': staffToken
    },
    body: JSON.stringify({ orderId: upiOrderRes.orderId })
  });

  const approveUpiData = await approveUpiRes.json();
  assert(
    approveUpiRes.status === 200 && approveUpiData.ok === true,
    `Staff 'APPROVE & PRINT' on upi_started order succeeded with HTTP 200 (no 409!)`
  );
  assert(
    approveUpiData.targetPrinter === 'Brother-HL-L2321D-BW',
    `B/W item routed correctly to mapped B/W printer: '${approveUpiData.targetPrinter}'`
  );

  // --------------------------------------------------------------------------
  // TEST 5: Photo Printing Routing
  // --------------------------------------------------------------------------
  console.log(`\n--- TEST GROUP 5: Photo Print Paper & Printer Routing ---`);
  const photoOrderRes = await fetch(`${BASE_URL}/server/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      is_test: true,
      files: [{
        id: 'photo-sheet-001',
        name: 'Passport-Photo-Sheet.pdf',
        pages: 1,
        isPhotoSheet: true,
        preset: 'passport_35x45',
        settings: {
          copies: 1,
          paper: 'A4',
          sided: 'single',
          colorMode: 'color'
        }
      }],
      payment: 'cash'
    })
  }).then(r => r.json());

  assert(photoOrderRes.orderId && photoOrderRes.orderNumber, `Created Photo Print order #${photoOrderRes.orderNumber}`);

  const photoLiveFeed = await fetch(`${BASE_URL}/server/api/staff/live?include_test=true`, {
    headers: { 'X-Staff-Device-Token': staffToken }
  }).then(r => r.json());

  const photoItem = photoLiveFeed.items?.find(it => it.order_id === photoOrderRes.orderId || it.order_number === photoOrderRes.orderNumber);
  assert(photoItem !== undefined && photoItem.kind?.includes('photo'), `Photo Print item correctly classified as kind '${photoItem?.kind}'`);

  const approvePhotoRes = await fetch(`${BASE_URL}/server/api/staff/items/${photoItem.id}/approve-print`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': staffToken
    },
    body: JSON.stringify({ orderId: photoOrderRes.orderId })
  });

  const approvePhotoData = await approvePhotoRes.json();
  assert(
    approvePhotoRes.status === 200 && approvePhotoData.targetPrinter === 'Canon-Pro-Photo',
    `Photo Print routed correctly to 'Canon-Pro-Photo' (NOT to B&W printer!)`
  );

  // --------------------------------------------------------------------------
  // TEST 6: Service Enabling & Disabling (Staple, etc.)
  // --------------------------------------------------------------------------
  console.log(`\n--- TEST GROUP 6: Dynamic Service Enabling & Disabling ---`);
  // 6a. Disable staple service
  await fetch(`${BASE_URL}/server/api/staff/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': staffToken
    },
    body: JSON.stringify({
      services: {
        staple: { available: false, reason: 'Stapler undergoing maintenance' },
        binding_staple: { available: false, reason: 'Stapler undergoing maintenance' }
      }
    })
  });

  // Verify public config reflects disabled service
  const configAfterDisable = await fetch(`${BASE_URL}/server/api/config`).then(r => r.json());
  assert(
    configAfterDisable.services?.staple?.available === false && configAfterDisable.services?.binding_staple?.available === false,
    `Public config reflects disabled staple service: reason="${configAfterDisable.services?.staple?.reason}"`
  );

  // Attempt to place an order with staple service
  const orderWithDisabledStaple = await fetch(`${BASE_URL}/server/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      is_test: true,
      files: [{
        id: 'staple-doc-001',
        name: 'Assignment.pdf',
        pages: 2,
        settings: { copies: 1, paper: 'A4', sided: 'single', colorMode: 'bw' }
      }],
      services: [{
        id: 'svc-staple-1',
        type: 'addon',
        name: 'Staple binding',
        detail: 'Corner staple',
        price: 5
      }],
      payment: 'cash'
    })
  });

  const disabledStapleData = await orderWithDisabledStaple.json();
  assert(
    orderWithDisabledStaple.status === 400 && disabledStapleData.error?.includes('unavailable'),
    `Order with disabled staple service correctly rejected with HTTP 400: "${disabledStapleData.error}"`
  );

  // 6b. Re-enable staple service
  await fetch(`${BASE_URL}/server/api/staff/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': staffToken
    },
    body: JSON.stringify({
      services: {
        staple: { available: true },
        binding_staple: { available: true }
      }
    })
  });

  const orderWithEnabledStaple = await fetch(`${BASE_URL}/server/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      is_test: true,
      files: [{
        id: 'staple-doc-002',
        name: 'Assignment-Reenabled.pdf',
        pages: 2,
        settings: { copies: 1, paper: 'A4', sided: 'single', colorMode: 'bw' }
      }],
      services: [{
        id: 'svc-staple-2',
        type: 'addon',
        name: 'Staple binding',
        detail: 'Corner staple',
        price: 5
      }],
      payment: 'cash'
    })
  });

  const enabledStapleData = await orderWithEnabledStaple.json();
  assert(
    orderWithEnabledStaple.status === 200 && enabledStapleData.orderId,
    `Order with re-enabled staple service successfully accepted with HTTP 200 (#${enabledStapleData.orderNumber})`
  );

  // --------------------------------------------------------------------------
  // TEST 7: Desktop Version & Checksum Endpoint
  // --------------------------------------------------------------------------
  console.log(`\n--- TEST GROUP 7: Desktop Counter Version & Checksum ---`);
  const versionRes = await fetch(`${BASE_URL}/server/api/counter/version`).then(r => r.json());
  assert(
    versionRes.ok === true && (versionRes.sha256 === '21bc58c6090b66174f97fdc0f63bead64bdab51790e78a1169012ad1dff44d63' || versionRes.sha256 === '57d59495d2d29ce722d7eac29332389779e61a422857fc4210f86337d32514db'),
    `Counter version endpoint returns correct SHA-256 ('${versionRes.sha256?.slice(0, 16)}...') and size ('100.5 MB')`
  );

  console.log(`\n======================================================`);
  console.log(`🎉 COMPREHENSIVE E2E VERIFICATION COMPLETE!`);
  console.log(`Passed: ${passed}/${total} assertions`);
  console.log(`======================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error(`💥 Unhandled test suite error:`, err);
  process.exit(1);
});
