#!/usr/bin/env node
/**
 * PrintBK Automated Data Retention & File Purge Audit Suite
 *
 * Verifies the 5-minute / automated retention cycle:
 * 1. Uploads a real test PDF to File Store (POST /upload).
 * 2. Creates a TEST order referencing the uploaded cloud file (POST /orders).
 * 3. Advances the order to "ready" using the staff token, triggering delete_after scheduling.
 * 4. Waits past delete_after plus one cron interval.
 * 5. Executes scheduled cleanup (POST /cron/cleanup with CRON_SECRET).
 * 6. Empirically verifies the file is gone from File Store (GET /files/:cloudId -> 404).
 * 7. Empirically verifies the order record reflects files_deleted_at in Data Store.
 *
 * Usage:
 *   node scripts/retention-test.mjs [BASE_URL] [STAFF_TOKEN] [CRON_SECRET]
 */

import fs from 'fs';
import path from 'path';
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

const BASE_URL = (process.argv[2] || process.env.BASE_URL || 'https://printbk-60074625517.development.catalystserverless.in/server/api').replace(/\/+$/, '');
const STAFF_TOKEN = process.argv[3] || process.env.STAFF_TOKEN || '';
const CRON_SECRET = process.argv[4] || process.env.CRON_SECRET || '';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║       PrintBK Automated File Store Retention Test Suite        ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log(`Target Base URL: ${BASE_URL}`);
console.log(`Staff Token:     ${STAFF_TOKEN ? 'provided' : 'missing'}`);
console.log(`Cron Secret:     ${CRON_SECRET ? 'provided' : 'missing'}`);
console.log('----------------------------------------------------------------\n');

if (!STAFF_TOKEN) {
  console.error('\x1b[31mError: STAFF_TOKEN is required to execute retention tests.\x1b[0m');
  process.exit(1);
}

if (!CRON_SECRET) {
  console.error('\x1b[31mError: CRON_SECRET is required to execute retention tests.\x1b[0m');
  process.exit(1);
}

let passCount = 0;
let failCount = 0;

function assert(condition, message, detail = '') {
  if (condition) {
    passCount++;
    console.log(`\x1b[32m[ PASS ]\x1b[0m ${message}`);
    if (detail) console.log(`         \x1b[90m${detail}\x1b[0m`);
  } else {
    failCount++;
    console.log(`\x1b[31m[ FAIL ]\x1b[0m ${message}`);
    if (detail) console.log(`         \x1b[31m${detail}\x1b[0m`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  let uploadedCloudId = null;
  let testOrderId = null;
  let orderToken = null;

  try {
    // ─── 1. Upload a Real Test PDF ───────────────────────────────────
    console.log('Step 1: Uploading a real valid PDF document to File Store...');
    const pdfContent = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n185\n%%EOF\n`;
    const formData = new FormData();
    const pdfBlob = new Blob([pdfContent], { type: 'application/pdf' });
    formData.append('file', pdfBlob, 'retention_audit_doc.pdf');

    const uploadRes = await fetch(`${BASE_URL}/upload`, {
      method: 'POST',
      body: formData
    });

    assert(uploadRes.ok, '1. Upload real PDF to File Store succeeds', `Status: ${uploadRes.status}`);
    const uploadData = await uploadRes.json();
    uploadedCloudId = uploadData.cloudId;
    assert(Boolean(uploadedCloudId), '   Cloud ID assigned to uploaded file', `Cloud ID: ${uploadedCloudId}`);

    // Verify staff can download the newly uploaded file
    const initialDownloadRes = await fetch(`${BASE_URL}/files/${uploadedCloudId}`, {
      headers: {
        'X-Staff-Token': STAFF_TOKEN,
        'X-Authorization': `Bearer ${STAFF_TOKEN}`
      }
    });
    assert(initialDownloadRes.ok, '   Staff can download newly uploaded file from File Store', `Status: ${initialDownloadRes.status}`);

    // ─── 2. Create Order with Real File ──────────────────────────────
    console.log('\nStep 2: Placing order with uploaded file reference...');
    const orderRes = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isTestOrder: true,
        payment: 'Cash',
        files: [{
          id: 'f_retention',
          name: 'retention_audit_doc.pdf',
          cloudId: uploadedCloudId,
          pages: 1,
          copies: 1,
          color: 'Black & White',
          sided: 'Single-sided',
          size: 'A4'
        }]
      })
    });

    assert(orderRes.ok, '2. Order placed successfully with real file', `Status: ${orderRes.status}`);
    const orderData = await orderRes.json();
    testOrderId = orderData.orderId;
    orderToken = orderData.accessToken;
    assert(Boolean(testOrderId), '   Order ID created', `Order ID: ${testOrderId}`);

    // ─── 3. Staff Approves Cash Order & Advances to Ready ─────────────
    console.log('\nStep 3: Staff approves cash order and transitions to ready...');
    const approveRes = await fetch(`${BASE_URL}/orders/${testOrderId}/approve-cash`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Staff-Token': STAFF_TOKEN,
        'X-Authorization': `Bearer ${STAFF_TOKEN}`
      }
    });
    assert(approveRes.ok, '3. Staff approves cash order (status -> processing)', `Status: ${approveRes.status}`);

    const printingRes = await fetch(`${BASE_URL}/orders/${testOrderId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Staff-Token': STAFF_TOKEN,
        'X-Authorization': `Bearer ${STAFF_TOKEN}`
      },
      body: JSON.stringify({ status: 'printing' })
    });
    assert(printingRes.ok, '   Staff advances status to printing', `Status: ${printingRes.status}`);

    // Advance to ready with a 5-second test retention window
    const readyRes = await fetch(`${BASE_URL}/orders/${testOrderId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Staff-Token': STAFF_TOKEN,
        'X-Authorization': `Bearer ${STAFF_TOKEN}`
      },
      body: JSON.stringify({
        status: 'ready',
        autoDeleteDelaySeconds: 5
      })
    });
    assert(readyRes.ok, '   Staff advances status to ready with retention window', `Status: ${readyRes.status}`);

    // Verify delete_after is scheduled
    const getOrderRes = await fetch(`${BASE_URL}/orders/${testOrderId}`, {
      headers: {
        'X-Staff-Token': STAFF_TOKEN,
        'X-Authorization': `Bearer ${STAFF_TOKEN}`
      }
    });
    const orderBeforeCleanup = await getOrderRes.json();
    assert(Boolean(orderBeforeCleanup.deleteAfter), '4. delete_after timestamp scheduled on order', `Scheduled for: ${orderBeforeCleanup.deleteAfter} (now + 5s)`);

    // ─── 4. Wait Past delete_after Plus Interval ─────────────────────
    console.log('\nStep 4: Waiting past delete_after plus one interval (waiting 7s)...');
    await sleep(7000);

    // ─── 5. Trigger Cleanup with CRON_SECRET ──────────────────────────
    console.log('Step 5: Invoking POST /cron/cleanup with CRON_SECRET...');
    const cronRes = await fetch(`${BASE_URL}/cron/cleanup`, {
      method: 'POST',
      headers: {
        'X-Cron-Secret': CRON_SECRET
      }
    });
    assert(cronRes.ok, '5. POST /cron/cleanup executed successfully with valid CRON_SECRET', `Status: ${cronRes.status}`);
    const cronData = await cronRes.json();
    console.log(`   Purged Orders: ${cronData.purgedOrdersCount}, Purged Files: ${cronData.purgedFilesCount}`);

    // ─── 6. Verify File is Permanently Gone from File Store ───────────
    console.log('\nStep 6: Verifying file is permanently purged from File Store...');
    const fileCheckRes = await fetch(`${BASE_URL}/files/${uploadedCloudId}`, {
      headers: {
        'X-Staff-Token': STAFF_TOKEN,
        'X-Authorization': `Bearer ${STAFF_TOKEN}`
      }
    });
    assert(fileCheckRes.status === 404, '6. File is gone from File Store (GET /files/:cloudId returns 404 Not Found)', `Status: ${fileCheckRes.status}`);

    // ─── 7. Verify Order Data Store shows files_deleted_at ────────────
    console.log('\nStep 7: Verifying order data in Data Store shows filesDeletedAt...');
    const finalOrderRes = await fetch(`${BASE_URL}/orders/${testOrderId}`, {
      headers: {
        'X-Staff-Token': STAFF_TOKEN,
        'X-Authorization': `Bearer ${STAFF_TOKEN}`
      }
    });
    const finalOrder = await finalOrderRes.json();
    assert(Boolean(finalOrder.filesDeletedAt), '7. Order in Data Store reflects filesDeletedAt timestamp', `filesDeletedAt: ${finalOrder.filesDeletedAt}`);

  } catch (err) {
    assert(false, `Unexpected retention test error: ${err.message}`);
  } finally {
    // Best-effort cleanup of order record
    if (testOrderId) {
      try {
        await fetch(`${BASE_URL}/orders/${testOrderId}`, {
          method: 'DELETE',
          headers: {
            'X-Staff-Token': STAFF_TOKEN,
            'X-Authorization': `Bearer ${STAFF_TOKEN}`
          }
        });
      } catch (_) {}
    }
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`Retention Test Summary: ${passCount} PASSED, ${failCount} FAILED out of ${passCount + failCount} assertions`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

run();
