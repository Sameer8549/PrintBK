/**
 * UPILerify — Background IMAP Polling Daemon
 *
 * Runs an automated, non-overlapping background polling loop that periodically
 * fetches incoming bank alert emails from Gmail TLS IMAP and reconciles them
 * against active payment orders.
 *
 * RULES.md Compliance:
 *  - Rule 1 (SRP): Solely responsible for scheduling and managing mailbox sync ticks.
 *  - Rule 2 (Modularity): Decoupled from transport and route handlers.
 *  - Rule 6 (< 300 lines): Compact, self-contained, and clean.
 */

import { imapService } from './imapService';
import { orderManager } from '../engine/orderManager';

export interface SyncSummary {
  scannedCount: number;
  matchedCount: number;
  matchedOrderIds: string[];
}

export class PollingDaemon {
  private timer: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private hasWarnedMissingCreds = false;
  private intervalMs = 30_000;

  /**
   * Performs a single synchronization pass across the configured Gmail inbox.
   * Concurrency-guarded: skips if a sync pass is already in flight.
   */
  public async syncOnce(): Promise<SyncSummary | null> {
    if (this.isSyncing) {
      return null; // Overlap prevented
    }

    const email = process.env.GMAIL_ADDRESS;
    const appPassword = process.env.GMAIL_APP_PASSWORD;

    if (!email || !appPassword) {
      if (!this.hasWarnedMissingCreds) {
        console.warn(
          '[UPILerify][Daemon] GMAIL_ADDRESS or GMAIL_APP_PASSWORD not configured. Background polling is idle.'
        );
        this.hasWarnedMissingCreds = true;
      }
      return { scannedCount: 0, matchedCount: 0, matchedOrderIds: [] };
    }

    this.isSyncing = true;
    const matchedOrderIds: string[] = [];

    try {
      const alerts = await imapService.fetchRecentAlerts(email, appPassword, 15);

      for (const alert of alerts) {
        const match = await orderManager.processBankAlert(alert);
        if (match.matched && match.order) {
          matchedOrderIds.push(match.order.id);
        }
      }

      return {
        scannedCount: alerts.length,
        matchedCount: matchedOrderIds.length,
        matchedOrderIds,
      };
    } catch (err: any) {
      console.error('[UPILerify][Daemon] Error during inbox polling:', err?.message || err);
      return { scannedCount: 0, matchedCount: 0, matchedOrderIds: [] };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Starts the background polling loop.
   */
  public start(): void {
    if (process.env.DISABLE_AUTO_POLLING === 'true') {
      console.log('[UPILerify][Daemon] Auto-polling disabled via DISABLE_AUTO_POLLING.');
      return;
    }

    if (this.timer) {
      return; // Already running
    }

    const envInterval = Number(process.env.IMAP_POLL_INTERVAL_MS);
    this.intervalMs = !isNaN(envInterval) && envInterval >= 5000 ? envInterval : 30_000;

    // Brief 3-second delay after server boot before the first sync pass
    const warmupTimer = setTimeout(() => {
      this.syncOnce().catch((err) =>
        console.error('[UPILerify][Daemon] Initial sync error:', err)
      );
    }, 3000);
    if (typeof warmupTimer.unref === 'function') warmupTimer.unref();

    this.timer = setInterval(() => {
      this.syncOnce().catch((err) =>
        console.error('[UPILerify][Daemon] Polling tick error:', err)
      );
    }, this.intervalMs);

    // Never keep the Node process alive solely for the background timer
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }

    console.log(
      `[UPILerify] Background IMAP polling daemon active (${Math.round(this.intervalMs / 1000)}s interval).`
    );
  }

  /**
   * Stops the background polling loop.
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[UPILerify][Daemon] Background IMAP polling daemon stopped.');
    }
  }

  public isRunning(): boolean {
    return this.timer !== null;
  }
}

export const pollingDaemon = new PollingDaemon();
