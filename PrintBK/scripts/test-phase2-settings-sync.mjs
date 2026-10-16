import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../functions/api/index.js';

let server;
let port;
let baseUrl;

async function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`Phase 2 verification server running on ${baseUrl}`);
      resolve();
    });
  });
}

async function stopServer() {
  return new Promise((resolve) => server.close(resolve));
}

const STAFF_TOKEN = 'fafeee08f195644f79d5dc333533fe7f82b226a05b6748b0072d9a6a04644485';

async function runPhase2Verification() {
  await startServer();
  let passed = 0;

  try {
    console.log('\n--- 1. Testing GET /config public endpoint ---');
    const configRes = await fetch(`${baseUrl}/config`);
    assert.equal(configRes.status, 200, 'GET /config must return 200');
    const etag = configRes.headers.get('etag');
    assert.ok(etag, 'GET /config must return ETag header');
    const configData = await configRes.json();
    assert.ok(configData.version !== undefined, 'Config must have version');
    assert.ok(configData.rates !== undefined, 'Config must have rates');
    assert.ok(configData.services !== undefined, 'Config must have services');
    assert.ok(configData.paymentMethods !== undefined, 'Config must have paymentMethods');
    assert.equal(typeof configData.open, 'boolean', 'Config must indicate if shop is open');
    passed++;
    console.log(`  ✓ GET /config returned v${configData.version} with ETag "${etag}"`);

    console.log('\n--- 2. Testing GET /config ETag 304 caching ---');
    const cachedRes = await fetch(`${baseUrl}/config`, {
      headers: { 'If-None-Match': etag }
    });
    assert.equal(cachedRes.status, 304, 'GET /config with matching ETag must return 304 Not Modified');
    passed++;
    console.log('  ✓ 304 Not Modified correctly returned when ETag matches');

    console.log('\n--- 3. Testing PUT /staff/settings live rate change ---');
    const currentVersion = configData.version;
    const updateRes = await fetch(`${baseUrl}/staff/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Staff-Token': STAFF_TOKEN
      },
      body: JSON.stringify({
        expected_version: currentVersion,
        rates: {
          bw: 2.25,
          colour: 10.00,
          duplex: 1.25,
          bulk: 60,
          a3: 2.0,
          legal: 1.2,
          photo4x6: 25,
          photo8x10: 60,
          photoPassport: 75,
          bindingSpiral: 35,
          bindingSoft: 55,
          bindingHard: 180,
          laminationA4: 25,
          laminationA3: 50,
          scanPerPage: 7,
          copyBw: 2.5,
          copyColour: 12,
          typingBase: 60,
          typingPerPage: 30,
        },
        services: {
          bw: { available: true },
          colour: { available: true },
          photos: { available: false, reason: 'Out of photo paper today' }
        },
        announcement: 'Closing 4:30 PM today for maintenance'
      })
    });
    assert.equal(updateRes.status, 200, 'PUT /staff/settings must succeed with 200');
    const updateJson = await updateRes.json();
    assert.ok(updateJson.version > currentVersion, 'Version must increment after update');
    passed++;
    console.log(`  ✓ Settings saved. Version incremented from v${currentVersion} to v${updateJson.version}`);

    console.log('\n--- 4. Testing GET /config reflects new rates and services immediately ---');
    const newConfigRes = await fetch(`${baseUrl}/config`);
    const newConfigData = await newConfigRes.json();
    assert.equal(newConfigData.version, updateJson.version, 'Config version must match updated version');
    assert.equal(newConfigData.rates.bw, 2.25, 'B&W rate must be updated to 2.25');
    assert.equal(newConfigData.services.photos.available, false, 'Photos service must be unavailable');
    assert.equal(newConfigData.services.photos.reason, 'Out of photo paper today', 'Reason must match');
    assert.equal(newConfigData.announcement, 'Closing 4:30 PM today for maintenance', 'Announcement must match');
    passed++;
    console.log('  ✓ Public /config immediately serves new rates, services, and announcement');

    console.log('\n--- 5. Testing optimistic locking (PUT with stale version -> 409) ---');
    const staleUpdateRes = await fetch(`${baseUrl}/staff/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Staff-Token': STAFF_TOKEN
      },
      body: JSON.stringify({
        expected_version: currentVersion, // Stale!
        rates: { bw: 3.00 }
      })
    });
    assert.equal(staleUpdateRes.status, 409, 'Stale expected_version must be rejected with 409 Conflict');
    passed++;
    console.log('  ✓ Stale expected_version correctly rejected with 409 Conflict');

    console.log('\n--- 6. Testing order pricing mismatch protection (409 Prices Changed) ---');
    const orderWithOldPriceRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { name: 'Test Student', phone: '9876543210' },
        service: 'bw',
        expectedTotal: 1.50, // Old rate before update to 2.25
        settingsVersion: currentVersion,
        items: [{
          type: 'document',
          pages: 1,
          copies: 1,
          color: 'bw',
          colorPages: 0,
          colorMode: 'all_bw',
          duplex: false,
          paperSize: 'a4',
          orientation: 'portrait',
          binding: 'none',
          lamination: 'none'
        }]
      })
    });
    assert.equal(orderWithOldPriceRes.status, 409, 'Order with outdated expectedTotal must return 409');
    const orderConflictData = await orderWithOldPriceRes.json();
    assert.equal(orderConflictData.pricesChanged, true, 'Response must indicate pricesChanged: true');
    passed++;
    console.log(`  ✓ Stale price order rejected with 409 Conflict (expected ₹1.50 vs actual ₹${orderConflictData.currentTotal})`);

    console.log('\n--- 7. Testing unavailable service order rejection (400) ---');
    const unavailOrderRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { name: 'Test Student', phone: '9876543210' },
        service: 'photos', // Disabled above
        items: [{
          type: 'photo',
          pages: 1,
          copies: 1
        }]
      })
    });
    assert.equal(unavailOrderRes.status, 400, 'Ordering an unavailable service must return 400');
    const unavailData = await unavailOrderRes.json();
    assert.ok(unavailData.error.includes('unavailable'), 'Error message must state service is unavailable');
    passed++;
    console.log('  ✓ Order for disabled service rejected with 400 Bad Request');

    console.log('\n--- 8. Testing shop closed order rejection (503) ---');
    // Set shop closed
    await fetch(`${baseUrl}/staff/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Staff-Token': STAFF_TOKEN
      },
      body: JSON.stringify({
        open: false
      })
    });

    const closedOrderRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { name: 'Test Student', phone: '9876543210' },
        service: 'bw',
        items: [{ type: 'document', pages: 1, copies: 1 }]
      })
    });
    assert.equal(closedOrderRes.status, 503, 'Order when shop is closed must return 503');
    const closedData = await closedOrderRes.json();
    assert.equal(closedData.shopClosed, true, 'Response must indicate shopClosed: true');
    passed++;
    console.log('  ✓ Order when shop is closed correctly rejected with 503 Service Unavailable');

    // Restore shop to open state
    await fetch(`${baseUrl}/staff/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Staff-Token': STAFF_TOKEN
      },
      body: JSON.stringify({
        open: true,
        rates: { bw: 1.50, colour: 8.00, duplex: 0.85, bulk: 50, a3: 2.0, legal: 1.2 },
        services: { bw: { available: true }, colour: { available: true }, photos: { available: true } },
        announcement: ''
      })
    });

    console.log(`\n🎉 All ${passed} Phase 2 verification checks passed cleanly!\n`);
  } catch (err) {
    console.error('❌ Phase 2 test failed:', err);
    process.exitCode = 1;
  } finally {
    await stopServer();
  }
}

runPhase2Verification();
