import http from 'http';
import assert from 'assert';
import crypto from 'crypto';
import app from '../functions/api/index.js';

// Setup runtime dynamic setup code if not provided via environment
const validCode = process.env.COUNTER_SETUP_CODE || crypto.randomBytes(16).toString('hex');
process.env.COUNTER_SETUP_CODE = validCode;

async function runTests() {
  console.log('--- Running Counter Pairing & Dual Revocation Tests ---');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(4321, resolve));
  const baseUrl = 'http://localhost:4321';

  try {
    // 1. Version Check
    console.log('[Test 1] GET /server/api/counter/version');
    const verRes = await fetch(`${baseUrl}/server/api/counter/version`);
    assert.strictEqual(verRes.status, 200, 'Expected 200 OK from version endpoint');
    const verData = await verRes.json();
    assert.ok(verData.ok, 'Expected ok: true');
    assert.ok(verData.latestVersion, 'Expected latestVersion');
    assert.ok(verData.minSupportedVersion, 'Expected minSupportedVersion');
    console.log('  -> Version info:', verData.latestVersion, 'min:', verData.minSupportedVersion);

    // 2. Reject short or missing setup code
    console.log('[Test 2] POST /server/api/counter/pair (invalid / short codes)');
    const shortRes = await fetch(`${baseUrl}/server/api/counter/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupCode: 'short-code' })
    });
    assert.strictEqual(shortRes.status, 400, 'Expected 400 for short code');
    const shortData = await shortRes.json();
    assert.ok(shortData.error.includes('24 characters'), 'Expected length validation error');
    console.log('  -> Rejected short code correctly:', shortData.error);

    // 3. Test Rate Limiting / Lockout (simulate 5 bad attempts from a unique IP header)
    console.log('[Test 3] Rate-limit lockout after 5 failed attempts');
    const testIp = '192.168.1.199';
    let lockedStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`${baseUrl}/server/api/counter/pair`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': testIp
        },
        body: JSON.stringify({ setupCode: '0123456789abcdef01234567' }) // 24 chars, invalid
      });
      if (res.status === 429) {
        lockedStatus = res.status;
        const data = await res.json();
        console.log(`  -> Attempt ${i + 1} locked out:`, data.error);
        break;
      }
    }
    assert.strictEqual(lockedStatus, 429, 'Expected 429 Too Many Requests after consecutive failures');

    // 4. Successful Pairing with valid COUNTER_SETUP_CODE
    console.log('[Test 4] Successful pairing with valid setup code');
    const pairRes = await fetch(`${baseUrl}/server/api/counter/pair`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.200'
      },
      body: JSON.stringify({
        setupCode: validCode,
        label: 'Campus Store Counter PC #1',
        appVersion: '1.2.0',
        agentVersion: '1.2.0'
      })
    });
    assert.strictEqual(pairRes.status, 200, `Expected 200 OK, got ${pairRes.status}`);
    const pairData = await pairRes.json();
    assert.ok(pairData.ok, 'Expected ok: true');
    assert.ok(pairData.counterId, 'Expected counterId');
    assert.ok(pairData.staffCredentials?.token, 'Expected staff token');
    assert.ok(pairData.agentCredentials?.token, 'Expected agent token');
    console.log('  -> Counter paired successfully. CounterId:', pairData.counterId);

    // 5. Single-use verification
    console.log('[Test 5] Reject reuse of already redeemed code');
    const reuseRes = await fetch(`${baseUrl}/server/api/counter/pair`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.201'
      },
      body: JSON.stringify({
        setupCode: validCode,
        label: 'Another PC'
      })
    });
    assert.strictEqual(reuseRes.status, 400, 'Expected 400 for already redeemed code');
    const reuseData = await reuseRes.json();
    assert.ok(reuseData.error.includes('already been redeemed'), 'Expected redeemed error message');
    console.log('  -> Single-use enforced correctly:', reuseData.error);

    // 6. List counters via Staff API
    console.log('[Test 6] GET /server/api/staff/counters (authenticated with staff token)');
    const listRes = await fetch(`${baseUrl}/server/api/staff/counters`, {
      headers: {
        'X-Staff-Device-Token': pairData.staffCredentials.token
      }
    });
    assert.strictEqual(listRes.status, 200, 'Expected 200 OK from /staff/counters');
    const listData = await listRes.json();
    assert.ok(Array.isArray(listData.counters), 'Expected counters array');
    const matched = listData.counters.find((c) => c.id === pairData.counterId);
    assert.ok(matched, 'Expected newly paired counter to appear in list');
    assert.strictEqual(matched.label, 'Campus Store Counter PC #1');
    assert.strictEqual(matched.app_version, '1.2.0');
    assert.strictEqual(matched.revoked, false);
    console.log('  -> Found counter in list:', matched.label, 'app:', matched.app_version, 'revoked:', matched.revoked);

    // 7. Per-PC Revocation (Revokes both staff and agent credentials)
    console.log('[Test 7] POST /server/api/staff/counters/:id/revoke');
    const revokeRes = await fetch(`${baseUrl}/server/api/staff/counters/${pairData.counterId}/revoke`, {
      method: 'POST',
      headers: {
        'X-Staff-Device-Token': pairData.staffCredentials.token
      }
    });
    assert.strictEqual(revokeRes.status, 200, 'Expected 200 OK from revoke');
    const revokeData = await revokeRes.json();
    assert.strictEqual(revokeData.revoked, true, 'Expected revoked: true');
    console.log('  -> Counter revoked successfully');

    // 8. Verify both credentials are now rejected
    console.log('[Test 8] Confirm revoked staff & agent credentials are now rejected');
    const afterStaffRes = await fetch(`${baseUrl}/server/api/staff/counters`, {
      headers: {
        'X-Staff-Device-Token': pairData.staffCredentials.token
      }
    });
    assert.ok(afterStaffRes.status === 401 || afterStaffRes.status === 403, `Expected 401/403 for revoked staff token, got ${afterStaffRes.status}`);
    console.log(`  -> Revoked staff request rejected with HTTP ${afterStaffRes.status}`);

    const afterAgentRes = await fetch(`${baseUrl}/server/api/agent/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Token': pairData.agentCredentials.token
      },
      body: JSON.stringify({ label: 'Test Agent', printers: [] })
    });
    assert.ok(afterAgentRes.status === 401 || afterAgentRes.status === 403, `Expected 401/403 for revoked agent token, got ${afterAgentRes.status}`);
    console.log(`  -> Revoked agent request rejected with HTTP ${afterAgentRes.status}`);

    console.log('--- ALL COUNTER PAIRING & REVOCATION TESTS PASSED! ---');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
