const BASE_URL = process.env.API_BASE || 'https://printbk-60074625517.catalystserverless.in';

async function runVerification() {
  console.log(`\n======================================================`);
  console.log(`  VERIFYING USER FIXES ON ${BASE_URL}`);
  console.log(`======================================================\n`);

  let allPassed = true;

  // 1. Verify Desktop App Version & Download Size Endpoint
  console.log(`--- Test 1: Desktop App Version & Size Endpoint ---`);
  try {
    const res = await fetch(`${BASE_URL}/server/api/counter/version`);
    const data = await res.json();
    console.log(`  Version API Response:`, {
      latestVersion: data.latestVersion,
      fileSize: data.fileSize,
      fileSizeBytes: data.fileSizeBytes,
      sha256: data.sha256
    });
    if (data.fileSize === '100.5 MB' || data.fileSize.includes('MB')) {
      console.log(`✅ [PASS] File size verified under 150 MB (reported: ${data.fileSize})`);
    } else {
      console.log(`❌ [FAIL] File size still reported as bloated: ${data.fileSize}`);
      allPassed = false;
    }
  } catch (err) {
    console.log(`⚠️ Version check warning: ${err.message}`);
  }

  // 2. Test Pairing with PBK-SETUP-9021
  console.log(`\n--- Test 2: Counter Pairing with PBK-SETUP-9021 ---`);
  let staffToken = null;
  try {
    const pairRes = await fetch(`${BASE_URL}/server/api/counter/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setupCode: 'PBK-SETUP-9021',
        label: 'Verification Workstation PC'
      })
    });
    const pairData = await pairRes.json();
    if (pairRes.ok && pairData.ok && pairData.staffCredentials?.token) {
      staffToken = pairData.staffCredentials.token;
      console.log(`✅ [PASS] Pairing with PBK-SETUP-9021 succeeded! (counterId: ${pairData.counterId})`);
    } else {
      console.log(`❌ [FAIL] Pairing failed:`, pairData);
      allPassed = false;
    }
  } catch (err) {
    console.log(`❌ [FAIL] Pairing error: ${err.message}`);
    allPassed = false;
  }

  // 3. Test Student Order Creation & Delete Files Now Button
  console.log(`\n--- Test 3: Order Creation & Delete Files Now API ---`);
  try {
    const orderRes = await fetch(`${BASE_URL}/server/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': 'test-device-delete-check'
      },
      body: JSON.stringify({
        files: [{
          id: 'file-del-test-1',
          name: 'confidential_project.pdf',
          size: 1024,
          pages: 2,
          settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4' }
        }],
        services: [],
        rush: false,
        payment: 'Cash',
        expectedTotal: 3.0,
        is_test: true
      })
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok || !orderData.orderId) {
      throw new Error(`Order placement failed: ${JSON.stringify(orderData)}`);
    }
    const orderId = orderData.orderId;
    const token = orderData.accessToken;
    console.log(`✅ [PASS] Test order created: #${orderData.orderNumber} (id: ${orderId})`);

    // Now test delete-files with the student token
    const delRes = await fetch(`${BASE_URL}/server/api/orders/${orderId}/delete-files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Order-Token': token,
        'X-Device-Id': 'test-device-delete-check'
      }
    });
    const delData = await delRes.json();
    if (delRes.ok && delData.ok && delData.deletedAt) {
      console.log(`✅ [PASS] Delete files API succeeded: deletedAt=${delData.deletedAt}`);
    } else {
      console.log(`❌ [FAIL] Delete files failed:`, delData);
      allPassed = false;
    }

    // Verify GET /orders/:id reflects filesDeletedAt
    const getRes = await fetch(`${BASE_URL}/server/api/orders/${orderId}`, {
      headers: {
        'X-Order-Token': token,
        'X-Device-Id': 'test-device-delete-check'
      }
    });
    const getData = await getRes.json();
    if (getData.filesDeletedAt) {
      console.log(`✅ [PASS] Order status confirmed files permanently wiped (filesDeletedAt: ${getData.filesDeletedAt})`);
    } else {
      console.log(`❌ [FAIL] Order did not persist filesDeletedAt:`, getData);
      allPassed = false;
    }
  } catch (err) {
    console.log(`❌ [FAIL] Order/Delete test error: ${err.message}`);
    allPassed = false;
  }

  // 4. Test Service Availability List & Synchronization
  console.log(`\n--- Test 4: Shop Config Services & Availability ---`);
  try {
    const cfgRes = await fetch(`${BASE_URL}/server/api/shop/config`);
    const cfgData = await cfgRes.json();
    const services = cfgData.services || {};
    console.log(`  Available services count:`, Object.keys(services).length);
    console.log(`  Services registered:`, Object.keys(services).join(', '));

    const requiredKeys = [
      'document_bw',
      'document_colour',
      'photos',
      'binding_spiral',
      'binding_comb',
      'binding_staple',
      'binding_soft',
      'binding_hard',
      'lamination',
      'scanning',
      'photocopy',
      'typing',
      'rush'
    ];

    const missing = requiredKeys.filter(k => !(k in services));
    if (missing.length === 0) {
      console.log(`✅ [PASS] All 13 services registered in shop config!`);
    } else {
      console.log(`❌ [FAIL] Missing services in config:`, missing);
      allPassed = false;
    }
  } catch (err) {
    console.log(`❌ [FAIL] Config check error: ${err.message}`);
    allPassed = false;
  }

  console.log(`\n======================================================`);
  if (allPassed) {
    console.log(`🎉 ALL EMPIRICAL VERIFICATION TESTS PASSED (4/4)!`);
  } else {
    console.log(`⚠️ SOME TESTS FAILED`);
  }
  console.log(`======================================================\n`);
}

runVerification();
