import dns from 'dns';
import https from 'https';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const staffRequire = createRequire(path.join(rootDir, 'PrintBK', 'staff', 'package.json'));
const { chromium } = staffRequire('@playwright/test');

// Prioritize IPv4 across all Node DNS lookups to prevent blackhole timeouts on campus/office Ethernet
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {}

function httpsGetJson(url, agent, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent, headers, timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, data: JSON.parse(data) });
        } catch (_) {
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, data });
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('ETIMEDOUT')); });
    req.on('error', reject);
  });
}

console.log('========================================================================');
console.log('🌐 PRINTBK ETHERNET & IPv4 RESILIENCE VERIFICATION');
console.log('========================================================================\n');

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Verify Windows OS DNS Resolver addresses for Catalyst
  console.log('--- Test 1: DNS Resolution Verification ---');
  const addrs = await new Promise((resolve) => {
    dns.lookup('printbk-60074625517.catalystserverless.in', { all: true }, (err, addresses) => {
      resolve(addresses || []);
    });
  });
  console.log('  Resolved addresses:', addrs);
  assert(addrs.some(a => a.family === 4 && a.address === '169.148.148.93'), 'Found target IPv4 address 169.148.148.93 in lookup');

  // 2. Test IPv4 pinned HTTPS Agent against production & development endpoints
  console.log('\n--- Test 2: IPv4-Pinned HTTPS Agent Connectivity ---');
  const httpsAgent = new https.Agent({
    autoSelectFamily: true,
    autoSelectFamilyAttemptTimeout: 200,
    keepAlive: true,
    timeout: 8000,
    lookup: (hostname, options, callback) => {
      dns.lookup(hostname, { ...options, family: 4 }, callback);
    }
  });

  const t0 = Date.now();
  const prodRes = await httpsGetJson('https://printbk-60074625517.catalystserverless.in/server/api/counter/version', httpsAgent);
  const tProd = Date.now() - t0;
  assert(prodRes.ok && prodRes.data.ok !== false, `Production API answered via IPv4 in ${tProd}ms (Status: ${prodRes.status})`);

  const t1 = Date.now();
  const devRes = await httpsGetJson('https://printbk-60074625517.development.catalystserverless.in/server/api/counter/version', httpsAgent);
  const tDev = Date.now() - t1;
  assert(devRes.ok && devRes.data.ok !== false, `Development API answered via IPv4 in ${tDev}ms (Status: ${devRes.status})`);

  // 3. Test Staff Live Queue API latency
  console.log('\n--- Test 3: Staff Live Feed Latency ---');
  const tLive0 = Date.now();
  const liveRes = await httpsGetJson(
    'https://printbk-60074625517.development.catalystserverless.in/server/api/staff/live',
    httpsAgent,
    { 'X-Staff-Device-Token': 'PBK-SETUP-9021' }
  );
  const tLive = Date.now() - tLive0;
  assert(liveRes.ok && Array.isArray(liveRes.data.items), `Staff /live queue answered via IPv4 in ${tLive}ms with ${liveRes.data.items?.length || 0} items`);

  // 4. Test Chromium Browser Host-Resolver Rules with Playwright
  console.log('\n--- Test 4: Chromium Host Resolver Rules Verification ---');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-gpu',
      '--no-sandbox',
      '--disable-features=DnsOverHttps,AsyncDns',
      '--host-resolver-rules=MAP *.catalystserverless.in 169.148.148.93, MAP catalystserverless.in 169.148.148.93'
    ]
  });

  try {
    const page = await browser.newPage();
    const navT0 = Date.now();
    await page.goto('https://printbk-60074625517.development.catalystserverless.in/app/staff/index.html', {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });
    const navDuration = Date.now() - navT0;
    console.log(`  Staff app DOM loaded in ${navDuration}ms`);

    // Verify staff UI loaded
    const title = await page.title();
    console.log(`  Page title: "${title}"`);
    assert(title.length > 0, `Chromium loaded Staff App successfully with title: "${title}"`);

    // Check that page didn't throw offline errors
    const content = await page.content();
    assert(!content.includes('Network Connection Lost'), 'No offline fallback screen encountered in Chromium');
    assert(content.includes('PrintBK') || content.includes('Counter') || content.includes('Staff'), 'Staff App DOM initialized cleanly');
  } finally {
    await browser.close();
  }

  console.log('\n========================================================================');
  if (failed === 0) {
    console.log(`🎉 ALL ${passed} ETHERNET RESILIENCE TESTS PASSED!`);
    console.log('   IPv6 blackhole bypass, IPv4 pinning, and Chromium mapping verified.');
  } else {
    console.error(`💥 ${failed} TEST(S) FAILED!`);
    process.exit(1);
  }
  console.log('========================================================================\n');
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
