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
  if (!agentToken) return false;
  const token = extractToken(req, 'agent');
  if (!token) return false;
  return timingSafeCompare(token, agentToken);
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
    if (allAllowedOrigins.includes(origin)) {
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

async function getNextOrderNumber(zcql) {
  if (zcql) {
    try {
      const rows = await zcql.executeZCQLQuery(`SELECT order_number FROM orders ORDER BY order_number DESC LIMIT 1`);
      if (rows && rows.length > 0 && rows[0].orders?.order_number) {
        return Number(rows[0].orders.order_number) + 1;
      }
    } catch (e) {}
    try {
      const allRows = await zcql.executeZCQLQuery(`SELECT id FROM orders`);
      if (allRows && allRows.length > 0) {
        return 1001 + allRows.length;
      }
    } catch (e) {}
  }
  if (memOrders.size > 0) {
    let max = 1000;
    for (const o of memOrders.values()) {
      const num = Number(o.order_number);
      if (num > max) max = num;
    }
    return max + 1;
  }
  return 1001;
}

/* ─── PUBLIC ENDPOINTS ───────────────────────────────────────────── */

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/config', async (req, res) => {
  let settings = null;
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery("SELECT * FROM shop_settings WHERE id = 'default'").catch(() => []);
    if (rows && rows.length > 0) {
      settings = rows[0].shop_settings;
    }
  } catch (_) {}

  const rzpEnabled = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_ENABLED === 'true');
  const upiId = process.env.UPI_ID || 'Q098686787@ybl';
  const upiPayee = process.env.UPI_PAYEE_NAME || 'PrintBK HKBK';

  let dynamicRates = defaultShopConfig.rates;
  let shopOpen = true;
  let announcement = '';
  let shopInfo = {};

  if (settings) {
    if (settings.rates) {
      try {
        const parsed = typeof settings.rates === 'string' ? JSON.parse(settings.rates) : settings.rates;
        dynamicRates = { ...dynamicRates, ...parsed };
      } catch (_) {}
    }
    if (typeof settings.open !== 'undefined') {
      shopOpen = settings.open === true || settings.open === 'true';
    }
    announcement = settings.announcement || '';
    if (settings.shop_info) {
      try {
        shopInfo = typeof settings.shop_info === 'string' ? JSON.parse(settings.shop_info) : settings.shop_info;
      } catch (_) {}
    }
  }

  res.json({
    ...defaultShopConfig,
    open: shopOpen,
    announcement,
    shopInfo,
    rates: dynamicRates,
    paymentMethods: {
      cash: true,
      upi: true,
      razorpay: rzpEnabled
    },
    upi: {
      enabled: true,
      payeeName: shopInfo.payee || upiPayee,
      upiId: shopInfo.upi || upiId
    }
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
app.post('/upload', (req, res, next) => {
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
    if (zcql) {
      try {
        const settingRows = await zcql.executeZCQLQuery("SELECT open, announcement FROM shop_settings WHERE id = 'default'").catch(() => []);
        if (settingRows && settingRows.length > 0) {
          const s = settingRows[0].shop_settings;
          const isOpen = s.open === true || s.open === 'true';
          if (!isOpen) {
            return res.status(503).json({
              error: `Shop is currently closed: ${s.announcement || 'Counter orders are paused. Please try again later.'}`
            });
          }
        }
      } catch (_) {}
    }

    const { files = [], services = [], rush = false } = req.body;
    const orderId = crypto.randomUUID();
    const now = nowSec();

    // 1. Server-Generated 4-digit pickup code & sequential order number
    const pickupCode = await generateUniquePickupCode(zcql);
    const orderNumber = await getNextOrderNumber(zcql);

    // 2. Generate 192-bit cryptographic student capability token
    const orderToken = crypto.randomBytes(24).toString('base64url');
    const accessTokenHash = crypto.createHash('sha256').update(orderToken).digest('hex');

    // 3. Strict Authoritative Price Calculation using Shared Engine
    const pricing = priceOrder({ files, services, rush }, defaultShopConfig);
    const total = pricing.total;
    const quotePending = pricing.quotePending;
    const paymentMethod = String(req.body.payment || '').toLowerCase();
    const status = quotePending ? 'waiting_quote' : (paymentMethod === 'cash' ? 'pending_cash' : 'pending_payment');
    
    // 4. Map into Typed Order Items for Staff App Tables
    const typedItems = basketToOrderItems({ files, services, rush }, defaultShopConfig);

    const basketPayload = {
      files,
      services,
      rush,
      phone: req.body.phone ? String(req.body.phone).trim() : null,
      pickupCode,
      orderNumber,
      accessTokenHash,
      breakdown: pricing,
      typedItems
    };

    const orderRecord = {
      id: orderId,
      order_number: orderNumber,
      access_token_hash: accessTokenHash,
      status,
      basket: JSON.stringify(basketPayload),
      file_names: JSON.stringify(files.map(f => f.name)),
      quote_pending: quotePending,
      total,
      created_at: now,
      updated_at: now
    };
    memOrders.set(orderId, orderRecord);

    const basketJson = esc(JSON.stringify(basketPayload));
    const filesJson  = esc(JSON.stringify(files.map(f => f.name)));

    if (zcql) {
      // Insert order with resilient column fallback
      try {
        await zcql.executeZCQLQuery(
          `INSERT INTO orders (id, order_number, access_token_hash, status, basket, file_names, quote_pending, total, created_at, updated_at) VALUES ('${orderId}', ${orderNumber}, '${accessTokenHash}', '${status}', '${basketJson}', '${filesJson}', ${quotePending}, ${total}, ${now}, ${now})`
        );
      } catch (insertErr) {
        try {
          await zcql.executeZCQLQuery(
            `INSERT INTO orders (id, status, basket, file_names, quote_pending, total, created_at, updated_at) VALUES ('${orderId}', '${status}', '${basketJson}', '${filesJson}', ${quotePending}, ${total}, ${now}, ${now})`
          );
        } catch (_) {}
      }
    }

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
          `SELECT id, order_number, status, total, quote_pending, basket, file_names, delete_after, files_deleted_at, created_at, updated_at FROM orders WHERE id = '${esc(req.params.id)}'`
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
    if (isStudent && o.status === 'pending_payment') {
      return res.json({
        id: o.id,
        status: 'pending_payment',
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

    if (!['upi_started', 'pending_payment'].includes(o.status)) {
      if (['upi_claimed', 'processing', 'ready', 'completed'].includes(o.status)) {
        return res.json({
          ok: true,
          status: o.status,
          orderId: o.id,
          orderNumber: o.order_number || b.orderNumber
        });
      }
      return res.status(409).json({ error: `Cannot record UPI claim for order in status "${o.status}"` });
    }

    const utr = req.body.utr ? String(req.body.utr).trim().slice(0, 32) : null;
    const now = nowSec();

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
    o.updated_at = now;
    o.basket = JSON.stringify(b);
    memOrders.set(o.id, o);

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

    const rows = await zcql.executeZCQLQuery(
      `SELECT id, order_number, status, total, quote_pending, basket, file_names, created_at, updated_at FROM orders ${statusFilter} ORDER BY created_at DESC LIMIT ${limit}`
    );
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

// 5. Staff Authenticated File Download
app.get('/files/:cloudId', async (req, res) => {
  if (!isStaff(req) && !isAgent(req)) {
    return res.status(401).json({ error: 'Staff authentication required to download files' });
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
async function purgeExpiredFiles(catalystApp, zcql, filestore) {
  const now = nowSec();
  let purgedOrdersCount = 0;
  let purgedFilesCount = 0;

  // 1. In-memory orders and items check
  for (const o of memOrders.values()) {
    if (!o.files_deleted_at) {
      const deleteAfter = o.delete_after ? Number(o.delete_after) : (o.printed_at ? Number(o.printed_at) + 300 : null);
      const isExpiredState = ['cancelled', 'rejected', 'expired'].includes(o.status);
      const isPastMaxCeiling = Number(o.created_at || now) <= now - 3600; // 60 min ceiling
      const isPastPrintDelete = deleteAfter && deleteAfter <= now;

      if (isExpiredState || isPastMaxCeiling || isPastPrintDelete) {
        o.files_deleted_at = now;
        o.updated_at = now;
        purgedOrdersCount++;
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
      const rows = await zcql.executeZCQLQuery(
        `SELECT id, basket, status, delete_after FROM orders WHERE (delete_after IS NOT NULL AND delete_after <= ${now} AND files_deleted_at IS NULL) OR (status IN ('cancelled', 'rejected', 'expired') AND files_deleted_at IS NULL) OR (created_at <= ${now - 3600} AND files_deleted_at IS NULL)`
      ).catch(() => []);

      let folder = null;
      if (filestore) {
        try { folder = await getPrintFilesFolder(filestore); } catch (_) {}
      }

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
        purgedOrdersCount++;
      }

      // Also clean order_items
      await zcql.executeZCQLQuery(
        `UPDATE order_items SET files_deleted_at = ${now} WHERE status = 'printed' AND files_deleted_at IS NULL AND delete_after IS NOT NULL AND delete_after <= ${now}`
      ).catch(() => {});
    } catch (_) {}
  }

  return { purgedOrdersCount, purgedFilesCount };
}

global.__printbk_purgeExpiredFiles = purgeExpiredFiles;

app.post(['/cron/cleanup-files', '/cron/cleanup'], async (req, res) => {
  if (!isCronScheduler(req)) {
    return res.status(401).json({ error: 'Unauthorized: valid cron secret required' });
  }
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const filestore = catalystApp ? catalystApp.filestore() : null;
    const result = await purgeExpiredFiles(catalystApp, zcql, filestore);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: 'Cleanup job failed: ' + err.message });
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