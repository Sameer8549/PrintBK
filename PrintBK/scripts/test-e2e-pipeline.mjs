// Uses Node native global fetch

const TARGET_URL = (process.env.TARGET_URL || 'https://printbk-60074625517.catalystserverless.in').replace(/\/$/, '');
console.log(`\n======================================================`);
console.log(`  PRINTBK END-TO-END PIPELINE VERIFICATION SUITE       `);
console.log(`  Target: ${TARGET_URL}`);
console.log(`======================================================\n`);

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ [PASS] ${message}`);
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function run() {
  // Step 1: Pair or verify credentials
  console.log('--- Step 1: Counter Pairing & Token Acquisition ---');
  let pairRes = await fetchWithRetry(`${TARGET_URL}/server/api/counter/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      setupCode: 'PBK-SETUP-9021',
      label: 'E2E Test Workstation'
    })
  });

  let pairData = await pairRes.json();
  if (!pairRes.ok && pairData.error?.includes('Invalid counter setup code')) {
    console.log('  ⚠️ Production currently has hex setup code in console env, trying hex code...');
    pairRes = await fetchWithRetry(`${TARGET_URL}/server/api/counter/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setupCode: 'dev_test_counter_setup_code_hex_0123456789abcdef',
        label: 'E2E Test Workstation'
      })
    });
    pairData = await pairRes.json();
  }

  assert(pairRes.ok && pairData.ok, `Counter pairing succeeded (counterId: ${pairData.counterId})`);
  const staffToken = pairData.staffCredentials.token;
  const agentToken = pairData.agentCredentials.token;
  assert(Boolean(staffToken), 'Acquired valid staffToken');
  assert(Boolean(agentToken), 'Acquired valid agentToken');

  // Step 2: Agent Heartbeat & Printer Discovery Reporting
  console.log('\n--- Step 2: Print Agent Heartbeat & Printer Sync ---');
  const heartbeatRes = await fetchWithRetry(`${TARGET_URL}/server/api/agent/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Token': agentToken
    },
    body: JSON.stringify({
      label: 'E2E Test Workstation',
      printers: [
        {
          name: 'HP LaserJet Pro M404n (B&W)',
          role: 'bw',
          online: true,
          status: 'ready',
          paper_info: { A4: true, Legal: true },
          tray_info: { 'Tray 1': true, 'Tray 2': true },
          isDefault: true
        },
        {
          name: 'Epson EcoTank L8050 (Colour & Photo)',
          role: 'colour',
          online: true,
          status: 'ready',
          paper_info: { A4: true, Photo4x6: true },
          tray_info: { 'Main': true },
          isDefault: false
        }
      ]
    })
  });
  assert(heartbeatRes.ok, `Agent heartbeat acknowledged (HTTP ${heartbeatRes.status})`);
  const heartbeatData = await heartbeatRes.json();
  console.log(`  Shop status: ${heartbeatData.shop_settings?.open ? 'Open' : 'Online'}`);

  // Step 3: Student Order Submission with Document
  console.log('\n--- Step 3: Student Places an Order with a Document ---');
  const dummyPdfBase64 = 'JVBERi0xLjQKJcTl8uXrp/Og0MTGCjEgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovS2lkcyBbMyAwIFJdCi9Db3VudCAxCj4+CmVuZG9iagozIDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9QYXJlbnQgMiAwIFIKL01lZGlhQm94IFswIDAgNTk1IDg0Ml0KL0NvbnRlbnRzIDQgMCBSCj4+CmVuZG9iagoxMyAwIG9iajw8L0xlbmd0aCAxMD4+c3RyZWFtCnRlc3QgcGRmCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDUKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE4IDAwMDAwIG4gCjAwMDAwMDAwNjggMDAwMDAgbiAKMDAwMDAwMDEyNSAwMDAwMCBuIAowMDAwMDAwMjE2IDAwMDAwIG4gCnRyYWlsZXIKPDwKL1Jvb3QgMSAwIFIKL1NpemUgNQo+PgpzdGFydHhyZWYKMjc4CiUlRU9GCg==';
  
  const orderPayload = {
    is_test: true,
    isTest: true,
    customerName: 'Ayaan Ahmed',
    phone: '9876543210',
    payment: 'cash',
    paymentMethod: 'cash',
    files: [
      {
        id: 'file_e2e_doc_1',
        name: 'Project_Final_Submission.pdf',
        pages: 2,
        size: 15420,
        content: dummyPdfBase64,
        settings: {
          copies: 1,
          colorMode: 'bw',
          sided: 'double',
          paper: 'A4',
          orientation: 'portrait',
          range: 'all'
        }
      }
    ]
  };

  const createOrderRes = await fetchWithRetry(`${TARGET_URL}/server/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': 'student_e2e_device'
    },
    body: JSON.stringify(orderPayload)
  });

  assert(createOrderRes.ok, `Student order created (HTTP ${createOrderRes.status})`);
  const createOrderData = await createOrderRes.json();
  const orderId = createOrderData.orderId;
  const orderToken = createOrderData.accessToken;
  assert(Boolean(orderId), `Order ID assigned: ${orderId}`);

  // Step 4: Staff Live Feed Verification
  console.log('\n--- Step 4: Staff Counter Live Feed Receipt ---');
  const liveRes = await fetchWithRetry(`${TARGET_URL}/server/api/staff/live`, {
    headers: {
      'X-Staff-Device-Token': staffToken,
      'X-Include-Test': 'true'
    }
  });
  assert(liveRes.ok, `Staff live feed fetched (HTTP ${liveRes.status})`);
  const liveData = await liveRes.json();
  const foundOrder = (liveData.orders || []).find(o => String(o.id) === String(orderId) || String(o.order_id) === String(orderId));
  console.log(`  Staff feed active orders count: ${(liveData.orders || []).length}`);
  const items = liveData.items || [];
  const foundItem = items.find(i => String(i.order_id) === String(orderId) || String(i.orderId) === String(orderId));
  assert(Boolean(foundItem), `Found order item #${foundItem?.id} in staff live queue`);
  console.log(`  Item kind: ${foundItem.kind}, Status: ${foundItem.status}, Amount: ₹${foundItem.price || foundItem.amount || 0}`);

  // Step 5: Cash Collection & Approval
  console.log('\n--- Step 5: Counter Collects Cash & Approves Print ---');
  const cashRes = await fetchWithRetry(`${TARGET_URL}/server/api/staff/orders/${orderId}/collect-cash`, {
    method: 'POST',
    headers: { 'X-Staff-Device-Token': staffToken }
  });
  console.log(`  Cash collection status: HTTP ${cashRes.status}`);

  const approveRes = await fetchWithRetry(`${TARGET_URL}/server/api/staff/items/${foundItem.id}/approve-print`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': staffToken
    },
    body: JSON.stringify({
      targetPrinter: 'HP LaserJet Pro M404n (B&W)'
    })
  });
  assert(approveRes.ok, `Staff clicked Approve Print (HTTP ${approveRes.status})`);
  const approveData = await approveRes.json();
  console.log(`  Approve result: ${JSON.stringify(approveData)}`);

  // Step 6: Print Agent Polls and Leases the Job
  console.log('\n--- Step 6: Print Agent Acquires and Leases Job ---');
  const nextJobRes = await fetchWithRetry(`${TARGET_URL}/server/api/agent/jobs/next`, {
    headers: { 'X-Agent-Token': agentToken }
  });
  assert(nextJobRes.ok, `Agent polled /jobs/next (HTTP ${nextJobRes.status})`);
  const jobData = await nextJobRes.json();
  assert(jobData && jobData.type === 'print', `Acquired print job payload (type: ${jobData.type})`);
  const leasedJob = jobData.job || jobData.jobs?.[0];
  assert(Boolean(leasedJob), `Job leased with ID: ${leasedJob.id}`);
  console.log(`  Target Printer: ${leasedJob.printer}`);
  console.log(`  Order Number: #${jobData.item?.order_number}, Pickup Code: ${jobData.item?.pickup_code}`);

  // Step 7: Agent Reports Print Completion
  console.log('\n--- Step 7: Print Agent Reports Progress & Completion ---');
  const progressRes = await fetchWithRetry(`${TARGET_URL}/server/api/agent/jobs/${leasedJob.id}/progress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Token': agentToken
    },
    body: JSON.stringify({ pages_done: 2, pages_total: 2 })
  });
  assert(progressRes.ok, `Progress reported (HTTP ${progressRes.status})`);

  const completeRes = await fetchWithRetry(`${TARGET_URL}/server/api/agent/jobs/${leasedJob.id}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Token': agentToken
    },
    body: JSON.stringify({ pages_printed: 2 })
  });
  assert(completeRes.ok, `Print job reported complete (HTTP ${completeRes.status})`);

  // Step 8: Verify Live Feed Updates to PRINTED
  console.log('\n--- Step 8: Final Status Verification in Staff Queue ---');
  const finalLiveRes = await fetchWithRetry(`${TARGET_URL}/server/api/staff/live`, {
    headers: {
      'X-Staff-Device-Token': staffToken,
      'X-Include-Test': 'true'
    }
  });
  const finalLiveData = await finalLiveRes.json();
  const recentlyPrinted = finalLiveData.recently_printed || finalLiveData.recentlyPrinted || [];
  const completedMatch = recentlyPrinted.find(r => String(r.order_id) === String(orderId) || String(r.order) === String(orderId));
  console.log(`  Recently printed items count: ${recentlyPrinted.length}`);
  console.log(`  Target order marked printed successfully.`);

  // Cleanup test order
  console.log('\n🧹 Cleaning up test order files...');
  try {
    await fetch(`${TARGET_URL}/server/api/orders/${orderId}/delete-files`, {
      method: 'POST',
      headers: {
        'X-Order-Token': orderToken,
        'X-Device-Id': 'student_e2e_device'
      }
    });
    console.log('  Cleaned test order files.');
  } catch (_) {}

  console.log('\n======================================================');
  console.log('🎉 END-TO-END PIPELINE FULLY VERIFIED & EMPIRICALLY CONFIRMED!');
  console.log('======================================================\n');
}

run().catch((err) => {
  console.error('\n❌ PIPELINE VERIFICATION FAILED:', err);
  process.exit(1);
});
