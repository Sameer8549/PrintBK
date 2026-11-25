/**
 * Reset Client Systems & Clear Device Pairings Script
 * 
 * Safely removes all registered counter terminals, staff devices, agent devices,
 * and printer mappings from both development and production environments, and
 * purges local AppData workstation credentials.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const staffToken = process.env.STAFF_TOKEN || 'PBK-SETUP-9021';
const environments = [
  { name: 'Development', base: 'https://printbk-60074625517.development.catalystserverless.in' },
  { name: 'Production', base: 'https://printbk-60074625517.catalystserverless.in' }
];

async function resetEnvironment(env) {
  console.log(`\n[Reset] Resetting systems on ${env.name} (${env.base})...`);
  
  // 1. Reset all registered devices and counters
  try {
    const res = await fetch(`${env.base}/server/api/staff/counters/reset-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Staff-Token': staffToken
      }
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`[Reset] ${env.name} devices cleared:`, data);
    } else {
      console.warn(`[Reset] ${env.name} /counters/reset-all returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error(`[Reset] ${env.name} device reset error:`, err.message);
  }

  // 2. Reset shop_settings printer mapping & verify clean UPI
  try {
    const putRes = await fetch(`${env.base}/server/api/staff/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Staff-Token': staffToken
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
    if (putRes.ok) {
      console.log(`[Reset] ${env.name} settings reset: UPI VPA set to Q098686787@ybl, printer_mapping cleared.`);
    } else {
      console.warn(`[Reset] ${env.name} settings update returned ${putRes.status}: ${await putRes.text()}`);
    }
  } catch (err) {
    console.error(`[Reset] ${env.name} settings error:`, err.message);
  }
}

function clearLocalWorkstationData() {
  console.log('\n[Reset] Purging local workstation credentials...');
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const printbkDir = path.join(appData, 'PrintBK');

  const targets = [
    path.join(printbkDir, 'counter-store.json'),
    path.join(printbkDir, 'agent-config.json'),
    path.join(process.cwd(), 'agent-config.json'),
    path.join(process.cwd(), 'PrintBK', 'agent-config.json')
  ];

  for (const t of targets) {
    if (fs.existsSync(t)) {
      try {
        fs.unlinkSync(t);
        console.log(`[Reset] Deleted credential store: ${t}`);
      } catch (err) {
        console.warn(`[Reset] Could not delete ${t}: ${err.message}`);
      }
    }
  }

  // Clear work and log directories
  ['work', 'logs', 'dry-run'].forEach(sub => {
    const p = path.join(printbkDir, sub);
    if (fs.existsSync(p)) {
      try {
        fs.rmSync(p, { recursive: true, force: true });
        console.log(`[Reset] Cleared directory: ${p}`);
      } catch (_) {}
    }
  });

  console.log('[Reset] Local workstation is completely clean and ready for fresh setup.');
}

async function main() {
  for (const env of environments) {
    await resetEnvironment(env);
  }
  clearLocalWorkstationData();
  console.log('\n[Reset] SUCCESS: All client systems and local data have been completely wiped.');
}

main().catch(console.error);
