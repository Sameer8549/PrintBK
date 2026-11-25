/**
 * UPILerify — Server instrumentation hook.
 *
 * Runs once when the Node.js server boots (next dev / next start).
 * Phase 1 security remediation: fail fast if required secrets are missing.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnvironment } = await import('./lib/security/envValidator');
    validateEnvironment();

    // Only start background polling daemon when serving, never during build
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      const { pollingDaemon } = await import('./lib/imap/pollingDaemon');
      pollingDaemon.start();
    }
  }
}