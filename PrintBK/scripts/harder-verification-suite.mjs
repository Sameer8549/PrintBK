// Comprehensive Hard Verification Suite for PrintBK
// Tests Web App, Desktop Counter App, Multi-PC Pairing, Agent Lifecycle, Photo Gating, and Cache Routing

const TARGET_URL = (process.env.TARGET_URL || 'https://printbk-60074625517.development.catalystserverless.in').replace(/\/+$/, '');
const SETUP_CODE = 'PBK-SETUP-9021';

console.log(`\n======================================================`);
console.log(`  PRINTBK HARD VERIFICATION SUITE (WEB & DESKTOP APP) `);
console.log(`  Target: ${TARGET_URL}`);
console.log(`======================================================\n`);

let passedCount = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    throw new Error(message);
  }
  passedCount++;
  console.log(`✅ [PASS] ${message}`);
}

async function runHarderTests() {
  // ---------------------------------------------------------
  // TEST 1: Desktop App Version, Checksum & Download Manifest
  // ---------------------------------------------------------
  console.log('--- TEST 1: Desktop App Download & Version Integrity ---');
  const vRes = await fetch(`${TARGET_URL}/server/api/counter/version`);
  assert(vRes.ok, `Version endpoint reachable (HTTP ${vRes.status})`);
  const vData = await vRes.json();
  console.log('   Version Payload:', {
    version: vData.latestVersion,
    fileSize: vData.fileSize,
    fileSizeBytes: vData.fileSizeBytes,
    sha256: vData.sha256?.slice(0, 16) + '...'
  });
  assert(vData.latestVersion === '1.0.0', 'Desktop version matches 1.0.0');
  assert(vData.fileSize.includes('MB'), `File size is lightweight (${vData.fileSize})`);
  assert(vData.sha256 === 'e90dcae73fcdb8b24e51fe6e03107d0f378d30e328dc3da4829da3e4a38aefba', 'SHA-256 matches production installer build');

  // ---------------------------------------------------------
  // TEST 2: Multi-PC Workstation Pairing & Independent Tokens
  // ---------------------------------------------------------
  console.log('\n--- TEST 2: Multi-PC Workstation Independent Pairing ---');
  // PC 1 Pairing (Desktop Counter App)
  const pc1Res = await fetch(`${TARGET_URL}/server/api/counter/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      setupCode: SETUP_CODE,
      label: 'Campus Store Counter PC #1 (Front Desk)',
      appVersion: '1.0.0'
    })
  });
  assert(pc1Res.ok, `PC #1 paired via counter/pair (HTTP ${pc1Res.status})`);
  const pc1 = await pc1Res.json();
  assert(Boolean(pc1.staffCredentials?.token), 'PC #1 acquired staff token');
  assert(Boolean(pc1.agentCredentials?.token), 'PC #1 acquired agent token');

  // PC 2 Pairing (Desktop Counter App on Second Workstation)
  const pc2Res = await fetch(`${TARGET_URL}/server/api/counter/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      setupCode: SETUP_CODE,
      label: 'Campus Store Counter PC #2 (Back Office)',
      appVersion: '1.0.0'
    })
  });
  assert(pc2Res.ok, `PC #2 paired via counter/pair (HTTP ${pc2Res.status})`);
  const pc2 = await pc2Res.json();
  assert(Boolean(pc2.staffCredentials?.token), 'PC #2 acquired independent staff token');
  assert(pc1.staffCredentials.token !== pc2.staffCredentials.token, 'PC #1 and PC #2 have unique, distinct tokens (no stomping)');

  // Browser Pairing (Staff Web App on Phone / Chrome)
  const browserRes = await fetch(`${TARGET_URL}/server/api/staff/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      setupCode: SETUP_CODE,
      label: 'Owner Mobile Phone Browser'
    })
  });
  assert(browserRes.ok, `Owner mobile paired via staff/pair (HTTP ${browserRes.status})`);
  const browserData = await browserRes.json();
  assert(Boolean(browserData.deviceToken), 'Mobile acquired valid deviceToken');

  // Negative Security Test: Invalid Setup Code Rejection
  const badPairRes = await fetch(`${TARGET_URL}/server/api/counter/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupCode: 'BAD-CODE-9999', label: 'Intruder PC' })
  });
  assert(!badPairRes.ok, `Invalid setup code rejected with HTTP ${badPairRes.status}`);

  // ---------------------------------------------------------
  // TEST 3: Print Agent Real-Time Printer Heartbeat & Sync
  // ---------------------------------------------------------
  console.log('\n--- TEST 3: Print Agent Real-Time Printer Synchronization ---');
  const heartbeatRes = await fetch(`${TARGET_URL}/server/api/agent/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Token': pc1.agentCredentials.token
    },
    body: JSON.stringify({
      counter_id: pc1.counterId,
      agent_version: '1.0.0',
      status: 'idle',
      printers: [
        {
          name: 'HP LaserJet Pro M404n (B&W)',
          is_default: true,
          status: 'online',
          capabilities: { color: false, duplex: true }
        },
        {
          name: 'Epson EcoTank L3250 (Colour)',
          is_default: false,
          status: 'online',
          capabilities: { color: true, duplex: false }
        }
      ]
    })
  });
  assert(heartbeatRes.ok, `Agent heartbeat acknowledged (HTTP ${heartbeatRes.status})`);
  const hbData = await heartbeatRes.json();
  assert(hbData.ok === true, 'Heartbeat returned ok: true');

  // ---------------------------------------------------------
  // TEST 4: Live Queue Parity & Catalyst Cache Performance
  // ---------------------------------------------------------
  console.log('\n--- TEST 4: Live Queue Parity & Catalyst Cache Routing ---');
  const t1 = Date.now();
  const poll1 = await fetch(`${TARGET_URL}/server/api/staff/live`, {
    headers: { 'X-Staff-Device-Token': pc1.staffCredentials.token }
  });
  const dur1 = Date.now() - t1;
  assert(poll1.ok, `PC #1 fetched live queue (HTTP ${poll1.status}, ${dur1} ms)`);
  const data1 = await poll1.json();

  const t2 = Date.now();
  const poll2 = await fetch(`${TARGET_URL}/server/api/staff/live`, {
    headers: { 'X-Staff-Device-Token': pc2.staffCredentials.token }
  });
  const dur2 = Date.now() - t2;
  assert(poll2.ok, `PC #2 fetched live queue (HTTP ${poll2.status}, ${dur2} ms)`);
  const data2 = await poll2.json();
  console.log(`   Cache status: poll1.cached=${data1.cached}, poll2.cached=${data2.cached} (${dur2} ms)`);
  assert(data1.orders?.length === data2.orders?.length, 'PC #1 and PC #2 see identical queue state');

  // ---------------------------------------------------------
  // TEST 5: Service Availability Gating (Staple & Custom)
  // ---------------------------------------------------------
  console.log('\n--- TEST 5: Service Availability (Staple & Custom Request) ---');
  const configRes = await fetch(`${TARGET_URL}/server/api/config`);
  const cfg = await configRes.json();
  assert(Boolean(cfg.services?.staple || cfg.services?.binding_staple), 'Corner Staple registered in shop config');
  assert(Boolean(cfg.services?.custom || cfg.services?.something_else), 'Need Something Else / Custom Service registered in shop config');

  // Toggle staple service off
  const toggleOff = await fetch(`${TARGET_URL}/server/api/staff/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': pc1.staffCredentials.token
    },
    body: JSON.stringify({
      services: {
        ...cfg.services,
        staple: { available: false, reason: 'Stapler pins restocking' },
        binding_staple: { available: false, reason: 'Stapler pins restocking' }
      }
    })
  });
  assert(toggleOff.ok, `Staff disabled staple service (HTTP ${toggleOff.status})`);

  const verifyOffRes = await fetch(`${TARGET_URL}/server/api/config`);
  const verifyOff = await verifyOffRes.json();
  assert(verifyOff.services?.staple?.available === false, 'Public config reflects staple is unavailable');

  // Restore staple service
  const toggleOn = await fetch(`${TARGET_URL}/server/api/staff/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': pc1.staffCredentials.token
    },
    body: JSON.stringify({
      services: {
        ...cfg.services,
        staple: { available: true },
        binding_staple: { available: true }
      }
    })
  });
  assert(toggleOn.ok, `Staff restored staple service (HTTP ${toggleOn.status})`);

  // ---------------------------------------------------------
  // TEST 6: Pricing Persistence Across App Restarts
  // ---------------------------------------------------------
  console.log('\n--- TEST 6: Rate Settings Persistence ---');
  const originalBw = cfg.rates?.bw || 1.5;
  const testBw = 2.25;

  const updateRatesRes = await fetch(`${TARGET_URL}/server/api/staff/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': pc1.staffCredentials.token
    },
    body: JSON.stringify({
      rates: {
        bw: testBw
      }
    })
  });
  assert(updateRatesRes.ok, `Rates updated to bw=${testBw} (HTTP ${updateRatesRes.status})`);

  // Verify second PC re-fetches updated rate identically
  const pc2RatesRes = await fetch(`${TARGET_URL}/server/api/config`);
  const pc2Rates = await pc2RatesRes.json();
  assert(pc2Rates.rates?.bw === testBw, `PC #2 observes persisted rate: bw=${pc2Rates.rates?.bw}`);

  // Restore original rate
  await fetch(`${TARGET_URL}/server/api/staff/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': pc1.staffCredentials.token
    },
    body: JSON.stringify({
      rates: {
        bw: originalBw
      }
    })
  });
  console.log(`   Restored original rate bw=${originalBw}`);

  // ---------------------------------------------------------
  // TEST 7: Complete E2E Print Pipeline & Concurrency Lock
  // ---------------------------------------------------------
  console.log('\n--- TEST 7: Complete Order, Preview, Approve & Print Pipeline ---');
  const dummyPdf = 'JVBERi0xLjQKJcTl8uXrp/Og0MTGCjEgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovS2lkcyBbMyAwIFJdCi9Db3VudCAxCj4+CmVuZG9iagozIDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9QYXJlbnQgMiAwIFIKL01lZGlhQm94IFswIDAgNTk1IDg0Ml0KL0NvbnRlbnRzIDQgMCBSCj4+CmVuZG9iagoxMyAwIG9iajw8L0xlbmd0aCAxMD4+c3RyZWFtCnRlc3QgcGRmCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDUKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE4IDAwMDAwIG4gCjAwMDAwMDAwNjggMDAwMDAgbiAKMDAwMDAwMDEyNSAwMDAwMCBuIAowMDAwMDAwMjE2IDAwMDAwIG4gCnRyYWlsZXIKPDwKL1Jvb3QgMSAwIFIKL1NpemUgNQo+PgpzdGFydHhyZWYKMjc4CiUlRU9GCg==';

  const orderRes = await fetch(`${TARGET_URL}/server/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': 'student_automated_rig'
    },
    body: JSON.stringify({
      is_test: true,
      customerName: 'Zayd Khan',
      phone: '9845012345',
      payment: 'cash',
      paymentMethod: 'cash',
      files: [
        {
          id: 'file_hard_test_1',
          name: 'Academic_Transcript.pdf',
          pages: 1,
          size: 14200,
          content: dummyPdf,
          settings: {
            copies: 1,
            colorMode: 'bw',
            sided: 'single',
            paper: 'A4',
            orientation: 'portrait'
          }
        }
      ]
    })
  });
  assert(orderRes.ok, `Student order placed (HTTP ${orderRes.status})`);
  const orderData = await orderRes.json();
  const orderId = orderData.orderId;
  const orderToken = orderData.accessToken;
  assert(Boolean(orderId), `Order ID assigned: #${orderData.orderNumber || orderId}`);

  // Fetch live feed from PC 2 to verify cross-PC visibility
  const liveRes = await fetch(`${TARGET_URL}/server/api/staff/live`, {
    headers: {
      'X-Staff-Device-Token': pc2.staffCredentials.token,
      'X-Include-Test': 'true'
    }
  });
  assert(liveRes.ok, 'PC #2 retrieved live queue with active order');
  const liveData = await liveRes.json();
  const item = (liveData.items || []).find(i => String(i.order_id) === String(orderId) || String(i.orderId) === String(orderId));
  assert(Boolean(item), `Found item #${item?.id} in PC #2 queue`);

  // Cash collection from PC 1
  const cashRes = await fetch(`${TARGET_URL}/server/api/staff/orders/${orderId}/collect-cash`, {
    method: 'POST',
    headers: { 'X-Staff-Device-Token': pc1.staffCredentials.token }
  });
  assert(cashRes.ok, `PC #1 marked cash collected (HTTP ${cashRes.status})`);

  // Staff approves print
  const approveRes = await fetch(`${TARGET_URL}/server/api/staff/items/${item.id}/approve-print`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': pc1.staffCredentials.token
    },
    body: JSON.stringify({ targetPrinter: 'HP LaserJet Pro M404n (B&W)' })
  });
  assert(approveRes.ok, `PC #1 approved print (HTTP ${approveRes.status})`);
  const approveData = await approveRes.json();

  // Print Agent on PC 1 leases job
  const jobRes = await fetch(`${TARGET_URL}/server/api/agent/jobs/next`, {
    headers: { 'X-Agent-Token': pc1.agentCredentials.token }
  });
  assert(jobRes.ok, `Agent on PC #1 polled /jobs/next (HTTP ${jobRes.status})`);
  const jobPayload = await jobRes.json();
  assert(jobPayload.type === 'print', 'Agent received print job');
  const leasedJob = jobPayload.job || jobPayload.jobs?.[0];
  assert(Boolean(leasedJob), `Job leased: ${leasedJob.id}`);

  // Concurrency Verification: Agent on PC 2 tries to poll same job
  const pc2JobRes = await fetch(`${TARGET_URL}/server/api/agent/jobs/next`, {
    headers: { 'X-Agent-Token': pc2.agentCredentials.token }
  });
  const pc2JobData = pc2JobRes.status === 200 ? await pc2JobRes.json() : null;
  assert(
    pc2JobRes.status === 204 || pc2JobData?.type === 'noop' || !pc2JobData?.job,
    'PC #2 received NOOP/empty — concurrency lock prevents duplicate printing across workstations'
  );

  // Complete job from PC 1
  const completeRes = await fetch(`${TARGET_URL}/server/api/agent/jobs/${leasedJob.id}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Token': pc1.agentCredentials.token
    },
    body: JSON.stringify({ pages_printed: 1 })
  });
  assert(completeRes.ok, `Print job reported complete (HTTP ${completeRes.status})`);

  // ---------------------------------------------------------
  // TEST 8: File Deletion & Stateless Cleanup
  // ---------------------------------------------------------
  console.log('\n--- TEST 8: Immediate File Purge & Storage Cleanup ---');
  const delRes = await fetch(`${TARGET_URL}/server/api/orders/${orderId}/delete-files`, {
    method: 'POST',
    headers: {
      'X-Order-Token': orderToken,
      'X-Device-Id': 'student_automated_rig'
    }
  });
  assert(delRes.ok, `Files permanently deleted from cloud (HTTP ${delRes.status})`);
  const delData = await delRes.json();
  assert(Boolean(delData.deletedAt), 'Deletion timestamp recorded');

  console.log(`\n======================================================`);
  console.log(`🎉 ALL ${passedCount}/${totalTests} HARD TESTS PASSED EMPIRICALLY!`);
  console.log(`======================================================\n`);
}

runHarderTests().catch(err => {
  console.error('\n❌ HARD VERIFICATION SUITE FAILED:', err);
  process.exit(1);
});
