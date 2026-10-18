import fs from 'node:fs';
import path from 'node:path';

const env = fs.readFileSync('functions/api/.env', 'utf8');
let secret = '';
for (const line of env.split(/\r?\n/)) {
  if (line.startsWith('CRON_SECRET=')) {
    secret = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
    break;
  }
}

const liveBase = 'https://printbk-60074625517.development.catalystserverless.in';
const res = await fetch(`${liveBase}/server/api/internal/filestore-audit`, {
  headers: { 'X-Cron-Secret': secret }
});

const data = await res.json();
console.log('[filestore-audit] Result:', JSON.stringify(data, null, 2));
