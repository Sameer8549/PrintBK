#!/usr/bin/env node
/**
 * scripts/test-upload-sizes.mjs
 *
 * Verifies upload handling for large PDF files (20 MB and 25 MB) on Zoho Catalyst dev.
 * Tests:
 * 1. 20 MB valid PDF upload (should succeed and return cloudId, or reveal function limit)
 * 2. 25 MB valid PDF upload (boundary test)
 * 3. 26 MB PDF upload (should be rejected with HTTP 413 LIMIT_FILE_SIZE)
 *
 * Usage:
 *   node scripts/test-upload-sizes.mjs [BASE_URL] [STAFF_TOKEN]
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
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

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║       PrintBK 20 MB & 25 MB Large PDF Upload Verification       ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log(`Target Base URL: ${BASE_URL}`);
console.log(`Staff Token:     ${STAFF_TOKEN ? 'provided' : 'missing'}`);
console.log('----------------------------------------------------------------\n');

function createTempPdf(sizeBytes, filename) {
  const filePath = path.join(os.tmpdir(), filename);
  const header = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length ' + (sizeBytes - 400) + ' >>\nstream\n');
  const footer = Buffer.from('\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000018 00000 n \n0000000077 00000 n \n0000000134 00000 n \n0000000223 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n350\n%%EOF\n');
  
  const paddingLength = Math.max(0, sizeBytes - header.length - footer.length);
  const padding = Buffer.alloc(paddingLength, 65); // 'A's

  const total = Buffer.concat([header, padding, footer]);
  fs.writeFileSync(filePath, total);
  return { filePath, size: total.length };
}

async function uploadPdf(filePath, filename) {
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });
  const form = new FormData();
  form.append('file', blob, filename);

  const start = Date.now();
  const res = await fetch(`${BASE_URL}/upload`, {
    method: 'POST',
    body: form
  });
  const durationMs = Date.now() - start;

  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = await res.text();
  }

  return { status: res.status, ok: res.ok, durationMs, body };
}

async function run() {
  const uploadedCloudIds = [];

  try {
    // ─── Test 1: 20 MB PDF ───────────────────────────────────────────
    console.log('Testing 20 MB PDF upload...');
    const size20Mb = 20 * 1024 * 1024;
    const file20 = createTempPdf(size20Mb, 'test-20mb-audit.pdf');
    console.log(`Created temporary test file: ${file20.filePath} (${(file20.size / (1024 * 1024)).toFixed(2)} MB)`);

    const result20 = await uploadPdf(file20.filePath, 'test-20mb-audit.pdf');
    try { fs.unlinkSync(file20.filePath); } catch (_) {}

    console.log(`20 MB Upload Result: HTTP ${result20.status} in ${result20.durationMs}ms`);
    console.log(`Response:`, JSON.stringify(result20.body));

    if (result20.ok && result20.body?.cloudId) {
      console.log(`\x1b[32m[ PASS ] 20 MB PDF uploaded successfully to Catalyst File Store!\x1b[0m`);
      uploadedCloudIds.push(result20.body.cloudId);
    } else {
      console.log(`\x1b[33m[ INFO ] 20 MB PDF returned status ${result20.status}\x1b[0m`);
    }

    console.log('----------------------------------------------------------------\n');

    // ─── Test 2: 25 MB PDF (Platform boundary) ──────────────────────
    console.log('Testing 25 MB PDF upload...');
    const size25Mb = 25 * 1024 * 1024;
    const file25 = createTempPdf(size25Mb, 'test-25mb-audit.pdf');
    console.log(`Created temporary test file: ${file25.filePath} (${(file25.size / (1024 * 1024)).toFixed(2)} MB)`);

    const result25 = await uploadPdf(file25.filePath, 'test-25mb-audit.pdf');
    try { fs.unlinkSync(file25.filePath); } catch (_) {}

    console.log(`25 MB Upload Result: HTTP ${result25.status} in ${result25.durationMs}ms`);
    console.log(`Response:`, JSON.stringify(result25.body));

    if (result25.ok && result25.body?.cloudId) {
      console.log(`\x1b[32m[ PASS ] 25 MB PDF uploaded successfully to Catalyst File Store!\x1b[0m`);
      uploadedCloudIds.push(result25.body.cloudId);
    } else {
      console.log(`\x1b[33m[ INFO ] 25 MB PDF returned status ${result25.status}\x1b[0m`);
    }

    console.log('----------------------------------------------------------------\n');

    // ─── Test 3: 26 MB PDF (Ceiling enforcement) ─────────────────────
    console.log('Testing 26 MB PDF upload (exceeds 25 MB limit)...');
    const size26Mb = 26 * 1024 * 1024;
    const file26 = createTempPdf(size26Mb, 'test-26mb-audit.pdf');

    const result26 = await uploadPdf(file26.filePath, 'test-26mb-audit.pdf');
    try { fs.unlinkSync(file26.filePath); } catch (_) {}

    console.log(`26 MB Upload Result: HTTP ${result26.status} in ${result26.durationMs}ms`);
    console.log(`Response:`, JSON.stringify(result26.body));

    if (result26.status === 413) {
      console.log(`\x1b[32m[ PASS ] 26 MB PDF correctly rejected with HTTP 413 (Payload Too Large)\x1b[0m`);
    } else {
      console.log(`\x1b[33m[ INFO ] 26 MB PDF returned HTTP ${result26.status}\x1b[0m`);
    }

  } catch (err) {
    console.error(`\x1b[31mError during upload tests: ${err.message}\x1b[0m`);
  }

  return { uploadedCloudIds };
}

run();
