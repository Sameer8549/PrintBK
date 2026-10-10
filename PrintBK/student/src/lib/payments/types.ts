export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export interface PaymentProvider {
  id: string;
  name: string;
  description: string;
  isAvailable(): boolean;
  processPayment(amount: number, orderId: string, extras?: any): Promise<PaymentResult>;
}
