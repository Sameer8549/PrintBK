import { PaymentProvider, PaymentResult } from './types';

export class CashProvider implements PaymentProvider {
  id = 'cash';
  name = 'Pay at Counter (Cash)';
  description = 'Reserve your print and pay with cash when you pick it up.';

  isAvailable() {
    return true;
  }

  async processPayment(amount: number, orderId: string): Promise<PaymentResult> {
    // Notify the backend that order will be paid by cash
    const res = await fetch(`/orders/${orderId}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'cash' })
    });
    
    if (res.ok) {
      return { success: true };
    }
    
    return { success: false, error: 'Failed to confirm cash order' };
  }
}
