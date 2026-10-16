/**
 * Backfill Payment Status Script for PrintBK
 * 
 * Computes canonical server-calculated payment_status for all existing orders
 * and updates database records.
 * 
 * Usage:
 *   node scripts/backfill-payment-status.mjs         # Dry run (default, shows counts)
 *   node scripts/backfill-payment-status.mjs --live  # Apply updates
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPaths = [
  path.resolve(__dirname, '../functions/api/.env'),
  path.resolve(process.cwd(), 'functions/api/.env'),
  path.resolve(process.cwd(), 'PrintBK/functions/api/.env')
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

const liveBase = 'https://printbk-60074625517.development.catalystserverless.in';

export async function runBackfill(options = { dryRun: true }) {
  console.log(`[backfill-payment-status] Running in ${options.dryRun ? 'DRY-RUN' : 'LIVE'} mode...`);

  const res = await fetch(`${liveBase}/server/api/internal/backfill-payment-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Cron-Secret': cronSecret
    },
    body: JSON.stringify({
      dryRun: options.dryRun
    })
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[backfill-payment-status] Failed (${res.status}):`, text);
    return;
  }

  const result = await res.json();
  console.log('[backfill-payment-status] Result:');
  console.log(`  Mode: ${result.dryRun ? 'DRY-RUN' : 'APPLIED'}`);
  console.log(`  Total orders inspected: ${result.totalOrders}`);
  console.log(`  Orders requiring update: ${result.updatesCount}`);
  console.log('  Payment status breakdown across all orders:');
  for (const [k, v] of Object.entries(result.breakdown || {})) {
    console.log(`    - ${k}: ${v}`);
  }
  if (result.sampleUpdates && result.sampleUpdates.length > 0) {
    console.log('  Sample updates:');
    for (const s of result.sampleUpdates) {
      console.log(`    Order #${s.order_number || s.id}: ${s.from} -> ${s.to}`);
    }
  }
  return result;
}

if (process.argv[1]?.endsWith('backfill-payment-status.mjs')) {
  const live = process.argv.includes('--live');
  runBackfill({ dryRun: !live }).catch(console.error);
}
