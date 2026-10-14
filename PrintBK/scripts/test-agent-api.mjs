// Test suite for PrintBK Agent API endpoints
import http from 'http';

process.env.STAFF_TOKEN = 'test-staff-token-12345';
process.env.STAFF_SETUP_CODE = 'PBK-SETUP-9021';
process.env.AGENT_TOKEN = 'test-agent-master-token-67890';
process.env.PORT = '0';

const { default: app } = await import('../functions/api/index.js');

const server = http.createServer(app);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;
console.log(`Agent test server running on ${baseUrl}`);

async function api(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  let body = null;
  const text = await res.text();
  try { body = JSON.parse(text); } catch (_) { body = text; }
  return { status: res.status, headers: res.headers, body };
}

let agentToken = null;

try {
  // Test 1: Pair with invalid setup code
  console.log('Test 1: POST /server/api/agent/pair with invalid setup code...');
  const t1 = await api('/server/api/agent/pair', {
    method: 'POST',
    body: JSON.stringify({ setupCode: 'WRONG-CODE', label: 'Counter PC' })
  });
  if (t1.status !== 401) throw new Error(`Expected 401, got ${t1.status}`);
  console.log('  ✓ Correctly rejected invalid setup code with 401');

  // Test 2: Pair with valid setup code
  console.log('Test 2: POST /server/api/agent/pair with valid setup code...');
  const t2 = await api('/server/api/agent/pair', {
    method: 'POST',
    body: JSON.stringify({ setupCode: 'PBK-SETUP-9021', label: 'Shop Main PC' })
  });
  if (t2.status !== 200 || !t2.body.ok || !t2.body.token) {
    throw new Error(`Failed to pair: ${JSON.stringify(t2.body)}`);
  }
  agentToken = t2.body.token;
  console.log('  ✓ Returned 200 and device token: ' + agentToken.slice(0, 10) + '...');

  // Test 3: Unauthenticated heartbeat
  console.log('Test 3: POST /server/api/agent/heartbeat without token...');
  const t3 = await api('/server/api/agent/heartbeat', {
    method: 'POST',
    body: JSON.stringify({ label: 'PC', printers: [] })
  });
  if (t3.status !== 401) throw new Error(`Expected 401, got ${t3.status}`);
  console.log('  ✓ Correctly rejected unauthenticated heartbeat with 401');

  // Test 4: Authenticated heartbeat with printers list
  console.log('Test 4: POST /server/api/agent/heartbeat with paired token and printers...');
  const t4 = await api('/server/api/agent/heartbeat', {
    method: 'POST',
    headers: { 'X-Agent-Token': agentToken },
    body: JSON.stringify({
      label: 'Shop Main PC',
      printers: [
        { name: 'EPSON L3150 Series', role: 'colour', online: true, status: 'ready', paper_info: { A4: true }, tray_info: { main: true } },
        { name: 'HP LaserJet M1005', role: 'bw', online: true, status: 'ready', paper_info: { A4: true, Legal: true } }
      ]
    })
  });
  if (t4.status !== 200 || !t4.body.ok || !t4.body.shop_settings) {
    throw new Error(`Heartbeat failed: ${JSON.stringify(t4.body)}`);
  }
  console.log('  ✓ Returned 200 with shop_settings and synced printers');

  // Test 5: Poll next job (empty queue -> 204)
  console.log('Test 5: GET /server/api/agent/jobs/next with empty queue...');
  const t5 = await api('/server/api/agent/jobs/next', {
    headers: { 'X-Agent-Token': agentToken }
  });
  if (t5.status !== 204 && t5.status !== 200) {
    throw new Error(`Expected 204 or 200, got ${t5.status}`);
  }
  console.log('  ✓ Correctly returned status ' + t5.status + ' when no jobs are queued');

  // Test 6: Queue a test print from staff and claim it in agent
  console.log('Test 6: Staff triggers test-print, Agent polls next job...');
  const staffPair = await api('/server/api/staff/pair', {
    method: 'POST',
    body: JSON.stringify({ setupCode: 'PBK-SETUP-9021', label: 'Counter' })
  });
  const staffToken = staffPair.body.token;

  const queueTest = await api('/server/api/staff/printers/EPSON%20L3150%20Series/test-print', {
    method: 'POST',
    headers: { 'X-Staff-Device-Token': staffToken },
    body: JSON.stringify({ printerName: 'EPSON L3150 Series' })
  });
  if (queueTest.status !== 200 || !queueTest.body.jobId) {
    throw new Error(`Failed to queue test print: ${JSON.stringify(queueTest.body)}`);
  }
  const jobId = queueTest.body.jobId;
  console.log('  ✓ Staff successfully queued test print job: ' + jobId);

  // Test 7: Agent claims the test print job
  console.log('Test 7: Agent claims the queued test print job...');
  const claim = await api('/server/api/agent/jobs/next', {
    headers: { 'X-Agent-Token': agentToken }
  });
  if (claim.status !== 200 || !claim.body.job) {
    throw new Error(`Expected 200 with job, got ${claim.status} ${JSON.stringify(claim.body)}`);
  }
  console.log('  ✓ Agent claimed job ' + claim.body.job.id + ' of type ' + claim.body.type);

  // Test 8: Agent reports progress
  console.log('Test 8: POST /server/api/agent/jobs/:id/progress...');
  const prog = await api(`/server/api/agent/jobs/${jobId}/progress`, {
    method: 'POST',
    headers: { 'X-Agent-Token': agentToken },
    body: JSON.stringify({ pages_done: 1, pages_total: 1 })
  });
  if (prog.status !== 200 || !prog.body.ok) {
    throw new Error(`Failed to report progress: ${JSON.stringify(prog.body)}`);
  }
  console.log('  ✓ Successfully reported real progress');

  // Test 9: Agent reports completion
  console.log('Test 9: POST /server/api/agent/jobs/:id/complete...');
  const comp = await api(`/server/api/agent/jobs/${jobId}/complete`, {
    method: 'POST',
    headers: { 'X-Agent-Token': agentToken },
    body: JSON.stringify({ pages_printed: 1, duration_ms: 2500 })
  });
  if (comp.status !== 200 || !comp.body.ok || !comp.body.delete_after) {
    throw new Error(`Failed to report complete: ${JSON.stringify(comp.body)}`);
  }
  console.log('  ✓ Job completed, delete_after set to: ' + new Date(comp.body.delete_after * 1000).toISOString());

  // Test 10: Agent reports failure
  console.log('Test 10: POST /server/api/agent/jobs/:id/fail...');
  const fail = await api(`/server/api/agent/jobs/fake-job-id/fail`, {
    method: 'POST',
    headers: { 'X-Agent-Token': agentToken },
    body: JSON.stringify({ error_code: 'PAPER_JAM', error_message: 'Tray 1 is jammed' })
  });
  if (fail.status !== 200 || !fail.body.ok) {
    throw new Error(`Failed to report failure: ${JSON.stringify(fail.body)}`);
  }
  console.log('  ✓ Successfully handled failure reporting');

  console.log('\n🎉 All 10 Agent API tests passed successfully!\n');
} finally {
  server.close();
}
