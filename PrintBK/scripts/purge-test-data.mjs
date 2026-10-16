/**
 * Purge Test Data Script for PrintBK
 * 
 * Safely removes automated test orders, associated order_items, print_jobs,
 * order_events, and file storage objects.
 * 
 * Complies with strict rule: Only flagged test data is purged automatically.
 * Unflagged candidates are listed for explicit user confirmation before deletion.
 */

import fs from 'node:fs';

const env = fs.readFileSync('functions/api/.env', 'utf8');
let cronSecret = '';
for (const line of env.split(/\r?\n/)) {
  if (line.startsWith('CRON_SECRET=')) {
    cronSecret = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  }
}

const liveBase = 'https://printbk-60074625517.development.catalystserverless.in';

export async function runPurge(options = { dryRun: true, forceUnflagged: false }) {
  console.log(`[purge-test-data] Running in ${options.dryRun ? 'DRY-RUN' : 'LIVE PURGE'} mode...`);
  
  // Call backend purge endpoint with CRON_SECRET or staff token
  const res = await fetch(`${liveBase}/server/api/internal/purge-test-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Cron-Secret': cronSecret
    },
    body: JSON.stringify({
      dryRun: options.dryRun,
      forceUnflagged: options.forceUnflagged
    })
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[purge-test-data] Failed (${res.status}):`, text);
    return;
  }

  const result = await res.json();
  console.log('[purge-test-data] Result:', JSON.stringify(result, null, 2));
  return result;
}

// If executed directly from CLI
if (process.argv[1]?.endsWith('purge-test-data.mjs')) {
  const force = process.argv.includes('--force');
  const live = process.argv.includes('--live');
  runPurge({ dryRun: !live, forceUnflagged: force }).catch(console.error);
}
