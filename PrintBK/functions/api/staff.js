'use strict';
const express = require('express');
const crypto = require('crypto');
const catalyst = require('zcatalyst-sdk-node');
const { computePaymentStatus, getPaymentLabel } = require('./shared/paymentStatus');
const { computeEffectiveShopStatus } = require('./shared/shopStatus');

const router = express.Router();

/* ─── Helpers ────────────────────────────────────────────────────── */
function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  for (const item of cookieHeader.split(';')) {
    const parts = item.split('=');
    const name = parts[0]?.trim();
    if (name) {
      list[name] = decodeURIComponent((parts.slice(1).join('=') || '').trim());
    }
  }
  return list;
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

/* ─── In-Memory Rate Limiting for Staff Devices ──────────────────── */
const deviceRequests = new Map(); // key: deviceId -> { count, resetTime }

function staffRateLimiter(req, res, next) {
  const deviceId = req.staffDevice?.id || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 120; // 120 requests/min (accommodating live feed 1.5s polling)

  const rec = deviceRequests.get(deviceId) || { count: 0, resetTime: now + windowMs };
  if (now > rec.resetTime) {
    rec.count = 1;
    rec.resetTime = now + windowMs;
  } else {
    rec.count++;
  }
  deviceRequests.set(deviceId, rec);

  if (process.env.NODE_ENV !== 'test' && rec.count > maxRequests) {
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  next();
}

// In-memory fallback stores when testing outside Catalyst or syncing across endpoints
const memStaffDevices = global.__printbk_staff_devices || (global.__printbk_staff_devices = new Map());
const memAgentDevices = global.__printbk_agent_devices || (global.__printbk_agent_devices = new Map());
const memOrders = global.__printbk_orders || (global.__printbk_orders = new Map());
const memOrderItems = global.__printbk_order_items || (global.__printbk_order_items = new Map());
const memPrintJobs = global.__printbk_jobs || (global.__printbk_jobs = new Map());
const memStaffActions = global.__printbk_staff_actions || (global.__printbk_staff_actions = new Map());

/* ─── Staff Authentication Middleware ────────────────────────────── */
async function authenticateStaff(req, res, next) {
  const cookies = parseCookies(req);
  const deviceToken = cookies.staff_device_token ||
    req.headers['x-staff-device-token'] ||
    req.headers['x-staff-token'] ||
    (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

  if (!deviceToken) {
    return res.status(401).json({ error: 'Staff authentication required' });
  }

  // 1. Check legacy STAFF_TOKEN bypass
  const masterStaffToken = process.env.STAFF_TOKEN;
  if (masterStaffToken && timingSafeCompare(deviceToken, masterStaffToken)) {
    req.staffDevice = { id: 'master', label: 'Admin Terminal' };
    return next();
  }

  // 1b. Check if deviceToken matches STAFF_SETUP_CODE directly
  const expectedSetupCode = process.env.STAFF_SETUP_CODE;
  if (expectedSetupCode && timingSafeCompare(deviceToken, expectedSetupCode)) {
    req.staffDevice = { id: 'setup-pass', label: 'Counter PC' };
    return next();
  }

  // 2. Look up token in staff_devices table
  const tokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;

    if (zcql) {
      const rows = await zcql.executeZCQLQuery(
        `SELECT ROWID, label, revoked FROM staff_devices WHERE token_hash = '${tokenHash}'`
      ).catch(() => null);

      if (rows && rows.length > 0) {
        const dev = rows[0].staff_devices;
        if (dev.revoked === true || String(dev.revoked) === 'true') {
          return res.status(403).json({ error: 'Device access has been revoked' });
        }

        // Update last seen asynchronously
        const now = nowSec();
        zcql.executeZCQLQuery(
          `UPDATE staff_devices SET last_seen_at = ${now} WHERE token_hash = '${tokenHash}'`
        ).catch(() => {});

        req.staffDevice = { id: String(dev.ROWID || tokenHash.slice(0, 8)), label: dev.label || 'Counter PC' };
        return next();
      }
    }
  } catch (err) {
    // If table lookup fails, fallback check
  }

  // Memory fallback
  const memDev = memStaffDevices.get(tokenHash);
  if (memDev) {
    if (memDev.revoked) {
      return res.status(403).json({ error: 'Device access has been revoked' });
    }
    memDev.last_seen_at = nowSec();
    req.staffDevice = { id: memDev.id, label: memDev.label };
    return next();
  }

  return res.status(401).json({ error: 'Invalid or expired staff device credentials' });
}

/* ─── Audit Event Logger ─────────────────────────────────────────── */
async function recordAudit(zcql, { orderId, itemId = null, actorType = 'staff', actorLabel = 'counter', action, fromStatus, toStatus }) {
  try {
    const eventId = crypto.randomUUID();
    const now = nowSec();
    await zcql.executeZCQLQuery(
      `INSERT INTO order_events (id, order_id, item_id, actor_type, actor_label, action, from_status, to_status, timestamp) VALUES ('${eventId}', '${esc(orderId)}', ${itemId ? `'${esc(itemId)}'` : 'NULL'}, '${esc(actorType)}', '${esc(actorLabel)}', '${esc(action)}', '${esc(fromStatus)}', '${esc(toStatus)}', ${now})`
    );
  } catch (err) {
    // Audit logging should not crash the main transaction
  }
}

/* ─── 1. PAIRING ENDPOINT (Public with Setup Code) ────────────────── */
router.post('/pair', async (req, res) => {
  try {
    const { setupCode, label = 'Counter Browser' } = req.body;
    const expectedSetupCode = process.env.STAFF_SETUP_CODE;

    if (!expectedSetupCode) {
      return res.status(500).json({ error: 'Staff setup code is not configured on the server' });
    }

    if (!setupCode || !timingSafeCompare(String(setupCode).trim(), expectedSetupCode)) {
      return res.status(401).json({ error: 'Invalid shop setup code' });
    }

    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;

    const deviceId = crypto.randomUUID();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const now = nowSec();

    if (catalystApp) {
      try {
        const table = catalystApp.datastore().table('staff_devices');
        await table.addRow({
          label: esc(label),
          token_hash: tokenHash,
          created_at: now,
          last_seen_at: now,
          revoked: false
        });
      } catch (tableErr) {
        if (zcql) {
          await zcql.executeZCQLQuery(
            `INSERT INTO staff_devices (label, token_hash, created_at, last_seen_at, revoked) VALUES ('${esc(label)}', '${tokenHash}', ${now}, ${now}, false)`
          ).catch(() => {});
        }
      }
    }

    memStaffDevices.set(tokenHash, {
      id: deviceId,
      label,
      token_hash: tokenHash,
      created_at: now,
      last_seen_at: now,
      revoked: false
    });

    // Set HttpOnly, Secure, SameSite=Strict cookie for 1 year
    res.cookie('staff_device_token', rawToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    res.json({
      ok: true,
      deviceId,
      token: rawToken,
      deviceToken: rawToken,
      label
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to pair device: ' + err.message });
  }
});

/* ─── Authenticated Staff Endpoints ──────────────────────────────── */
router.use(authenticateStaff);
router.use(staffRateLimiter);

/* ─── 2. LIVE DELTA FEED ─────────────────────────────────────────── */
router.get('/live', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const now = nowSec();

    // Trigger lazy file purge on staff poll
    if (typeof global.__printbk_purgeExpiredFiles === 'function') {
      try {
        const filestore = catalystApp ? catalystApp.filestore() : null;
        await global.__printbk_purgeExpiredFiles(catalystApp, zcql, filestore);
      } catch (_) {}
    }

    // 1. Fetch shop_settings
    const mem = global.__printbk_shop_settings || {};
    let rawShop = {
      version: Number(mem.version || 1),
      open: mem.open !== false && String(mem.open) !== 'false',
      paused: mem.paused === true || String(mem.paused) === 'true',
      hours_enabled: mem.hours_enabled === true || String(mem.hours_enabled) === 'true' || mem.open_by_hours === true,
      closed_since: mem.closed_since || null,
      announcement: mem.announcement || '',
      delete_delay_minutes: Number(mem.delete_delay_minutes || 5),
      mixed_colour_mode: mem.mixed_colour_mode || 'split',
      rates: mem.rates || { bw: '1.50', colour: '8.00', duplex: '0.85', bulk: '100', a3: '2', legal: '1.25' },
      services: mem.services || {},
      payments: mem.payments || { cash: true, upi: true },
      shop_info: mem.shop_info || { name: 'HKBK Student Point', address: 'HKBK College Campus, Bengaluru' },
      printer_mapping: mem.shop_info?.printer_mapping || {}
    };
    if (zcql) {
      try {
        const settingsRows = await zcql.executeZCQLQuery(`SELECT * FROM shop_settings WHERE id = 'default' LIMIT 1`);
        if (settingsRows && settingsRows.length > 0) {
          const s = settingsRows[0].shop_settings;
          rawShop = {
            version: Number(s.version || mem.version || 1),
            open: s.open !== false && String(s.open) !== 'false',
            paused: s.paused === true || String(s.paused) === 'true',
            hours_enabled: s.hours_enabled === true || String(s.hours_enabled) === 'true' || s.open_by_hours === true,
            closed_since: s.closed_since ? Number(s.closed_since) : null,
            announcement: s.announcement || '',
            delete_delay_minutes: Number(s.delete_delay_minutes || 5),
            mixed_colour_mode: s.mixed_colour_mode || 'split',
            rates: typeof s.rates === 'string' ? JSON.parse(s.rates || '{}') : s.rates || rawShop.rates,
            services: typeof s.services === 'string' ? JSON.parse(s.services || '{}') : s.services || {},
            payments: typeof s.payments === 'string' ? JSON.parse(s.payments || '{}') : s.payments || rawShop.payments,
            shop_info: typeof s.shop_info === 'string' ? JSON.parse(s.shop_info || '{}') : s.shop_info || rawShop.shop_info,
            printer_mapping: (typeof s.shop_info === 'string' ? JSON.parse(s.shop_info || '{}') : s.shop_info || {}).printer_mapping || {}
          };
        }
      } catch (_) {}
    }

    const effective = computeEffectiveShopStatus(rawShop, now);
    const shop = {
      ...rawShop,
      open: effective.open,
      effectiveOpen: effective.open,
      reason: effective.reason,
      closedSince: effective.closedSince,
      closed_since: effective.closedSince,
      reopenAt: effective.reopenAt,
      announcement: effective.announcement,
      precedenceDescription: effective.precedenceDescription
    };

    // 2. Fetch printers reported by agent
    let printers = [];
    if (zcql) {
      try {
        const printerRows = await zcql.executeZCQLQuery(`SELECT * FROM printers`);
        for (const r of (printerRows || [])) {
          const p = r.printers;
          printers.push({
            id: p.id,
            name: p.name,
            role: p.role,
            online: p.online !== false && String(p.online) !== 'false',
            status: p.status,
            lastSeen: Number(p.last_seen || 0)
          });
        }
      } catch (_) {}
    }

    // If no printers in DB, check in-memory printers reported by agent
    if (printers.length === 0 && global.__printbk_printers && global.__printbk_printers.size > 0) {
      for (const [pName, p] of global.__printbk_printers) {
        const isOnline = p.online !== false && (now - Number(p.last_seen || 0) < 15);
        printers.push({
          id: p.id || pName,
          name: p.name || pName,
          role: p.role || 'bw',
          online: isOnline,
          status: isOnline ? (p.status || 'ready') : 'offline',
          lastSeen: Number(p.last_seen || 0)
        });
      }
    }

    // No agent connected yet — return empty list so the UI shows "no printers" state
    // (instead of fake placeholder printers that appear online but cannot print)

    // 3. Fetch active orders
    const deleteCutoff = now - (shop.delete_delay_minutes * 60);
    const activeStatuses = "'pending_cash', 'upi_claimed', 'cash_collected', 'processing', 'printing', 'ready', 'waiting_quote', 'quote_sent'";
    
    const ordersMap = new Map();
    const includeTest = req.query.include_test === 'true' || req.headers['x-include-test'] === 'true';
    if (zcql) {
      try {
        const testFilter = includeTest ? '' : '(is_test IS NULL OR is_test = false) AND ';
        const orderRows = await zcql.executeZCQLQuery(
          `SELECT id, order_number, status, total, quote_pending, basket, is_test, created_at, updated_at FROM orders WHERE ${testFilter}status IN (${activeStatuses}) ORDER BY created_at ASC`
        ).catch(async () => {
          return zcql.executeZCQLQuery(
            `SELECT id, order_number, status, total, quote_pending, basket, created_at, updated_at FROM orders WHERE status IN (${activeStatuses}) ORDER BY created_at ASC`
          ).catch(() => []);
        });
        for (const r of (orderRows || [])) {
          ordersMap.set(r.orders.id, r.orders);
        }
      } catch (e) {
        try {
          const orderRows = await zcql.executeZCQLQuery(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 50`);
          for (const r of (orderRows || [])) {
            ordersMap.set(r.orders.id, r.orders);
          }
        } catch (_) {}
      }
    }

    // Merge in-memory orders
    for (const [id, o] of memOrders) {
      const activeList = ['pending_cash', 'upi_claimed', 'cash_collected', 'processing', 'printing', 'ready', 'waiting_quote', 'quote_sent'];
      if (activeList.includes(o.status) && !ordersMap.has(id)) {
        ordersMap.set(id, o);
      }
    }

    const orders = [];
    const items = [];
    const recentlyPrinted = [];

    for (const o of ordersMap.values()) {
      let b = {};
      try { b = typeof o.basket === 'string' ? JSON.parse(o.basket || '{}') : (o.basket || {}); } catch (_) {}
      if (!includeTest && (o.is_test === true || String(o.is_test) === 'true' || b.is_test === true)) {
        continue;
      }

      const num = Number(o.order_number || 0);
      const orderObj = {
        id: o.id,
        orderId: o.id,
        order_id: o.id,
        orderNumber: num,
        order_number: num,
        status: o.status,
        total: Number(o.total || 0),
        quotePending: !!o.quote_pending,
        pickupCode: b.pickupCode || (num ? String(num).slice(-4) : '—'),
        pickup_code: b.pickupCode || (num ? String(num).slice(-4) : '—'),
        payment: computePaymentStatus(o),
        payment_status: computePaymentStatus(o),
        createdAt: Number(o.created_at || now),
        updatedAt: Number(o.updated_at || now)
      };

      orders.push(orderObj);

      // Extract items: check memOrderItems first
      const orderMemItems = [];
      for (const it of memOrderItems.values()) {
        if (it.order_id === o.id) orderMemItems.push(it);
      }

      if (orderMemItems.length > 0) {
        for (const it of orderMemItems) {
          const specObj = typeof it.payload === 'string' ? JSON.parse(it.payload || '{}') : (it.payload || {});
          const matchingTyped = (b.typedItems || []).find(t => t.id === it.id);
          const printInstructions = it.printInstructions || it.print_instructions || matchingTyped?.printInstructions || specObj.printInstructions || '';
          items.push({
            id: it.id,
            orderId: o.id,
            order_id: o.id,
            orderNumber: orderObj.orderNumber,
            order_number: orderObj.orderNumber,
            pickup_code: orderObj.pickupCode,
            pickupCode: orderObj.pickupCode,
            kind: it.kind,
            type: it.kind,
            title: it.kind.includes('colour') ? 'Colour Document' : (it.kind.includes('photo') ? 'Photo Print' : (it.kind.includes('bw') ? 'B&W Document' : (it.kind.includes('binding') ? 'Spiral binding' : (it.kind.includes('lamination') ? 'Lamination' : 'Service Document')))),
            quantity: 1,
            price: Number(it.price || 0),
            status: it.status,
            payment_status: computePaymentStatus(o),
            pages_done: 0,
            pages_total: 1,
            created_at: new Date(orderObj.createdAt * 1000).toISOString(),
            specifications: specObj,
            payload: specObj,
            printInstructions: printInstructions,
            print_instructions: printInstructions
          });
        }
      } else {
        // Fallback to typedItems in basket
        const typed = b.typedItems || [];
        for (const item of typed) {
          items.push({
            id: item.id || `${o.id}_${item.type || 'doc'}`,
            orderId: o.id,
            order_id: o.id,
            orderNumber: orderObj.orderNumber,
            order_number: orderObj.orderNumber,
            pickup_code: orderObj.pickupCode,
            pickupCode: orderObj.pickupCode,
            kind: item.type,
            type: item.type,
            title: item.title,
            quantity: item.quantity || 1,
            price: item.computedPricing?.lineTotal || 0,
            status: (o.status === 'cash_collected' || o.status === 'upi_claimed') ? 'ready_to_print' : (o.status === 'pending_cash' ? 'preparing' : 'waiting_payment'),
            payment_status: computePaymentStatus(o),
            pages_done: 0,
            pages_total: 1,
            created_at: new Date(orderObj.createdAt * 1000).toISOString(),
            specifications: item.specifications || {},
            payload: item.specifications || {},
            printInstructions: item.printInstructions || ''
          });
        }
      }
    }

    // 4. Fetch recently printed items
    if (zcql) {
      try {
        const printedRows = await zcql.executeZCQLQuery(
          `SELECT id, order_id, kind, status, payload, price, printed_at, delete_after FROM order_items WHERE printed_at >= ${deleteCutoff} ORDER BY printed_at DESC LIMIT 20`
        );
        for (const pr of (printedRows || [])) {
          const item = pr.order_items;
          recentlyPrinted.push({
            itemId: item.id,
            item_id: item.id,
            orderId: item.order_id,
            order_id: item.order_id,
            orderNumber: 1000,
            order_number: 1000,
            pickup_code: '',
            kind: item.kind,
            printedAt: Number(item.printed_at),
            printed_at: new Date(item.printed_at * 1000).toISOString(),
            expiresAt: Number(item.delete_after || item.printed_at + 300),
            delete_after: new Date((item.delete_after || item.printed_at + 300) * 1000).toISOString()
          });
        }
      } catch (_) {}
    }

    // Merge in-memory printed items
    for (const it of memOrderItems.values()) {
      if (it.status === 'printed' && it.printed_at && it.printed_at >= deleteCutoff) {
        if (!recentlyPrinted.some(rp => rp.itemId === it.id || rp.item_id === it.id)) {
          const ord = memOrders.get(it.order_id);
          let b = {};
          try { b = typeof ord?.basket === 'string' ? JSON.parse(ord.basket || '{}') : (ord?.basket || {}); } catch (_) {}
          recentlyPrinted.push({
            itemId: it.id,
            item_id: it.id,
            orderId: it.order_id,
            order_id: it.order_id,
            orderNumber: Number(ord?.order_number || 1000),
            order_number: Number(ord?.order_number || 1000),
            pickup_code: b.pickupCode || '',
            kind: it.kind,
            printedAt: Number(it.printed_at),
            printed_at: new Date(it.printed_at * 1000).toISOString(),
            expiresAt: Number(it.delete_after || it.printed_at + 300),
            delete_after: new Date((it.delete_after || it.printed_at + 300) * 1000).toISOString()
          });
        }
      }
    }

    // 5. Today aggregations & counters
    let todayCollected = 0;
    let todayOrdersCount = 0;
    let todayCash = 0;
    let todayUpi = 0;
    let todayPages = 0;

    for (const o of memOrders.values()) {
      if (['cash_collected', 'upi_claimed', 'processing', 'printing', 'ready', 'completed'].includes(o.status)) {
        todayOrdersCount++;
        const tot = Number(o.total || 0);
        todayCollected += tot;
        if (o.status === 'cash_collected') todayCash += tot;
        else todayUpi += tot;
        try {
          const b = typeof o.basket === 'string' ? JSON.parse(o.basket || '{}') : (o.basket || {});
          for (const f of (b.files || [])) {
            todayPages += Number(f.pages || 1) * Number(f.settings?.copies || 1);
          }
        } catch (_) {}
      }
    }

    const counters = {
      waiting: items.filter(it => it.status === 'ready_to_print' || it.status === 'preparing').length,
      cashToCollect: orders.filter(o => o.status === 'pending_cash').length,
      upiToVerify: orders.filter(o => o.status === 'upi_claimed').length,
      printedToday: todayOrdersCount,
      collectedToday: todayCollected
    };

    const today = {
      collected: todayCollected,
      orders: todayOrdersCount,
      pages: todayPages,
      cash: todayCash,
      online: todayUpi,
      averageWait: '5m 12s'
    };

    const payload = {
      timestamp: now,
      serverTime: Date.now(),
      shop,
      open: shop.open,
      announcement: shop.announcement,
      rates: shop.rates,
      printers,
      orders,
      items,
      recentlyPrinted,
      counters,
      today
    };

    // ETag calculation based on business state
    const stateFingerprint = JSON.stringify({
      open: shop.open,
      announcement: shop.announcement,
      rates: shop.rates,
      printers,
      orders,
      items,
      recentlyPrinted,
      counters,
      today
    });
    const etag = '"' + crypto.createHash('md5').update(stateFingerprint).digest('hex') + '"';
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch live feed: ' + err.message });
  }
});

/* ─── 3. STAFF ACTIONS ───────────────────────────────────────────── */

// A. Collect Cash (Allowed only when pending_cash)
router.post('/orders/:id/collect-cash', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const orderId = req.params.id;
    const now = nowSec();

    let o = null;
    if (zcql) {
      const rows = await zcql.executeZCQLQuery(`SELECT id, order_number, status, basket, total FROM orders WHERE id = '${esc(orderId)}' OR order_number = ${Number(orderId) || 0}`).catch(() => null);
      if (rows && rows.length > 0) o = rows[0].orders;
    }
    if (!o) o = memOrders.get(orderId);
    if (!o && !isNaN(Number(orderId))) {
      for (const ord of memOrders.values()) {
        if (ord.order_number === Number(orderId)) { o = ord; break; }
      }
    }
    if (!o) return res.status(404).json({ error: 'Order not found' });

    const primaryOrderId = o.id || orderId;

    if (o.status !== 'pending_cash') {
      return res.status(409).json({ error: `Cannot collect cash: order is in status '${o.status}'` });
    }

    // Save undo action snapshot
    const actionId = crypto.randomUUID();
    const undoPayload = JSON.stringify({ orderId: primaryOrderId, previousStatus: 'pending_cash' });
    const expiresAt = now + 5; // 5 seconds undo window

    memStaffActions.set(actionId, {
      id: actionId,
      action_type: 'collect_cash',
      order_id: primaryOrderId,
      payload: undoPayload,
      expires_at: expiresAt,
      undone: false,
      created_at: now
    });

    if (zcql) {
      await zcql.executeZCQLQuery(
        `INSERT INTO staff_actions (id, action_type, order_id, payload, expires_at, undone, created_at) VALUES ('${actionId}', 'collect_cash', '${esc(primaryOrderId)}', '${esc(undoPayload)}', ${expiresAt}, false, ${now})`
      ).catch(() => {});
      await zcql.executeZCQLQuery(
        `UPDATE orders SET status = 'cash_collected', payment_status = 'cash_collected', confirmed_by = 'staff', confirmed_at = ${now}, updated_at = ${now} WHERE id = '${esc(primaryOrderId)}' OR order_number = ${Number(o.order_number) || 0}`
      ).catch(async () => {
        await zcql.executeZCQLQuery(
          `UPDATE orders SET status = 'cash_collected', confirmed_by = 'staff', confirmed_at = ${now}, updated_at = ${now} WHERE id = '${esc(primaryOrderId)}' OR order_number = ${Number(o.order_number) || 0}`
        ).catch(() => {});
      });
      await zcql.executeZCQLQuery(
        `UPDATE order_items SET status = 'ready_to_print' WHERE (order_id = '${esc(primaryOrderId)}' OR order_id = '${esc(orderId)}') AND (status = 'waiting_payment' OR status = 'preparing')`
      ).catch(() => {});
    }

    o.status = 'cash_collected';
    o.payment_status = 'cash_collected';
    o.confirmed_by = 'staff';
    o.confirmed_at = now;
    o.updated_at = now;
    memOrders.set(primaryOrderId, o);
    memOrders.set(orderId, o);

    for (const it of memOrderItems.values()) {
      if ((it.order_id === primaryOrderId || it.order_id === orderId) && (it.status === 'waiting_payment' || it.status === 'preparing')) {
        it.status = 'ready_to_print';
      }
    }

    await recordAudit(zcql, {
      orderId,
      actorType: 'staff',
      actorLabel: req.staffDevice.label,
      action: 'collect_cash',
      fromStatus: 'pending_cash',
      toStatus: 'cash_collected'
    });

    res.json({ ok: true, orderId, status: 'cash_collected', actionId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to collect cash: ' + err.message });
  }
});

// B. Approve & Print Item (Allowed only when order is paid/verified)
router.post('/items/:id/approve-print', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const itemId = req.params.id;
    const now = nowSec();

    let itemRecord = memOrderItems.get(itemId);
    if (!itemRecord && zcql) {
      try {
        const itemRows = await zcql.executeZCQLQuery(`SELECT id, order_id, kind, status FROM order_items WHERE id = '${esc(itemId)}'`);
        if (itemRows && itemRows.length > 0) {
          itemRecord = itemRows[0].order_items;
        }
      } catch (_) {}
    }

    let orderId = req.body?.orderId || itemRecord?.order_id;
    let itemStatus = itemRecord?.status || 'ready_to_print';
    let kind = itemRecord?.kind || 'document_bw';

    if (['sending', 'printing', 'printed'].includes(itemStatus)) {
      return res.status(409).json({ error: `Item is already in status '${itemStatus}'` });
    }

    if (!orderId && zcql) {
      try {
        const activeOrderRows = await zcql.executeZCQLQuery(
          `SELECT id, order_number, status, basket FROM orders WHERE status IN ('pending_cash', 'upi_claimed', 'cash_collected', 'processing', 'printing') ORDER BY created_at DESC LIMIT 50`
        );
        for (const r of (activeOrderRows || [])) {
          try {
            const b = typeof r.orders.basket === 'string' ? JSON.parse(r.orders.basket || '{}') : (r.orders.basket || {});
            if (b.typedItems && b.typedItems.some(it => it.id === itemId)) {
              orderId = r.orders.id;
              order = r.orders;
              break;
            }
          } catch (_) {}
        }
      } catch (_) {}
    }

    if (!orderId) {
      for (const [oid, o] of memOrders) {
        try {
          const b = typeof o.basket === 'string' ? JSON.parse(o.basket || '{}') : (o.basket || {});
          if (b.typedItems && b.typedItems.some(it => it.id === itemId)) {
            orderId = oid;
            order = o;
            break;
          }
        } catch (_) {}
      }
    }

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required to verify payment' });
    }

    if (!order) {
      let oRecord = memOrders.get(orderId);
      if (!oRecord && zcql) {
        const orderRows = await zcql.executeZCQLQuery(`SELECT id, order_number, status, basket FROM orders WHERE id = '${esc(orderId)}' OR order_number = ${Number(orderId) || 0}`).catch(() => null);
        if (orderRows && orderRows.length > 0) oRecord = orderRows[0].orders;
      }
      if (!oRecord && !isNaN(Number(orderId))) {
        for (const ord of memOrders.values()) {
          if (ord.order_number === Number(orderId)) { oRecord = ord; break; }
        }
      }
      order = oRecord;
    }

    if (!order) return res.status(404).json({ error: 'Order not found' });

    const isPaid = ['cash_collected', 'upi_claimed', 'paid', 'processing', 'printing'].includes(order.status);
    if (!isPaid) {
      return res.status(409).json({ error: 'Cannot print: payment has not been collected or verified' });
    }

    // Determine target printer based on assigned printer mapping or registered printers
    let targetPrinter = '';
    if (zcql) {
      try {
        const sRows = await zcql.executeZCQLQuery(`SELECT shop_info FROM shop_settings WHERE id = 'default' LIMIT 1`);
        if (sRows && sRows.length > 0) {
          const sInfo = typeof sRows[0].shop_settings.shop_info === 'string' ? JSON.parse(sRows[0].shop_settings.shop_info || '{}') : (sRows[0].shop_settings.shop_info || {});
          if (sInfo.printer_mapping) {
            targetPrinter = kind.includes('colour') ? sInfo.printer_mapping.colour : sInfo.printer_mapping.bw;
          }
        }
      } catch (_) {}
    }
    if (!targetPrinter && zcql) {
      try {
        const pRows = await zcql.executeZCQLQuery(`SELECT name, role FROM printers WHERE role = '${kind.includes('colour') ? 'colour' : 'bw'}' OR role = 'both' ORDER BY online DESC LIMIT 1`);
        if (pRows && pRows.length > 0) targetPrinter = pRows[0].printers.name;
      } catch (_) {}
    }
    if (!targetPrinter && global.__printbk_printers) {
      for (const [pName, p] of global.__printbk_printers) {
        if ((kind.includes('colour') && (p.role === 'colour' || p.role === 'both')) || (!kind.includes('colour') && (p.role === 'bw' || p.role === 'both'))) {
          targetPrinter = p.name || pName;
          break;
        }
      }
    }
    if (!targetPrinter) {
      targetPrinter = kind.includes('colour') ? 'Colour Printer' : 'B&W Printer';
    }

    // Ensure item record exists for print agent dispatch
    if (!itemRecord && order) {
      let b = {};
      try { b = typeof order.basket === 'string' ? JSON.parse(order.basket || '{}') : (order.basket || {}); } catch (_) {}
      const matched = (b.typedItems || []).find(it => it.id === itemId);
      if (matched) {
        itemRecord = {
          id: itemId,
          order_id: orderId,
          order_number: order.order_number,
          kind: matched.type,
          status: 'sending',
          payload: JSON.stringify(matched.specifications || {}),
          file_refs: JSON.stringify(matched.specifications?.fileId ? [matched.specifications.fileId] : []),
          printer_role: kind.includes('colour') ? 'colour' : 'bw'
        };
        memOrderItems.set(itemId, itemRecord);
        if (zcql) {
          const payloadStr = esc(itemRecord.payload);
          const fileRefsStr = esc(itemRecord.file_refs);
          await zcql.executeZCQLQuery(
            `INSERT INTO order_items (id, order_id, kind, status, payload, price, file_refs, printer_role, created_at) VALUES ('${itemId}', '${orderId}', '${itemRecord.kind}', 'sending', '${payloadStr}', ${Number(matched.computedPricing?.lineTotal || 0)}, '${fileRefsStr}', '${itemRecord.printer_role}', ${now})`
          ).catch(() => {});
        }
      }
    }

    // Queue print job for print agent
    const printJobId = crypto.randomUUID();

    memPrintJobs.set(printJobId, {
      id: printJobId,
      item_id: itemId,
      itemId: itemId,
      attempt: 1,
      status: 'queued',
      pages_done: 0,
      pages_total: 1,
      printer: targetPrinter,
      created_at: now,
      updated_at: now
    });

    if (itemRecord) itemRecord.status = 'sending';
    const isUpiOrder = order.status === 'upi_claimed' || (order.basket && (order.basket.payment === 'upi' || order.basket.paymentMethod === 'upi'));
    const targetPaymentStatus = isUpiOrder ? 'paid_verified' : (order.payment_status || 'paid_verified');
    order.status = 'processing';
    order.payment_status = targetPaymentStatus;
    order.updated_at = now;

    if (zcql) {
      await zcql.executeZCQLQuery(
        `INSERT INTO print_jobs (id, item_id, attempt, status, pages_done, pages_total, printer, created_at, updated_at) VALUES ('${printJobId}', '${esc(itemId)}', 1, 'queued', 0, 1, '${esc(targetPrinter)}', ${now}, ${now})`
      ).catch(() => {});
      await zcql.executeZCQLQuery(
        `UPDATE order_items SET status = 'sending' WHERE id = '${esc(itemId)}'`
      ).catch(() => {});
      await zcql.executeZCQLQuery(
        `UPDATE orders SET status = 'processing', payment_status = '${targetPaymentStatus}', updated_at = ${now} WHERE id = '${esc(orderId)}'`
      ).catch(async () => {
        await zcql.executeZCQLQuery(
          `UPDATE orders SET status = 'processing', updated_at = ${now} WHERE id = '${esc(orderId)}'`
        ).catch(() => {});
      });
    }

    await recordAudit(zcql, {
      orderId,
      itemId,
      actorType: 'staff',
      actorLabel: req.staffDevice.label,
      action: 'approve_print',
      fromStatus: itemStatus,
      toStatus: 'sending'
    });

    res.json({ ok: true, itemId, status: 'sending', printJobId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve print: ' + err.message });
  }
});

// C. Retry Print Item (Allowed when failed)
router.post('/items/:id/retry-print', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const itemId = req.params.id;
    const now = nowSec();

    const printJobId = crypto.randomUUID();
    memPrintJobs.set(printJobId, {
      id: printJobId,
      item_id: itemId,
      itemId: itemId,
      attempt: 2,
      status: 'queued',
      pages_done: 0,
      pages_total: 1,
      created_at: now,
      updated_at: now
    });

    const it = memOrderItems.get(itemId);
    if (it) it.status = 'sending';

    if (zcql) {
      await zcql.executeZCQLQuery(
        `INSERT INTO print_jobs (id, item_id, attempt, status, pages_done, pages_total, created_at, updated_at) VALUES ('${printJobId}', '${esc(itemId)}', 2, 'queued', 0, 1, ${now}, ${now})`
      ).catch(() => {});
      await zcql.executeZCQLQuery(`UPDATE order_items SET status = 'sending' WHERE id = '${esc(itemId)}'`).catch(() => {});
    }

    res.json({ ok: true, itemId, status: 'sending' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retry print: ' + err.message });
  }
});

// D. Physical Service Done (Binding, Lamination, Scanning, Photocopy)
router.post('/items/:id/done', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const itemId = req.params.id;

    const it = memOrderItems.get(itemId);
    if (it) it.status = 'done';

    if (zcql) {
      await zcql.executeZCQLQuery(`UPDATE order_items SET status = 'done' WHERE id = '${esc(itemId)}'`).catch(() => {});
    }

    res.json({ ok: true, itemId, status: 'done' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark service done: ' + err.message });
  }
});

// E. Send Quote for Custom Typing / Request
router.post('/items/:id/quote', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const itemId = req.params.id;
    const { amount = 0, quoteAmount = 0, notes = '' } = req.body;
    const finalAmount = Number(amount || quoteAmount);
    const now = nowSec();

    const it = memOrderItems.get(itemId);
    let orderId = it ? it.order_id : null;
    if (it) {
      it.status = 'quote_sent';
      it.price = finalAmount;
    }

    if (zcql) {
      try {
        await zcql.executeZCQLQuery(`UPDATE order_items SET status = 'quote_sent', price = ${finalAmount} WHERE id = '${esc(itemId)}'`);
        const itemRows = await zcql.executeZCQLQuery(`SELECT order_id FROM order_items WHERE id = '${esc(itemId)}'`);
        if (itemRows && itemRows.length > 0) orderId = itemRows[0].order_items.order_id;
      } catch (_) {}
    }

    if (orderId) {
      const o = memOrders.get(orderId);
      if (o) {
        o.status = 'quote_sent';
        o.total = finalAmount;
        o.updated_at = now;
      }
      if (zcql) {
        await zcql.executeZCQLQuery(`UPDATE orders SET status = 'quote_sent', total = ${finalAmount}, updated_at = ${now} WHERE id = '${esc(orderId)}'`).catch(() => {});
      }
    }

    res.json({ ok: true, itemId, orderId, status: 'quote_sent', amount: finalAmount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send quote: ' + err.message });
  }
});

// F. Reject Order
router.post('/orders/:id/reject', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const orderId = req.params.id;
    const { reason = 'Order rejected by staff' } = req.body;
    const now = nowSec();

    let o = memOrders.get(orderId);
    if (!o && zcql) {
      const rows = await zcql.executeZCQLQuery(`SELECT id, status FROM orders WHERE id = '${esc(orderId)}'`).catch(() => null);
      if (rows && rows.length > 0) o = rows[0].orders;
    }
    if (!o) return res.status(404).json({ error: 'Order not found' });

    const previousStatus = o.status;
    o.status = 'rejected';
    o.updated_at = now;
    memOrders.set(orderId, o);

    const actionId = crypto.randomUUID();
    const undoPayload = JSON.stringify({ orderId, previousStatus });
    memStaffActions.set(actionId, {
      id: actionId,
      action_type: 'reject',
      order_id: orderId,
      payload: undoPayload,
      expires_at: now + 5,
      undone: false,
      created_at: now
    });

    if (zcql) {
      await zcql.executeZCQLQuery(
        `INSERT INTO staff_actions (id, action_type, order_id, payload, expires_at, undone, created_at) VALUES ('${actionId}', 'reject', '${esc(orderId)}', '${esc(undoPayload)}', ${now + 5}, false, ${now})`
      ).catch(() => {});
      await zcql.executeZCQLQuery(`UPDATE orders SET status = 'rejected', updated_at = ${now} WHERE id = '${esc(orderId)}'`).catch(() => {});
    }

    res.json({ ok: true, orderId, status: 'rejected', actionId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject order: ' + err.message });
  }
});

// G. 5-Second Undo Action
router.post(['/undo', '/actions/:id/undo'], async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const actionId = req.params.id || req.body?.actionId;
    if (!actionId) return res.status(400).json({ error: 'Action ID required' });
    const now = nowSec();

    let act = null;
    if (zcql) {
      const rows = await zcql.executeZCQLQuery(`SELECT * FROM staff_actions WHERE id = '${esc(actionId)}'`).catch(() => null);
      if (rows && rows.length > 0) act = rows[0].staff_actions;
    }
    if (!act) act = memStaffActions.get(actionId);
    if (!act) return res.status(404).json({ error: 'Action not found' });

    if (act.undone === true || String(act.undone) === 'true') {
      return res.status(409).json({ error: 'Action has already been undone' });
    }

    if (now > Number(act.expires_at)) {
      return res.status(410).json({ error: 'Undo window has expired' });
    }

    const payload = typeof act.payload === 'string' ? JSON.parse(act.payload || '{}') : (act.payload || {});
    if (payload.orderId && payload.previousStatus) {
      if (zcql) {
        await zcql.executeZCQLQuery(
          `UPDATE orders SET status = '${esc(payload.previousStatus)}', updated_at = ${now} WHERE id = '${esc(payload.orderId)}'`
        ).catch(() => {});
      }
      const memO = memOrders.get(payload.orderId);
      if (memO) {
        memO.status = payload.previousStatus;
        memO.updated_at = now;
      }
    }

    act.undone = true;
    if (zcql) {
      await zcql.executeZCQLQuery(`UPDATE staff_actions SET undone = true WHERE id = '${esc(actionId)}'`).catch(() => {});
    }

    res.json({ ok: true, undone: true });
  } catch (err) {
    res.status(500).json({ error: 'Undo failed: ' + err.message });
  }
});


// G2. Trigger Printer Test Print
router.post('/printers/:id/test-print', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const printerId = req.params.id;
    const now = nowSec();

    let printerName = req.body.printerName || printerId;
    if (zcql) {
      try {
        const rows = await zcql.executeZCQLQuery(`SELECT name FROM printers WHERE id = '${esc(printerId)}' OR name = '${esc(printerId)}' LIMIT 1`);
        if (rows && rows.length > 0) printerName = rows[0].printers.name;
      } catch (_) {}
    }

    const printJobId = crypto.randomUUID();
    if (zcql) {
      await zcql.executeZCQLQuery(
        `INSERT INTO print_jobs (id, item_id, attempt, status, pages_done, pages_total, printer, created_at, updated_at) VALUES ('${printJobId}', 'test-print-${esc(printerId)}', 1, 'queued', 0, 1, '${esc(printerName)}', ${now}, ${now})`
      ).catch(() => {});
    }
    memPrintJobs.set(printJobId, {
      id: printJobId,
      item_id: `test-print-${printerId}`,
      attempt: 1,
      status: 'queued',
      pages_done: 0,
      pages_total: 1,
      printer: printerName,
      created_at: now,
      updated_at: now
    });

    res.json({ ok: true, jobId: printJobId, printer: printerName, message: 'Test print queued' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to queue test print: ' + err.message });
  }
});

// G3. Trigger Print QR Code
router.post('/printers/:id/print-qr', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const printerId = req.params.id;
    const now = nowSec();

    let printerName = req.body.printerName || printerId;
    if (zcql) {
      try {
        const rows = await zcql.executeZCQLQuery(`SELECT name FROM printers WHERE id = '${esc(printerId)}' OR name = '${esc(printerId)}' LIMIT 1`);
        if (rows && rows.length > 0) printerName = rows[0].printers.name;
      } catch (_) {}
    }

    const printJobId = crypto.randomUUID();
    if (zcql) {
      await zcql.executeZCQLQuery(
        `INSERT INTO print_jobs (id, item_id, attempt, status, pages_done, pages_total, printer, created_at, updated_at) VALUES ('${printJobId}', 'print-qr-${esc(printerId)}', 1, 'queued', 0, 1, '${esc(printerName)}', ${now}, ${now})`
      ).catch(() => {});
    }
    memPrintJobs.set(printJobId, {
      id: printJobId,
      item_id: `print-qr-${printerId}`,
      attempt: 1,
      status: 'queued',
      pages_done: 0,
      pages_total: 1,
      printer: printerName,
      created_at: now,
      updated_at: now
    });

    res.json({ ok: true, jobId: printJobId, printer: printerName, message: 'Print QR queued' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to queue print QR: ' + err.message });
  }
});

// G4. Manually Add / Configure Printer
router.post('/printers/add', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const { name, role = 'both', online = true } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Printer name is required' });
    }
    const printerName = name.trim();
    const now = nowSec();
    const printerId = crypto.randomUUID();

    if (zcql) {
      try {
        const existing = await zcql.executeZCQLQuery(`SELECT id FROM printers WHERE name = '${esc(printerName)}' LIMIT 1`);
        if (existing && existing.length > 0) {
          await zcql.executeZCQLQuery(`UPDATE printers SET role = '${esc(role)}', online = ${!!online}, last_seen = ${now} WHERE id = '${existing[0].printers.id}'`);
        } else {
          await zcql.executeZCQLQuery(`INSERT INTO printers (id, name, role, online, status, last_seen) VALUES ('${printerId}', '${esc(printerName)}', '${esc(role)}', ${!!online}, 'ready', ${now})`);
        }
      } catch (_) {}
    }

    if (global.__printbk_printers) {
      global.__printbk_printers.set(printerName, {
        id: printerId,
        name: printerName,
        role,
        online: !!online,
        status: 'ready',
        last_seen: now
      });
    }

    res.json({ ok: true, printer: { id: printerId, name: printerName, role, online: !!online, status: 'ready' } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add printer: ' + err.message });
  }
});

// G2. Get Full Shop Settings (Staff Authenticated)
router.get('/settings', authenticateStaff, async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    let s = null;
    if (zcql) {
      try {
        const rows = await zcql.executeZCQLQuery("SELECT * FROM shop_settings WHERE id = 'default' LIMIT 1");
        if (rows && rows.length > 0) s = rows[0].shop_settings;
      } catch (_) {}
    }
    const mem = global.__printbk_shop_settings;
    const now = nowSec();

    let printers = [];
    if (zcql) {
      try {
        const pRows = await zcql.executeZCQLQuery("SELECT * FROM printers");
        printers = (pRows || []).map(r => ({
          id: r.printers.id,
          name: r.printers.name,
          role: r.printers.role,
          online: r.printers.online !== false && String(r.printers.online) !== 'false',
          status: r.printers.status
        }));
      } catch (_) {}
    }
    if (printers.length === 0 && global.__printbk_printers) {
      for (const p of global.__printbk_printers.values()) {
        printers.push(p);
      }
    }

    const rates = typeof s?.rates === 'string' ? JSON.parse(s.rates) : (s?.rates || mem?.rates || {});
    const services = typeof s?.services === 'string' ? JSON.parse(s.services) : (s?.services || mem?.services || {});
    const payments = typeof s?.payments === 'string' ? JSON.parse(s.payments) : (s?.payments || mem?.payments || {});
    const shop_info = typeof s?.shop_info === 'string' ? JSON.parse(s.shop_info) : (s?.shop_info || mem?.shop_info || {});

    const settings = {
      version: Number(s?.version || mem?.version || 1),
      open: s ? (s.open !== false && String(s.open) !== 'false') : (mem?.open !== false),
      closed_since: s?.closed_since || mem?.closed_since || null,
      announcement: s?.announcement ?? mem?.announcement ?? '',
      rates,
      services,
      payments,
      shop_info,
      delete_delay_minutes: Number(s?.delete_delay_minutes || mem?.delete_delay_minutes || 5),
      mixed_colour_mode: s?.mixed_colour_mode || mem?.mixed_colour_mode || 'split',
      printer_mapping: shop_info.printer_mapping || {},
      printers,
      updated_at: Number(s?.updated_at || mem?.updated_at || now),
      razorpay_configured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
      razorpay_key_id: process.env.RAZORPAY_KEY_ID ? `${process.env.RAZORPAY_KEY_ID.slice(0, 8)}...` : ''
    };

    res.json({ ok: true, settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings: ' + err.message });
  }
});

// H. Update Shop Settings (Validated, Versioned & Audited)
router.put('/settings', authenticateStaff, async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const now = nowSec();

    let existing = {};
    if (zcql) {
      try {
        const rows = await zcql.executeZCQLQuery("SELECT * FROM shop_settings WHERE id = 'default' LIMIT 1");
        if (rows && rows.length > 0) {
          existing = rows[0].shop_settings || {};
        }
      } catch (_) {}
    }
    const mem = global.__printbk_shop_settings || (global.__printbk_shop_settings = {});

    // Optimistic Version Check (if client provided expected_version)
    const currentVersion = Number(existing.version || mem.version || 1);
    if (typeof req.body.expected_version !== 'undefined' && req.body.expected_version !== null) {
      const expected = Number(req.body.expected_version);
      if (expected !== currentVersion) {
        return res.status(409).json({
          error: 'Settings have been updated by another terminal. Please reload.',
          conflict: true,
          currentVersion
        });
      }
    }

    // Input Validation
    if (req.body.rates && typeof req.body.rates === 'object') {
      for (const [key, val] of Object.entries(req.body.rates)) {
        if (typeof val === 'number' && (isNaN(val) || val < 0)) {
          return res.status(400).json({ error: `Rate for "${key}" cannot be negative` });
        }
      }
    }
    if (typeof req.body.delete_delay_minutes !== 'undefined') {
      const d = Number(req.body.delete_delay_minutes);
      if (isNaN(d) || d < 1 || d > 60) {
        return res.status(400).json({ error: 'Delete delay must be between 1 and 60 minutes' });
      }
    }

    const newVersion = currentVersion + 1;

    // Track open status and closed_since
    let isOpen = existing.open !== false && String(existing.open) !== 'false';
    let closedSince = existing.closed_since || mem.closed_since || null;
    if (typeof req.body.open !== 'undefined') {
      const requestedOpen = req.body.open === true || req.body.open === 'true';
      if (isOpen && !requestedOpen) {
        closedSince = now;
      } else if (!isOpen && requestedOpen) {
        closedSince = null;
      }
      isOpen = requestedOpen;
    }

    let isPaused = typeof req.body.paused !== 'undefined'
      ? (req.body.paused === true || req.body.paused === 'true')
      : (existing.paused === true || String(existing.paused) === 'true' || mem.paused === true);
    let hoursEnabled = typeof req.body.hours_enabled !== 'undefined'
      ? (req.body.hours_enabled === true || req.body.hours_enabled === 'true')
      : (typeof req.body.open_by_hours !== 'undefined'
          ? (req.body.open_by_hours === true || req.body.open_by_hours === 'true')
          : (existing.hours_enabled === true || String(existing.hours_enabled) === 'true' || mem.hours_enabled === true));

    // Merge shop_info
    let existingShopInfo = {};
    try {
      existingShopInfo = typeof existing.shop_info === 'string' ? JSON.parse(existing.shop_info) : (existing.shop_info || mem.shop_info || {});
    } catch (_) {}

    const shopInfoMerged = {
      ...existingShopInfo,
      ...(req.body.shop_info || {})
    };
    if (req.body.printer_mapping) {
      shopInfoMerged.printer_mapping = {
        ...(existingShopInfo.printer_mapping || {}),
        ...req.body.printer_mapping
      };
    }

    // Merge rates
    let existingRates = {};
    try {
      existingRates = typeof existing.rates === 'string' ? JSON.parse(existing.rates) : (existing.rates || mem.rates || {});
    } catch (_) {}
    const ratesMerged = {
      ...existingRates,
      ...(req.body.rates || {})
    };

    // Merge services
    let existingServices = {};
    try {
      existingServices = typeof existing.services === 'string' ? JSON.parse(existing.services) : (existing.services || mem.services || {});
    } catch (_) {}
    const servicesMerged = {
      ...existingServices,
      ...(req.body.services || {})
    };

    // Merge payments
    let existingPayments = {};
    try {
      existingPayments = typeof existing.payments === 'string' ? JSON.parse(existing.payments) : (existing.payments || mem.payments || {});
    } catch (_) {}
    const paymentsMerged = {
      ...existingPayments,
      ...(req.body.payments || {})
    };

    const announcement = typeof req.body.announcement !== 'undefined' ? req.body.announcement : (existing.announcement ?? mem.announcement ?? '');
    const deleteDelay = typeof req.body.delete_delay_minutes !== 'undefined' ? Number(req.body.delete_delay_minutes) : (Number(existing.delete_delay_minutes) || 5);
    const mixedMode = req.body.mixed_colour_mode || existing.mixed_colour_mode || mem.mixed_colour_mode || 'split';

    // Update in-memory store immediately
    mem.version = newVersion;
    mem.open = isOpen;
    mem.paused = isPaused;
    mem.hours_enabled = hoursEnabled;
    mem.open_by_hours = hoursEnabled;
    mem.closed_since = closedSince;
    mem.announcement = announcement;
    mem.rates = ratesMerged;
    mem.services = servicesMerged;
    mem.payments = paymentsMerged;
    mem.shop_info = shopInfoMerged;
    mem.delete_delay_minutes = deleteDelay;
    mem.mixed_colour_mode = mixedMode;
    mem.updated_at = now;

    // Persist to ZCQL
    if (zcql) {
      const updates = [
        `version = ${newVersion}`,
        `open = ${isOpen}`,
        `announcement = '${esc(announcement)}'`,
        `rates = '${esc(JSON.stringify(ratesMerged))}'`,
        `services = '${esc(JSON.stringify(servicesMerged))}'`,
        `payments = '${esc(JSON.stringify(paymentsMerged))}'`,
        `shop_info = '${esc(JSON.stringify(shopInfoMerged))}'`,
        `delete_delay_minutes = ${deleteDelay}`,
        `mixed_colour_mode = '${esc(mixedMode)}'`,
        `updated_at = ${now}`
      ];
      if (closedSince) {
        updates.push(`closed_since = ${closedSince}`);
      }

      try {
        await zcql.executeZCQLQuery(`UPDATE shop_settings SET ${updates.join(', ')} WHERE id = 'default'`);
      } catch (_) {
        try {
          const ratesJson = esc(JSON.stringify(ratesMerged));
          const servicesJson = esc(JSON.stringify(servicesMerged));
          const paymentsJson = esc(JSON.stringify(paymentsMerged));
          const shopJson = esc(JSON.stringify(shopInfoMerged));
          await zcql.executeZCQLQuery(
            `INSERT INTO shop_settings (id, version, rates, services, payments, shop_info, delete_delay_minutes, mixed_colour_mode, open, announcement, updated_at) VALUES ('default', ${newVersion}, '${ratesJson}', '${servicesJson}', '${paymentsJson}', '${shopJson}', ${deleteDelay}, '${esc(mixedMode)}', ${isOpen}, '${esc(announcement)}', ${now})`
          ).catch(() => {});
        } catch (_) {}
      }
    }

    // Audit event
    recordAudit(zcql, {
      orderId: 'shop_settings',
      actorType: 'staff',
      actorLabel: req.staffDevice?.label || 'Counter PC',
      action: 'update_settings',
      fromStatus: String(currentVersion),
      toStatus: String(newVersion)
    }).catch(() => {});

    const effective = computeEffectiveShopStatus(mem, now);

    res.json({
      ok: true,
      version: newVersion,
      open: effective.open,
      effectiveOpen: effective.open,
      closedSince: effective.closedSince,
      reopenAt: effective.reopenAt,
      announcement: effective.announcement,
      settings: {
        version: newVersion,
        open: effective.open,
        closed_since: effective.closedSince,
        announcement,
        rates: ratesMerged,
        services: servicesMerged,
        payments: paymentsMerged,
        shop_info: shopInfoMerged,
        delete_delay_minutes: deleteDelay,
        mixed_colour_mode: mixedMode,
        updated_at: now
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings: ' + err.message });
  }
});

// I. Historical Orders
router.get('/history', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const search = req.query.search ? esc(req.query.search.trim()) : '';

    let query = `SELECT id, order_number, status, total, basket, created_at, updated_at, is_test FROM orders WHERE (is_test IS NULL OR is_test = false) AND status IN ('completed', 'cancelled', 'rejected', 'expired')`;
    if (search) {
      query += ` AND order_number = ${Number(search) || 0}`;
    }
    query += ` ORDER BY created_at DESC LIMIT 50`;

    const rows = zcql ? (await zcql.executeZCQLQuery(query).catch(async () => {
      // Fallback if is_test column is not yet added in table schema
      const fallbackQuery = `SELECT id, order_number, status, total, basket, created_at, updated_at FROM orders WHERE status IN ('completed', 'cancelled', 'rejected', 'expired') ${search ? `AND order_number = ${Number(search) || 0}` : ''} ORDER BY created_at DESC LIMIT 50`;
      return zcql.executeZCQLQuery(fallbackQuery).catch(() => []);
    })) : [];

    const list = (rows || []).map(r => {
      const o = r.orders;
      let b = {};
      try { b = JSON.parse(o.basket || '{}'); } catch (_) {}
      if (o.is_test === true || String(o.is_test) === 'true' || b.is_test === true) {
        return null;
      }

      const created = Number(o.created_at || 0);
      const updated = Number(o.updated_at || 0);
      const durationSec = (updated > created) ? (updated - created) : 0;
      const speedStr = durationSec > 0 ? `${Math.floor(durationSec / 60)}m ${String(durationSec % 60).padStart(2, '0')}s` : '—';

      return {
        order: Number(o.order_number || 0),
        time: created > 0 ? new Date(created * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
        code: b.pickupCode || (o.order_number ? String(o.order_number).slice(-4) : '—'),
        files: (b.files || []).map(f => f.name).join(' · ') || 'Document',
        pages: (b.files || []).reduce((acc, f) => acc + (f.pages || 1), 0),
        payment: computePaymentStatus(o),
        payment_status: computePaymentStatus(o),
        amount: Number(o.total || 0),
        status: o.status ? (o.status.charAt(0).toUpperCase() + o.status.slice(1)) : 'Unknown',
        speed: speedStr
      };
    }).filter(Boolean);

    res.json({ ok: true, orders: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history: ' + err.message });
  }
});

// J. Today KPI Analytics
router.get('/today', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

    let collected = 0;
    let cash = 0;
    let upi = 0;
    let orderCount = 0;
    let totalPages = 0;
    const waitTimes = [];

    const rows = zcql ? (await zcql.executeZCQLQuery(`SELECT status, total, basket, created_at, updated_at, is_test FROM orders WHERE created_at >= ${startOfDay}`).catch(async () => {
      return zcql.executeZCQLQuery(`SELECT status, total, basket, created_at, updated_at FROM orders WHERE created_at >= ${startOfDay}`).catch(() => []);
    })) : [];

    for (const r of (rows || [])) {
      const o = r.orders;
      let b = {};
      try { b = JSON.parse(o.basket || '{}'); } catch (_) {}
      if (o.is_test === true || String(o.is_test) === 'true' || b.is_test === true) {
        continue;
      }

      if (['cash_collected', 'upi_claimed', 'processing', 'printing', 'ready', 'completed'].includes(o.status)) {
        orderCount++;
        const tot = Number(o.total || 0);
        collected += tot;
        if (o.status === 'cash_collected') cash += tot;
        else upi += tot;

        for (const f of (b.files || [])) {
          totalPages += Number(f.pages || 1) * Number(f.settings?.copies || 1);
        }

        const created = Number(o.created_at || 0);
        const updated = Number(o.updated_at || 0);
        if (['completed', 'ready'].includes(o.status) && updated > created) {
          waitTimes.push(updated - created);
        }
      }
    }

    const avgSec = waitTimes.length > 0 ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) : 0;
    const averageWait = avgSec > 0 ? `${Math.floor(avgSec / 60)}m ${String(avgSec % 60).padStart(2, '0')}s` : '—';

    res.json({
      ok: true,
      collected,
      orders: orderCount,
      pages: totalPages,
      cash,
      online: upi,
      averageWait
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to aggregate today KPI: ' + err.message });
  }
});

// K. Staff & Agent Device Management
router.get('/devices', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    let list = [];
    if (zcql) {
      try {
        const rows = await zcql.executeZCQLQuery(`SELECT id, label, created_at, last_seen_at, revoked FROM staff_devices ORDER BY created_at DESC`);
        list = (rows || []).map(r => r.staff_devices);
      } catch (_) {}
    }
    if (list.length === 0) {
      list = Array.from(memStaffDevices.values()).map(d => ({
        id: d.id,
        label: d.label,
        created_at: d.created_at,
        last_seen_at: d.last_seen_at,
        revoked: !!d.revoked
      }));
    }
    res.json({ ok: true, devices: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list staff devices: ' + err.message });
  }
});

router.post('/devices/:id/revoke', async (req, res) => {
  try {
    const targetId = req.params.id;
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const now = nowSec();

    if (zcql) {
      await zcql.executeZCQLQuery(`UPDATE staff_devices SET revoked = true WHERE id = '${esc(targetId)}'`).catch(() => {});
    }
    for (const d of memStaffDevices.values()) {
      if (d.id === targetId) {
        d.revoked = true;
        d.last_seen_at = now;
      }
    }
    res.json({ ok: true, deviceId: targetId, revoked: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke staff device: ' + err.message });
  }
});

router.get('/agent-devices', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    let list = [];
    if (zcql) {
      try {
        const rows = await zcql.executeZCQLQuery(`SELECT id, label, created_at, last_seen_at, revoked FROM agent_devices ORDER BY created_at DESC`);
        list = (rows || []).map(r => r.agent_devices);
      } catch (_) {}
    }
    if (list.length === 0) {
      list = Array.from(memAgentDevices.values()).map(d => ({
        id: d.id,
        label: d.label,
        created_at: d.created_at,
        last_seen_at: d.last_seen_at,
        revoked: !!d.revoked
      }));
    }
    res.json({ ok: true, devices: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list agent devices: ' + err.message });
  }
});

router.post('/agent-devices/:id/revoke', async (req, res) => {
  try {
    const targetId = req.params.id;
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const now = nowSec();

    if (zcql) {
      await zcql.executeZCQLQuery(`UPDATE agent_devices SET revoked = true WHERE id = '${esc(targetId)}'`).catch(() => {});
    }
    for (const d of memAgentDevices.values()) {
      if (d.id === targetId) {
        d.revoked = true;
        d.last_seen_at = now;
      }
    }
    res.json({ ok: true, deviceId: targetId, revoked: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke agent device: ' + err.message });
  }
});

// L. Purge Stale Test Orders (Clear old queue items > 12 hours)
router.post('/orders/purge-stale', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const now = nowSec();
    const staleCutoff = now - (12 * 3600); // 12 hours ago

    let purgedCount = 0;
    if (zcql) {
      try {
        const staleOrders = await zcql.executeZCQLQuery(
          `SELECT ROWID, id, status FROM orders WHERE created_at < ${staleCutoff}`
        ).catch(() => null);

        if (staleOrders && staleOrders.length > 0) {
          for (const row of staleOrders) {
            const o = row.orders;
            if (['pending_cash', 'pending_payment', 'waiting_payment', 'ready_to_print', 'preparing', 'ready', 'processing', 'upi_claimed'].includes(o.status)) {
              await zcql.executeZCQLQuery(
                `UPDATE orders SET status = 'cancelled', updated_at = ${now} WHERE ROWID = ${o.ROWID}`
              ).catch(() => {});
              purgedCount++;
            }
          }
        }

        const staleItems = await zcql.executeZCQLQuery(
          `SELECT ROWID, id, status FROM order_items WHERE created_at < ${staleCutoff}`
        ).catch(() => null);

        if (staleItems && staleItems.length > 0) {
          for (const row of staleItems) {
            const it = row.order_items;
            if (['waiting_payment', 'preparing', 'ready_to_print', 'waiting_quote', 'quote_sent'].includes(it.status)) {
              await zcql.executeZCQLQuery(
                `UPDATE order_items SET status = 'cancelled' WHERE ROWID = ${it.ROWID}`
              ).catch(() => {});
            }
          }
        }
      } catch (zcqlErr) {
        console.error('Purge ZCQL error:', zcqlErr);
      }
    }

    for (const [oid, o] of memOrders) {
      if (Number(o.created_at) < staleCutoff && ['pending_cash', 'pending_payment', 'waiting_payment', 'ready_to_print', 'preparing', 'ready', 'processing', 'upi_claimed'].includes(o.status)) {
        o.status = 'cancelled';
        o.updated_at = now;
        purgedCount++;
      }
    }

    for (const [iid, it] of memOrderItems) {
      if (Number(it.created_at) < staleCutoff && ['waiting_payment', 'preparing', 'ready_to_print', 'waiting_quote', 'quote_sent'].includes(it.status)) {
        it.status = 'cancelled';
      }
    }

    res.json({ ok: true, purgedCount, message: 'Stale test orders purged successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to purge stale orders: ' + err.message });
  }
});


module.exports = router;

