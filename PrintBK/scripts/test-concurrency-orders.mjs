process.env.NODE_ENV = 'test';

import http from 'node:http';
import assert from 'node:assert/strict';

// Import backend app
const apiAppModule = await import('../functions/api/index.js');
const apiApp = apiAppModule.default || apiAppModule;

const server = http.createServer((req, res) => {
  apiApp(req, res);
});

await new Promise((resolve) => server.listen(4205, resolve));
console.log('[test-concurrency] Server listening on http://localhost:4205');

try {
  const N = 50;
  console.log(`[test-concurrency] Firing ${N} concurrent order checkout requests...`);

  const orderPromises = [];
  for (let i = 0; i < N; i++) {
    const payload = JSON.stringify({
      files: [
        {
          id: `file_${i}`,
          name: `doc_${i}.pdf`,
          pages: 1,
          sizeBytes: 1024,
          settings: {
            copies: 1,
            colorMode: 'bw',
            sided: 'single',
            paper: 'A4'
          }
        }
      ],
      payment: 'cash',
      is_test: true,
      expectedTotal: 1.50
    });

    orderPromises.push(
      fetch('http://localhost:4205/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-suite': 'concurrency-check'
        },
        body: payload
      }).then(async (res) => {
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Order ${i} failed (${res.status}): ${txt}`);
        }
        return res.json();
      })
    );
  }

  const results = await Promise.all(orderPromises);
  console.log(`[test-concurrency] All ${results.length} orders created successfully.`);

  const orderNumbers = results.map(r => Number(r.orderNumber || r.order_number));
  console.log('[test-concurrency] Assigned order numbers:', orderNumbers.slice(0, 10), '...', orderNumbers.slice(-5));

  // Check uniqueness
  const uniqueSet = new Set(orderNumbers);
  assert.equal(uniqueSet.size, N, `Expected ${N} unique order numbers, but got ${uniqueSet.size}! Duplicate detected.`);
  console.log(`[test-concurrency] ✓ All ${N} numbers are strictly unique.`);

  // Check consecutive progression
  const sorted = [...orderNumbers].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length - 1; i++) {
    assert.equal(
      sorted[i + 1],
      sorted[i] + 1,
      `Order numbers not consecutive: ${sorted[i]} followed by ${sorted[i + 1]}`
    );
  }
  console.log(`[test-concurrency] ✓ All numbers from ${sorted[0]} to ${sorted[sorted.length - 1]} are strictly consecutive and monotonic!`);

  console.log('[test-concurrency] SUCCESS: Concurrency test passed with 0 duplicates.');
} finally {
  server.close();
}
