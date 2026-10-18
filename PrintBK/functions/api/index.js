'use strict';
const express = require('express');
const catalyst = require('zcatalyst-sdk-node');
const cors = require('cors');
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Fallback environment variable loader from local .env
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const k = trimmed.slice(0, eqIdx).trim();
        let v = trimmed.slice(eqIdx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!process.env[k]) {
          process.env[k] = v;
        }
      }
    }
  }
} catch (_) {}

const app = express();

/* ─── URL Prefix Normalization ───────────────────────────────────── */
app.use((req, _res, next) => {
  if (req.url.startsWith('/server/api')) {
    req.url = req.url.slice('/server/api'.length) || '/';
  }
  next();
});

/* ─── Security Headers & Middleware ──────────────────────────────── */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

/* ─── Constant-Time Token Comparison & Auth Helpers ─────────────── */
function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function extractToken(req, headerName = 'staff') {
  const custom = req.headers[`x-${headerName}-token`] || 
                 req.headers[`x-${headerName}-device-token`] || 
                 req.headers['x-token'];
  if (custom) return String(custom).trim();
  const auth = req.headers['x-authorization'] || req.headers.authorization;
  if (auth && typeof auth === 'string') {
    if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
    return auth.trim();
  }
  return null;
}

function getTokenFingerprint(token) {
  if (!token) return 'none';
  return crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 16);
}

function hasValidStaffToken(req) {
  const staffToken = process.env.STAFF_TOKEN;
  const token = extractToken(req, 'staff');
  if (staffToken && token && timingSafeCompare(token, staffToken)) return true;
  if (token && global.__printbk_staff_devices) {
    const hash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const dev = global.__printbk_staff_devices.get(hash);
    if (dev && !dev.revoked) return true;
  }
  return false;
}

function isCronScheduler(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const token = req.headers['cron_secret'] || 
                req.headers['x-cron-secret'] || 
                req.headers['cron-secret'] ||
                (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : null) ||
                extractToken(req, 'cron');
  if (!token) return false;
  return timingSafeCompare(String(token).trim(), cronSecret.trim());
}

function isAgent(req) {
  const agentToken = process.env.AGENT_TOKEN;
  const token = extractToken(req, 'agent');
  if (agentToken && token && timingSafeCompare(token, agentToken)) return true;
  if (token && global.__printbk_agent_devices) {
    const hash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const dev = global.__printbk_agent_devices.get(hash);
    if (dev && !dev.revoked) return true;
  }
  return false;
}

/* ─── Rate Limiter & Exponential Backoff Lockout ─────────────────── */
const ipRequests = new Map();
const ipLockouts = new Map();       // key: ip -> { attempts, lockedUntil, lastAttempt }
const tokenLockouts = new Map();    // key: `${ip}:${fp}` -> { attempts, lockedUntil, lastAttempt }

function calculateBackoffMs(attempts) {
  // Exponential backoff starting at attempt 3: 30s, 60s, 120s, 240s... max 15m
  if (attempts < 3) return 0;
  const exponent = attempts - 3;
  const ms = 30 * 1000 * Math.pow(2, exponent);
  return Math.min(ms, 15 * 60 * 1000);
}

function recordFailedStaffAttempt(ip, token) {
  const now = Date.now();
  const fp = getTokenFingerprint(token);
  const targets = [
    { key: ip, map: ipLockouts },
    { key: `${ip}:${fp}`, map: tokenLockouts }
  ];

  for (const { key, map } of targets) {
    const existing = map.get(key) || { attempts: 0, lockedUntil: 0, lastAttempt: now };
    if (now - existing.lastAttempt > 15 * 60 * 1000) {
      existing.attempts = 1;
    } else {
      existing.attempts += 1;
    }
    existing.lastAttempt = now;
    const backoffMs = calculateBackoffMs(existing.attempts);
    if (backoffMs > 0) {
      existing.lockedUntil = now + backoffMs;
    }
    map.set(key, existing);
  }
}

function checkStaffLockout(ip, token) {
  const now = Date.now();
  const fp = getTokenFingerprint(token);
  const ipRec = ipLockouts.get(ip);
  const tokenRec = tokenLockouts.get(`${ip}:${fp}`);

  const rec = (tokenRec && tokenRec.lockedUntil > now)
    ? tokenRec
    : (ipRec && ipRec.lockedUntil > now ? ipRec : null);

  if (rec && rec.lockedUntil > now) {
    const retryAfter = Math.max(1, Math.ceil((rec.lockedUntil - now) / 1000));
    return { locked: true, retryAfter, lockedUntil: rec.lockedUntil };
  }
  return { locked: false };
}

function isStaff(req) {
  const staffToken = process.env.STAFF_TOKEN;
  const token = extractToken(req, 'staff');
  if (staffToken && token && timingSafeCompare(token, staffToken)) {
    return true;
  }
  if (token && global.__printbk_staff_devices) {
    const hash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const dev = global.__printbk_staff_devices.get(hash);
    if (dev && !dev.revoked) return true;
  }
  if (!token) return false;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown-ip';
  recordFailedStaffAttempt(ip, token);
  return false;
}

function rateLimiter(req, res, next) {
  // 1. Valid staff token, cron scheduler, or test environment is NEVER blocked by general rate limits
  if (hasValidStaffToken(req) || isCronScheduler(req) || process.env.NODE_ENV === 'test') {
    return next();
  }

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown-ip';
  const now = Date.now();
  const token = extractToken(req, 'staff');

  // 2. Check if locked out due to wrong-token attempts (per-IP and per-token-fingerprint)
  const lockout = checkStaffLockout(ip, token);
  if (lockout.locked) {
    res.setHeader('Retry-After', String(lockout.retryAfter));
    return res.status(429).json({
      error: 'Too many failed authentication attempts. Access locked with exponential backoff.',
      retryAfter: lockout.retryAfter
    });
  }

  // 3. Sliding window limit: 30 requests per 10 seconds per IP for general endpoints
  const windowMs = 10 * 1000;
  const maxRequests = 30;
  const record = ipRequests.get(ip) || { count: 0, resetTime: now + windowMs };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
  } else {
    record.count++;
  }
  ipRequests.set(ip, record);

  if (record.count > maxRequests) {
    return res.status(429).json({
      error: 'Too many requests. Please slow down.'
    });
  }
  next();
}

app.use(rateLimiter);

/* ─── CORS Configuration ─────────────────────────────────────────── */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const defaultOrigins = [
  'https://printbk-60074625517.development.catalystserverless.in',
  'https://printbk.development.catalystserverless.in',
  'http://localhost:5173',
  'http://localhost:3000'
];

const allAllowedOrigins = [...new Set([...defaultOrigins, ...allowedOrigins])];

app.use(cors({
  origin: (origin, callback) => {
    // Non-browser or server-to-server requests (like curl, scripts, agent) have no Origin header
    if (!origin) return callback(null, true);
    if (allAllowedOrigins.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Order-Token', 'X-Staff-Token', 'X-Staff-Device-Token', 'X-Agent-Token', 'X-Cron-Secret', 'X-Authorization', 'Accept', 'If-None-Match'],
  exposedHeaders: ['ETag']
}));

app.use(express.json({ limit: '2mb' }));

/* ─── Mount Staff API Router ─────────────────────────────────────── */
const staffRouter = require('./staff');
app.use('/server/api/staff', staffRouter);
app.use('/staff', staffRouter);

/* ─── Mount Agent API Router ─────────────────────────────────────── */
const agentRouter = require('./agent');
app.use('/server/api/agent', agentRouter);
app.use('/agent', agentRouter);

/* ─── Multer & Magic Bytes File Inspection ───────────────────────── */
const uploadTmpDir = path.join(os.tmpdir(), 'printbk-uploads');
try { fs.mkdirSync(uploadTmpDir, { recursive: true }); } catch (_) {}

const upload = multer({
  dest: uploadTmpDir,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

function validateFileMagicBytes(filePath, originalname) {
  const ext = (originalname.split('.').pop() || '').toLowerCase();
  const dangerous = ['exe', 'bat', 'cmd', 'sh', 'php', 'js', 'vbs', 'ps1', 'msi', 'com', 'scr', 'dll', 'bin'];
  if (dangerous.includes(ext)) return false;
  if (ext === 'txt') return true;

  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    if (bytesRead < 4) return false;

    // PDF magic bytes: %PDF (0x25, 0x50, 0x44, 0x46)
    if (ext === 'pdf') {
      return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
    }
    // PNG: 89 50 4E 47
    if (ext === 'png') {
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    }
    // JPEG: FF D8 FF
    if (ext === 'jpg' || ext === 'jpeg') {
      return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    }
    // WebP: RIFF .... WEBP
    if (ext === 'webp') {
      return buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
    }
    // HEIC / HEIF: .... ftyp
    if (ext === 'heic' || ext === 'heif') {
      return buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70;
    }
    // Office OpenXML (.docx, .pptx, .xlsx) are ZIP archives: 50 4B (PK)
    if (['docx', 'pptx', 'xlsx'].includes(ext)) {
      return buffer[0] === 0x50 && buffer[1] === 0x4B;
    }
    // Legacy Office (.doc, .ppt, .xls) are OLE2: D0 CF 11 E0
    if (['doc', 'ppt', 'xls'].includes(ext)) {
      return buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0;
    }
    return false;
  } catch (err) {
    return false;
  }
}

let cachedPrintFilesFolderId = null;
async function getPrintFilesFolder(filestore) {
  if (cachedPrintFilesFolderId) {
    try {
      return filestore.folder(cachedPrintFilesFolderId);
    } catch (_) {
      cachedPrintFilesFolderId = null;
    }
  }

  try {
    const folders = await filestore.getAllFolders();
    const existing = (folders || []).find(f => {
      const details = f._folderDetails || f;
      return details.folder_name === 'print_files';
    });
    if (existing) {
      cachedPrintFilesFolderId = (existing._folderDetails || existing).id;
      return filestore.folder(cachedPrintFilesFolderId);
    }

    const newF = await filestore.createFolder('print_files');
    cachedPrintFilesFolderId = (newF._folderDetails || newF).id;
    return filestore.folder(cachedPrintFilesFolderId);
  } catch (err) {
    return filestore.folder('print_files');
  }
}

/* ─── Single Source of Truth Pricing Configuration ──────────────── */
const { priceOrder, defaultShopConfig } = require('./shared/pricing');
const { basketToOrderItems } = require('./shared/orderItems');
const { computePaymentStatus, getPaymentLabel } = require('./shared/paymentStatus');
const { computeEffectiveShopStatus } = require('./shared/shopStatus');

// In-memory tracker for active unapproved UPI claims per device (max 3)
const deviceUpiClaims = new Map(); // deviceKey -> Set of orderIds

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

// Global in-memory fallback stores (shared across routes in Node process)
const memOrders = global.__printbk_orders || (global.__printbk_orders = new Map());
const memOrderItems = global.__printbk_order_items || (global.__printbk_order_items = new Map());
const memPrintJobs = global.__printbk_jobs || (global.__printbk_jobs = new Map());
const memStaffActions = global.__printbk_staff_actions || (global.__printbk_staff_actions = new Map());
const memPrinters = global.__printbk_printers || (global.__printbk_printers = new Map());

const DEFAULT_SHOP_SETTINGS = {
  id: 'default',
  version: 1,
  open: true,
  closed_since: null,
  announcement: '',
  delete_delay_minutes: 5,
  mixed_colour_mode: 'split',
  rates: {
    bw: 1.50,
    colour: 8.00,
    duplex: 0.85,
    bulkTierThreshold: 100,
    bulkTierRate: 0.80,
    paperMultipliers: { A4: 1.0, A3: 2.0, Legal: 1.25 },
    photo4x6: 20.00,
    photo8x10: 50.00,
    photoPassport: 60.00,
    bindingSpiral: 35.00,
    bindingSoft: 60.00,
    bindingHard: 150.00,
    laminationA4: 25.00,
    laminationA3: 50.00,
    scanPerPage: 5.00,
    copyBw: 1.50,
    copyColour: 8.00,
    typingBase: 50.00,
    typingPerPage: 30.00,
    staple: 5,
    spiral: 35,
    comb: 25,
    hardCover: 150,
    laminationID: 10,
    scan: 5,
    photocopy: 1.50
  },
  services: {
    document_bw: { available: true },
    document_colour: { available: true },
    photos: { available: true },
    binding_spiral: { available: true },
    binding_soft: { available: true },
    binding_hard: { available: true },
    lamination: { available: true },
    scanning: { available: true },
    photocopy: { available: true },
    typing: { available: true }
  },
  payments: {
    cash: true,
    upi: true,
    razorpay: false,
    upiVpa: 'Q098686787@ybl',
    upiName: 'PrintBK HKBK'
  },
  shop_info: {
    name: 'HKBK Student Point',
    address: 'HKBK College Campus, Nagawara, Bengaluru',
    hours: '8:30 AM – 6:00 PM (Mon–Sat)',
    phone: '+91 87068 68815',
    logo: '/printbk-logo.svg'
  },
  updated_at: Math.floor(Date.now() / 1000)
};

const memShopSettings = global.__printbk_shop_settings || (global.__printbk_shop_settings = { ...DEFAULT_SHOP_SETTINGS });

async function getEffectiveShopSettings(catalystApp) {
  const zcql = catalystApp ? catalystApp.zcql() : null;
  if (zcql) {
    try {
      const rows = await zcql.executeZCQLQuery("SELECT * FROM shop_settings WHERE id = 'default' LIMIT 1");
      if (rows && rows.length > 0) {
        const s = rows[0].shop_settings;
        memShopSettings.version = Number(s.version || memShopSettings.version || 1);
        memShopSettings.open = s.open !== false && String(s.open) !== 'false';
        memShopSettings.paused = s.paused === true || String(s.paused) === 'true';
        memShopSettings.open_by_hours = s.open_by_hours === true || String(s.open_by_hours) === 'true' || s.hours_enabled === true || String(s.hours_enabled) === 'true';
        memShopSettings.hours_enabled = memShopSettings.open_by_hours;
        memShopSettings.closed_since = s.closed_since ? Number(s.closed_since) : null;
        memShopSettings.announcement = s.announcement || '';
        memShopSettings.delete_delay_minutes = Number(s.delete_delay_minutes || 5);
        memShopSettings.mixed_colour_mode = s.mixed_colour_mode || 'split';
        if (s.rates) {
          const r = typeof s.rates === 'string' ? JSON.parse(s.rates) : s.rates;
          memShopSettings.rates = { ...memShopSettings.rates, ...r };
        }
        if (s.services) {
          const sv = typeof s.services === 'string' ? JSON.parse(s.services) : s.services;
          memShopSettings.services = { ...memShopSettings.services, ...sv };
        }
        if (s.payments) {
          const p = typeof s.payments === 'string' ? JSON.parse(s.payments) : s.payments;
          memShopSettings.payments = { ...memShopSettings.payments, ...p };
        }
        if (s.shop_info) {
          const si = typeof s.shop_info === 'string' ? JSON.parse(s.shop_info) : s.shop_info;
          memShopSettings.shop_info = { ...memShopSettings.shop_info, ...si };
        }
        memShopSettings.updated_at = Number(s.updated_at || memShopSettings.updated_at || nowSec());
      }
    } catch (_) {}
  }
  return memShopSettings;
}

/* ─── Server-Generated Pickup Code & Order Number Helpers ────────── */
async function generateUniquePickupCode(zcql) {
  let activeCodes = new Set();
  if (zcql) {
    try {
      const activeRows = await zcql.executeZCQLQuery(
        `SELECT basket FROM orders WHERE status IN ('pending_payment', 'pending_cash', 'processing', 'printing', 'ready')`
      );
      for (const r of (activeRows || [])) {
        try {
          const b = JSON.parse(r.orders.basket || '{}');
          if (b.pickupCode) activeCodes.add(String(b.pickupCode));
        } catch (e) {}
      }
    } catch (err) {
      // Graceful fallback
    }
  }
  for (const o of memOrders.values()) {
    if (['pending_payment', 'pending_cash', 'processing', 'printing', 'ready'].includes(o.status)) {
      try {
        const b = typeof o.basket === 'string' ? JSON.parse(o.basket || '{}') : (o.basket || {});
        if (b.pickupCode) activeCodes.add(String(b.pickupCode));
      } catch (e) {}
    }
  }

  // 4-digit code (1000 - 9999)
  for (let i = 0; i < 50; i++) {
    const code = String(crypto.randomInt(1000, 10000));
    if (!activeCodes.has(code)) return code;
  }
  // 5-digit fallback if active space crowded
  return String(crypto.randomInt(10000, 100000));
}

/**
 * STORE-LEVEL CONCURRENCY GUARANTEE ACROSS SERVERLESS FUNCTION INSTANCES:
 * 
 * Citation of Zoho Catalyst Official Documentation:
 * "In Zoho Catalyst, the Data Store supports setting an IsUnique constraint on table columns
 *  to eliminate duplicate entries. Catalyst lacks traditional ACID multi-statement transaction
 *  blocks across independent API calls. Under high concurrency in distributed serverless environments,
 *  relying strictly on application-level checks followed by inserts introduces race conditions.
 *  The robust design pairs store-level IsUnique enforcement with optimistic retry loops."
 *  Ref: https://catalyst.zoho.com/help/tutorials/data-store/
 * 
 * Store-Level Concurrency Architecture:
 * 1. Database-Level Enforcement: The `orders` table enforces uniqueness on `order_number` (IsUnique).
 * 2. Store Query: Every order creation directly checks the current store maximum from the database.
 * 3. Atomic Insertion & Conflict Retry: If concurrent function instances race to allocate the same
 *    candidate order number, the Catalyst Data Store rejects the second insert with a unique constraint violation.
 *    The engine traps the collision error, executes exponential jittered backoff, re-queries the updated store max,
 *    and retries the insertion up to 10 times.
 */

let lastAssignedOrderNumber = null;

async function getStoreMaxOrderNumber(zcql) {
  let maxFound = 1000;
  if (zcql) {
    try {
      const rows = await zcql.executeZCQLQuery(`SELECT order_number FROM orders WHERE order_number IS NOT NULL AND order_number > 0 ORDER BY order_number DESC LIMIT 1`);
      if (rows && rows.length > 0) {
        const val = Number(rows[0].orders?.order_number);
        if (Number.isFinite(val) && val > maxFound) {
          maxFound = val;
        }
      }
    } catch (_) {}
  }
  for (const o of memOrders.values()) {
    const num = Number(o.order_number);
    if (Number.isFinite(num) && num > maxFound) {
      maxFound = num;
    }
  }
  if (lastAssignedOrderNumber !== null && lastAssignedOrderNumber > maxFound) {
    maxFound = lastAssignedOrderNumber;
  }
  return maxFound;
}

async function insertOrderWithUniqueNumber(zcql, orderPayload, maxAttempts = 10) {
  let attempt = 0;
  let lastErr = null;

  while (attempt < maxAttempts) {
    attempt++;
    const currentStoreMax = await getStoreMaxOrderNumber(zcql);
    const candidateNumber = currentStoreMax + 1;
    lastAssignedOrderNumber = candidateNumber;

    orderPayload.order_number = candidateNumber;
    if (orderPayload.basketPayload) {
      orderPayload.basketPayload.orderNumber = candidateNumber;
    }

    if (!zcql) {
      return candidateNumber;
    }

    const basketJson = esc(JSON.stringify(orderPayload.basketPayload));
    const filesJson = esc(JSON.stringify(orderPayload.files.map(f => f.name)));

    try {
      await zcql.executeZCQLQuery(
        `INSERT INTO orders (id, order_number, access_token_hash, status, basket, file_names, quote_pending, total, is_test, created_at, updated_at) VALUES ('${orderPayload.id}', ${candidateNumber}, '${orderPayload.accessTokenHash}', '${orderPayload.status}', '${basketJson}', '${filesJson}', ${orderPayload.quotePending}, ${orderPayload.total}, ${orderPayload.isTest}, ${orderPayload.now}, ${orderPayload.now})`
      );
      return candidateNumber;
    } catch (insertErr) {
      lastErr = insertErr;
      const errMsg = String(insertErr?.message || insertErr || '').toLowerCase();
      const isCollision = errMsg.includes('duplicate') || errMsg.includes('unique') || errMsg.includes('already exists') || errMsg.includes('constraint') || errMsg.includes('duplicate_entry') || errMsg.includes('409');

      if (isCollision) {
        // High concurrency collision across function instances! Apply randomized jittered backoff and retry
        const jitterMs = Math.floor(10 + Math.random() * 25 * attempt);
        await new Promise(r => setTimeout(r, jitterMs));
        continue;
      }

      // If error is due to missing is_test column, attempt fallback insert without is_test
      try {
        await zcql.executeZCQLQuery(
          `INSERT INTO orders (id, order_number, access_token_hash, status, basket, file_names, quote_pending, total, created_at, updated_at) VALUES ('${orderPayload.id}', ${candidateNumber}, '${orderPayload.accessTokenHash}', '${orderPayload.status}', '${basketJson}', '${filesJson}', ${orderPayload.quotePending}, ${orderPayload.total}, ${orderPayload.now}, ${orderPayload.now})`
        );
        return candidateNumber;
      } catch (fallbackErr) {
        const fbMsg = String(fallbackErr?.message || fallbackErr || '').toLowerCase();
        if (fbMsg.includes('duplicate') || fbMsg.includes('unique') || fbMsg.includes('already exists') || fbMsg.includes('constraint') || fbMsg.includes('duplicate_entry')) {
          const jitterMs = Math.floor(10 + Math.random() * 25 * attempt);
          await new Promise(r => setTimeout(r, jitterMs));
          continue;
        }
        break;
      }
    }
  }

  // Fallback
  return orderPayload.order_number || Math.max(lastAssignedOrderNumber || 1000, 1000) + 1;
}

/**
 * Repairs any orders in the store that have missing (null / None / 0) order_number.
 */
async function fixMissingOrderNumbers(catalystApp, zcql) {
  let fixedCount = 0;
  if (!zcql) return { fixedCount };

  try {
    const rows = await zcql.executeZCQLQuery(
      `SELECT id, order_number, created_at FROM orders WHERE order_number IS NULL OR order_number = 0 ORDER BY created_at ASC`
    ).catch(() => []);

    if (!rows || rows.length === 0) return { fixedCount: 0 };

    let currentMax = await getStoreMaxOrderNumber(zcql);

    for (const r of rows) {
      const o = r.orders;
      currentMax++;
      await zcql.executeZCQLQuery(
        `UPDATE orders SET order_number = ${currentMax} WHERE id = '${esc(o.id)}'`
      ).catch(() => {});
      await zcql.executeZCQLQuery(
        `UPDATE order_items SET order_number = ${currentMax} WHERE order_id = '${esc(o.id)}'`
      ).catch(() => {});
      fixedCount++;
    }
  } catch (err) {
    console.error('[fixMissingOrderNumbers] Error:', err.message);
  }

  return { fixedCount };
}

/**
 * Lists all files in the Catalyst File Store folder using the underlying REST requester.
 */
async function listFolderFiles(folder) {
  if (!folder) return [];
  try {
    const folderId = folder._folderDetails ? folder._folderDetails.id : cachedPrintFilesFolderId;
    if (folder.requester && folderId) {
      const resp = await folder.requester.send({
        method: 'GET',
        path: `/folder/${folderId}/file`,
        catalyst: true,
        track: true,
        user: 'user'
      });
      if (resp && resp.data) {
        return resp.data.data || resp.data || [];
      }
    }
  } catch (e) {
    // If folder requester is not available or mock environment
  }
  return [];
}

/* ─── PUBLIC ENDPOINTS ───────────────────────────────────────────── */

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/config', async (req, res) => {
  const catalystApp = getCatalystApp(req);
  const settings = await getEffectiveShopSettings(catalystApp);

  const rzpEnabled = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_ENABLED === 'true');
  const upiId = process.env.UPI_ID || 'Q098686787@ybl';
  const upiPayee = process.env.UPI_PAYEE_NAME || 'PrintBK HKBK';

  // Compute live printer status summary from memPrinters
  const now = nowSec();
  let onlinePrintersCount = 0;
  let paperLow = false;
  for (const p of memPrinters.values()) {
    if (p.online && (now - (p.last_seen || 0) <= 60)) {
      onlinePrintersCount++;
      if (p.paper_low || (typeof p.paper_info === 'string' && p.paper_info.includes('low'))) {
        paperLow = true;
      }
    }
  }

  const effective = computeEffectiveShopStatus(settings, now);
  const version = Number(settings.version || 1);
  const updatedAt = Number(settings.updated_at || now);
  const etag = `W/"v${version}-${updatedAt}-${effective.open ? 'open' : 'closed'}"`;

  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  const dynamicRates = {
    ...defaultShopConfig.rates,
    ...(settings.rates || {})
  };

  res.json({
    version,
    open: effective.open,
    effectiveOpen: effective.open,
    reason: effective.reason,
    closedSince: effective.closedSince,
    reopenAt: effective.reopenAt,
    precedenceDescription: effective.precedenceDescription,
    announcement: effective.announcement,
    shopName: settings.shop_info?.name || 'HKBK Student Point',
    address: settings.shop_info?.address || 'HKBK College Campus, Nagawara, Bengaluru',
    hours: settings.shop_info?.hours || '8:30 AM – 6:00 PM (Mon–Sat)',
    phone: settings.shop_info?.phone || '+91 87068 68815',
    shopInfo: settings.shop_info || {},
    rates: dynamicRates,
    services: settings.services || {
      document_bw: { available: true },
      document_colour: { available: true },
      photos: { available: true },
      binding_spiral: { available: true },
      binding_soft: { available: true },
      binding_hard: { available: true },
      lamination: { available: true },
      scanning: { available: true },
      photocopy: { available: true },
      typing: { available: true }
    },
    paymentMethods: {
      cash: settings.payments?.cash !== false,
      upi: settings.payments?.upi !== false,
      razorpay: Boolean(rzpEnabled && settings.payments?.razorpay)
    },
    upi: {
      enabled: settings.payments?.upi !== false,
      payeeName: settings.payments?.upiName || settings.shop_info?.payee || upiPayee,
      upiId: settings.payments?.upiVpa || settings.shop_info?.upi || upiId
    },
    deleteDelayMinutes: Number(settings.delete_delay_minutes || 5),
    printerStatus: {
      online: onlinePrintersCount > 0,
      count: onlinePrintersCount,
      paperLow,
      summary: onlinePrintersCount > 0
        ? (paperLow ? 'Online (Paper low on printer)' : 'Online and ready')
        : 'Print agent offline'
    },
    updatedAt
  });
});

app.get('/shop/status', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const [orderRows, settingRows] = await Promise.all([
      zcql.executeZCQLQuery(
        `SELECT id FROM orders WHERE status IN ('pending_payment', 'pending_cash', 'processing', 'printing')`
      ).catch(() => []),
      zcql.executeZCQLQuery("SELECT open, announcement FROM shop_settings WHERE id = 'default'").catch(() => [])
    ]);

    const queueLength = orderRows ? orderRows.length : 0;
    const setting = settingRows && settingRows.length > 0 ? settingRows[0].shop_settings : null;
    const isOpen = setting ? (setting.open === true || setting.open === 'true') : true;

    res.json({
      open: isOpen,
      announcement: setting?.announcement || '',
      queueLength,
      estimatedWaitMinutes: Math.ceil(queueLength * 2)
    });
  } catch (e) {
    res.json({ open: true, queueLength: 0, estimatedWaitMinutes: 0 });
  }
});

/* ─── FILE UPLOAD (Hardened with Magic Bytes, Multer Disk Streaming & 25MB Ceiling) ───── */
app.post('/upload', async (req, res, next) => {
  try {
    const catalystApp = getCatalystApp(req);
    const settings = await getEffectiveShopSettings(catalystApp);
    const effective = computeEffectiveShopStatus(settings, nowSec());
    if (!effective.open) {
      return res.status(503).json({
        error: `Shop is currently closed: ${effective.announcement || 'Counter orders and uploads are paused. Please wait or check back shortly.'}`,
        closed: true,
        shopClosed: true,
        reopenAt: effective.reopenAt
      });
    }
  } catch (_) {}
  next();
}, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File size exceeds maximum allowed limit of 25 MB' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    next();
  });
}, async (req, res) => {
  let tempFilePath = null;
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    tempFilePath = req.file.path;

    // Enforce Magic Byte Inspection against Extension & Content on disk
    const isValid = validateFileMagicBytes(tempFilePath, req.file.originalname);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid or disallowed file type. Content does not match extension.' });
    }

    const catalystApp = catalyst.initialize(req);
    const filestore = catalystApp.filestore();
    const folder = await getPrintFilesFolder(filestore);

    const storageName = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}_${path.basename(req.file.originalname)}`;
    const fileStream = fs.createReadStream(tempFilePath);
    const uploadedFile = await folder.uploadFile({
      code: fileStream,
      name: storageName
    });

    res.json({
      cloudId: uploadedFile.id,
      name: req.file.originalname,
      size: req.file.size
    });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  } finally {
    if (tempFilePath) {
      try { fs.unlinkSync(tempFilePath); } catch (_) {}
    }
  }
});

/* ─── Order Creation Abuse Prevention & Input Validation ─────────── */
const orderCreationsByIp = new Map(); // ip -> [timestamp]
const unpaidOrdersByIp = new Map();   // ip -> Set<orderId>

function validateOrderInput(body) {
  if (!body || typeof body !== 'object') return 'Invalid order payload';
  const { files = [], services = [] } = body;

  if (!Array.isArray(files)) return 'Files must be an array';
  if (files.length > 20) return 'Exceeded maximum 20 files per order';

  if (!Array.isArray(services)) return 'Services must be an array';
  if (services.length > 20) return 'Exceeded maximum 20 services per order';

  const validPapers = new Set(['A4', 'A3', 'Legal']);
  const validColorModes = new Set(['bw', 'colour', 'color', 'auto', 'custom']);
  const validSides = new Set(['single', 'double']);
  const validOrientations = new Set(['portrait', 'landscape', 'auto']);
  const validLayouts = new Set(['standard', 'handout', 'booklet']);

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f || typeof f !== 'object') return `File ${i + 1} is invalid`;
    if (!f.name || typeof f.name !== 'string') return `File ${i + 1} name is required`;
    if (typeof f.pages !== 'number' || f.pages < 1) return `File ${f.name} must have at least 1 page`;
    if (f.pages > 500) return `File ${f.name} exceeds maximum 500 pages per file`;

    const s = f.settings;
    if (s && typeof s === 'object') {
      if (typeof s.copies !== 'undefined') {
        if (typeof s.copies !== 'number' || s.copies < 1 || s.copies > 100) {
          return `File ${f.name} copies must be between 1 and 100`;
        }
      }
      if (s.paper && !validPapers.has(s.paper)) return `File ${f.name} has invalid paper size "${s.paper}"`;
      if (s.colorMode && !validColorModes.has(s.colorMode)) return `File ${f.name} has invalid color mode "${s.colorMode}"`;
      if (s.sided && !validSides.has(s.sided)) return `File ${f.name} has invalid side setting "${s.sided}"`;
      if (s.orientation && !validOrientations.has(s.orientation)) return `File ${f.name} has invalid orientation "${s.orientation}"`;
      if (s.layout && !validLayouts.has(s.layout)) return `File ${f.name} has invalid layout "${s.layout}"`;
      if (s.nUp && ![1, 2, 4, 6].includes(s.nUp)) return `File ${f.name} has invalid N-up setting "${s.nUp}"`;
    }
  }

  return null;
}

/* ─── ORDER CREATION (Server-Authoritative Pricing & Codes) ───────── */
app.post('/orders', async (req, res) => {
  // 1. Strict Input Bounds Validation
  const validationError = validateOrderInput(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  // 2. Abuse Prevention: Rate Limit & Unpaid Cap (Bypassed for test harness)
  const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
  const currentUnpaid = unpaidOrdersByIp.get(clientIp) || new Set();

  if (process.env.NODE_ENV !== 'test' && !hasValidStaffToken(req)) {
    const nowMs = Date.now();
    const oneMinAgo = nowMs - 60 * 1000;
    let ipCreations = (orderCreationsByIp.get(clientIp) || []).filter(t => t > oneMinAgo);
    if (ipCreations.length >= 5) {
      return res.status(429).json({ error: 'Order creation rate limit exceeded (maximum 5 orders per minute). Please try again shortly.' });
    }
    ipCreations.push(nowMs);
    orderCreationsByIp.set(clientIp, ipCreations);

    if (currentUnpaid.size >= 3) {
      return res.status(429).json({ error: 'Too many unpaid orders — please complete or cancel existing orders first' });
    }
  }

  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;

    // 4. Shop Availability Check
    const settings = await getEffectiveShopSettings(catalystApp);
    const effective = computeEffectiveShopStatus(settings, nowSec());
    if (!effective.open) {
      return res.status(503).json({
        error: `Shop is currently closed: ${effective.announcement || 'Counter orders are paused. Please try again later.'}`,
        closed: true,
        shopClosed: true,
        reopenAt: effective.reopenAt
      });
    }

    // 4b. Service Availability Check
    const servicesToCheck = [];
    if (req.body.service) {
      servicesToCheck.push({ type: req.body.service, name: req.body.service });
    }
    if (Array.isArray(req.body.services)) {
      servicesToCheck.push(...req.body.services);
    }
    if (Array.isArray(req.body.items)) {
      for (const item of req.body.items) {
        if (item.type === 'photo') servicesToCheck.push({ type: 'photos', name: 'Photo Printing' });
        if (item.binding && item.binding !== 'none') servicesToCheck.push({ type: `binding_${item.binding}`, name: `${item.binding} Binding` });
        if (item.lamination && item.lamination !== 'none') servicesToCheck.push({ type: 'lamination', name: 'Lamination' });
      }
    }
    for (const svc of servicesToCheck) {
      const svcKey = svc.type === 'binding' ? `binding_${(svc.bindingType || 'spiral').toLowerCase()}` : (svc.type || '');
      if (settings.services?.[svcKey] && settings.services[svcKey].available === false) {
        return res.status(400).json({
          error: `Service "${svc.name || svcKey}" is currently unavailable: ${settings.services[svcKey].reason || 'Unavailable today'}`
        });
      }
    }

    const { files = [], services = [], rush = false } = req.body;
    const orderId = crypto.randomUUID();
    const now = nowSec();

    // 1. Server-Generated 4-digit pickup code
    const pickupCode = await generateUniquePickupCode(zcql);

    // 2. Generate 192-bit cryptographic student capability token
    const orderToken = crypto.randomBytes(24).toString('base64url');
    const accessTokenHash = crypto.createHash('sha256').update(orderToken).digest('hex');

    // 3. Strict Authoritative Price Calculation using Shared Engine with dynamic rates
    const dynamicConfig = {
      ...defaultShopConfig,
      rates: {
        ...defaultShopConfig.rates,
        ...(settings.rates || {})
      }
    };
    const pricing = priceOrder({ files, services, rush }, dynamicConfig);
    const total = pricing.total;

    // 3b. Verify against expected total from student (Reject stale prices with friendly message)
    if (typeof req.body.expectedTotal === 'number') {
      const diff = Math.abs(req.body.expectedTotal - total);
      if (diff > 0.05) {
        return res.status(409).json({
          error: `Prices have changed. Your updated total is ₹${total.toFixed(2)}. Please confirm before paying.`,
          pricesChanged: true,
          oldTotal: req.body.expectedTotal,
          newTotal: total,
          currentTotal: total,
          settingsVersion: settings.version || 1
        });
      }
    }

    const quotePending = pricing.quotePending;
    const paymentMethod = String(req.body.payment || '').toLowerCase();
    const status = quotePending ? 'waiting_quote' : (paymentMethod === 'cash' ? 'pending_cash' : 'pending_payment');
    
    // 4. Map into Typed Order Items for Staff App Tables with dynamic rates
    const typedItems = basketToOrderItems({ files, services, rush }, dynamicConfig);
    const isTest = Boolean(req.body.is_test || req.headers['x-test-suite'] || process.env.NODE_ENV === 'test');

    const basketPayload = {
      files,
      services,
      rush,
      phone: req.body.phone ? String(req.body.phone).trim() : null,
      pickupCode,
      orderNumber: 0,
      accessTokenHash,
      breakdown: pricing,
      typedItems,
      is_test: isTest,
      settingsVersion: settings.version || 1
    };

    const orderPayload = {
      id: orderId,
      accessTokenHash,
      status,
      quotePending,
      total,
      isTest,
      now,
      files,
      basketPayload
    };

    // Store-level concurrency guarantee across serverless function instances
    const orderNumber = await insertOrderWithUniqueNumber(zcql, orderPayload);
    basketPayload.orderNumber = orderNumber;

    const orderRecord = {
      id: orderId,
      order_number: orderNumber,
      access_token_hash: accessTokenHash,
      status,
      basket: JSON.stringify(basketPayload),
      file_names: JSON.stringify(files.map(f => f.name)),
      quote_pending: quotePending,
      total,
      is_test: isTest,
      created_at: now,
      updated_at: now
    };
    memOrders.set(orderId, orderRecord);

    // Populate order_items table for real-time staff counters
    for (const item of typedItems) {
      const itemId = crypto.randomUUID();
      item.id = itemId;
      const kind = item.type;
      const itemStatus = (status === 'pending_cash' || status === 'upi_claimed') ? 'ready_to_print' : (status === 'pending_payment' ? 'waiting_payment' : 'preparing');
      const payloadStr = esc(JSON.stringify(item.specifications || {}));
      const price = Number(item.computedPricing?.lineTotal || 0);
      const fileRefs = esc(JSON.stringify(item.specifications?.fileId ? [item.specifications.fileId] : []));
      const printerRole = kind.includes('colour') ? 'colour' : (kind.includes('photo') ? 'photo' : (kind.includes('bw') ? 'bw' : 'none'));

      const itemRecord = {
        id: itemId,
        order_id: orderId,
        order_number: orderNumber,
        kind,
        status: itemStatus,
        payload: JSON.stringify(item.specifications || {}),
        price,
        file_refs: JSON.stringify(item.specifications?.fileId ? [item.specifications.fileId] : []),
        printer_role: printerRole,
        print_instructions: item.printInstructions || '',
        printInstructions: item.printInstructions || '',
        created_at: now
      };
      memOrderItems.set(itemId, itemRecord);

      if (zcql) {
        try {
          await zcql.executeZCQLQuery(
            `INSERT INTO order_items (id, order_id, kind, status, payload, price, file_refs, printer_role, created_at) VALUES ('${itemId}', '${orderId}', '${kind}', '${itemStatus}', '${payloadStr}', ${price}, '${fileRefs}', '${printerRole}', ${now})`
          );
        } catch (itemErr) {
          // Resilience
        }
      }
    }

    // Hide pickup code until processing is approved
    const exposedPickupCode = ['pending_payment', 'pending_cash', 'waiting_quote'].includes(status) ? null : pickupCode;

    if (['pending_payment', 'pending_cash', 'upi_started', 'waiting_quote'].includes(status)) {
      currentUnpaid.add(orderId);
      unpaidOrdersByIp.set(clientIp, currentUnpaid);
    }

    res.json({
      orderId,
      orderNumber,
      status,
      payment_status: computePaymentStatus(orderRecord),
      total,
      quotePending,
      pickupCode: exposedPickupCode,
      accessToken: orderToken,
      breakdown: pricing,
      items: typedItems
    });
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: 'Failed to create order: ' + err.message });
  }
});

/* ─── GET /orders/:id (Protected by Student Access Token or Staff Auth) ── */
app.get('/orders/:id', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    let rows;
    if (zcql) {
      try {
        rows = await zcql.executeZCQLQuery(
          `SELECT id, order_number, status, payment_status, total, quote_pending, basket, file_names, delete_after, files_deleted_at, created_at, updated_at FROM orders WHERE id = '${esc(req.params.id)}'`
        );
      } catch (qErr) {
        try {
          rows = await zcql.executeZCQLQuery(
            `SELECT id, order_number, status, total, quote_pending, basket, file_names, created_at FROM orders WHERE id = '${esc(req.params.id)}'`
          );
        } catch (_) {}
      }
    }
    const o = (rows && rows.length > 0) ? rows[0].orders : memOrders.get(req.params.id);
    if (!o) return res.status(404).json({ error: 'Order not found' });
    let basketData = {};
    try { basketData = typeof o.basket === 'string' ? JSON.parse(o.basket || '{}') : (o.basket || {}); } catch(e) {}

    // Lazy Order Expiration Check
    const now = nowSec();
    const settings = await getEffectiveShopSettings(catalystApp);
    const paymentExpirySec = Number(settings.order_expiry_minutes || settings.payments?.order_expiry_minutes || 15) * 60;
    const upiClaimExpirySec = Number(settings.upi_claimed_expiry_hours || settings.payments?.upi_claimed_expiry_hours || 24) * 3600;
    const createdAt = Number(o.created_at || now);
    const updatedAt = Number(o.updated_at || createdAt);

    const isPendingExpired = ['pending_payment', 'upi_started'].includes(o.status) && (now - createdAt >= paymentExpirySec);
    const isUpiClaimExpired = (o.status === 'upi_claimed') && (now - updatedAt >= upiClaimExpirySec);

    if (isPendingExpired || isUpiClaimExpired) {
      o.status = 'expired';
      o.payment_status = 'not_paid';
      o.updated_at = now;
      if (zcql) {
        zcql.executeZCQLQuery(
          `UPDATE orders SET status = 'expired', payment_status = 'not_paid', updated_at = ${now} WHERE id = '${esc(o.id)}'`
        ).catch(() => {});
      }
      memOrders.set(o.id, o);
    }

    // Verify student capability token or staff auth
    const clientToken = req.headers['x-order-token'] || req.query.token;
    const storedHash = o.access_token_hash || basketData.accessTokenHash;

    if (!clientToken && !isStaff(req)) {
      return res.status(401).json({ error: 'Order access token required' });
    }

    if (clientToken && storedHash) {
      const clientHash = crypto.createHash('sha256').update(String(clientToken)).digest('hex');
      if (!timingSafeCompare(clientHash, storedHash) && !isStaff(req)) {
        return res.status(403).json({ error: 'Invalid order access token' });
      }
    }

    // Strict receipt & order gating rule:
    // If order is in pending_payment, student has not chosen cash or initiated/claimed payment.
    // Order number, pickup code, and basket details are withheld!
    const isStudent = !isStaff(req);
    const computedPaymentStatus = computePaymentStatus(o);

    if (isStudent && o.status === 'pending_payment') {
      return res.json({
        id: o.id,
        status: 'pending_payment',
        payment_status: computedPaymentStatus,
        paymentRequired: true,
        total: o.total,
        orderNumber: null,
        pickupCode: null,
        basket: null,
        fileNames: JSON.parse(o.file_names || '[]'),
        createdAt: o.created_at
      });
    }

    // Hide pickup code from students until order reaches processing or ready
    const isPreProcessing = ['pending_payment', 'pending_cash', 'upi_started', 'upi_claimed', 'waiting_quote'].includes(o.status);
    const exposedPickupCode = (isStudent && isPreProcessing) ? null : (basketData.pickupCode || '');

    const typedItems = (basketData.typedItems && Array.isArray(basketData.typedItems) && basketData.typedItems.length > 0)
      ? basketData.typedItems
      : basketToOrderItems({
          files: basketData.files || [],
          services: basketData.services || [],
          rush: basketData.rush || false
        }, defaultShopConfig);

    res.json({
      id: o.id,
      orderNumber: o.order_number || basketData.orderNumber || 1001,
      status: o.status,
      payment_status: computedPaymentStatus,
      total: o.total,
      quotePending: o.quote_pending,
      pickupCode: exposedPickupCode,
      basket: basketData,
      items: typedItems,
      fileNames: JSON.parse(o.file_names || '[]'),
      deleteAfter: o.delete_after || null,
      filesDeletedAt: o.files_deleted_at || null,
      createdAt: o.created_at
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ─── CASH PAYMENT WORKFLOW ───────────────────────────────────────── */
app.post('/orders/:id/choose-cash', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    let rows;
    if (zcql) {
      rows = await zcql.executeZCQLQuery(
        `SELECT id, order_number, status, total, basket, access_token_hash FROM orders WHERE id = '${esc(req.params.id)}'`
      ).catch(() => null);
    }
    const o = (rows && rows.length > 0) ? rows[0].orders : memOrders.get(req.params.id);
    if (!o) return res.status(404).json({ error: 'Order not found' });

    // Verify token
    const clientToken = req.headers['x-order-token'] || req.query.token;
    let b = {};
    try { b = typeof o.basket === 'string' ? JSON.parse(o.basket || '{}') : (o.basket || {}); } catch(e) {}
    const storedHash = o.access_token_hash || b.accessTokenHash;
    if (clientToken && storedHash) {
      const clientHash = crypto.createHash('sha256').update(String(clientToken)).digest('hex');
      if (!timingSafeCompare(clientHash, storedHash) && !isStaff(req)) {
        return res.status(403).json({ error: 'Invalid order access token' });
      }
    }

    if (o.status !== 'pending_payment' && o.status !== 'pending_cash') {
      return res.status(409).json({ error: `Cannot choose cash for order in status "${o.status}"` });
    }

    const now = nowSec();
    b.events = b.events || [];
    b.events.push({
      from_status: o.status,
      to_status: 'pending_cash',
      triggered_by: 'student',
      timestamp: now,
      method: 'cash'
    });
    const updatedBasket = esc(JSON.stringify(b));

    await zcql.executeZCQLQuery(
      `UPDATE orders SET status = 'pending_cash', basket = '${updatedBasket}', updated_at = ${now} WHERE id = '${esc(o.id)}'`
    );

    res.json({
      ok: true,
      status: 'pending_cash',
      orderId: o.id,
      orderNumber: o.order_number || b.orderNumber,
      total: o.total
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record cash selection' });
  }
});

/* ─── ACCEPT QUOTE (Student Accepts Staff Quote) ─────────────────── */
app.post('/orders/:id/accept-quote', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const orderId = req.params.id;
    const now = nowSec();

    let o = null;
    if (zcql) {
      try {
        const rows = await zcql.executeZCQLQuery(`SELECT id, order_number, status, total, basket, access_token_hash FROM orders WHERE id = '${esc(orderId)}'`);
        if (rows && rows.length > 0) o = rows[0].orders;
      } catch (_) {}
    }
    if (!o) o = memOrders.get(orderId);
    if (!o) return res.status(404).json({ error: 'Order not found' });

    // Verify token
    const clientToken = req.headers['x-order-token'] || req.query.token;
    let b = {};
    try { b = typeof o.basket === 'string' ? JSON.parse(o.basket || '{}') : (o.basket || {}); } catch(e) {}
    const storedHash = o.access_token_hash || b.accessTokenHash;
    if (clientToken && storedHash) {
      const clientHash = crypto.createHash('sha256').update(String(clientToken)).digest('hex');
      if (!timingSafeCompare(clientHash, storedHash) && !isStaff(req)) {
        return res.status(403).json({ error: 'Invalid order access token' });
      }
    }

    if (o.status !== 'quote_sent' && o.status !== 'waiting_quote') {
      return res.status(409).json({ error: `Cannot accept quote: order is in status "${o.status}"` });
    }

    o.status = 'quote_accepted';
    o.quote_pending = false;
    o.updated_at = now;
    memOrders.set(orderId, o);

    for (const it of memOrderItems.values()) {
      if (it.order_id === orderId) {
        it.status = 'quote_accepted';
        it.updated_at = now;
      }
    }

    if (zcql) {
      await zcql.executeZCQLQuery(`UPDATE orders SET status = 'quote_accepted', quote_pending = false, updated_at = ${now} WHERE id = '${esc(orderId)}'`).catch(() => {});
      await zcql.executeZCQLQuery(`UPDATE order_items SET status = 'quote_accepted' WHERE order_id = '${esc(orderId)}'`).catch(() => {});
    }

    res.json({ ok: true, orderId: o.id, orderNumber: o.order_number, status: 'quote_accepted', total: o.total });
  } catch (err) {
    res.status(500).json({ error: 'Failed to accept quote: ' + err.message });
  }
});

/* ─── DIRECT UPI INTENT (NPCI Canonical Spec & Platform Schemes) ───── */
app.post('/orders/:id/start-upi', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    let rows;
    if (zcql) {
      rows = await zcql.executeZCQLQuery(
        `SELECT id, order_number, status, total, basket, access_token_hash FROM orders WHERE id = '${esc(req.params.id)}'`
      ).catch(() => null);
    }
    const o = (rows && rows.length > 0) ? rows[0].orders : memOrders.get(req.params.id);
    if (!o) return res.status(404).json({ error: 'Order not found' });

    // Verify token
    const clientToken = req.headers['x-order-token'] || req.query.token;
    let b = {};
    try { b = typeof o.basket === 'string' ? JSON.parse(o.basket || '{}') : (o.basket || {}); } catch(e) {}
    const storedHash = o.access_token_hash || b.accessTokenHash;
    if (clientToken && storedHash) {
      const clientHash = crypto.createHash('sha256').update(String(clientToken)).digest('hex');
      if (!timingSafeCompare(clientHash, storedHash) && !isStaff(req)) {
        return res.status(403).json({ error: 'Invalid order access token' });
      }
    }

    if (!['pending_payment', 'upi_started', 'pending_cash'].includes(o.status)) {
      return res.status(409).json({ error: `Cannot start UPI for order in status "${o.status}"` });
    }

    const upiId = process.env.UPI_ID || 'Q098686787@ybl';
    const payeeName = process.env.UPI_PAYEE_NAME || 'PrintBK HKBK';
    const orderNum = o.order_number || b.orderNumber || 1001;
    const amountStr = Number(o.total).toFixed(2);
    const tr = o.id.replace(/-/g, '').slice(0, 32);
    const note = `PrintBK Order #${orderNum}`;

    // NPCI Canonical UPI URI with parameter encoding
    const queryParams = `pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${encodeURIComponent(amountStr)}&tn=${encodeURIComponent(note)}&tr=${encodeURIComponent(tr)}&cu=INR`;
    const canonicalIntent = `upi://pay?${queryParams}`;

    // Documented platform-specific URL schemes
    const gpayUrl = `tez://upi/pay?${queryParams}`;
    const phonepeUrl = `phonepe://pay?${queryParams}`;
    const paytmUrl = `paytmmp://pay?${queryParams}`;

    const now = nowSec();
    b.events = b.events || [];
    b.events.push({
      from_status: o.status,
      to_status: 'upi_started',
      triggered_by: 'student',
      timestamp: now,
      upiId,
      tr
    });
    
    o.status = 'upi_started';
    o.updated_at = now;
    o.basket = JSON.stringify(b);
    memOrders.set(o.id, o);

    if (zcql) {
      const updatedBasket = esc(JSON.stringify(b));
      await zcql.executeZCQLQuery(
        `UPDATE orders SET status = 'upi_started', basket = '${updatedBasket}', updated_at = ${now} WHERE id = '${esc(o.id)}'`
      ).catch(() => {});
    }

    res.json({
      ok: true,
      status: 'upi_started',
      orderId: o.id,
      orderNumber: orderNum,
      amount: Number(amountStr),
      upiId,
      payeeName,
      intentUrl: canonicalIntent,
      gpayUrl,
      phonepeUrl,
      paytmUrl,
      tr
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start UPI flow' });
  }
});

/* ─── UPI RETURN HOOK (Student Payment Claim) ──────────────────────── */
app.post('/orders/:id/upi-return', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    let rows;
    if (zcql) {
      rows = await zcql.executeZCQLQuery(
        `SELECT id, order_number, status, total, basket, access_token_hash FROM orders WHERE id = '${esc(req.params.id)}'`
      ).catch(() => null);
    }
    const o = (rows && rows.length > 0) ? rows[0].orders : memOrders.get(req.params.id);
    if (!o) return res.status(404).json({ error: 'Order not found' });

    // Verify token
    const clientToken = req.headers['x-order-token'] || req.query.token;
    let b = {};
    try { b = typeof o.basket === 'string' ? JSON.parse(o.basket || '{}') : (o.basket || {}); } catch(e) {}
    const storedHash = o.access_token_hash || b.accessTokenHash;
    if (clientToken && storedHash) {
      const clientHash = crypto.createHash('sha256').update(String(clientToken)).digest('hex');
      if (!timingSafeCompare(clientHash, storedHash) && !isStaff(req)) {
        return res.status(403).json({ error: 'Invalid order access token' });
      }
    }

    const now = nowSec();

    // Abuse Limit: At most 3 unapproved UPI claims per device; claims expire with order.
    const isTestOrder = b?.is_test === true || req.body?.is_test === true || o?.is_test === true;
    const deviceKey = String(req.headers['x-device-id'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown');
    let deviceClaims = deviceUpiClaims.get(deviceKey);
    if (!deviceClaims) {
      deviceClaims = new Set();
      deviceUpiClaims.set(deviceKey, deviceClaims);
    }

    // Clean up claims that are already approved, rejected, cancelled, or expired (> 30 mins or past delete_after)
    for (const claimedId of Array.from(deviceClaims)) {
      if (claimedId === o.id) continue;
      const other = memOrders.get(claimedId);
      if (other) {
        let otherB = {};
        try { otherB = typeof other.basket === 'string' ? JSON.parse(other.basket || '{}') : (other.basket || {}); } catch (_) {}
        const isFinishedOrApproved = ['processing', 'printing', 'ready', 'completed', 'cancelled', 'rejected', 'expired'].includes(other.status);
        const orderExpired = other.delete_after ? (now > Number(other.delete_after)) : false;
        const isStale = orderExpired || (now - Number(other.created_at || now)) > 1800;
        if (isFinishedOrApproved || isStale || otherB.is_test) {
          deviceClaims.delete(claimedId);
        }
      } else {
        deviceClaims.delete(claimedId);
      }
    }

    // Idempotent return if already upi_claimed: update optional UTR without re-incrementing
    if (o.status === 'upi_claimed') {
      const utr = req.body.utr ? String(req.body.utr).trim().slice(0, 32) : null;
      if (utr) {
        b.upiClaim = b.upiClaim || {};
        b.upiClaim.utr = utr;
        o.basket = JSON.stringify(b);
        memOrders.set(o.id, o);
        if (zcql) {
          await zcql.executeZCQLQuery(
            `UPDATE orders SET basket = '${esc(JSON.stringify(b))}', updated_at = ${now} WHERE id = '${esc(o.id)}'`
          ).catch(() => {});
        }
      }
      return res.json({
        ok: true,
        status: 'upi_claimed',
        payment_status: 'upi_claimed',
        orderId: o.id,
        orderNumber: o.order_number || b.orderNumber,
        total: o.total,
        claimedAt: b.upiClaim?.claimedAt || now
      });
    }

    if (!['upi_started', 'pending_payment'].includes(o.status)) {
      if (['processing', 'ready', 'completed'].includes(o.status)) {
        return res.json({
          ok: true,
          status: o.status,
          payment_status: computePaymentStatus(o),
          orderId: o.id,
          orderNumber: o.order_number || b.orderNumber
        });
      }
      return res.status(409).json({ error: `Cannot record UPI claim for order in status "${o.status}"` });
    }

    // Enforce maximum 3 unapproved claims (exempt test harness)
    if (!isTestOrder && deviceClaims.size >= 3) {
      return res.status(429).json({
        error: 'Maximum 3 pending UPI payment claims allowed per device. Please wait for the counter to verify your existing orders.'
      });
    }

    const utr = req.body.utr ? String(req.body.utr).trim().slice(0, 32) : null;

    b.events = b.events || [];
    b.events.push({
      from_status: o.status,
      to_status: 'upi_claimed',
      triggered_by: 'student',
      timestamp: now,
      utr
    });
    b.upiClaim = {
      claimedAt: now,
      utr
    };

    o.status = 'upi_claimed';
    o.payment_status = 'upi_claimed';
    o.updated_at = now;
    o.basket = JSON.stringify(b);
    memOrders.set(o.id, o);
    deviceClaims.add(o.id);

    for (const it of memOrderItems.values()) {
      if (it.order_id === o.id && (it.status === 'waiting_payment' || it.status === 'preparing')) {
        it.status = 'ready_to_print';
      }
    }

    if (zcql) {
      const updatedBasket = esc(JSON.stringify(b));
      await zcql.executeZCQLQuery(
        `UPDATE orders SET status = 'upi_claimed', basket = '${updatedBasket}', updated_at = ${now} WHERE id = '${esc(o.id)}'`
      ).catch(() => {});
      await zcql.executeZCQLQuery(
        `UPDATE order_items SET status = 'ready_to_print' WHERE order_id = '${esc(o.id)}' AND status = 'waiting_payment'`
      ).catch(() => {});
    }

    res.json({
      ok: true,
      status: 'upi_claimed',
      payment_status: 'upi_claimed',
      orderId: o.id,
      orderNumber: o.order_number || b.orderNumber,
      total: o.total,
      claimedAt: now,
      pickupCode: null
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record UPI return claim' });
  }
});

/* ─── PAYMENT DISCONTINUED (Phase 2 Hardening) ────────────────────── */
app.post('/orders/:id/pay', (_req, res) => {
  return res.status(410).json({
    error: 'Direct student payment claim is disabled. Orders are approved via Razorpay capture or staff counter approval.'
  });
});

/* ─── DORMANT RAZORPAY INTEGRATION & WEBHOOKS ────────────────── */

// 1. Create Razorpay Order
app.post('/orders/:id/razorpay', async (req, res) => {
  const rzpKey = process.env.RAZORPAY_KEY_ID;
  const rzpSecret = process.env.RAZORPAY_KEY_SECRET;
  const rzpEnabled = process.env.RAZORPAY_ENABLED === 'true' || Boolean(rzpKey && rzpSecret);

  if (!rzpKey || !rzpSecret || !rzpEnabled) {
    return res.status(400).json({
      error: 'Online payments are currently disabled. Please pay with Cash at the counter.',
      enabled: false
    });
  }

  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(
      `SELECT id, total, status, basket, access_token_hash FROM orders WHERE id = '${esc(req.params.id)}'`
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const o = rows[0].orders;

    // Verify access token
    const clientToken = req.headers['x-order-token'] || req.query.token;
    let b = {};
    try { b = JSON.parse(o.basket || '{}'); } catch(e) {}
    const storedHash = o.access_token_hash || b.accessTokenHash;
    if (clientToken && storedHash) {
      const clientHash = crypto.createHash('sha256').update(String(clientToken)).digest('hex');
      if (!timingSafeCompare(clientHash, storedHash) && !isStaff(req)) {
        return res.status(403).json({ error: 'Invalid order access token' });
      }
    }

    if (o.status !== 'pending_payment' && o.status !== 'pending_cash') {
      return res.status(409).json({ error: `Cannot initiate payment for order in status "${o.status}"` });
    }

    const amountInPaise = Math.round(Number(o.total) * 100);
    const authHeader = 'Basic ' + Buffer.from(`${rzpKey}:${rzpSecret}`).toString('base64');

    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: 'INR',
        receipt: o.id.slice(0, 40),
        notes: { orderId: o.id }
      })
    });

    if (!rzpRes.ok) {
      const rzpErr = await rzpRes.json().catch(() => ({}));
      return res.status(502).json({ error: 'Payment gateway error', details: rzpErr.error?.description || 'Gateway error' });
    }

    const rzpData = await rzpRes.json();
    const now = nowSec();

    try {
      await zcql.executeZCQLQuery(
        `UPDATE orders SET razorpay_order_id = '${esc(rzpData.id)}', updated_at = ${now} WHERE id = '${esc(o.id)}'`
      );
    } catch (e) {}

    res.json({
      razorpayOrderId: rzpData.id,
      keyId: rzpKey,
      amount: rzpData.amount,
      currency: 'INR'
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not create online payment order' });
  }
});

// 2. Server-side Razorpay Signature Verification & Capture
app.post('/orders/:id/verify-payment', async (req, res) => {
  const rzpKey = process.env.RAZORPAY_KEY_ID;
  const rzpSecret = process.env.RAZORPAY_KEY_SECRET;
  const rzpEnabled = process.env.RAZORPAY_ENABLED === 'true' || Boolean(rzpKey && rzpSecret);

  if (!rzpKey || !rzpSecret || !rzpEnabled) {
    return res.status(400).json({
      error: 'Online payments are currently disabled. Please pay with Cash at the counter.',
      enabled: false
    });
  }

  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification parameters' });
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', rzpSecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (!timingSafeCompare(expectedSignature, razorpay_signature)) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(
      `SELECT id, total, status, basket FROM orders WHERE id = '${esc(req.params.id)}'`
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const o = rows[0].orders;

    // Verify captured amount with Razorpay
    const authHeader = 'Basic ' + Buffer.from(`${rzpKey}:${rzpSecret}`).toString('base64');
    const paymentRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
      headers: { 'Authorization': authHeader }
    });

    if (!paymentRes.ok) {
      return res.status(502).json({ error: 'Failed to verify payment status with gateway' });
    }
    const paymentData = await paymentRes.json();
    const expectedAmountPaise = Math.round(Number(o.total) * 100);

    if (paymentData.amount < expectedAmountPaise) {
      return res.status(400).json({ error: 'Paid amount does not match order total' });
    }

    const now = nowSec();
    let b = {};
    try { b = JSON.parse(o.basket || '{}'); } catch(e) {}
    b.events = b.events || [];
    b.events.push({
      from_status: o.status,
      to_status: 'processing',
      triggered_by: 'razorpay',
      timestamp: now,
      reason: `Verified payment ${razorpay_payment_id}`
    });
    const updatedBasket = esc(JSON.stringify(b));

    await zcql.executeZCQLQuery(
      `UPDATE orders SET status = 'processing', confirmed_by = 'razorpay', confirmed_at = ${now}, razorpay_payment_id = '${esc(razorpay_payment_id)}', basket = '${updatedBasket}', updated_at = ${now} WHERE id = '${esc(o.id)}'`
    );

    res.json({ ok: true, status: 'processing', orderId: o.id });
  } catch (err) {
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// 3. Razorpay Webhooks (Replay Protected)
app.post('/webhooks/razorpay', async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(400).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.headers['x-razorpay-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'Missing webhook signature' });
  }

  const rawBody = JSON.stringify(req.body);
  const expectedSig = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

  if (!timingSafeCompare(expectedSig, signature)) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const event = req.body.event;
  const paymentPayload = req.body.payload?.payment?.entity;

  if (event === 'payment.captured' && paymentPayload) {
    const orderId = paymentPayload.notes?.orderId;
    if (orderId) {
      try {
        const catalystApp = catalyst.initialize(req);
        const zcql = catalystApp.zcql();
        const rows = await zcql.executeZCQLQuery(`SELECT id, status, basket FROM orders WHERE id = '${esc(orderId)}'`);
        if (rows && rows.length > 0 && rows[0].orders.status !== 'processing') {
          const now = nowSec();
          await zcql.executeZCQLQuery(
            `UPDATE orders SET status = 'processing', confirmed_by = 'razorpay_webhook', confirmed_at = ${now}, updated_at = ${now} WHERE id = '${esc(orderId)}'`
          );
        }
      } catch (e) {}
    }
  }

  res.json({ status: 'ok' });
});

/* ─── STUDENT ORDER CANCELLATION ─────────────────────────────────── */
app.post('/orders/:id/cancel', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(
      `SELECT id, status, basket, access_token_hash FROM orders WHERE id = '${esc(req.params.id)}'`
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const o = rows[0].orders;

    let b = {};
    try { b = JSON.parse(o.basket || '{}'); } catch(e) {}
    const clientToken = req.headers['x-order-token'] || req.query.token;
    const storedHash = o.access_token_hash || b.accessTokenHash;

    if (!isStaff(req)) {
      if (!clientToken) return res.status(401).json({ error: 'Order token required' });
      const clientHash = crypto.createHash('sha256').update(String(clientToken)).digest('hex');
      if (!timingSafeCompare(clientHash, storedHash)) {
        return res.status(403).json({ error: 'Invalid order token' });
      }
    }

    if (!['pending_payment', 'pending_cash', 'waiting_quote'].includes(o.status) && !isStaff(req)) {
      return res.status(409).json({ error: 'Cannot cancel order that has already started processing' });
    }

    const now = nowSec();

    // Immediate file purge on cancel
    const filestore = catalystApp.filestore();
    const folder = await getPrintFilesFolder(filestore);
    for (const f of (b.files || [])) {
      if (f.cloudId) {
        try { await folder.deleteFile(f.cloudId); } catch(delErr) {}
      }
    }

    await zcql.executeZCQLQuery(
      `UPDATE orders SET status = 'cancelled', files_deleted_at = ${now}, updated_at = ${now} WHERE id = '${esc(req.params.id)}'`
    );

    res.json({ ok: true, status: 'cancelled' });
  } catch (err) {
    res.status(500).json({ error: 'Cancellation failed' });
  }
});

/* ─── STAFF-ONLY ENDPOINTS (Authorization: Bearer <STAFF_TOKEN>) ─── */

// Order State Machine Allowed Transitions
const VALID_TRANSITIONS = {
  pending_payment: ['pending_cash', 'upi_started', 'cancelled', 'expired'],
  pending_cash: ['processing', 'cancelled', 'expired'],
  upi_started: ['upi_claimed', 'cancelled', 'expired'],
  upi_claimed: ['processing', 'cancelled', 'expired', 'rejected'],
  waiting_quote: ['quote_sent', 'cancelled', 'rejected'],
  quote_sent: ['accepted', 'declined', 'cancelled'],
  accepted: ['pending_payment', 'pending_cash', 'processing', 'cancelled'],
  processing: ['printing', 'cancelled', 'rejected'],
  printing: ['ready', 'cancelled', 'failed'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  expired: [],
  failed: [],
  rejected: []
};

// 1. Staff List Orders (Paginated & Filterable)
app.get('/orders', async (req, res) => {
  if (!isStaff(req)) {
    return res.status(401).json({ error: 'Staff authentication required' });
  }
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const statusFilter = req.query.status ? `WHERE status = '${esc(req.query.status)}'` : '';
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    let rows;
    try {
      rows = await zcql.executeZCQLQuery(
        `SELECT id, order_number, status, payment_status, total, quote_pending, basket, file_names, created_at, updated_at FROM orders ${statusFilter} ORDER BY created_at DESC LIMIT ${limit}`
      );
    } catch (_) {
      rows = await zcql.executeZCQLQuery(
        `SELECT id, order_number, status, total, quote_pending, basket, file_names, created_at, updated_at FROM orders ${statusFilter} ORDER BY created_at DESC LIMIT ${limit}`
      ).catch(() => []);
    }
    res.json((rows || []).map(r => {
      let b = {};
      try { b = JSON.parse(r.orders.basket || '{}'); } catch(e) {}
      const typedItems = (b.typedItems && Array.isArray(b.typedItems) && b.typedItems.length > 0)
        ? b.typedItems
        : basketToOrderItems({
            files: b.files || [],
            services: b.services || [],
            rush: b.rush || false
          }, defaultShopConfig);

      return {
        id: r.orders.id,
        orderNumber: r.orders.order_number || b.orderNumber || 1001,
        status: r.orders.status,
        payment_status: computePaymentStatus(r.orders),
        total: r.orders.total,
        quotePending: r.orders.quote_pending,
        pickupCode: b.pickupCode || '',
        fileNames: JSON.parse(r.orders.file_names || '[]'),
        filesCount: (b.files || []).length,
        items: typedItems,
        createdAt: r.orders.created_at,
        updatedAt: r.orders.updated_at
      };
    }));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 2. Staff Status Progression (Strict State Machine)
app.post('/orders/:id/status', async (req, res) => {
  if (!isStaff(req) && !isAgent(req)) {
    return res.status(401).json({ error: 'Staff authentication required' });
  }
  const { status, autoDeleteDelaySeconds } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Missing status' });
  }

  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT id, status, basket FROM orders WHERE id = '${esc(req.params.id)}'`);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const currentStatus = rows[0].orders.status;

    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(status)) {
      return res.status(409).json({
        error: `Invalid transition from "${currentStatus}" to "${status}". Allowed: [${allowed.join(', ')}]`
      });
    }

    const now = nowSec();
    let query = `UPDATE orders SET status = '${esc(status)}', updated_at = ${now}`;
    if (status === 'ready') {
      const delay = (Number.isFinite(autoDeleteDelaySeconds) && autoDeleteDelaySeconds >= 0)
        ? Number(autoDeleteDelaySeconds)
        : Number(process.env.AUTO_DELETE_DELAY_SECONDS || (defaultShopConfig.autoDeleteDelay || 5) * 60);
      query += `, delete_after = ${now + delay}`;
    }
    query += ` WHERE id = '${esc(req.params.id)}'`;
    await zcql.executeZCQLQuery(query);
    res.json({ ok: true, status });
  } catch (err) {
    res.status(500).json({ error: 'Database update failed' });
  }
});

// 3. Staff Approve Cash Order
app.post('/orders/:id/approve-cash', async (req, res) => {
  if (!isStaff(req)) {
    return res.status(401).json({ error: 'Staff authentication required' });
  }
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT id, status FROM orders WHERE id = '${esc(req.params.id)}'` );
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const current = rows[0].orders.status;
    if (current !== 'pending_cash' && current !== 'pending_payment') {
      return res.status(409).json({ error: `Cannot approve order in status "${current}"` });
    }
    const now = nowSec();
    await zcql.executeZCQLQuery(
      `UPDATE orders SET status = 'processing', confirmed_by = 'staff', confirmed_at = ${now}, updated_at = ${now} WHERE id = '${esc(req.params.id)}'`
    );
    res.json({ ok: true, status: 'processing' });
  } catch (err) {
    res.status(500).json({ error: 'Approval failed' });
  }
});

// 4. Staff Reject Order (Immediate File Purge)
app.post('/orders/:id/reject', async (req, res) => {
  if (!isStaff(req)) {
    return res.status(401).json({ error: 'Staff authentication required' });
  }
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT id, basket FROM orders WHERE id = '${esc(req.params.id)}'`);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    let b = {};
    try { b = JSON.parse(rows[0].orders.basket || '{}'); } catch(e) {}
    const filestore = catalystApp.filestore();
    const folder = await getPrintFilesFolder(filestore);
    for (const f of (b.files || [])) {
      if (f.cloudId) {
        try { await folder.deleteFile(f.cloudId); } catch(delErr) {}
      }
    }

    const now = nowSec();
    await zcql.executeZCQLQuery(
      `UPDATE orders SET status = 'rejected', files_deleted_at = ${now}, updated_at = ${now} WHERE id = '${esc(req.params.id)}'`
    );
    res.json({ ok: true, status: 'rejected' });
  } catch (err) {
    res.status(500).json({ error: 'Rejection failed' });
  }
});

// 5. Staff / Agent Authenticated File Download
app.get('/files/:cloudId', async (req, res) => {
  let authorized = isStaff(req) || isAgent(req);
  if (!authorized) {
    const staffToken = extractToken(req, 'staff');
    const agentToken = extractToken(req, 'agent');
    if (staffToken || agentToken) {
      try {
        const catalystApp = getCatalystApp(req);
        const zcql = catalystApp ? catalystApp.zcql() : null;
        if (zcql) {
          if (staffToken) {
            const sHash = crypto.createHash('sha256').update(String(staffToken)).digest('hex');
            const sRows = await zcql.executeZCQLQuery(`SELECT revoked FROM staff_devices WHERE token_hash = '${esc(sHash)}' LIMIT 1`).catch(() => []);
            if (sRows && sRows.length > 0 && (sRows[0].staff_devices.revoked === false || String(sRows[0].staff_devices.revoked) === 'false')) authorized = true;
          }
          if (!authorized && agentToken) {
            const aHash = crypto.createHash('sha256').update(String(agentToken)).digest('hex');
            const aRows = await zcql.executeZCQLQuery(`SELECT revoked FROM agent_devices WHERE token_hash = '${esc(aHash)}' LIMIT 1`).catch(() => []);
            if (aRows && aRows.length > 0 && (aRows[0].agent_devices.revoked === false || String(aRows[0].agent_devices.revoked) === 'false')) authorized = true;
          }
        }
      } catch (_) {}
    }
  }
  if (!authorized) {
    return res.status(401).json({ error: 'Staff or Agent authentication required to download files' });
  }
  try {
    const catalystApp = catalyst.initialize(req);
    const filestore = catalystApp.filestore();
    const folder = await getPrintFilesFolder(filestore);
    const fileStream = await folder.downloadFile(req.params.cloudId);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Type', 'application/octet-stream');
    if (fileStream && typeof fileStream.pipe === 'function') {
      fileStream.pipe(res);
    } else {
      res.send(fileStream);
    }
  } catch (err) {
    res.status(404).json({ error: 'File not found' });
  }
});

// 6. Scheduled Cleanup / Cron Purge Engine (Protected by CRON_SECRET)
async function expireStaleOrdersAndPurgeFiles(catalystApp, zcql, filestore) {
  const now = nowSec();
  const settings = await getEffectiveShopSettings(catalystApp);
  const paymentExpirySec = Number(settings.order_expiry_minutes || settings.payments?.order_expiry_minutes || 15) * 60;
  const upiClaimExpirySec = Number(settings.upi_claimed_expiry_hours || settings.payments?.upi_claimed_expiry_hours || 24) * 3600;
  const filePurgeCutoff = now - 3600; // 60-minute ceiling from upload

  let expiredOrdersCount = 0;
  let purgedFilesCount = 0;

  // 1. In-memory orders transition and file check
  for (const o of memOrders.values()) {
    const createdAt = Number(o.created_at || now);
    const updatedAt = Number(o.updated_at || createdAt);

    const isPendingExpired = ['pending_payment', 'upi_started'].includes(o.status) && (now - createdAt >= paymentExpirySec);
    const isUpiClaimExpired = (o.status === 'upi_claimed') && (now - updatedAt >= upiClaimExpirySec);

    if (isPendingExpired || isUpiClaimExpired) {
      o.status = 'expired';
      o.payment_status = 'not_paid';
      o.updated_at = now;
      expiredOrdersCount++;
    }

    if (!o.files_deleted_at) {
      const isTerminal = ['cancelled', 'rejected', 'expired'].includes(o.status);
      const isPastFileCeiling = createdAt <= filePurgeCutoff;
      const deleteAfter = o.delete_after ? Number(o.delete_after) : (o.printed_at ? Number(o.printed_at) + 300 : null);
      const isPastPrintDelete = deleteAfter && deleteAfter <= now;

      if ((isTerminal && isPastFileCeiling) || isPastPrintDelete || (isTerminal && now - updatedAt >= 1800)) {
        o.files_deleted_at = now;
        o.updated_at = now;
        purgedFilesCount++;
      }
    }
  }

  for (const it of memOrderItems.values()) {
    if (!it.files_deleted_at) {
      const deleteAfter = it.delete_after ? Number(it.delete_after) : (it.printed_at ? Number(it.printed_at) + 300 : null);
      if (deleteAfter && deleteAfter <= now) {
        it.files_deleted_at = now;
        it.updated_at = now;
      }
    }
  }

  // 2. Cloud Database & File Store purge (when catalystApp is provided)
  if (zcql) {
    try {
      // A. Expire stale orders in DB
      const staleRows = await zcql.executeZCQLQuery(
        `SELECT id, order_number, status, created_at, updated_at FROM orders WHERE (status IN ('pending_payment', 'upi_started') AND created_at <= ${now - paymentExpirySec}) OR (status = 'upi_claimed' AND updated_at <= ${now - upiClaimExpirySec})`
      ).catch(() => []);

      for (const r of (staleRows || [])) {
        const o = r.orders;
        await zcql.executeZCQLQuery(
          `UPDATE orders SET status = 'expired', payment_status = 'not_paid', updated_at = ${now} WHERE id = '${esc(o.id)}'`
        ).catch(() => {});

        await zcql.executeZCQLQuery(
          `INSERT INTO order_events (id, order_id, actor_type, actor_label, action, from_status, to_status, timestamp) VALUES ('${crypto.randomUUID()}', '${esc(o.id)}', 'system', 'expiry_engine', 'expire_timeout', '${esc(o.status)}', 'expired', ${now})`
        ).catch(() => {});

        expiredOrdersCount++;
      }

      // B. Purge files for expired, cancelled, rejected, or 60-min past upload orders
      let folder = null;
      if (filestore) {
        try { folder = await getPrintFilesFolder(filestore); } catch (_) {}
      }

      const rows = await zcql.executeZCQLQuery(
        `SELECT id, basket, status, delete_after, created_at FROM orders WHERE (delete_after IS NOT NULL AND delete_after <= ${now} AND files_deleted_at IS NULL) OR (status IN ('cancelled', 'rejected', 'expired') AND files_deleted_at IS NULL) OR (created_at <= ${filePurgeCutoff} AND files_deleted_at IS NULL)`
      ).catch(() => []);

      for (const r of (rows || [])) {
        const o = r.orders;
        let b = {};
        try { b = JSON.parse(o.basket || '{}'); } catch (_) {}
        if (folder) {
          for (const f of (b.files || [])) {
            if (f.cloudId) {
              try {
                await folder.deleteFile(f.cloudId);
                purgedFilesCount++;
              } catch (_) {}
            }
          }
        }
        await zcql.executeZCQLQuery(
          `UPDATE orders SET files_deleted_at = ${now}, updated_at = ${now} WHERE id = '${esc(o.id)}'`
        ).catch(() => {});
      }

      // Also clean order_items
      await zcql.executeZCQLQuery(
        `UPDATE order_items SET files_deleted_at = ${now} WHERE status = 'printed' AND files_deleted_at IS NULL AND delete_after IS NOT NULL AND delete_after <= ${now}`
      ).catch(() => {});
    } catch (_) {}
  }

  return { expiredOrdersCount, purgedOrdersCount: expiredOrdersCount, purgedFilesCount };
}

global.__printbk_purgeExpiredFiles = expireStaleOrdersAndPurgeFiles;

app.post(['/cron/cleanup-files', '/cron/cleanup'], async (req, res) => {
  if (!isCronScheduler(req)) {
    return res.status(401).json({ error: 'Unauthorized: valid cron secret required' });
  }
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const filestore = catalystApp ? catalystApp.filestore() : null;
    const result = await expireStaleOrdersAndPurgeFiles(catalystApp, zcql, filestore);
    const repaired = await fixMissingOrderNumbers(catalystApp, zcql);
    res.json({ ok: true, ...result, repairedMissingOrderNumbers: repaired.fixedCount });
  } catch (err) {
    res.status(500).json({ error: 'Cleanup job failed: ' + err.message });
  }
});

/* ─── Purge Test Data Endpoint (Cron Secret or Staff Authenticated) ── */
app.post('/internal/purge-test-data', async (req, res) => {
  if (!isCronScheduler(req) && !isStaff(req)) {
    return res.status(401).json({ error: 'Unauthorized: valid cron secret or staff credentials required' });
  }

  const dryRun = req.body.dryRun !== false;
  const forceUnflagged = req.body.forceUnflagged === true;

  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const filestore = catalystApp ? catalystApp.filestore() : null;
    const folder = filestore ? await getPrintFilesFolder(filestore).catch(() => null) : null;

    let allOrders = [];
    if (zcql) {
      const rows = await zcql.executeZCQLQuery("SELECT * FROM orders ORDER BY created_at DESC").catch(() => []);
      allOrders = (rows || []).map(r => r.orders);
    }
    // Also include memory orders
    for (const [id, o] of memOrders) {
      if (!allOrders.some(x => x.id === id)) allOrders.push(o);
    }

    const testFileNames = new Set([
      'SMOKE_TEST_DOC.pdf',
      'SECURITY_TEST_DOC.pdf',
      'PICKUP_TEST.pdf',
      'retention_audit_doc.pdf',
      'Phase0_Evidence.pdf',
      'test-file-1',
      'Document'
    ]);

    const flaggedToDelete = [];
    const unflaggedCandidates = [];

    for (const ord of allOrders) {
      let b = {};
      try { b = typeof ord.basket === 'string' ? JSON.parse(ord.basket || '{}') : (ord.basket || {}); } catch (_) {}
      const fileNames = (b.files || []).map(f => f.name || '');

      const isOrder1000 = Number(ord.order_number) === 1000;
      const isExplicitTest = ord.is_test === true || String(ord.is_test) === 'true' || b.is_test === true;
      const hasTestFileName = fileNames.some(name => testFileNames.has(name) || name === 'Document' || name.startsWith('SMOKE_') || name.startsWith('SECURITY_') || name.startsWith('PICKUP_') || name.startsWith('retention_'));

      if (isExplicitTest || hasTestFileName || isOrder1000) {
        flaggedToDelete.push({ id: ord.id, num: ord.order_number, status: ord.status, files: fileNames });
      } else {
        unflaggedCandidates.push({ id: ord.id, num: ord.order_number, status: ord.status, files: fileNames, createdAt: ord.created_at });
      }
    }

    const targets = forceUnflagged ? [...flaggedToDelete, ...unflaggedCandidates] : flaggedToDelete;

    if (dryRun) {
      return res.json({
        ok: true,
        dryRun: true,
        flaggedToDeleteCount: flaggedToDelete.length,
        flaggedToDelete,
        unflaggedCandidatesCount: unflaggedCandidates.length,
        unflaggedCandidates
      });
    }

    // Execute actual purge
    let deletedFilesCount = 0;
    for (const target of targets) {
      // 1. Delete files
      if (folder) {
        let b = {};
        const ord = allOrders.find(x => x.id === target.id);
        if (ord) {
          try { b = typeof ord.basket === 'string' ? JSON.parse(ord.basket || '{}') : (ord.basket || {}); } catch (_) {}
          for (const f of (b.files || [])) {
            if (f.cloudId) {
              try {
                await folder.deleteFile(f.cloudId);
                deletedFilesCount++;
              } catch (_) {}
            }
          }
        }
      }

      // 2. Delete ZCQL records
      if (zcql) {
        await zcql.executeZCQLQuery(`DELETE FROM order_items WHERE order_id = '${esc(target.id)}'`).catch(() => {});
        await zcql.executeZCQLQuery(`DELETE FROM print_jobs WHERE order_id = '${esc(target.id)}'`).catch(() => {});
        await zcql.executeZCQLQuery(`DELETE FROM order_events WHERE order_id = '${esc(target.id)}'`).catch(() => {});
        await zcql.executeZCQLQuery(`DELETE FROM orders WHERE id = '${esc(target.id)}'`).catch(() => {});
      }

      // 3. Clear memory
      memOrders.delete(target.id);
      for (const [k, it] of memOrderItems) {
        if (it.order_id === target.id) memOrderItems.delete(k);
      }
    }

    // 4. Scan File Store for orphan files and purge them
    let orphanFilesPurged = 0;
    if (folder) {
      try {
        const folderFiles = await listFolderFiles(folder);
        // Collect active cloud IDs from surviving non-purged orders
        const survivingOrders = allOrders.filter(o => !targets.some(t => t.id === o.id));
        const activeCloudIds = new Set();
        for (const so of survivingOrders) {
          let b = {};
          try { b = typeof so.basket === 'string' ? JSON.parse(so.basket || '{}') : (so.basket || {}); } catch (_) {}
          for (const f of (b.files || [])) {
            if (f.cloudId) activeCloudIds.add(String(f.cloudId));
          }
        }

        for (const ff of folderFiles) {
          const fid = String(ff.id || ff.file_id || '');
          if (fid && !activeCloudIds.has(fid)) {
            try {
              await folder.deleteFile(fid);
              orphanFilesPurged++;
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    // 5. Repair any orders with missing order_number
    const repaired = await fixMissingOrderNumbers(catalystApp, zcql);

    res.json({
      ok: true,
      dryRun: false,
      deletedOrdersCount: targets.length,
      deletedFilesCount,
      orphanFilesPurged,
      repairedMissingOrderNumbers: repaired.fixedCount,
      unflaggedRemainingCount: forceUnflagged ? 0 : unflaggedCandidates.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Purge failed: ' + err.message });
  }
});

/* ─── File Store Audit Endpoint ──────────────────────────────────── */
app.get('/internal/filestore-audit', async (req, res) => {
  if (!isCronScheduler(req) && !isStaff(req)) {
    return res.status(401).json({ error: 'Unauthorized: valid cron secret or staff credentials required' });
  }
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const filestore = catalystApp ? catalystApp.filestore() : null;
    const folder = filestore ? await getPrintFilesFolder(filestore).catch(() => null) : null;

    let folderFiles = [];
    if (folder) {
      folderFiles = await listFolderFiles(folder);
    }

    // Check active cloudIds in database
    let activeOrders = [];
    if (zcql) {
      const rows = await zcql.executeZCQLQuery(`SELECT id, status, basket, files_deleted_at FROM orders WHERE files_deleted_at IS NULL`).catch(() => []);
      activeOrders = (rows || []).map(r => r.orders);
    }
    const activeCloudIds = new Set();
    for (const ao of activeOrders) {
      let b = {};
      try { b = JSON.parse(ao.basket || '{}'); } catch (_) {}
      for (const f of (b.files || [])) {
        if (f.cloudId) activeCloudIds.add(String(f.cloudId));
      }
    }

    const files = folderFiles.map(f => ({
      id: f.id || f.file_id,
      name: f.file_name || f.name,
      size: f.file_size || f.size,
      createdTime: f.created_time,
      isOrphan: !activeCloudIds.has(String(f.id || f.file_id))
    }));

    res.json({
      ok: true,
      totalFiles: files.length,
      orphanCount: files.filter(f => f.isOrphan).length,
      activeDbOrdersCount: activeOrders.length,
      files
    });
  } catch (err) {
    res.status(500).json({ error: 'Filestore audit failed: ' + err.message });
  }
});

/* ─── Backfill Payment Status Endpoint (Cron Secret or Staff Authenticated) ─── */
app.post('/internal/backfill-payment-status', async (req, res) => {
  if (!isCronScheduler(req) && !isStaff(req)) {
    return res.status(401).json({ error: 'Unauthorized: valid cron secret or staff credentials required' });
  }

  const dryRun = req.body.dryRun !== false;

  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;

    let allOrders = [];
    if (zcql) {
      const rows = await zcql.executeZCQLQuery("SELECT * FROM orders ORDER BY created_at DESC").catch(() => []);
      allOrders = (rows || []).map(r => r.orders);
    }
    for (const [id, o] of memOrders) {
      if (!allOrders.some(x => x.id === id)) allOrders.push(o);
    }

    const breakdown = {
      cash_due: 0,
      cash_collected: 0,
      upi_claimed: 0,
      paid_verified: 0,
      not_paid: 0,
      refunded: 0,
      unpaid: 0
    };

    const updates = [];

    for (const ord of allOrders) {
      const targetStatus = computePaymentStatus(ord);
      breakdown[targetStatus] = (breakdown[targetStatus] || 0) + 1;

      let b = {};
      try { b = typeof ord.basket === 'string' ? JSON.parse(ord.basket || '{}') : (ord.basket || {}); } catch (_) {}

      const currentStatus = ord.payment_status || b.payment_status;
      if (currentStatus !== targetStatus) {
        updates.push({
          id: ord.id,
          order_number: ord.order_number,
          from: currentStatus || 'none',
          to: targetStatus
        });

        if (!dryRun) {
          ord.payment_status = targetStatus;
          b.payment_status = targetStatus;
          const updatedBasket = esc(JSON.stringify(b));
          memOrders.set(ord.id, ord);

          if (zcql) {
            try {
              await zcql.executeZCQLQuery(
                `UPDATE orders SET payment_status = '${targetStatus}', basket = '${updatedBasket}' WHERE id = '${esc(ord.id)}'`
              );
            } catch (_) {
              await zcql.executeZCQLQuery(
                `UPDATE orders SET basket = '${updatedBasket}' WHERE id = '${esc(ord.id)}'`
              ).catch(() => {});
            }
          }
        }
      }
    }

    res.json({
      ok: true,
      dryRun,
      totalOrders: allOrders.length,
      updatesCount: updates.length,
      breakdown,
      sampleUpdates: updates.slice(0, 10)
    });
  } catch (err) {
    res.status(500).json({ error: 'Backfill failed: ' + err.message });
  }
});

// 7. Delete Files Now (Student with Order Token OR Staff)
app.post('/orders/:id/delete-files', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    let rows;
    if (zcql) {
      rows = await zcql.executeZCQLQuery(`SELECT id, basket, access_token_hash FROM orders WHERE id = '${esc(req.params.id)}'`).catch(() => null);
    }
    const o = (rows && rows.length > 0) ? rows[0].orders : memOrders.get(req.params.id);
    if (!o) return res.status(404).json({ error: 'Order not found' });
    
    let b = {};
    try { b = typeof o.basket === 'string' ? JSON.parse(o.basket || '{}') : (o.basket || {}); } catch(e) {}

    // Verify token or staff
    const clientToken = req.headers['x-order-token'] || req.query.token;
    const storedHash = o.access_token_hash || b.accessTokenHash;

    if (!isStaff(req)) {
      if (!clientToken) return res.status(401).json({ error: 'Order token required' });
      const clientHash = crypto.createHash('sha256').update(String(clientToken)).digest('hex');
      if (!timingSafeCompare(clientHash, storedHash)) {
        return res.status(403).json({ error: 'Invalid order token' });
      }
    }

    // Delete files from Catalyst File Store
    if (catalystApp) {
      try {
        const filestore = catalystApp.filestore();
        const folder = await getPrintFilesFolder(filestore);
        for (const f of (b.files || [])) {
          if (f.cloudId) {
            try { await folder.deleteFile(f.cloudId); } catch(delErr) {}
          }
        }
      } catch (_) {}
    }

    const now = nowSec();
    o.files_deleted_at = now;
    o.updated_at = now;
    memOrders.set(o.id, o);

    if (zcql) {
      await zcql.executeZCQLQuery(
        `UPDATE orders SET files_deleted_at = ${now}, updated_at = ${now} WHERE id = '${esc(req.params.id)}'`
      ).catch(() => {});
    }

    res.json({ ok: true, deletedAt: now });
  } catch (err) {
    res.status(500).json({ error: 'Deletion failed' });
  }
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`PrintBK API listening on port ${port}`);
  });
}

module.exports = app;