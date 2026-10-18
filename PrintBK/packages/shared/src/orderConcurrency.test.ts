import { describe, it, expect, vi } from 'vitest';

/**
 * Concurrency & Store-Level Guarantee Tests
 * 
 * Simulates two serverless function instances racing to create orders at the exact same millisecond.
 * Verifies that store-level unique constraints and optimistic retry loops eliminate duplicates.
 */

describe('Order Number Concurrency & Store-Level Guarantee', () => {
  it('simulates two distinct serverless function instances inserting orders concurrently without duplicates', async () => {
    // Shared mock database store simulating Catalyst Data Store table 'orders'
    const mockStore = [
      { id: 'initial-1', order_number: 1050, status: 'completed' }
    ];

    let queryCount = 0;
    let collisionCount = 0;

    // Simulated Catalyst ZCQL executor with store-level unique constraint
    const createMockZcql = (instanceId) => ({
      async executeZCQLQuery(query) {
        queryCount++;
        // SELECT max query
        if (query.includes('ORDER BY order_number DESC LIMIT 1')) {
          const sorted = [...mockStore].sort((a, b) => b.order_number - a.order_number);
          return sorted.length > 0 ? [{ orders: { order_number: sorted[0].order_number } }] : [];
        }

        // INSERT query
        if (query.startsWith('INSERT INTO orders')) {
          const match = query.match(/VALUES\s*\('([^']+)',\s*(\d+)/i);
          if (!match) throw new Error('Malformed INSERT');
          const id = match[1];
          const orderNum = parseInt(match[2], 10);

          // ENFORCE STORE-LEVEL UNIQUE CONSTRAINT:
          // In Catalyst, an IsUnique column constraint immediately rejects duplicates
          const exists = mockStore.some(r => r.order_number === orderNum);
          if (exists) {
            collisionCount++;
            const err = new Error(`DUPLICATE_ENTRY: Column 'order_number' with value '${orderNum}' already exists in table 'orders'`);
            err.code = 'DUPLICATE_ENTRY';
            throw err;
          }

          // Successful atomic insert
          mockStore.push({ id, order_number: orderNum, instanceId });
          return { affectedRows: 1 };
        }

        return [];
      }
    });

    // Store-level insert helper (matching functions/api/index.js)
    async function insertOrderWithUniqueNumber(zcql, orderPayload, maxAttempts = 10) {
      let attempt = 0;
      while (attempt < maxAttempts) {
        attempt++;
        // 1. Query store max
        const rows = await zcql.executeZCQLQuery(`SELECT order_number FROM orders ORDER BY order_number DESC LIMIT 1`);
        const storeMax = rows.length > 0 ? Number(rows[0].orders.order_number) : 1000;
        const candidateNumber = storeMax + 1;

        try {
          await zcql.executeZCQLQuery(
            `INSERT INTO orders (id, order_number) VALUES ('${orderPayload.id}', ${candidateNumber})`
          );
          return candidateNumber;
        } catch (insertErr) {
          const errMsg = String(insertErr?.message || '').toLowerCase();
          if (errMsg.includes('duplicate') || errMsg.includes('already exists')) {
            // High-concurrency collision from another instance: apply jittered backoff and retry
            await new Promise(r => setTimeout(r, 5 + Math.random() * 15 * attempt));
            continue;
          }
          throw insertErr;
        }
      }
      throw new Error('Max attempts reached');
    }

    // Instance 1 & Instance 2 running concurrently
    const instance1Zcql = createMockZcql('instance-1');
    const instance2Zcql = createMockZcql('instance-2');

    // Both instances start at the exact same moment
    const [num1, num2] = await Promise.all([
      insertOrderWithUniqueNumber(instance1Zcql, { id: 'order-inst-1' }),
      insertOrderWithUniqueNumber(instance2Zcql, { id: 'order-inst-2' })
    ]);

    expect(num1).toBeDefined();
    expect(num2).toBeDefined();
    expect(num1).not.toBe(num2); // ZERO duplicates!
    expect([1051, 1052]).toContain(num1);
    expect([1051, 1052]).toContain(num2);
    expect(mockStore.length).toBe(3);
  });

  it('repairs orders that have missing (null / None / 0) order numbers', async () => {
    const mockStore = [
      { id: 'valid-1', order_number: 1060 },
      { id: 'missing-1', order_number: null },
      { id: 'missing-2', order_number: null }
    ];

    const mockZcql = {
      async executeZCQLQuery(query) {
        if (query.includes('order_number IS NULL')) {
          return mockStore
            .filter(r => r.order_number === null || r.order_number === 0)
            .map(r => ({ orders: r }));
        }
        if (query.includes('ORDER BY order_number DESC LIMIT 1')) {
          const valid = mockStore.filter(r => r.order_number !== null).sort((a, b) => b.order_number - a.order_number);
          return valid.length > 0 ? [{ orders: { order_number: valid[0].order_number } }] : [];
        }
        if (query.startsWith('UPDATE orders SET order_number')) {
          const match = query.match(/SET order_number = (\d+) WHERE id = '([^']+)'/);
          if (match) {
            const num = parseInt(match[1], 10);
            const id = match[2];
            const item = mockStore.find(r => r.id === id);
            if (item) item.order_number = num;
          }
          return { affectedRows: 1 };
        }
        return [];
      }
    };

    async function fixMissingOrderNumbers(zcql) {
      const rows = await zcql.executeZCQLQuery(
        `SELECT id, order_number, created_at FROM orders WHERE order_number IS NULL OR order_number = 0 ORDER BY created_at ASC`
      );
      if (!rows || rows.length === 0) return { fixedCount: 0 };

      const maxRows = await zcql.executeZCQLQuery(`SELECT order_number FROM orders WHERE order_number IS NOT NULL AND order_number > 0 ORDER BY order_number DESC LIMIT 1`);
      let currentMax = maxRows.length > 0 ? Number(maxRows[0].orders.order_number) : 1000;
      let fixedCount = 0;

      for (const r of rows) {
        currentMax++;
        await zcql.executeZCQLQuery(`UPDATE orders SET order_number = ${currentMax} WHERE id = '${r.orders.id}'`);
        fixedCount++;
      }
      return { fixedCount };
    }

    const res = await fixMissingOrderNumbers(mockZcql);
    expect(res.fixedCount).toBe(2);
    expect(mockStore.find(r => r.id === 'missing-1')?.order_number).toBe(1061);
    expect(mockStore.find(r => r.id === 'missing-2')?.order_number).toBe(1062);
    expect(mockStore.every(r => r.order_number !== null && r.order_number > 0)).toBe(true);
  });
});
