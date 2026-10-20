import { PaymentProvider, PaymentResult } from './types';

// Razorpay dormant feature flag
const RAZORPAY_ENABLED = false;

export class RazorpayProvider implements PaymentProvider {
  id = 'razorpay';
  name = 'Online Payment (Cards / Netbanking)';
  description = 'Pay instantly online (Gateway fee may apply).';
  keyId: string | null;

  constructor(keyId: string | null = null) {
    this.keyId = keyId;
  }

  isAvailable() {
    return RAZORPAY_ENABLED && this.keyId !== null;
  }

  async processPayment(amount: number, orderId: string): Promise<PaymentResult> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Razorpay is currently disabled.' };
    }

    return new Promise((resolve) => {
      const options = {
        key: this.keyId,
        amount: Math.round(amount * 100), // paise
        currency: 'INR',
        name: 'PrintBK',
        description: `Order ${orderId}`,
        order_id: '',
        handler: function (response: any) {
          resolve({ success: true, transactionId: response.razorpay_payment_id });
        },
        prefill: {},
        theme: {
          color: '#000000'
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
        resolve({ success: false, error: response.error.description });
      });
      rzp.open();
    });
  }
}
