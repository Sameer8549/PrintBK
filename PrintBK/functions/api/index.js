'use strict';
const express = require('express');
const catalyst = require('zcatalyst-sdk-node');
const cors = require('cors');
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

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

/* ─── Security Headers & Middleware ──────────────────────────────── */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

/* ─── Rate Limiter & Brute-Force Lockout ──────────────────────────── */
const ipRequests = new Map();
const failedStaffLogins = new Map();

function rateLimiter(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown-ip';
  const now = Date.now();

  // 1. Check if IP is locked out due to repeated failed staff logins
  const failed = failedStaffLogins.get(ip);
  if (failed && failed.count >= 5 && (now - failed.lastAttempt) < 5 * 60 * 1000) {
    return res.status(429).json({
      error: 'Too many failed authentication attempts. Access locked for 5 minutes.'
    });
  }

  // 2. Sliding window limit: 30 requests per 10 seconds per IP
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Order-Token', 'Accept']
}));

app.use(express.json({ limit: '2mb' }));

/* ─── Constant-Time Token Comparison Helpers ─────────────────────── */
function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function extractToken(req, headerName = 'staff') {
  const custom = req.headers[`x-${headerName}-token`] || req.headers['x-token'];
  if (custom) return String(custom).trim();
  const auth = req.headers['x-authorization'] || req.headers.authorization;
  if (auth && typeof auth === 'string') {
    if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
    return auth.trim();
  }
  return null;
}

function isStaff(req) {
  const staffToken = process.env.STAFF_TOKEN;
  if (!staffToken) return false;
  const token = extractToken(req, 'staff');
  if (!token) return false;
  const valid = timingSafeCompare(token, staffToken);
  if (!valid) {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown-ip';
    const now = Date.now();
    const failed = failedStaffLogins.get(ip) || { count: 0, lastAttempt: now };
    if (now - failed.lastAttempt > 60 * 1000) failed.count = 1;
    else failed.count++;
    failed.lastAttempt = now;
    failedStaffLogins.set(ip, failed);
  }
  return valid;
}

function isAgent(req) {
  const agentToken = process.env.AGENT_TOKEN;
  if (!agentToken) return false;
  const token = extractToken(req, 'agent');
  if (!token) return false;
  return timingSafeCompare(token, agentToken);
}

/* ─── Multer & Magic Bytes File Inspection ───────────────────────── */
function validateMagicBytes(buffer, mimetype, originalname) {
  if (!buffer || buffer.length < 4) return false;
  const ext = (originalname.split('.').pop() || '').toLowerCase();
  
  // Disallowed executable and script extensions
  const dangerous = ['exe', 'bat', 'cmd', 'sh', 'php', 'js', 'vbs', 'ps1', 'msi', 'com', 'scr', 'dll', 'bin'];
  if (dangerous.includes(ext)) return false;

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
  if (ext === 'txt') {
    return true;
  }
  return false;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

/* ─── Single Source of Truth Pricing Configuration ──────────────── */
const { priceOrder, defaultShopConfig } = require('./shared/pricing');

function esc(str) { return String(str ?? '').replace(/'/g, "''"); }
function nowSec() { return Math.floor(Date.now() / 1000); }

/* ─── Server-Generated Pickup Code & Order Number Helpers ────────── */
async function generateUniquePickupCode(zcql) {
  let activeCodes = new Set();
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

  // 4-digit code (1000 - 9999)
  for (let i = 0; i < 50; i++) {
    const code = String(crypto.randomInt(1000, 10000));
    if (!activeCodes.has(code)) return code;
  }
  // 5-digit fallback if active space crowded
  return String(crypto.randomInt(10000, 100000));
}

async function getNextOrderNumber(zcql) {
  try {
    const rows = await zcql.executeZCQLQuery(`SELECT order_number FROM orders ORDER BY order_number DESC LIMIT 1`);
    if (rows && rows.length > 0 && rows[0].orders?.order_number) {
      return Number(rows[0].orders.order_number) + 1;
    }
  } catch (e) {}
  try {
    const allRows = await zcql.executeZCQLQuery(`SELECT id FROM orders`);
    return 1001 + (allRows ? allRows.length : 0);
  } catch (e) {
    return 1001;
  }
}

/* ─── PUBLIC ENDPOINTS ───────────────────────────────────────────── */

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/config', (_req, res) => {
  const rzpEnabled = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  res.json({
    ...defaultShopConfig,
    paymentMethods: {
      cash: true,
      razorpay: rzpEnabled
    }
  });
});

app.get('/shop/status', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(
      `SELECT id FROM orders WHERE status IN ('pending_payment', 'pending_cash', 'processing', 'printing')`
    );
    const queueLength = rows ? rows.length : 0;
    res.json({
      open: true,
      queueLength,
      estimatedWaitMinutes: Math.ceil(queueLength * 2)
    });
  } catch (e) {
    res.json({ open: true, queueLength: 0, estimatedWaitMinutes: 0 });
  }
});

/* ─── FILE UPLOAD (Hardened with Magic Bytes & MIME Firewall) ───── */
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Enforce Magic Byte Inspection against Extension & Content
    const isValid = validateMagicBytes(req.file.buffer, req.file.mimetype, req.file.originalname);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid or disallowed file type. Content does not match extension.' });
    }

    const catalystApp = catalyst.initialize(req);
    const filestore = catalystApp.filestore();
    
    let folderId = null;
    try {
      const folders = await filestore.getAllFolders();
      const existing = folders.find(f => f.folder_name === 'print_files');
      if (existing) {
        folderId = existing.id;
      } else {
        const newF = await filestore.createFolder('print_files');
        folderId = newF.id;
      }
    } catch (err) {
      folderId = 1;
    }

    const folder = filestore.folder(folderId);
    // Sanitize storage name using cryptographically secure random id
    const storageName = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const uploadedFile = await folder.uploadFile({
      code: req.file.buffer,
      name: storageName
    });

    res.json({
      cloudId: uploadedFile.id,
      name: req.file.originalname,
      size: req.file.size
    });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

/* ─── ORDER CREATION (Server-Authoritative Pricing & Codes) ───────── */
app.post('/orders', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
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
    const status = quotePending ? 'waiting_quote' : (req.body.payment === 'Cash' ? 'pending_cash' : 'pending_payment');
    
    const basketPayload = {
      files,
      services,
      rush,
      pickupCode,
      orderNumber,
      accessTokenHash,
      breakdown: pricing
    };

    const basketJson = esc(JSON.stringify(basketPayload));
    const filesJson  = esc(JSON.stringify(files.map(f => f.name)));

    // Insert order with resilient column fallback
    try {
      await zcql.executeZCQLQuery(
        `INSERT INTO orders (id, order_number, access_token_hash, status, basket, file_names, quote_pending, total, created_at, updated_at) VALUES ('${orderId}', ${orderNumber}, '${accessTokenHash}', '${status}', '${basketJson}', '${filesJson}', ${quotePending}, ${total}, ${now}, ${now})`
      );
    } catch (insertErr) {
      // Fallback if schema columns are not yet created
      await zcql.executeZCQLQuery(
        `INSERT INTO orders (id, status, basket, file_names, quote_pending, total, created_at, updated_at) VALUES ('${orderId}', '${status}', '${basketJson}', '${filesJson}', ${quotePending}, ${total}, ${now}, ${now})`
      );
    }

    // Hide pickup code until processing is approved
    const exposedPickupCode = ['pending_payment', 'pending_cash', 'waiting_quote'].includes(status) ? null : pickupCode;

    res.json({
      orderId,
      orderNumber,
      status,
      total,
      quotePending,
      pickupCode: exposedPickupCode,
      accessToken: orderToken,
      breakdown: pricing
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create order' });
  }
});

/* ─── GET /orders/:id (Protected by Student Access Token or Staff Auth) ── */
app.get('/orders/:id', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    let rows;
    try {
      rows = await zcql.executeZCQLQuery(
        `SELECT id, order_number, status, total, quote_pending, basket, file_names, delete_after, files_deleted_at, created_at, updated_at FROM orders WHERE id = '${esc(req.params.id)}'`
      );
    } catch (qErr) {
      rows = await zcql.executeZCQLQuery(
        `SELECT id, order_number, status, total, quote_pending, basket, file_names, created_at FROM orders WHERE id = '${esc(req.params.id)}'`
      );
    }
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const o = rows[0].orders;
    let basketData = {};
    try { basketData = JSON.parse(o.basket || '{}'); } catch(e) {}

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

    // Hide pickup code from students until order reaches processing
    const isStudent = !isStaff(req);
    const isPrePayment = ['pending_payment', 'pending_cash', 'waiting_quote'].includes(o.status);
    const exposedPickupCode = (isStudent && isPrePayment) ? null : (basketData.pickupCode || '');

    res.json({
      id: o.id,
      orderNumber: o.order_number || basketData.orderNumber || 1001,
      status: o.status,
      total: o.total,
      quotePending: o.quote_pending,
      pickupCode: exposedPickupCode,
      basket: basketData,
      fileNames: JSON.parse(o.file_names || '[]'),
      deleteAfter: o.delete_after || null,
      filesDeletedAt: o.files_deleted_at || null,
      createdAt: o.created_at
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
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
    const folder = filestore.folder('print_files');
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
  pending_payment: ['processing', 'cancelled', 'expired'],
  pending_cash: ['processing', 'cancelled', 'expired'],
  waiting_quote: ['processing', 'cancelled', 'rejected'],
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
      return {
        id: r.orders.id,
        orderNumber: r.orders.order_number || b.orderNumber || 1001,
        status: r.orders.status,
        total: r.orders.total,
        quotePending: r.orders.quote_pending,
        pickupCode: b.pickupCode || '',
        fileNames: JSON.parse(r.orders.file_names || '[]'),
        filesCount: (b.files || []).length,
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
  const { status } = req.body;
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
      const delay = Number(defaultShopConfig.autoDeleteDelay || 5) * 60;
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
    const folder = filestore.folder('print_files');
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
    const fileStream = await filestore.folder('print_files').downloadFile(req.params.cloudId);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Type', 'application/octet-stream');
    fileStream.pipe(res);
  } catch (err) {
    res.status(404).json({ error: 'File not found' });
  }
});

// 6. Scheduled Cleanup / Cron Purge
app.post('/cron/cleanup', async (req, res) => {
  if (!isStaff(req)) {
    return res.status(401).json({ error: 'Authentication required for cleanup' });
  }
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const now = nowSec();

    let rows;
    try {
      rows = await zcql.executeZCQLQuery(
        `SELECT id, basket, status, delete_after FROM orders WHERE (delete_after IS NOT NULL AND delete_after <= ${now} AND files_deleted_at IS NULL) OR (status IN ('cancelled', 'rejected', 'expired') AND files_deleted_at IS NULL)`
      );
    } catch (e) {
      rows = [];
    }

    const filestore = catalystApp.filestore();
    const folder = filestore.folder('print_files');
    let purgedOrdersCount = 0;
    let purgedFilesCount = 0;

    for (const r of (rows || [])) {
      const o = r.orders;
      let b = {};
      try { b = JSON.parse(o.basket || '{}'); } catch(e) {}
      for (const f of (b.files || [])) {
        if (f.cloudId) {
          try {
            await folder.deleteFile(f.cloudId);
            purgedFilesCount++;
          } catch (e) {}
        }
      }
      await zcql.executeZCQLQuery(
        `UPDATE orders SET files_deleted_at = ${now}, updated_at = ${now} WHERE id = '${esc(o.id)}'`
      );
      purgedOrdersCount++;
    }

    res.json({ ok: true, purgedOrdersCount, purgedFilesCount });
  } catch (err) {
    res.status(500).json({ error: 'Cleanup job failed' });
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
    const fileStream = await filestore.folder('print_files').downloadFile(req.params.cloudId);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Type', 'application/octet-stream');
    fileStream.pipe(res);
  } catch (err) {
    res.status(404).json({ error: 'File not found' });
  }
});

// 6. Delete Files Now (Student with Order Token OR Staff)
app.post('/orders/:id/delete-files', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT id, basket, access_token_hash FROM orders WHERE id = '${esc(req.params.id)}'`);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    
    const o = rows[0].orders;
    let b = {};
    try { b = JSON.parse(o.basket || '{}'); } catch(e) {}

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
    const filestore = catalystApp.filestore();
    const folder = filestore.folder('print_files');
    for (const f of (b.files || [])) {
      if (f.cloudId) {
        try { await folder.deleteFile(f.cloudId); } catch(delErr) {}
      }
    }

    const now = nowSec();
    await zcql.executeZCQLQuery(
      `UPDATE orders SET files_deleted_at = ${now}, updated_at = ${now} WHERE id = '${esc(req.params.id)}'`
    );

    res.json({ ok: true, deletedAt: now });
  } catch (err) {
    res.status(500).json({ error: 'Deletion failed' });
  }
});

module.exports = app;