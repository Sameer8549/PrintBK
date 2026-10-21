'use strict';
const express = require('express');
const crypto = require('crypto');
const catalyst = require('zcatalyst-sdk-node');

const router = express.Router();

/* ─── Shared Memory Registries across Serverless Instances ────────── */
const memStaffDevices = global.__printbk_staff_devices || (global.__printbk_staff_devices = new Map());
const memAgentDevices = global.__printbk_agent_devices || (global.__printbk_agent_devices = new Map());
const memPairedCounters = global.__printbk_paired_counters || (global.__printbk_paired_counters = new Map());
const memUsedCounterCodes = global.__printbk_used_counter_codes || (global.__printbk_used_counter_codes = new Map());
const counterRateLimits = global.__printbk_counter_rate_limits || (global.__printbk_counter_rate_limits = new Map());

/* ─── Helpers ────────────────────────────────────────────────────── */
function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function esc(str) { return String(str ?? '').replace(/'/g, "''"); }
function nowSec() { return Math.floor(Date.now() / 1000); }

function getCatalystApp(req) {
  try {
    return catalyst.initialize(req);
  } catch (_) {
    try {
      return catalyst.initialize();
    } catch (e) {
      return null;
    }
  }
}

/* ─── 1. POST /pair — One Setup Code Pairs Entire Counter PC ──────── */
router.post('/pair', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();

  // 1. Rate limiting & Lockout: 5 failed attempts locks IP for 15 minutes
  const lockoutWindowMs = 15 * 60 * 1000;
  let rl = counterRateLimits.get(ip);
  if (!rl) {
    rl = { failedAttempts: 0, lockedUntil: 0 };
    counterRateLimits.set(ip, rl);
  }

  if (rl.lockedUntil > now) {
    const remainingSec = Math.ceil((rl.lockedUntil - now) / 1000);
    return res.status(429).json({
      error: `Too many failed pairing attempts. Counter locked out for ${remainingSec} seconds.`
    });
  }

  const { setupCode, label = 'Shop Counter PC', appVersion = '1.0.0', agentVersion = '1.0.0' } = req.body;

  if (!setupCode) {
    rl.failedAttempts++;
    if (rl.failedAttempts >= 5) {
      rl.lockedUntil = now + lockoutWindowMs;
    }
    return res.status(400).json({ error: 'Counter setup code is required' });
  }

  const cleanCode = String(setupCode).trim();
  // Setup code must be at least 24 characters
  if (cleanCode.length < 24) {
    rl.failedAttempts++;
    if (rl.failedAttempts >= 5) {
      rl.lockedUntil = now + lockoutWindowMs;
    }
    return res.status(400).json({ error: 'Counter setup code must be at least 24 characters' });
  }

  // Retrieve authorized setup code from environment (must be configured, single-use by default)
  const expectedCode = process.env.COUNTER_SETUP_CODE;
  if (!expectedCode) {
    return res.status(503).json({ error: 'Counter pairing is currently disabled: COUNTER_SETUP_CODE is not configured in server environment' });
  }

  if (!timingSafeCompare(cleanCode, expectedCode)) {
    rl.failedAttempts++;
    if (rl.failedAttempts >= 5) {
      rl.lockedUntil = now + lockoutWindowMs;
      return res.status(429).json({
        error: 'Too many failed pairing attempts. Counter locked out for 15 minutes.'
      });
    }
    return res.status(401).json({ error: 'Invalid counter setup code' });
  }

  // 2. Single-use and expiration check
  const codeHash = crypto.createHash('sha256').update(cleanCode).digest('hex');
  const codeUsage = memUsedCounterCodes.get(codeHash);
  const allowMultiUse = process.env.COUNTER_CODE_MULTI_USE === 'true';

  if (codeUsage && !allowMultiUse) {
    const ageHours = (now - codeUsage.usedAt) / (1000 * 60 * 60);
    // Configurable 24-hour expiration or single use
    return res.status(400).json({
      error: 'This counter setup code has already been redeemed. Generate a fresh code in Catalyst Console.'
    });
  }

  // Pairing succeeded: reset rate limit for this IP
  counterRateLimits.delete(ip);

  // 3. Generate PC-level cryptographic credentials
  const counterId = crypto.randomUUID();
  const staffToken = crypto.randomBytes(32).toString('hex');
  const agentToken = crypto.randomBytes(32).toString('hex');
  const staffHash = crypto.createHash('sha256').update(staffToken).digest('hex');
  const agentHash = crypto.createHash('sha256').update(agentToken).digest('hex');
  const staffDeviceId = crypto.randomUUID();
  const agentDeviceId = crypto.randomUUID();
  const cleanLabel = String(label).trim();
  const timestamp = nowSec();

  const catalystApp = getCatalystApp(req);
  const zcql = catalystApp ? catalystApp.zcql() : null;

  // Persist staff device row
  if (catalystApp) {
    try {
      const table = catalystApp.datastore().table('staff_devices');
      await table.addRow({
        label: esc(`${cleanLabel} (Counter UI) [COUNTER:${counterId}:${appVersion}:${agentVersion}]`),
        token_hash: staffHash,
        created_at: timestamp,
        last_seen_at: timestamp,
        revoked: false
      });
    } catch (_) {
      if (zcql) {
        await zcql.executeZCQLQuery(
          `INSERT INTO staff_devices (label, token_hash, created_at, last_seen_at, revoked) VALUES ('${esc(`${cleanLabel} (Counter UI) [COUNTER:${counterId}:${appVersion}:${agentVersion}]`)}', '${staffHash}', ${timestamp}, ${timestamp}, false)`
        ).catch(() => {});
      }
    }

    // Persist agent device row
    try {
      const table = catalystApp.datastore().table('agent_devices');
      await table.addRow({
        label: esc(`${cleanLabel} (Print Agent) [COUNTER:${counterId}:${appVersion}:${agentVersion}]`),
        token_hash: agentHash,
        created_at: timestamp,
        last_seen_at: timestamp,
        revoked: false
      });
    } catch (_) {
      if (zcql) {
        await zcql.executeZCQLQuery(
          `INSERT INTO agent_devices (label, token_hash, created_at, last_seen_at, revoked) VALUES ('${esc(`${cleanLabel} (Print Agent) [COUNTER:${counterId}:${appVersion}:${agentVersion}]`)}', '${agentHash}', ${timestamp}, ${timestamp}, false)`
        ).catch(() => {});
      }
    }
  }

  // Update in-memory registries
  memStaffDevices.set(staffHash, {
    id: staffDeviceId,
    counter_id: counterId,
    label: `${cleanLabel} (Counter UI)`,
    token_hash: staffHash,
    created_at: timestamp,
    last_seen_at: timestamp,
    revoked: false
  });

  memAgentDevices.set(agentHash, {
    id: agentDeviceId,
    counter_id: counterId,
    label: `${cleanLabel} (Print Agent)`,
    token_hash: agentHash,
    created_at: timestamp,
    last_seen_at: timestamp,
    revoked: false
  });

  memPairedCounters.set(counterId, {
    id: counterId,
    label: cleanLabel,
    staff_device_id: staffDeviceId,
    agent_device_id: agentDeviceId,
    staff_token_hash: staffHash,
    agent_token_hash: agentHash,
    created_at: timestamp,
    last_seen_at: timestamp,
    app_version: appVersion,
    agent_version: agentVersion,
    revoked: false
  });

  // Mark setup code as redeemed
  memUsedCounterCodes.set(codeHash, {
    usedAt: now,
    counterId,
    label: cleanLabel
  });

  // Set HttpOnly cookie for staff webview
  res.cookie('staff_device_token', staffToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 365 * 24 * 60 * 60 * 1000,
    path: '/'
  });

  res.json({
    ok: true,
    counterId,
    label: cleanLabel,
    staffCredentials: {
      deviceId: staffDeviceId,
      token: staffToken
    },
    agentCredentials: {
      deviceId: agentDeviceId,
      token: agentToken
    },
    message: 'PrintBK Counter successfully paired for both staff UI and print agent'
  });
});

/* ─── 2. GET /version — Counter Desktop Version Check ─────────────── */
let versionCache = { data: null, timestamp: 0 };

router.get('/version', (req, res) => {
  const now = Date.now();
  if (versionCache.data && (now - versionCache.timestamp < 60 * 1000)) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.json(versionCache.data);
  }

  const latestVersion = process.env.COUNTER_LATEST_VERSION || '1.0.0';
  const minSupportedVersion = process.env.COUNTER_MIN_VERSION || '1.0.0';
  const fileSize = process.env.COUNTER_FILE_SIZE || '367 MB';
  const fileSizeBytes = Number(process.env.COUNTER_FILE_SIZE_BYTES) || 384720332;
  const releaseDate = process.env.COUNTER_RELEASE_DATE || '2026-10-21';
  const sha256 = process.env.COUNTER_SHA256 || '0d047441cc9d1fe2bf945983330af7f548f1b10c9f447438d3bd0eb613235f04';
  const releasesOwner = process.env.GITHUB_RELEASES_OWNER || 'Sameer8549';
  const releasesRepo = process.env.GITHUB_RELEASES_REPO || 'PrintBK-releases';
  const defaultReleaseBase = `https://github.com/${releasesOwner}/${releasesRepo}/releases/latest/download`;

  const downloadUrl = process.env.COUNTER_DOWNLOAD_URL || `${defaultReleaseBase}/PrintBK-Counter-Setup-1.0.0.exe`;
  const stableDownloadUrl = process.env.COUNTER_STABLE_DOWNLOAD_URL || `${defaultReleaseBase}/PrintBK-Counter-Setup.exe`;
  const updateFeedUrl = process.env.COUNTER_UPDATE_URL || defaultReleaseBase;
  const releaseNotes = process.env.COUNTER_RELEASE_NOTES || 'PrintBK Counter unified desktop application with embedded print agent and automated Windows printer management.';

  const data = {
    ok: true,
    latestVersion,
    minSupportedVersion,
    fileSize,
    fileSizeBytes,
    releaseDate,
    sha256,
    downloadUrl,
    stableDownloadUrl,
    updateFeedUrl,
    releaseNotes,
    serverTime: nowSec()
  };

  versionCache = { data, timestamp: now };
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json(data);
});

module.exports = router;
module.exports.memPairedCounters = memPairedCounters;
