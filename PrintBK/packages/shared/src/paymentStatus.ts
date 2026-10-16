/**
 * Canonical Payment Status State Machine for PrintBK
 * 
 * Rules:
 *  - cash_due: until the shop collects cash
 *  - cash_collected: afterwards
 *  - upi_claimed: after the student returns from the UPI app
 *  - paid_verified: once the shop approves a UPI order (and for Razorpay after verified capture)
 *  - not_paid: for cancelled, rejected, or expired orders that never got paid
 *  - refunded: for refunded orders
 *  - unpaid: newly created order awaiting payment selection
 */

export type PaymentStatus =
  | 'unpaid'
  | 'cash_due'
  | 'cash_collected'
  | 'upi_claimed'
  | 'paid_verified'
  | 'not_paid'
  | 'refunded';

export interface OrderPaymentContext {
  status: string;
  paymentMethod?: string;
  payment_method?: string;
  payment?: string;
  payment_status?: string;
  basket?: any;
}

export function computePaymentStatus(order: OrderPaymentContext): PaymentStatus {
  if (!order) return 'unpaid';

  const status = String(order.status || '').toLowerCase().trim();

  // 1. Explicit refund check
  if (status === 'refunded' || order.payment_status === 'refunded') {
    return 'refunded';
  }

  // 2. Parse basket if string
  let b: any = {};
  if (typeof order.basket === 'string') {
    try { b = JSON.parse(order.basket); } catch (_) {}
  } else if (order.basket && typeof order.basket === 'object') {
    b = order.basket;
  }

  const rawMethod = String(
    order.paymentMethod ||
    order.payment_method ||
    order.payment ||
    b.payment ||
    b.paymentMethod ||
    ''
  ).toLowerCase().trim();

  const isCash = rawMethod === 'cash' || status === 'pending_cash' || status === 'cash_collected';
  const isUpi = rawMethod === 'upi' || status === 'upi_started' || status === 'upi_claimed';
  const isRazorpay = rawMethod === 'razorpay' || rawMethod === 'online' || rawMethod === 'card';

  // 3. Terminal states (cancelled, rejected, expired)
  if (['cancelled', 'rejected', 'expired'].includes(status)) {
    // If it was already collected/verified before cancellation:
    if (order.payment_status === 'cash_collected' || order.payment_status === 'paid_verified') {
      return order.payment_status as PaymentStatus;
    }
    const events = Array.isArray(b.events) ? b.events : [];
    const wasPaid = events.some((e: any) =>
      ['cash_collected', 'processing', 'printing', 'ready', 'completed', 'paid'].includes(e.to_status)
    );
    if (wasPaid) {
      return isCash ? 'cash_collected' : 'paid_verified';
    }
    return 'not_paid';
  }

  // 4. Cash Lifecycle
  if (isCash) {
    if (status === 'pending_cash') {
      return 'cash_due';
    }
    if (['cash_collected', 'processing', 'printing', 'ready', 'completed'].includes(status)) {
      return 'cash_collected';
    }
    return 'cash_due';
  }

  // 5. UPI Lifecycle
  if (isUpi) {
    if (status === 'pending_payment' || status === 'upi_started') {
      return 'unpaid';
    }
    if (status === 'upi_claimed') {
      return 'upi_claimed';
    }
    if (['processing', 'printing', 'ready', 'completed', 'paid'].includes(status)) {
      return 'paid_verified';
    }
    return 'unpaid';
  }

  // 6. Razorpay Lifecycle
  if (isRazorpay) {
    if (['processing', 'printing', 'ready', 'completed', 'paid'].includes(status)) {
      return 'paid_verified';
    }
    return 'unpaid';
  }

  // 7. General Status Fallback
  if (['processing', 'printing', 'ready', 'completed'].includes(status)) {
    return 'paid_verified';
  }
  if (status === 'upi_claimed') {
    return 'upi_claimed';
  }
  if (status === 'pending_cash') {
    return 'cash_due';
  }
  if (['cancelled', 'rejected', 'expired'].includes(status)) {
    return 'not_paid';
  }

  return 'unpaid';
}

/**
 * Honest, human-readable student-facing payment label
 */
export function getPaymentLabel(
  paymentStatus: PaymentStatus,
  total?: number,
  orderStatus?: string
): string {
  const amountStr = typeof total === 'number' ? `₹${total.toFixed(2)}` : 'amount';

  switch (paymentStatus) {
    case 'cash_due':
      return `Pay ${amountStr} at the counter`;
    case 'cash_collected':
      return 'Paid in cash';
    case 'upi_claimed':
      return 'UPI payment waiting for the shop to verify';
    case 'paid_verified':
      return 'Payment verified';
    case 'not_paid':
      return `Not paid (${orderStatus || 'cancelled'})`;
    case 'refunded':
      return 'Refunded';
    case 'unpaid':
    default:
      return 'Payment pending';
  }
}

/**
 * Styling tokens for payment chip/badge
 */
export function getPaymentBadgeDetails(
  paymentStatus: PaymentStatus,
  total?: number,
  orderStatus?: string
): { label: string; bg: string; color: string; border: string } {
  const label = getPaymentLabel(paymentStatus, total, orderStatus);

  switch (paymentStatus) {
    case 'cash_due':
      return { label, bg: '#fff7ed', color: '#c2410c', border: '#ffedd5' };
    case 'cash_collected':
      return { label, bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' };
    case 'upi_claimed':
      return { label, bg: '#fefce8', color: '#ca8a04', border: '#fef08a' };
    case 'paid_verified':
      return { label, bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' };
    case 'not_paid':
      return { label, bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
    case 'refunded':
      return { label, bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
    case 'unpaid':
    default:
      return { label, bg: '#fff7ed', color: '#c2410c', border: '#ffedd5' };
  }
}
