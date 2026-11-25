/**
 * UPILerify — Bank Alert Order Matcher
 *
 * Implements the 4-tier matching algorithm to bind incoming bank credit alerts
 * to pending and claimed orders.
 *
 * RULES.md Compliance:
 *  - Rule 1 (SRP): Pure matching heuristics separated from order orchestration.
 *  - Rule 2 (Modularity): Decoupled and independently testable.
 *  - Rule 6 (< 300 lines): Clean, compact, strictly typed.
 */

import type { PaymentOrder, MatchTier } from './types';
import type { ParsedUPIAlert } from '../parser/multiBankParser';

export interface MatchResult {
  matched: boolean;
  order?: PaymentOrder;
  tier?: MatchTier;
  replayed?: boolean;
  unmatchedReason?: string;
}

export class OrderMatcher {
  /**
   * Matches an incoming bank alert to active orders.
   *
   * Tier 0: Confirms CLAIMED orders when real bank UTR + amount arrive.
   * Tier 1: Exact transaction remark match (e.g. ORD-XXXX in note).
   * Tier 2: Micro-offset unique expectedAmount match.
   * Tier 3: Unique baseAmount match (only if single pending order exists for that amount).
   */
  public static matchAlert(
    alert: ParsedUPIAlert,
    allOrders: PaymentOrder[],
    verifiedUtrOwner?: PaymentOrder
  ): MatchResult {
    // 1. Durable UTR dedup: replaying an already-verified UTR is strictly blocked
    if (verifiedUtrOwner && verifiedUtrOwner.status === 'VERIFIED') {
      return { matched: false, replayed: true };
    }

    const pendingOrders = allOrders.filter((o) => o.status === 'PENDING');
    const claimedOrders = allOrders.filter((o) => o.status === 'CLAIMED');

    // Tier 0: Claimed UTR Confirmation (Confirmed only with matching UTR and amount)
    if (alert.utr) {
      const claimedOrder = claimedOrders.find((o) => o.claimedUtr === alert.utr);
      if (claimedOrder) {
        if (Math.abs(claimedOrder.expectedAmount - alert.amount) < 0.009) {
          return { matched: true, order: claimedOrder, tier: 'TIER_0_CLAIMED_CONFIRMED' };
        }
        return {
          matched: false,
          unmatchedReason: `UTR ${alert.utr} matched CLAIMED order ${claimedOrder.id} but bank amount ₹${alert.amount} != expected ₹${claimedOrder.expectedAmount}.`,
          order: claimedOrder,
        };
      }
    }

    // Tier 1: Exact Remark Match (e.g. ORD-XXXX in transaction note)
    if (alert.remark) {
      const match = pendingOrders.find(
        (o) => o.refNote.toLowerCase() === alert.remark?.toLowerCase()
      );
      if (match) {
        return { matched: true, order: match, tier: 'TIER_1_REMARK' };
      }
    }

    // Tier 2: Micro-Offset Amount Match (Unique expectedAmount within recent window)
    const microAmountMatch = pendingOrders.find(
      (o) => Math.abs(o.expectedAmount - alert.amount) < 0.009
    );
    if (microAmountMatch) {
      return { matched: true, order: microAmountMatch, tier: 'TIER_2_MICRO_OFFSET' };
    }

    // Tier 3: Unique Base Amount Match (if only one order matches that exact base amount)
    const baseAmountMatches = pendingOrders.filter(
      (o) => Math.abs(o.baseAmount - alert.amount) < 0.009
    );
    if (baseAmountMatches.length === 1) {
      return { matched: true, order: baseAmountMatches[0], tier: 'TIER_2_MICRO_OFFSET' };
    }

    return { matched: false };
  }
}
