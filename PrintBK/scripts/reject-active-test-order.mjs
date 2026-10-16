import fs from 'node:fs';

const env = fs.readFileSync('functions/api/.env', 'utf8');
let setupCode = '';
for (const line of env.split(/\r?\n/)) {
  if (line.startsWith('STAFF_SETUP_CODE=')) {
    setupCode = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  }
}

async function cleanAllLive() {
  const base = 'https://printbk-60074625517.development.catalystserverless.in';
  const pairRes = await fetch(base + '/server/api/staff/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupCode, label: 'Queue Cleaner' })
  });
  const { token } = await pairRes.json();
  const liveRes = await fetch(base + '/server/api/staff/live', {
    headers: { 'X-Staff-Device-Token': token }
  });
  const liveData = await liveRes.json();
  console.log(`Found ${liveData.orders?.length || 0} active live orders to clear.`);
  for (const o of (liveData.orders || [])) {
    const res = await fetch(`${base}/server/api/staff/orders/${o.id || o.orderId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Staff-Device-Token': token
      },
      body: JSON.stringify({ reason: 'Clear test order queue' })
    });
    console.log(`Rejected order #${o.orderNumber || o.order_number}: ${res.status}`);
  }
}

cleanAllLive().catch(console.error);
