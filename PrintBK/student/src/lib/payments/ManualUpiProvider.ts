import { PaymentProvider, PaymentResult } from './types';

/**
 * UPILerify Direct UPI Payment Provider
 * Creates UPILerify payment sessions via /api/checkout/create and supports
 * manual 12-digit UTR fallback via /api/checkout/manual-utr.
 */
export class UpiLerifyProvider implements PaymentProvider {
  id = 'upilerify';
  name = 'Direct UPI (UPILerify)';
  description = 'Pay exact paise amount via UPI QR or Intent for instant auto-verification.';
  merchantUpiId: string;

  constructor(merchantUpiId: string = '') {
    this.merchantUpiId = merchantUpiId;
  }

  isAvailable() {
    return true;
  }

  async processPayment(_amount: number, orderId: string, extras?: { utrNumber?: string }): Promise<PaymentResult> {
    if (extras?.utrNumber) {
      const res = await fetch('/api/checkout/manual-utr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, utrNumber: extras.utrNumber })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        return { success: true, transactionId: extras.utrNumber };
      }
      return { success: false, error: data.error || 'Failed to submit UTR verification' };
    }

    const res = await fetch('/api/checkout/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.orderId) {
      return { success: true, transactionId: data.orderId };
    }
    return { success: false, error: data.error || 'Failed to create UPILerify checkout session' };
  }
}
