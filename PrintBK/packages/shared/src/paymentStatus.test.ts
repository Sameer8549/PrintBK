import { describe, it, expect } from 'vitest';
import { computePaymentStatus, getPaymentLabel } from './paymentStatus';

describe('computePaymentStatus', () => {
  it('identifies cash_due for pending cash order', () => {
    const res = computePaymentStatus({ status: 'pending_cash', paymentMethod: 'cash' });
    expect(res).toBe('cash_due');
    expect(getPaymentLabel(res, 86)).toBe('Pay ₹86.00 at the counter');
  });

  it('identifies cash_collected when staff collects cash', () => {
    const res = computePaymentStatus({ status: 'cash_collected', paymentMethod: 'cash' });
    expect(res).toBe('cash_collected');
    expect(getPaymentLabel(res)).toBe('Paid in cash');
  });

  it('identifies cash_collected when order is processing/ready/completed with cash', () => {
    expect(computePaymentStatus({ status: 'processing', paymentMethod: 'cash' })).toBe('cash_collected');
    expect(computePaymentStatus({ status: 'printing', paymentMethod: 'cash' })).toBe('cash_collected');
    expect(computePaymentStatus({ status: 'ready', paymentMethod: 'cash' })).toBe('cash_collected');
    expect(computePaymentStatus({ status: 'completed', paymentMethod: 'cash' })).toBe('cash_collected');
  });

  it('identifies upi_claimed when student returns from UPI app', () => {
    const res = computePaymentStatus({ status: 'upi_claimed', paymentMethod: 'upi' });
    expect(res).toBe('upi_claimed');
    expect(getPaymentLabel(res)).toBe('UPI payment waiting for the shop to verify');
  });

  it('identifies paid_verified once shop approves a UPI order', () => {
    const res = computePaymentStatus({ status: 'processing', paymentMethod: 'upi' });
    expect(res).toBe('paid_verified');
    expect(getPaymentLabel(res)).toBe('Payment verified');
    expect(computePaymentStatus({ status: 'ready', paymentMethod: 'upi' })).toBe('paid_verified');
    expect(computePaymentStatus({ status: 'completed', paymentMethod: 'upi' })).toBe('paid_verified');
  });

  it('identifies not_paid for cancelled, rejected or expired orders that never got paid', () => {
    expect(computePaymentStatus({ status: 'cancelled', paymentMethod: 'upi' })).toBe('not_paid');
    expect(getPaymentLabel('not_paid', 10, 'cancelled')).toBe('Not paid (cancelled)');

    expect(computePaymentStatus({ status: 'rejected', paymentMethod: 'cash' })).toBe('not_paid');
    expect(getPaymentLabel('not_paid', 10, 'rejected')).toBe('Not paid (rejected)');

    expect(computePaymentStatus({ status: 'expired' })).toBe('not_paid');
    expect(getPaymentLabel('not_paid', 10, 'expired')).toBe('Not paid (expired)');
  });

  it('identifies refunded orders', () => {
    const res = computePaymentStatus({ status: 'refunded' });
    expect(res).toBe('refunded');
    expect(getPaymentLabel(res)).toBe('Refunded');
  });
});
