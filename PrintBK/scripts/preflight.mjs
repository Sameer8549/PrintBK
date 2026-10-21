#!/usr/bin/env node
/**
 * PrintBK Comprehensive Pre-Flight Verification Runner
 *
 * Runs all validation suites across packages, frontends, backends,
 * security gates, pricing vectors, layout viewports, and E2E flows.
 * Terminates immediately with non-zero exit code on the first failure.
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const steps = [
  { name: 'Environment Manifest Check', cmd: 'node scripts/check-env-manifest.mjs' },
  { name: 'Binary Integrity Check', cmd: 'node scripts/verify-binary-integrity.mjs' },
  { name: 'No-Mock-Data & Hygiene Gate', cmd: 'node scripts/no-mock-data.mjs' },
  { name: 'Typecheck @printbk/shared', cmd: 'pnpm --filter @printbk/shared build' },
  { name: 'Shared Pricing Vectors Check', cmd: 'node scripts/generate-pricing-vectors.mjs --verify' },
  { name: 'Security Check (Auth, Capabilities, Invariants)', cmd: 'node scripts/security-check.mjs' },
  { name: 'Counter PC Pairing & Dual Revocation Suite', cmd: 'node scripts/test-counter-pairing.mjs' },
  { name: 'Staff Download Page & Hashes Verification', cmd: 'node scripts/verify-download-page.mjs' },
  { name: 'UPI Return Auto-Redirect & Overlap Suite', cmd: 'node scripts/verify-overlap-and-payment.mjs' },
  { name: 'Settings Adaptive Experience Suite', cmd: 'node scripts/verify-settings-experience.mjs' },
  { name: 'Ultra-HD & Full Preview Fidelity Suite', cmd: 'node scripts/verify-ultrahd-and-preview.mjs' },
  { name: 'QR Code Generation & Parity Checks', cmd: 'node scripts/verify-qr-download.mjs' }
];

console.log('🚀 [preflight] Starting Comprehensive PrintBK Pre-Flight Verification...\n');
console.log(`Total verification suites to execute: ${steps.length}\n`);

const startTime = Date.now();

for (let i = 0; i < steps.length; i++) {
  const step = steps[i];
  console.log(`======================================================================`);
  console.log(`[${i + 1}/${steps.length}] Running: ${step.name}`);
  console.log(`Command: ${step.cmd}`);
  console.log(`======================================================================\n`);

  try {
    execSync(step.cmd, {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        TEST_MODE: 'true',
        NODE_ENV: 'test'
      }
    });
    console.log(`\n✅ [PASS] Step ${i + 1}/${steps.length} passed: ${step.name}\n`);
  } catch (err) {
    console.error(`\n🚨 [FAIL] Pre-flight failed at step ${i + 1}/${steps.length}: ${step.name}`);
    console.error(`Command: ${step.cmd}`);
    process.exit(1);
  }
}

const totalDurationSec = ((Date.now() - startTime) / 1000).toFixed(1);
console.log('🎉 ======================================================================');
console.log(`🎉 ALL PRE-FLIGHT VERIFICATION GATES PASSED CLEANLY (${totalDurationSec}s)!`);
console.log('🎉 System is verified and ready for production deployment.');
console.log('======================================================================\n');
process.exit(0);
