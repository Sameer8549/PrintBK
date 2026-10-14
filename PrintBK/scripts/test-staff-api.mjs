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
      console.log(`Test server running on ${baseUrl}`);
      resolve();
    });
  });
}

async function stopServer() {
  return new Promise((resolve) => server.close(resolve));
}

async function runTests() {
  await startServer();
  let passed = 0;

  try {
    // 1. Pairing with invalid setup code -> 401
    console.log('Test 1: POST /staff/pair with invalid setup code...');
    const pairFailRes = await fetch(`${baseUrl}/staff/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupCode: 'WRONG-CODE', label: 'Test Terminal' })
    });
    assert.equal(pairFailRes.status, 401, 'Should return 401 for invalid setup code');
    passed++;
    console.log('  ✓ Correctly rejected invalid setup code with 401');

    // 2. Accessing /staff/live without auth -> 401
    console.log('Test 2: GET /staff/live without auth -> 401...');
    const liveUnauthRes = await fetch(`${baseUrl}/staff/live`);
    assert.equal(liveUnauthRes.status, 401, 'Should return 401 when unauthenticated');
    passed++;
    console.log('  ✓ Correctly rejected unauthenticated live feed request with 401');

    // 3. Accessing /staff/live with master STAFF_TOKEN -> 200 with ETag
    const liveAuthRes = await fetch(`${baseUrl}/staff/live`, {
      headers: { 'X-Staff-Token': 'fafeee08f195644f79d5dc333533fe7f82b226a05b6748b0072d9a6a04644485' }
    });
    const text = await liveAuthRes.text();
    if (liveAuthRes.status !== 200) {
      console.error('Error response body:', text);
    }
    assert.equal(liveAuthRes.status, 200, 'Should return 200 with valid staff token');
    const etag = liveAuthRes.headers.get('etag');
    assert.ok(etag, 'Response must include ETag header');
    const data = JSON.parse(text);
    assert.ok(data.orders !== undefined, 'Live data must include orders array');
    assert.ok(data.printers !== undefined, 'Live data must include printers array');
    assert.ok(data.today !== undefined, 'Live data must include today analytics');
    passed++;
    console.log('  ✓ Returned 200 with valid ETag and live feed structure');

    // 4. ETag 304 Not Modified verification
    console.log('Test 4: GET /staff/live with matching If-None-Match -> 304...');
    const live304Res = await fetch(`${baseUrl}/staff/live`, {
      headers: {
        'X-Staff-Token': 'fafeee08f195644f79d5dc333533fe7f82b226a05b6748b0072d9a6a04644485',
        'If-None-Match': etag
      }
    });
    assert.equal(live304Res.status, 304, 'Should return 304 Not Modified when ETag matches');
    passed++;
    console.log('  ✓ Correctly returned 304 Not Modified on cache hit');

    // 5. Pairing with valid setup code -> 200, returns token and sets cookie
    console.log('Test 5: POST /staff/pair with valid setup code -> 200 & cookie...');
    const pairOkRes = await fetch(`${baseUrl}/staff/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupCode: 'PBK-SETUP-9021', label: 'Counter PC 1' })
    });
    assert.equal(pairOkRes.status, 200, 'Should return 200 for valid setup code');
    const pairData = await pairOkRes.json();
    assert.ok(pairData.ok === true, 'Response must have ok: true');
    assert.ok(pairData.token, 'Response must return device token');
    const setCookie = pairOkRes.headers.get('set-cookie');
    assert.ok(setCookie && setCookie.includes('staff_device_token'), 'Response must set staff_device_token cookie');
    passed++;
    console.log('  ✓ Returned 200, device token, and HttpOnly cookie');

    // 6. Accessing /staff/today with device token
    console.log('Test 6: GET /staff/today with device token -> 200...');
    const todayRes = await fetch(`${baseUrl}/staff/today`, {
      headers: { 'X-Staff-Token': 'fafeee08f195644f79d5dc333533fe7f82b226a05b6748b0072d9a6a04644485' }
    });
    assert.equal(todayRes.status, 200, 'Should return 200 for today analytics');
    const todayData = await todayRes.json();
    assert.ok(todayData.ok === true, 'Today data must have ok: true');
    passed++;
    console.log('  ✓ Returned 200 with today analytics structure');

    // 7. Accessing /staff/history
    console.log('Test 7: GET /staff/history -> 200...');
    const histRes = await fetch(`${baseUrl}/staff/history`, {
      headers: { 'X-Staff-Token': 'fafeee08f195644f79d5dc333533fe7f82b226a05b6748b0072d9a6a04644485' }
    });
    assert.equal(histRes.status, 200, 'Should return 200 for history');
    const histData = await histRes.json();
    assert.ok(Array.isArray(histData.orders), 'History must return orders array');
    passed++;
    console.log('  ✓ Returned 200 with orders array');

    // 8. PUT /staff/settings
    console.log('Test 8: PUT /staff/settings -> 200...');
    const setRes = await fetch(`${baseUrl}/staff/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Staff-Token': 'fafeee08f195644f79d5dc333533fe7f82b226a05b6748b0072d9a6a04644485'
      },
      body: JSON.stringify({
        open: true,
        delete_delay_minutes: 5,
        rates: { bw: '1.50', colour: '8.00' }
      })
    });
    assert.equal(setRes.status, 200, 'Should return 200 when updating settings');
    passed++;
    console.log('  ✓ Returned 200 on settings update');

    // 9. POST /staff/items/:id/approve-print without orderId -> 400
    console.log('Test 9: POST /staff/items/:id/approve-print without orderId -> 400...');
    const appPrintRes = await fetch(`${baseUrl}/staff/items/item-123/approve-print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Staff-Token': 'fafeee08f195644f79d5dc333533fe7f82b226a05b6748b0072d9a6a04644485'
      },
      body: JSON.stringify({})
    });
    assert.equal(appPrintRes.status, 400, 'Should return 400 when orderId is missing');
    passed++;
    console.log('  ✓ Correctly returned 400 when orderId is missing');

    // 10. POST /staff/actions/:id/undo with unknown id -> 404
    console.log('Test 10: POST /staff/actions/unknown-id/undo -> 404...');
    const undoRes = await fetch(`${baseUrl}/staff/actions/unknown-id/undo`, {
      method: 'POST',
      headers: {
        'X-Staff-Token': 'fafeee08f195644f79d5dc333533fe7f82b226a05b6748b0072d9a6a04644485'
      }
    });
    assert.equal(undoRes.status, 404, 'Should return 404 for unknown action');
    passed++;
    console.log('  ✓ Correctly returned 404 for unknown undo action');

    console.log(`\n🎉 All ${passed} Staff API tests passed successfully!\n`);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exitCode = 1;
  } finally {
    await stopServer();
  }
}

runTests();
