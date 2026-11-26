import fs from 'node:fs';

async function verifyLive() {
  const LIVE_API = 'https://printbk-60074625517.development.catalystserverless.in/server/api';
  const LIVE_APP = 'https://printbk-60074625517.development.catalystserverless.in/app';

  console.log('1. Checking Live Counter Version...');
  const vRes = await fetch(LIVE_API + '/counter/version');
  console.log('Version status:', vRes.status);
  const vData = await vRes.json();
  console.log('Version releaseDate:', vData.releaseDate);
  console.log('Version releaseNotes:', vData.releaseNotes);

  console.log('\n2. Checking Live Download of PrintBK-Counter-AllInOne.bat via API...');
  const batRes = await fetch(LIVE_API + '/counter/agent/download/PrintBK-Counter-AllInOne.bat');
  console.log('API Bat status:', batRes.status);
  const batText = await batRes.text();
  console.log('Bat text length:', batText.length);
  console.log('Contains PBK-SETUP-9021:', batText.includes('PBK-SETUP-9021'));
  console.log('Contains Staff app launch:', batText.includes('app/staff/index.html'));

  console.log('\n3. Checking Live Static Client Bat Download...');
  const staticBatRes = await fetch(LIVE_APP + '/agent/PrintBK-Counter-AllInOne.bat');
  console.log('Static Client Bat status:', staticBatRes.status);

  console.log('\n4. Checking Live Exact Amount in Checkout & 1-Click I Have Paid...');
  const orderPayload = {
    files: [
      { id: 'f-1', name: 'Resume_Test.pdf', pages: 3, colorMode: 'bw', is_test: true }
    ],
    rush: false
  };
  const coRes = await fetch(LIVE_API + '/checkout/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-suite': 'true' },
    body: JSON.stringify(orderPayload)
  });
  console.log('Checkout status:', coRes.status);
  const coData = await coRes.json();
  console.log('Base amount:', coData.baseAmount);
  console.log('Payable amount:', coData.payableAmount);
  console.log('Exact amount match:', coData.baseAmount === coData.payableAmount);

  console.log('\n5. Testing 1-Click "I Have Paid" Declaration...');
  const paidRes = await fetch(LIVE_API + '/checkout/manual-utr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-suite': 'true' },
    body: JSON.stringify({ orderId: coData.orderId, utrNumber: 'PAID_DECLARED' })
  });
  console.log('Manual UTR status:', paidRes.status);
  const paidData = await paidRes.json();
  console.log('Status after I Have Paid:', paidData.status);

  console.log('\n6. Purging queue to leave 0 active orders...');
  const purgeRes = await fetch(LIVE_API + '/staff/orders/purge-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-staff-token': 'PBK-SETUP-9021' },
    body: JSON.stringify({ all: true })
  });
  console.log('Purge status:', purgeRes.status);
  const purgeData = await purgeRes.json();
  console.log('Purge result:', purgeData);

  console.log('\n7. Final Queue Length Check...');
  const queueRes = await fetch(LIVE_API + '/staff/live', {
    headers: { 'x-staff-token': 'PBK-SETUP-9021', 'x-test-suite': 'true' }
  });
  console.log('Queue status:', queueRes.status);
  const queueData = await queueRes.json();
  console.log('Active queue orders count:', (queueData.orders || []).length);
}

verifyLive().catch(console.error);
