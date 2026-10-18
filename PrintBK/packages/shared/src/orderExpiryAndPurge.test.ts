import { describe, it, expect } from 'vitest';
import { computePaymentStatus } from './paymentStatus';

/**
 * Order Expiry & File Purge Lifecycle Tests
 * 
 * Verifies:
 * 1. pending_payment and upi_started orders expire after configured time (default 15m)
 * 2. Unpaid upi_claimed orders expire after configurable long limit (default 24h)
 * 3. File purge within 60 minutes of upload
 * 4. payment_status transitions strictly to 'not_paid' upon expiration
 */

describe('Order Expiry & File Purge Lifecycle', () => {
  const DEFAULT_PAYMENT_EXPIRY_SEC = 15 * 60; // 900s
  const DEFAULT_CLAIM_EXPIRY_SEC = 24 * 3600; // 86400s
  const FILE_PURGE_CEILING_SEC = 3600; // 60 mins

  function checkOrderExpiration(order, config = {}, nowSec) {
    const paymentLimit = Number(config.order_expiry_minutes || 15) * 60;
    const claimLimit = Number(config.upi_claimed_expiry_hours || 24) * 3600;

    const createdAt = Number(order.created_at || nowSec);
    const updatedAt = Number(order.updated_at || createdAt);

    const isPendingExpired = ['pending_payment', 'upi_started'].includes(order.status) && (nowSec - createdAt >= paymentLimit);
    const isClaimExpired = (order.status === 'upi_claimed') && (nowSec - updatedAt >= claimLimit);

    if (isPendingExpired || isClaimExpired) {
      return {
        ...order,
        status: 'expired',
        payment_status: computePaymentStatus({ status: 'expired' }),
        updated_at: nowSec
      };
    }
    return order;
  }

  function shouldPurgeFiles(order, nowSec) {
    const isTerminal = ['cancelled', 'rejected', 'expired'].includes(order.status);
    const createdAt = Number(order.created_at || nowSec);
    const isPastCeiling = (nowSec - createdAt) >= FILE_PURGE_CEILING_SEC;
    const deleteAfter = order.delete_after ? Number(order.delete_after) : null;
    const isPastPrintDelete = deleteAfter && deleteAfter <= nowSec;

    return (isTerminal && isPastCeiling) || isPastPrintDelete || (isTerminal && (nowSec - Number(order.updated_at || createdAt)) >= 1800);
  }

  it('expires pending_payment order after 15 minutes and updates payment_status to not_paid', () => {
    const now = 1792200000;
    const order = {
      id: 'ord-pending',
      status: 'pending_payment',
      created_at: now - 901, // 15m 1s ago
      updated_at: now - 901
    };

    const expired = checkOrderExpiration(order, { order_expiry_minutes: 15 }, now);
    expect(expired.status).toBe('expired');
    expect(expired.payment_status).toBe('not_paid');
  });

  it('expires upi_started order after 15 minutes', () => {
    const now = 1792200000;
    const order = {
      id: 'ord-upi-started',
      status: 'upi_started',
      created_at: now - 905,
      updated_at: now - 905
    };

    const expired = checkOrderExpiration(order, { order_expiry_minutes: 15 }, now);
    expect(expired.status).toBe('expired');
    expect(expired.payment_status).toBe('not_paid');
  });

  it('keeps pending_payment active when under 15 minutes', () => {
    const now = 1792200000;
    const order = {
      id: 'ord-fresh',
      status: 'pending_payment',
      created_at: now - 300, // 5m ago
      updated_at: now - 300
    };

    const res = checkOrderExpiration(order, { order_expiry_minutes: 15 }, now);
    expect(res.status).toBe('pending_payment');
  });

  it('expires unapproved upi_claimed orders after 24 hours', () => {
    const now = 1792200000;
    const order = {
      id: 'ord-claimed-old',
      status: 'upi_claimed',
      created_at: now - 90000,
      updated_at: now - 86401 // 24 hours 1s unapproved
    };

    const expired = checkOrderExpiration(order, { upi_claimed_expiry_hours: 24 }, now);
    expect(expired.status).toBe('expired');
    expect(expired.payment_status).toBe('not_paid');
  });

  it('purges files of expired or cancelled orders within 60 minutes of upload ceiling', () => {
    const now = 1792200000;
    const orderRecent = {
      id: 'ord-recent-cancel',
      status: 'cancelled',
      created_at: now - 600, // 10 min ago
      updated_at: now - 600
    };
    // If cancelled 10 min ago, files not yet past 60m ceiling or 30m post-cancel
    expect(shouldPurgeFiles(orderRecent, now)).toBe(false);

    // Cancelled and uploaded 61 minutes ago: MUST PURGE
    const orderOld = {
      id: 'ord-old-cancel',
      status: 'cancelled',
      created_at: now - 3601, // 60m 1s ago
      updated_at: now - 3601
    };
    expect(shouldPurgeFiles(orderOld, now)).toBe(true);

    // Expired order uploaded 60+ minutes ago: MUST PURGE
    const orderExpired = {
      id: 'ord-expired-files',
      status: 'expired',
      created_at: now - 3700,
      updated_at: now - 900
    };
    expect(shouldPurgeFiles(orderExpired, now)).toBe(true);
  });
});
