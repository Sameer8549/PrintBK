import { PaymentProvider, PaymentResult } from './types';

export class ManualUpiProvider implements PaymentProvider {
  id = 'manual_upi';
  name = 'UPI QR / Intent';
  description = 'Scan QR at shop or use any UPI app.';
  upiId: string;

  constructor(upiId: string = 'printbk@upi') {
    this.upiId = upiId;
  }

  isAvailable() {
    return true;
  }

  async processPayment(amount: number, orderId: string): Promise<PaymentResult> {
    const res = await fetch(`/orders/${orderId}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'manual_upi' })
    });
    
    if (res.ok) {
      // In a real flow, the shopkeeper confirms payment on the agent side
      return { success: true };
    }
    
    return { success: false, error: 'Failed to initiate UPI payment' };
  }

  generateIntentUrl(amount: number, orderId: string) {
    return `upi://pay?pa=${this.upiId}&pn=PrintBK&am=${amount}&tr=${orderId}&cu=INR`;
  }
}
