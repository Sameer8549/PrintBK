/**
 * UPILerify — Order Engine Domain Types
 *
 * RULES.md Compliance:
 *  - Rule 2 (Strict Modularity): Centralized type definitions.
 *  - Rule 6 (< 300 lines): Focused and strictly typed.
 */

export type OrderStatus = 'PENDING' | 'CLAIMED' | 'VERIFIED' | 'EXPIRED';

export type MatchTier =
  | 'TIER_0_CLAIMED_CONFIRMED'
  | 'TIER_1_REMARK'
  | 'TIER_2_MICRO_OFFSET'
  | 'TIER_3_UTR_FALLBACK';

export interface PaymentOrder {
  id: string;
  merchantUpiId: string;
  merchantName: string;
  baseAmount: number;
  expectedAmount: number;
  refNote: string;
  status: OrderStatus;
  createdAt: number;
  expiresAt: number;
  verifiedAt?: number;
  claimedUtr?: string;
  claimedAt?: number;
  matchedUtr?: string;
  matchedBank?: string;
  matchedSender?: string;
  matchTier?: MatchTier;
  webhookUrl?: string;
  redirectUrl?: string;
  webhookStatus?: 'PENDING' | 'SENT' | 'FAILED';
  metadata?: Record<string, any>;
  customerEmail?: string;
}

export interface ActivityLog {
  id: string;
  timestamp: number;
  type:
    | 'ORDER_CREATED'
    | 'ALERT_RECEIVED'
    | 'CLAIMED'
    | 'VERIFIED'
    | 'COLLISION_RESOLVED'
    | 'WEBHOOK_SENT'
    | 'UNMATCHED';
  message: string;
  details?: any;
}

export interface CreateOrderParams {
  merchantUpiId?: string;
  merchantName?: string;
  amount: number;
  useMicroOffset?: boolean;
  webhookUrl?: string;
  redirectUrl?: string;
  metadata?: Record<string, any>;
  customNote?: string;
  customerEmail?: string;
}
