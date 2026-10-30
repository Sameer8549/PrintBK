
const BASE_URL = process.env.TARGET_URL || 'https://printbk-60074625517.development.catalystserverless.in';
const SETUP_CODE = 'PBK-SETUP-9021';

async function testServicesAndPreview() {
  console.log('=== TEST: Service Availability & Asset Preview ===');

  // 1. Pair staff device
  console.log('1. Pairing staff device via counter pair...');
  const pairRes = await fetch(`${BASE_URL}/server/api/counter/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupCode: SETUP_CODE, label: 'Automated Test Rig' })
  });
  if (!pairRes.ok) throw new Error(`Pairing failed: ${pairRes.status}`);
  const pairData = await pairRes.json();
  const staffToken = pairData.staffCredentials?.token || pairData.staffToken;
  console.log('   Acquired staff token:', staffToken ? 'YES' : 'NO');

  // 2. Fetch current config
  console.log('2. Fetching shop config...');
  const cfgRes = await fetch(`${BASE_URL}/server/api/config`);
  const cfg = await cfgRes.json();
  console.log('   Current version:', cfg.version, 'Open:', cfg.open);

  // 3. Test Service Toggle: Disable document_colour
  console.log('3. Toggling document_colour to DISABLED...');
  const updateRes1 = await fetch(`${BASE_URL}/server/api/staff/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': staffToken
    },
    body: JSON.stringify({
      services: {
        ...cfg.services,
        document_colour: { available: false, reason: 'Toner undergoing scheduled replacement' }
      }
    })
  });
  if (!updateRes1.ok) {
    const errText = await updateRes1.text();
    throw new Error(`Failed to update settings: ${updateRes1.status} - ${errText}`);
  }
  const updateData1 = await updateRes1.json();
  console.log('   Settings updated to version:', updateData1.version);

  // Verify public config reflects disabled service
  const verifyCfgRes = await fetch(`${BASE_URL}/server/api/config`);
  const verifyCfg = await verifyCfgRes.json();
  const isColourAvailable = verifyCfg.services?.document_colour?.available !== false;
  console.log('   Public config document_colour available:', isColourAvailable);
  if (isColourAvailable) throw new Error('Expected document_colour to be disabled!');
  console.log('   ✅ Service successfully disabled in public config.');

  // 4. Verify student cannot place order with disabled colour document
  console.log('4. Attempting student order with disabled colour document...');
  const rejectOrderRes = await fetch(`${BASE_URL}/server/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: [{
        id: 'test-colour-file',
        name: 'assignment.pdf',
        size: 1024,
        pages: 2,
        colorPages: 2,
        colorMode: 'color',
        settings: { copies: 1, colorMode: 'color', paper: 'A4', sided: 'single' }
      }],
      services: [],
      payment: 'cash',
      is_test: true
    })
  });
  console.log('   Response status:', rejectOrderRes.status);
  const rejectOrderData = await rejectOrderRes.json();
  console.log('   Response message:', rejectOrderData.error);
  if (rejectOrderRes.status !== 400) {
    throw new Error(`Expected HTTP 400 for disabled service, got: ${rejectOrderRes.status}`);
  }
  console.log('   ✅ Order with disabled service was rejected with HTTP 400!');

  // 5. Re-enable document_colour
  console.log('5. Re-enabling document_colour...');
  const updateRes2 = await fetch(`${BASE_URL}/server/api/staff/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': staffToken
    },
    body: JSON.stringify({
      services: {
        ...cfg.services,
        document_colour: { available: true }
      }
    })
  });
  if (!updateRes2.ok) throw new Error(`Failed to re-enable service: ${updateRes2.status}`);
  const updateData2 = await updateRes2.json();
  console.log('   Settings restored to version:', updateData2.version);

  // 6. Test File Upload & Preview
  console.log('6. Uploading test PDF asset...');
  const dummyPdf = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF';
  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  const postBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="lab_sheet.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
    Buffer.from(dummyPdf, 'utf-8'),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const uploadRes = await fetch(`${BASE_URL}/server/api/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body: postBody
  });
  if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
  const uploadData = await uploadRes.json();
  console.log('   Uploaded test PDF with cloudId:', uploadData.cloudId);

  // 7. Verify Staff Preview Download
  console.log('7. Downloading preview asset via Staff Authenticated endpoint...');
  const fileDownloadRes = await fetch(`${BASE_URL}/server/api/files/${uploadData.cloudId}`, {
    headers: {
      'X-Staff-Device-Token': staffToken
    }
  });
  console.log('   Preview response status:', fileDownloadRes.status);
  console.log('   Content-Type:', fileDownloadRes.headers.get('content-type'));
  if (!fileDownloadRes.ok) throw new Error(`Preview download failed: ${fileDownloadRes.status}`);
  const arrayBuf = await fileDownloadRes.arrayBuffer();
  const fileBytes = Buffer.from(arrayBuf);
  const fileHeader = fileBytes.slice(0, 5).toString('utf-8');
  console.log('   File magic bytes header:', fileHeader);
  if (!fileHeader.startsWith('%PDF-')) {
    throw new Error(`Expected PDF magic header %PDF-, got: ${fileHeader}`);
  }
  console.log('   ✅ Preview asset served accurately with valid PDF header!');

  console.log('\n🎉 ALL CHECKS PASSED EMPIRICALLY!');
}

testServicesAndPreview().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
