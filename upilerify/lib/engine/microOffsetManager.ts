/**
 * UPILerify — Active Micro-Offset Collision Avoidance Engine
 *
 * Dynamically leases micro-paisa offsets (₹0.01 – ₹0.99) for concurrent orders
 * with identical base amounts, ensuring each in-flight pending order has a
 * unique payable total.
 *
 * RULES.md Compliance:
 *  - Rule 1 (SRP): Solely responsible for collision-free offset leasing.
 *  - Rule 2 (Modularity): Decoupled from storage implementation.
 *  - Rule 6 (< 300 lines): Compact, self-contained, typed.
 */

import type { StorageAdapter } from '../storage/storageAdapter';

export class MicroOffsetCapacityError extends Error {
  constructor(baseAmount: number) {
    super(
      `All 99 micro-offset slots for ₹${baseAmount} are currently leased by active orders. Please try again shortly.`
    );
    this.name = 'MicroOffsetCapacityError';
  }
}

export class MicroOffsetManager {
  /**
   * Calculates a collision-free expected amount for a given base amount.
   * Scans active PENDING orders in storage to find the lowest unleased
   * offset from 0.01 to 0.99.
   *
   * @param baseAmount The original order price (e.g., 499.00)
   * @param useMicroOffset Whether micro-offsetting is requested
   * @param storage Storage adapter to inspect active orders
   */
  public static async calculateExpectedAmount(
    baseAmount: number,
    useMicroOffset: boolean,
    storage: StorageAdapter
  ): Promise<number> {
    if (!useMicroOffset) {
      return baseAmount;
    }

    const now = Date.now();
    const allOrders = await storage.getAllOrders();

    // Find all active unexpired pending orders for the same baseAmount
    const activeSameBaseOrders = allOrders.filter(
      (o) =>
        o.status === 'PENDING' &&
        o.expiresAt > now &&
        Math.abs(o.baseAmount - baseAmount) < 0.009
    );

    // Collect all currently reserved expectedAmounts
    const reservedAmounts = new Set<string>();
    for (const order of activeSameBaseOrders) {
      reservedAmounts.add(order.expectedAmount.toFixed(2));
    }

    // Find the lowest available offset from 0.01 to 0.99
    for (let i = 1; i <= 99; i++) {
      const offset = i / 100;
      const candidate = parseFloat((baseAmount + offset).toFixed(2));
      const candidateKey = candidate.toFixed(2);

      if (!reservedAmounts.has(candidateKey)) {
        return candidate;
      }
    }

    // All 99 offset slots are occupied by active unexpired orders
    throw new MicroOffsetCapacityError(baseAmount);
  }
}
