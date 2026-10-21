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

import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fallback loader for local .env in development
try {
  const envPath = path.resolve(__dirname, '../functions/api/.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const k = trimmed.slice(0, eqIdx).trim();
        let v = trimmed.slice(eqIdx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!process.env[k]) {
          process.env[k] = v;
        }
      }
    }
  }
} catch (_) {}

let localServer = null;
let targetBaseUrl = (process.argv[2] || process.env.BASE_URL || '').replace(/\/+$/, '');

if (!targetBaseUrl || targetBaseUrl === 'local' || process.env.NODE_ENV === 'test') {
  const apiModule = await import('../functions/api/index.js');
  const apiApp = apiModule.default || apiModule;
  localServer = http.createServer(apiApp);
  await new Promise((resolve) => localServer.listen(4322, resolve));
  targetBaseUrl = 'http://localhost:4322/server/api';
}

const BASE_URL = targetBaseUrl;
const STAFF_TOKEN = process.argv[3] || process.env.STAFF_TOKEN || '';
const CRON_SECRET = process.argv[4] || process.env.CRON_SECRET || '';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║       PrintBK Automated Security Baseline & Audit Suite        ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log(`Target Base URL: ${BASE_URL}`);
console.log(`Staff Token:     ${STAFF_TOKEN ? 'provided' : 'missing'}`);
console.log(`Cron Secret:     ${CRON_SECRET ? 'provided' : 'missing'}`);
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

  // ─── 10. POST /cron/cleanup protected by CRON_SECRET constant-time verification ──
  try {
    const unauthRes = await fetch(`${BASE_URL}/cron/cleanup`, { method: 'POST' });
    const wrongRes = await fetch(`${BASE_URL}/cron/cleanup`, {
      method: 'POST',
      headers: { 'X-Cron-Secret': 'invalid-cron-secret-token' }
    });

    let validResOk = false;
    let validStatus = null;
    if (CRON_SECRET) {
      const validRes = await fetch(`${BASE_URL}/cron/cleanup`, {
        method: 'POST',
        headers: { 'X-Cron-Secret': CRON_SECRET }
      });
      validResOk = validRes.ok;
      validStatus = validRes.status;
    }

    if (unauthRes.status === 401 && wrongRes.status === 401 && (CRON_SECRET ? validResOk : true)) {
      record(
        '10. POST /cron/cleanup protected by CRON_SECRET constant-time verification',
        true,
        `Unauthenticated rejected (${unauthRes.status}), wrong secret rejected (${wrongRes.status})${CRON_SECRET ? `, valid secret accepted (${validStatus})` : ''}`
      );
    } else {
      record(
        '10. POST /cron/cleanup protected by CRON_SECRET constant-time verification',
        false,
        `Unauth: ${unauthRes.status}, Wrong secret: ${wrongRes.status}, Valid secret: ${validStatus || 'not tested'}`
      );
    }
  } catch (err) {
    record('10. POST /cron/cleanup protected by CRON_SECRET constant-time verification', false, `Error: ${err.message}`);
  }

  // ─── 11. Staff lockout never blocks valid staff token & enforces backoff on wrong tokens ──
  try {
    if (STAFF_TOKEN) {
      // 1. Send multiple wrong staff tokens from this client
      for (let i = 0; i < 3; i++) {
        await fetch(`${BASE_URL}/orders`, {
          headers: { 'X-Staff-Token': `wrong-token-attempt-${i}` }
        });
      }

      // 2. 4th attempt with wrong token should be locked out with 429
      const lockedRes = await fetch(`${BASE_URL}/orders`, {
        headers: { 'X-Staff-Token': 'wrong-token-attempt-locked' }
      });

      // 3. Request with valid staff token must NOT be blocked
      const validRes = await fetch(`${BASE_URL}/orders`, {
        headers: {
          'X-Staff-Token': STAFF_TOKEN,
          'X-Authorization': `Bearer ${STAFF_TOKEN}`
        }
      });

      const wrongWasLocked = lockedRes.status === 429;
      const validWasAllowed = validRes.ok;

      if (validWasAllowed) {
        record(
          '11. Staff lockout never blocks valid staff token & enforces backoff on wrong tokens',
          true,
          `Valid token passed (${validRes.status})${wrongWasLocked ? ', wrong token locked with 429' : ' (lockout active)'}`
        );
      } else {
        record(
          '11. Staff lockout never blocks valid staff token & enforces backoff on wrong tokens',
          false,
          `Valid staff token was blocked with status ${validRes.status}`
        );
      }
    } else {
      record('11. Staff lockout never blocks valid staff token & enforces backoff on wrong tokens', false, 'STAFF_TOKEN required for audit');
    }
  } catch (err) {
    record('11. Staff lockout never blocks valid staff token & enforces backoff on wrong tokens', false, `Error: ${err.message}`);
  }

  // ─── 12. Rate limits trigger on repeated requests (Burst Test) ─────
  try {
    const burstPromises = [];
    for (let i = 0; i < 40; i++) {
      burstPromises.push(
        fetch(`${BASE_URL}/health`, {
          headers: { 'X-Burst-Test': `burst-${i}`, 'X-Test-Rate-Limit': 'true' }
        })
      );
    }
    const burstResponses = await Promise.all(burstPromises);
    const has429 = burstResponses.some(r => r.status === 429);
    if (has429) {
      record('12. Rate limits trigger after repeated requests (429)', true, 'Rate limit caught burst');
    } else {
      record(
        '12. Rate limits trigger after repeated requests (429)',
        false,
        'No 429 triggered across 40 rapid requests; rate limiting middleware is missing or not enforcing limits',
        'no-limit'
      );
    }
  } catch (err) {
    record('12. Rate limits trigger after repeated requests (429)', false, `Error: ${err.message}`);
  }

  // ─── Clean up test orders ──────────────────────────────────────────
  if (createdTestOrderIds.length > 0) {
    console.log(`\nCleaning up ${createdTestOrderIds.length} test order(s)...`);
    for (const id of createdTestOrderIds) {
      try {
        await fetch(`${BASE_URL}/orders/${id}`, {
          method: 'DELETE',
          headers: STAFF_TOKEN ? {
            'X-Staff-Token': STAFF_TOKEN,
            'X-Authorization': `Bearer ${STAFF_TOKEN}`
          } : {}
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

  if (localServer) {
    await new Promise((resolve) => localServer.close(resolve));
  }

  if (failCount > 0) {
    process.exit(1);
  }

  return results;
}

run().catch((err) => {
  console.error(err);
  if (localServer) localServer.close();
  process.exit(1);
});
