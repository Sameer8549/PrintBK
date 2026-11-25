"use strict";
/**
 * Canonical Payment Status State Machine for PrintBK (UPILerify + Cash)
 *
 * Rules:
 *  - cash_due: until the shop collects cash
 *  - cash_collected: afterwards
 *  - upi_claimed: when UPILerify status is UNDER_REVIEW (manual 12-digit UTR submitted)
 *  - paid_verified: when UPILerify confirms payment (PAID) or staff verifies UTR / order moves to fulfillment
 *  - not_paid: for cancelled, rejected, or expired orders (EXPIRED) that never got paid
 *  - refunded: for refunded orders
 *  - unpaid: newly created order awaiting UPILerify payment (PENDING)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computePaymentStatus = computePaymentStatus;
exports.getPaymentLabel = getPaymentLabel;
exports.getPaymentBadgeDetails = getPaymentBadgeDetails;
function computePaymentStatus(order) {
    if (!order)
        return 'unpaid';
    const status = String(order.status || '').toLowerCase().trim();
    // 1. Explicit refund check
    if (status === 'refunded' || order.payment_status === 'refunded') {
        return 'refunded';
    }
    // 2. UPILerify explicit states
    if (status === 'paid') {
        return 'paid_verified';
    }
    if (status === 'under_review') {
        return 'upi_claimed';
    }
    if (status === 'expired') {
        return 'not_paid';
    }
    if (status === 'pending') {
        return 'unpaid';
    }
    // 3. Parse basket if string
    let b = {};
    if (typeof order.basket === 'string') {
        try {
            b = JSON.parse(order.basket);
        }
        catch (_) { }
    }
    else if (order.basket && typeof order.basket === 'object') {
        b = order.basket;
    }
    const rawMethod = String(order.paymentMethod ||
        order.payment_method ||
        order.payment ||
        b.payment ||
        b.paymentMethod ||
        '').toLowerCase().trim();
    const isCash = rawMethod === 'cash' || status === 'pending_cash' || status === 'cash_collected';
    const isUpi = rawMethod === 'upi' || rawMethod === 'upilerify' || Boolean(order.utrNumber);
    // 4. Terminal states (cancelled, rejected, expired)
    if (['cancelled', 'rejected', 'expired'].includes(status)) {
        if (order.payment_status === 'cash_collected' || order.payment_status === 'paid_verified') {
            return order.payment_status;
        }
        const events = Array.isArray(b.events) ? b.events : [];
        const wasPaid = events.some((e) => ['cash_collected', 'processing', 'printing', 'ready', 'completed', 'paid', 'PAID'].includes(e.to_status));
        if (wasPaid) {
            return isCash ? 'cash_collected' : 'paid_verified';
        }
        return 'not_paid';
    }
    // 5. Cash Lifecycle
    if (isCash) {
        if (status === 'pending_cash') {
            return 'cash_due';
        }
        if (['cash_collected', 'processing', 'printing', 'ready', 'completed'].includes(status)) {
            return 'cash_collected';
        }
        return 'cash_due';
    }
    // 6. Direct UPI (UPILerify) Lifecycle
    if (isUpi) {
        if (status === 'pending_payment' || status === 'pending') {
            return 'unpaid';
        }
        if (status === 'under_review') {
            return 'upi_claimed';
        }
        if (['processing', 'printing', 'ready', 'completed', 'paid'].includes(status)) {
            return 'paid_verified';
        }
        return 'unpaid';
    }
    // 7. General Status Fallback
    if (['processing', 'printing', 'ready', 'completed', 'paid'].includes(status)) {
        return 'paid_verified';
    }
    if (status === 'pending_cash') {
        return 'cash_due';
    }
    return 'unpaid';
}
/**
 * Honest, human-readable student-facing payment label
 */
function getPaymentLabel(paymentStatus, total, orderStatus) {
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
function getPaymentBadgeDetails(paymentStatus, total, orderStatus) {
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
