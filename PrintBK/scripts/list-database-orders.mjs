import fs from 'node:fs';

const env = fs.readFileSync('functions/api/.env', 'utf8');
let setupCode = '';
for (const line of env.split(/\r?\n/)) {
  if (line.startsWith('STAFF_SETUP_CODE=')) {
    setupCode = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  }
}

async function listAll() {
  const base = 'https://printbk-60074625517.development.catalystserverless.in';
  const pairRes = await fetch(base + '/server/api/staff/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupCode, label: 'List Orders' })
  });
  const { token } = await pairRes.json();
  const histRes = await fetch(base + '/server/api/staff/history', {
    headers: { 'X-Staff-Device-Token': token }
  });
  const liveRes = await fetch(base + '/server/api/staff/live', {
    headers: { 'X-Staff-Device-Token': token }
  });
  const histData = await histRes.json();
  const liveData = await liveRes.json();
  console.log('LIVE ORDERS (' + liveData.orders?.length + '):');
  for (const o of (liveData.orders || [])) {
    console.log(JSON.stringify(o));
  }
  console.log('\nHISTORY ORDERS (' + histData.orders?.length + '):');
  for (const o of (histData.orders || [])) {
    console.log(o.order + ' | ' + o.status + ' | ' + o.files + ' | ' + o.time + ' | ₹' + o.amount);
  }
}
listAll();
