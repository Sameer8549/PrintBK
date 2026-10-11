#!/usr/bin/env node
/**
 * scripts/security-check.mjs
 * 
 * Standalone security verification suite for PrintBK.
 * Zero external dependencies (uses native Node 18+ fetch, FormData, Blob).
 * 
 * Usage:
 *   node scripts/security-check.mjs [BASE_URL] [STAFF_TOKEN]
 * 
 * Example:
 *   node scripts/security-check.mjs https://printbk-60074625517.development.catalystserverless.in/server/api
 */

const BASE_URL = (process.argv[2] || process.env.BASE_URL || 'https://printbk-60074625517.development.catalystserverless.in/server/api').replace(/\/+$/, '');
const STAFF_TOKEN = process.argv[3] || process.env.STAFF_TOKEN || '';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║       PrintBK Automated Security Baseline & Audit Suite        ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log(`Target Base URL: ${BASE_URL}`);
console.log(`Staff Token:     ${STAFF_TOKEN ? '[PROVIDED (' + STAFF_TOKEN.slice(0, 4) + '...)]' : '[NONE]'}`);
console.log('----------------------------------------------------------------\n');

const results = [];
let createdTestOrderIds = [];

function record(name, pass, detail, currentStatus = null) {
  const statusStr = pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`[ ${statusStr} ] ${name}`);
  if (detail) console.log(`         Detail: ${detail}`);
  results.push({ name, pass, detail, currentStatus });
}

async function run() {
  // ─── 1. Unauthenticated GET /orders ────────────────────────────────
  try {
    const res = await fetch(`${BASE_URL}/orders`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (res.status === 401 || res.status === 403) {
      record('1. Unauthenticated GET /orders is rejected (401/403)', true, `Returned ${res.status}`);
    } else {
      const data = await res.json().catch(() => null);
      const count = Array.isArray(data) ? data.length : 'unknown';
      record(
        '1. Unauthenticated GET /orders is rejected (401/403)',
        false,
        `Returned ${res.status} OK (Exposed ${count} orders to public internet!)`,
        res.status
      );
    }
  } catch (err) {
    record('1. Unauthenticated GET /orders is rejected (401/403)', false, `Network error: ${err.message}`);
  }

  // Helper: Create a temporary test order
  let testOrderId = null;
  let testOrderToken = null;
  try {
    const createRes = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isTestOrder: true,
        files: [{
          id: 'test-file-1',
          name: 'SECURITY_TEST_DOC.pdf',
          pages: 1,
          settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4' }
        }],
        services: [],
        rush: false,
        pickupCode: '1337' // Attempt to inject client pickupCode
      })
    });
    if (createRes.ok) {
      const createData = await createRes.json();
      testOrderId = createData.orderId;
      testOrderToken = createData.accessToken || createData.orderToken || null;
      if (testOrderId) createdTestOrderIds.push(testOrderId);
    }
  } catch (e) {
    console.warn('Could not create initial test order:', e.message);
  }

  // ─── 2. Unauthenticated POST /orders/:id/status ────────────────────
  try {
    const targetId = testOrderId || '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${BASE_URL}/orders/${targetId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ready' })
    });
    if (res.status === 401 || res.status === 403) {
      record('2. Unauthenticated POST /orders/:id/status is rejected (401/403)', true, `Returned ${res.status}`);
    } else {
      record(
        '2. Unauthenticated POST /orders/:id/status is rejected (401/403)',
        false,
        `Returned ${res.status} (Unauthenticated status manipulation allowed!)`,
        res.status
      );
    }
  } catch (err) {
    record('2. Unauthenticated POST /orders/:id/status is rejected (401/403)', false, `Error: ${err.message}`);
  }

  // ─── 3. Student POST /orders/:id/pay cannot move order to processing
  try {
    if (testOrderId) {
      const res = await fetch(`${BASE_URL}/orders/${testOrderId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.status === 404 || res.status === 405 || res.status === 410) {
        record('3. POST /orders/:id/pay by student cannot move order to processing', true, `Endpoint returned ${res.status}`);
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.status === 'processing' || res.status === 200) {
          record(
            '3. POST /orders/:id/pay by student cannot move order to processing',
            false,
            `Returned 200 and moved order to "processing" without payment verification!`,
            res.status
          );
        } else {
          record('3. POST /orders/:id/pay by student cannot move order to processing', true, `Returned ${res.status}`);
        }
      }
    } else {
      record('3. POST /orders/:id/pay by student cannot move order to processing', false, 'Test order could not be created');
    }
  } catch (err) {
    record('3. POST /orders/:id/pay by student cannot move order to processing', false, `Error: ${err.message}`);
  }

  // ─── 4. GET /orders/:id without order access token is rejected ─────
  try {
    if (testOrderId) {
      // 4a. Without token
      const resWithoutToken = await fetch(`${BASE_URL}/orders/${testOrderId}`, {
        method: 'GET'
      });
      // 4b. With wrong token
      const resWithWrongToken = await fetch(`${BASE_URL}/orders/${testOrderId}`, {
        method: 'GET',
        headers: { 'X-Order-Token': 'wrong-attacker-token-12345' }
      });

      const rejectedWithout = (resWithoutToken.status === 401 || resWithoutToken.status === 403);
      const rejectedWrong = (resWithWrongToken.status === 401 || resWithWrongToken.status === 403);

      if (rejectedWithout && rejectedWrong) {
        record('4. GET /orders/:id requires order access token and rejects others', true, 'Protected with X-Order-Token');
      } else {
        record(
          '4. GET /orders/:id requires order access token and rejects others',
          false,
          `Exposed order data without token (HTTP ${resWithoutToken.status}) or with wrong token (HTTP ${resWithWrongToken.status})`,
          resWithoutToken.status
        );
      }
    } else {
      record('4. GET /orders/:id requires order access token and rejects others', false, 'Test order missing');
    }
  } catch (err) {
    record('4. GET /orders/:id requires order access token and rejects others', false, `Error: ${err.message}`);
  }

  // ─── 5. Client cannot choose its own pickupCode ────────────────────
  try {
    const injectedCode = '7777';
    const res = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isTestOrder: true,
        files: [{ id: 'f1', name: 'PICKUP_TEST.pdf', pages: 1 }],
        pickupCode: injectedCode
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.orderId) createdTestOrderIds.push(data.orderId);
      if (data.pickupCode === injectedCode) {
        record(
          '5. Client cannot choose its own pickupCode',
          false,
          `Server accepted client-specified pickupCode "${injectedCode}"! Must be server-generated.`,
          'accepted'
        );
      } else {
        record('5. Client cannot choose its own pickupCode', true, `Server generated its own code: "${data.pickupCode}"`);
      }
    } else {
      record('5. Client cannot choose its own pickupCode', false, `Order creation failed with ${res.status}`);
    }
  } catch (err) {
    record('5. Client cannot choose its own pickupCode', false, `Error: ${err.message}`);
  }

  // ─── 6. Online payment creation returns clear "not enabled" while Razorpay keys absent
  try {
    const targetId = testOrderId || '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${BASE_URL}/orders/${targetId}/razorpay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    // While disabled, should return a clear not enabled response (400, 403, 503, or 422 with message)
    if (res.status === 400 || res.status === 403 || res.status === 503 || res.status === 422) {
      const body = await res.json().catch(() => ({}));
      if (String(body.error || '').toLowerCase().includes('not enabled') || String(body.error || '').toLowerCase().includes('disabled')) {
        record('6. Online-payment returns clear "not enabled" response when keys absent', true, body.error);
      } else {
        record('6. Online-payment returns clear "not enabled" response when keys absent', false, `Status ${res.status} but message was: ${body.error || 'none'}`);
      }
    } else if (res.status === 404) {
      record('6. Online-payment returns clear "not enabled" response when keys absent', false, 'Endpoint does not exist yet (404)');
    } else {
      record('6. Online-payment returns clear "not enabled" response when keys absent', false, `Unexpected status ${res.status}`);
    }
  } catch (err) {
    record('6. Online-payment returns clear "not enabled" response when keys absent', false, `Error: ${err.message}`);
  }

  // ─── 7. Uploads with disallowed type, mismatched ext, or oversize rejected
  try {
    // 7a. Test disallowed executable file
    const formDataExe = new FormData();
    const fakeExe = new Blob(['MZ\x90\x00\x03\x00\x00\x00'], { type: 'application/x-msdownload' });
    formDataExe.append('file', fakeExe, 'trojan.exe');

    const resExe = await fetch(`${BASE_URL}/upload`, {
      method: 'POST',
      body: formDataExe
    });

    // 7b. Test extension mismatch: named .pdf but containing executable content
    const formDataSpoof = new FormData();
    const spoofPdf = new Blob(['MZ\x90\x00\x03\x00\x00\x00 malicious payload'], { type: 'application/pdf' });
    formDataSpoof.append('file', spoofPdf, 'spoofed.pdf');

    const resSpoof = await fetch(`${BASE_URL}/upload`, {
      method: 'POST',
      body: formDataSpoof
    });

    const exeRejected = resExe.status >= 400;
    const spoofRejected = resSpoof.status >= 400;

    if (exeRejected && spoofRejected) {
      record('7. Upload validation rejects disallowed types and mismatched content', true, 'Both rejected');
    } else {
      record(
        '7. Upload validation rejects disallowed types and mismatched content',
        false,
        `Exe rejected: ${exeRejected} (status ${resExe.status}); Spoof rejected: ${spoofRejected} (status ${resSpoof.status} - accepts fake PDF by claimed MIME without checking magic bytes!)`,
        resSpoof.status
      );
    }
  } catch (err) {
    record('7. Upload validation rejects disallowed types and mismatched content', false, `Error: ${err.message}`);
  }

  // ─── 8. Unauthenticated file download by cloudId is rejected ───────
  try {
    const res = await fetch(`${BASE_URL}/files/test-cloud-id-999`, {
      method: 'GET'
    });
    if (res.status === 401 || res.status === 403) {
      record('8. Unauthenticated file download by cloudId is rejected (401/403)', true, `Returned ${res.status}`);
    } else {
      record(
        '8. Unauthenticated file download by cloudId is rejected (401/403)',
        false,
        `Returned ${res.status} (Missing authentication gate on file access)`,
        res.status
      );
    }
  } catch (err) {
    record('8. Unauthenticated file download by cloudId is rejected (401/403)', false, `Error: ${err.message}`);
  }

  // ─── 9. CORS rejects unknown Origin ────────────────────────────────
  try {
    const res = await fetch(`${BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Origin': 'https://evil-unauthorized-attacker.com'
      }
    });
    const allowOrigin = res.headers.get('access-control-allow-origin');
    if (!allowOrigin || allowOrigin === 'null' || allowOrigin !== 'https://evil-unauthorized-attacker.com') {
      record('9. CORS rejects unknown Origin', true, `Header: ${allowOrigin || '[absent]'}`);
    } else {
      record(
        '9. CORS rejects unknown Origin',
        false,
        `Allowed unauthorized origin in Access-Control-Allow-Origin: ${allowOrigin}`,
        allowOrigin
      );
    }
  } catch (err) {
    record('9. CORS rejects unknown Origin', false, `Error: ${err.message}`);
  }

  // ─── 10. Rate limits trigger on repeated requests ──────────────────
  try {
    const burstPromises = [];
    for (let i = 0; i < 40; i++) {
      burstPromises.push(
        fetch(`${BASE_URL}/health`, {
          headers: { 'X-Burst-Test': `burst-${i}` }
        })
      );
    }
    const burstResponses = await Promise.all(burstPromises);
    const has429 = burstResponses.some(r => r.status === 429);
    if (has429) {
      record('10. Rate limits trigger after repeated requests (429)', true, 'Rate limit caught burst');
    } else {
      record(
        '10. Rate limits trigger after repeated requests (429)',
        false,
        'No 429 triggered across 40 rapid requests; rate limiting middleware is missing or not enforcing limits',
        'no-limit'
      );
    }
  } catch (err) {
    record('10. Rate limits trigger after repeated requests (429)', false, `Error: ${err.message}`);
  }

  // ─── Clean up test orders ──────────────────────────────────────────
  if (createdTestOrderIds.length > 0) {
    console.log(`\nCleaning up ${createdTestOrderIds.length} test order(s)...`);
    for (const id of createdTestOrderIds) {
      try {
        await fetch(`${BASE_URL}/orders/${id}`, {
          method: 'DELETE',
          headers: STAFF_TOKEN ? { 'Authorization': `Bearer ${STAFF_TOKEN}` } : {}
        });
      } catch (e) {
        // cleanup best effort
      }
    }
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  const passCount = results.filter(r => r.pass).length;
  const failCount = results.filter(r => !r.pass).length;
  console.log(`Summary: ${passCount} PASSED, ${failCount} FAILED out of ${results.length} checks`);
  console.log('════════════════════════════════════════════════════════════════\n');

  return results;
}

run().catch(console.error);
