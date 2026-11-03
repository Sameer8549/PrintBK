const BASE_URL = 'https://printbk-60074625517.development.catalystserverless.in';
const SETUP_CODE = 'PBK-SETUP-9021';

async function purgeTestData() {
  console.log(`Connecting to ${BASE_URL}...`);
  const pairRes = await fetch(`${BASE_URL}/server/api/staff/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupCode: SETUP_CODE, label: 'Order Cleaner' })
  }).then(r => r.json());

  if (!pairRes.ok) {
    console.error('Pair failed:', pairRes);
    return;
  }

  const staffToken = pairRes.deviceToken;
  console.log('Invoking /internal/purge-test-data with dryRun: false...');
  const purgeRes = await fetch(`${BASE_URL}/server/api/internal/purge-test-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': staffToken
    },
    body: JSON.stringify({ dryRun: false, forceUnflagged: false })
  }).then(r => r.json());

  console.log('Purge Result:', JSON.stringify(purgeRes, null, 2));

  // Check remaining items
  const live = await fetch(`${BASE_URL}/server/api/staff/live?include_test=true`, {
    headers: { 'X-Staff-Device-Token': staffToken }
  }).then(r => r.json());

  console.log(`Remaining active items in queue: ${live.items?.length || 0}`);

  // Revoke device token cleanly
  await fetch(`${BASE_URL}/server/api/staff/unpair`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': staffToken
    }
  }).catch(() => {});
}

purgeTestData().catch(console.error);
