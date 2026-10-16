import fs from 'node:fs';

const env = fs.readFileSync('functions/api/.env', 'utf8');
let setupCode = '';
for (const line of env.split(/\r?\n/)) {
  if (line.startsWith('STAFF_SETUP_CODE=')) {
    setupCode = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  }
}

async function checkLive() {
  const base = 'https://printbk-60074625517.development.catalystserverless.in';
  const pairRes = await fetch(base + '/server/api/staff/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupCode, label: 'Audit Terminal' })
  });
  console.log('Pair status:', pairRes.status);
  const pairData = await pairRes.json();
  console.log('Pair response:', { ok: pairData.ok, hasToken: !!pairData.token });

  if (pairData.token) {
    const liveRes = await fetch(base + '/server/api/staff/live', {
      headers: { 'X-Staff-Device-Token': pairData.token }
    });
    console.log('Live status:', liveRes.status);
    const liveData = await liveRes.json();
    console.log('Live orders count:', liveData.orders?.length);
    console.log('Live items count:', liveData.items?.length);
    console.log('Live recently printed count:', liveData.recentlyPrinted?.length);
    if (liveData.orders?.length > 0) {
      console.log('Sample orders in DB:', liveData.orders.map(o => ({ id: o.id, num: o.orderNumber, status: o.status })));
    }

    const histRes = await fetch(base + '/server/api/staff/history', {
      headers: { 'X-Staff-Device-Token': pairData.token }
    });
    const histData = await histRes.json();
    console.log('History count in DB:', histData.orders?.length);
    if (histData.orders?.length > 0) {
      console.log('Sample history in DB:', histData.orders.slice(0, 10).map(o => ({ num: o.order, status: o.status, files: o.files })));
    }
  }
}
checkLive();
