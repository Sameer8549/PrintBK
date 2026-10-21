#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const manifestPath = path.join(rootDir, 'config', 'required-env.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`❌ Manifest file missing: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Optionally load .env if running locally and process.env is empty
const localEnvPath = path.join(rootDir, 'functions', 'api', '.env');
if (fs.existsSync(localEnvPath)) {
  const envContent = fs.readFileSync(localEnvPath, 'utf8');
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

if (!process.env.COUNTER_SETUP_CODE && process.env.STAFF_SETUP_CODE) {
  process.env.COUNTER_SETUP_CODE = process.env.STAFF_SETUP_CODE;
}

console.log('📋 [check-env-manifest] Validating environment configuration against manifest...');
let errors = 0;
let missingCritical = [];

for (const item of manifest.critical) {
  const val = process.env[item.name];
  if (!val || !val.trim()) {
    console.error(`❌ Missing critical variable: ${item.name} (${item.description})`);
    missingCritical.push(item.name);
    errors++;
    continue;
  }

  if (item.minLength && val.trim().length < item.minLength) {
    console.error(`❌ Variable ${item.name} is too short (min ${item.minLength} chars, got ${val.trim().length})`);
    errors++;
    continue;
  }

  if (item.pattern && !new RegExp(item.pattern).test(val.trim())) {
    console.error(`❌ Variable ${item.name} failed pattern validation`);
    errors++;
    continue;
  }

  console.log(`✅ [PASS] ${item.name} is configured properly (${item.sensitive ? 'SECRET' : val.trim()})`);
}

for (const item of manifest.optional) {
  const val = process.env[item.name];
  if (val && val.trim()) {
    console.log(`ℹ️ [CONFIGURED] Optional: ${item.name}`);
  } else {
    console.log(`⚪ [DEFAULT / UNSET] Optional: ${item.name} (default: ${item.default || 'none'})`);
  }
}

if (errors > 0) {
  console.error(`\n🚨 Environment manifest check FAILED with ${errors} error(s).`);
  console.error(`Missing critical variables: ${missingCritical.join(', ')}`);
  process.exit(1);
}

console.log('\n🎉 [check-env-manifest] All critical environment variables validated successfully.\n');
process.exit(0);
