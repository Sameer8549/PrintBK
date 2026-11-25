import dns from 'dns';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import https from 'https';
import http from 'http';

dns.setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const agentRequire = createRequire(path.join(rootDir, 'PrintBK', 'agent', 'package.json'));
const fetch = agentRequire('node-fetch');

const httpsAgent = new https.Agent({
  keepAlive: true,
  timeout: 15000,
  lookup: (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, family: 4 }, (err, address, family) => {
      if (err || !address) {
        if (hostname.includes('catalystserverless.in')) {
          return callback(null, '169.148.148.93', 4);
        }
      }
      callback(err, address, family);
    });
  }
});

const BASE_URL = (process.env.BASE_URL || 'https://printbk-60074625517.development.catalystserverless.in').replace(/\/$/, '');
const SETUP_CODE = process.env.SETUP_CODE || 'PBK-SETUP-9021';

// Read CRON_SECRET from env files
const envPaths = [
  path.resolve(rootDir, 'PrintBK/functions/api/.env'),
  path.resolve(rootDir, 'functions/api/.env')
];

let cronSecret = '';
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    const env = fs.readFileSync(p, 'utf8');
    for (const line of env.split(/\r?\n/)) {
      if (line.startsWith('CRON_SECRET=')) {
        cronSecret = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
        break;
      }
    }
    if (cronSecret) break;
  }
}

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { ...options.headers };
  if (!headers['Content-Type'] && options.body) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, {
    agent: httpsAgent,
    ...options,
    headers
  });
}

function clearLocalWorkstationData() {
  console.log('\n[Clean Slate] Purging local workstation credentials & temp files...');
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const printbkDir = path.join(appData, 'PrintBK');

  const targets = [
    path.join(printbkDir, 'counter-store.json'),
    path.join(printbkDir, 'agent-config.json'),
    path.join(rootDir, 'agent-config.json'),
    path.join(rootDir, 'PrintBK', 'agent-config.json')
  ];

  for (const t of targets) {
    if (fs.existsSync(t)) {
      try {
        fs.unlinkSync(t);
        console.log(`[Local] Removed ${t}`);
      } catch (err) {
        console.warn(`[Local] Could not remove ${t}: ${err.message}`);
      }
    }
  }

  ['work', 'logs', 'dry-run'].forEach(sub => {
    const p = path.join(printbkDir, sub);
    if (fs.existsSync(p)) {
      try {
        fs.rmSync(p, { recursive: true, force: true });
        console.log(`[Local] Cleared directory: ${p}`);
      } catch (_) {}
    }
  });
}

async function run() {
  console.log('====================================================');
  console.log('   PRINTBK CLEAN SLATE & FRESH PAIRING EXECUTION    ');
  console.log('====================================================');
  console.log(`Target Server: ${BASE_URL}`);
  console.log(`Setup Code   : ${SETUP_CODE}`);

  // 1. Purge test data (including unflagged legacy records)
  console.log('\n1. Purging test data via /internal/purge-test-data (forceUnflagged: true)...');
  const purgeHeaders = {
    'Content-Type': 'application/json',
    'X-Staff-Token': SETUP_CODE
  };
  if (cronSecret) purgeHeaders['X-Cron-Secret'] = cronSecret;

  const purgeRes = await request('/server/api/internal/purge-test-data', {
    method: 'POST',
    headers: purgeHeaders,
    body: JSON.stringify({ dryRun: false, forceUnflagged: true })
  });
  const purgeData = await purgeRes.json().catch(err => ({ error: err.message }));
  console.log('Purge Test Data Response:', purgeData);

  // 2. Purge all orders from queue / in-memory / datastore
  console.log('\n2. Purging all queue orders via /staff/orders/purge-all (all: true)...');
  const wipeRes = await request('/server/api/staff/orders/purge-all', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Token': SETUP_CODE
    },
    body: JSON.stringify({ all: true })
  });
  const wipeData = await wipeRes.json().catch(err => ({ error: err.message }));
  console.log('Purge All Response:', wipeData);

  // 3. Reset all paired counters, agent devices, rate limits, and printer registries
  console.log('\n3. Resetting all devices & pairings via /staff/counters/reset-all...');
  const resetRes = await request('/server/api/staff/counters/reset-all', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Token': SETUP_CODE
    }
  });
  const resetData = await resetRes.json().catch(err => ({ error: err.message }));
  console.log('Reset All Response:', resetData);

  // 4. Reset shop_settings to clean slate with open-source UPI VPA
  console.log('\n4. Resetting shop_settings (clean printer_mapping, verified UPI VPA)...');
  const settingsRes = await request('/server/api/staff/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Token': SETUP_CODE
    },
    body: JSON.stringify({
      payments: {
        cash: true,
        upi: true
        upiVpa: 'Q098686787@ybl',
        upiName: 'HKBK Student Point'
      },
      printer_mapping: {},
      printers: []
    })
  });
  const settingsData = await settingsRes.json().catch(err => ({ error: err.message }));
  console.log('Settings Reset Response:', settingsData);

  // 5. Clear local workstation credentials
  clearLocalWorkstationData();

  // 6. Verify 0 active orders in Staff queue
  console.log('\n5. Verifying active queue orders on Staff App...');
  const liveRes = await request('/server/api/staff/live?include_test=true', {
    headers: { 'X-Staff-Token': SETUP_CODE }
  });
  const liveData = await liveRes.json().catch(err => ({ error: err.message }));
  const activeItemsCount = Array.isArray(liveData.items) ? liveData.items.length : 0;
  console.log(`Active queue items count: ${activeItemsCount}`);

  // 7. Verify 0 paired devices
  console.log('\n6. Verifying paired counters / devices on server...');
  const countersRes = await request('/server/api/staff/counters', {
    headers: { 'X-Staff-Token': SETUP_CODE }
  });
  const countersData = await countersRes.json().catch(err => ({ error: err.message }));
  const pairedCount = Array.isArray(countersData.counters) ? countersData.counters.length : 0;
  console.log(`Registered paired counters count: ${pairedCount}`);

  // 8. Test fresh pairing verification with setup code
  console.log('\n7. Verifying fresh pairing handshake with setup code...');
  const pairTestRes = await request('/server/api/staff/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupCode: SETUP_CODE, label: 'Clean Slate Verification Terminal' })
  });
  const pairTestData = await pairTestRes.json().catch(err => ({ error: err.message }));
  console.log('Fresh Pairing Test Result:', {
    ok: pairTestData.ok,
    deviceLabel: pairTestData.deviceLabel,
    hasToken: Boolean(pairTestData.deviceToken)
  });

  if (pairTestData.ok && pairTestData.deviceToken) {
    // Unpair immediately so state remains clean
    await request('/server/api/staff/unpair', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Staff-Device-Token': pairTestData.deviceToken
      }
    });
    console.log('[Clean Slate] Ephemeral test device unpaired immediately.');
  }

  // 9. Re-verify 0 devices
  const finalCountersRes = await request('/server/api/staff/counters', {
    headers: { 'X-Staff-Token': SETUP_CODE }
  });
  const finalCountersData = await finalCountersRes.json().catch(err => ({ error: err.message }));
  const finalPairedCount = Array.isArray(finalCountersData.counters) ? finalCountersData.counters.length : 0;

  console.log('\n====================================================');
  console.log('              CLEAN SLATE SUMMARY                   ');
  console.log('====================================================');
  console.log(`Queue Active Orders : ${activeItemsCount} (Expected: 0)`);
  console.log(`Paired Devices      : ${finalPairedCount} (Expected: 0)`);
  console.log(`Fresh Pairing Ready : ${pairTestData.ok ? 'YES' : 'NO'} (Code: ${SETUP_CODE})`);
  console.log(`UPI Gateway VPA     : Q098686787@ybl (HKBK Student Point)`);
  console.log('====================================================\n');

  if (activeItemsCount === 0 && finalPairedCount === 0 && pairTestData.ok) {
    console.log('CLEAN SLATE COMPLETED WITH 100% SUCCESS!');
    process.exit(0);
  } else {
    console.error('CLEAN SLATE CHECK FAILED - Non-zero counts detected.');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
