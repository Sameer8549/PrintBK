'use strict';
const express = require('express');
const crypto = require('crypto');
const catalyst = require('zcatalyst-sdk-node');

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

  if (rec.count > maxRequests) {
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  next();
}

// In-memory fallback stores when testing outside Catalyst or syncing across endpoints
const memStaffDevices = new Map();
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

  // 2. Look up token in staff_devices table
  const tokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;

    if (zcql) {
      const rows = await zcql.executeZCQLQuery(
        `SELECT id, label, revoked FROM staff_devices WHERE token_hash = '${tokenHash}'`
      );

      if (rows && rows.length > 0) {
        const dev = rows[0].staff_devices;
        if (dev.revoked === true || String(dev.revoked) === 'true') {
          return res.status(403).json({ error: 'Device access has been revoked' });
        }

        // Update last seen asynchronously
        const now = nowSec();
        zcql.executeZCQLQuery(
          `UPDATE staff_devices SET last_seen_at = ${now} WHERE id = '${esc(dev.id)}'`
        ).catch(() => {});

        req.staffDevice = { id: dev.id, label: dev.label };
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

    if (zcql) {
      await zcql.executeZCQLQuery(
        `INSERT INTO staff_devices (id, label, token_hash, created_at, last_seen_at, revoked) VALUES ('${deviceId}', '${esc(label)}', '${tokenHash}', ${now}, ${now}, false)`
      ).catch(() => {});
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

    // 1. Fetch shop_settings
    let shop = {
      open: true,
      announcement: '',
      delete_delay_minutes: 5,
      mixed_colour_mode: 'split',
      rates: { bw: '1.50', colour: '8.00', duplex: '0.85', bulk: '100', a3: '2', legal: '1.25' },
      services: {},
      payments: { cash: true, upi: true },
      shop_info: { name: 'HKBK Student Point', address: 'HKBK College Campus, Bengaluru' }
    };
    if (zcql) {
      try {
        const settingsRows = await zcql.executeZCQLQuery(`SELECT * FROM shop_settings LIMIT 1`);
        if (settingsRows && settingsRows.length > 0) {
          const s = settingsRows[0].shop_settings;
          shop = {
            open: s.open !== false && String(s.open) !== 'false',
            announcement: s.announcement || '',
            delete_delay_minutes: Number(s.delete_delay_minutes || 5),
            mixed_colour_mode: s.mixed_colour_mode || 'split',
            rates: typeof s.rates === 'string' ? JSON.parse(s.rates || '{}') : s.rates || shop.rates,
            services: typeof s.services === 'string' ? JSON.parse(s.services || '{}') : s.services || {},
            payments: typeof s.payments === 'string' ? JSON.parse(s.payments || '{}') : s.payments || shop.payments,
            shop_info: typeof s.shop_info === 'string' ? JSON.parse(s.shop_info || '{}') : s.shop_info || shop.shop_info
          };
        }
      } catch (_) {}
    }

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

    // If no printers in DB, provide default connected roles
    if (printers.length === 0) {
      printers = [
        { id: 'bw-1', name: 'EPSON L3110 Series', role: 'bw', online: true, status: 'ready', lastSeen: now },
        { id: 'colour-1', name: 'EPSON L3110 Series', role: 'colour', online: true, status: 'ready', lastSeen: now }
      ];
    }

    // 3. Fetch active orders
    const deleteCutoff = now - (shop.delete_delay_minutes * 60);
    const activeStatuses = "'pending_cash', 'upi_claimed', 'cash_collected', 'processing', 'printing', 'ready', 'waiting_quote', 'quote_sent'";
    
    const ordersMap = new Map();
    if (zcql) {
      try {
        const orderRows = await zcql.executeZCQLQuery(
          `SELECT id, order_number, status, total, quote_pending, basket, created_at, updated_at FROM orders WHERE status IN (${activeStatuses}) ORDER BY created_at ASC`
        );
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

      const orderObj = {
        id: o.id,
        orderId: o.id,
        order_id: o.id,
        orderNumber: Number(o.order_number || 1000),
        order_number: Number(o.order_number || 1000),
        status: o.status,
        total: Number(o.total || 0),
        quotePending: !!o.quote_pending,
        pickupCode: b.pickupCode || String(o.order_number || '0000').slice(-4),
        pickup_code: b.pickupCode || String(o.order_number || '0000').slice(-4),
        payment: o.status === 'cash_collected' ? 'cash_collected' : (o.status === 'pending_cash' ? 'cash_due' : (o.status === 'upi_claimed' ? 'upi' : 'paid')),
        payment_status: o.status,
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
            payment_status: o.status,
            pages_done: 0,
            pages_total: 1,
            created_at: new Date(orderObj.createdAt * 1000).toISOString(),
            specifications: specObj,
            payload: specObj,
            printInstructions: ''
          });
        }
      } else {
        // Fallback to typedItems in basket
        const typed = b.typedItems || [];
        for (const item of typed) {
          items.push({
            id: item.id || crypto.randomUUID(),
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
            payment_status: o.status,
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
      const rows = await zcql.executeZCQLQuery(`SELECT id, status, basket, total FROM orders WHERE id = '${esc(orderId)}'`).catch(() => null);
      if (rows && rows.length > 0) o = rows[0].orders;
    }
    if (!o) o = memOrders.get(orderId);
    if (!o) return res.status(404).json({ error: 'Order not found' });

    if (o.status !== 'pending_cash') {
      return res.status(409).json({ error: `Cannot collect cash: order is in status '${o.status}'` });
    }

    // Save undo action snapshot
    const actionId = crypto.randomUUID();
    const undoPayload = JSON.stringify({ orderId, previousStatus: 'pending_cash' });
    const expiresAt = now + 5; // 5 seconds undo window

    memStaffActions.set(actionId, {
      id: actionId,
      action_type: 'collect_cash',
      order_id: orderId,
      payload: undoPayload,
      expires_at: expiresAt,
      undone: false,
      created_at: now
    });

    if (zcql) {
      await zcql.executeZCQLQuery(
        `INSERT INTO staff_actions (id, action_type, order_id, payload, expires_at, undone, created_at) VALUES ('${actionId}', 'collect_cash', '${esc(orderId)}', '${esc(undoPayload)}', ${expiresAt}, false, ${now})`
      ).catch(() => {});
      await zcql.executeZCQLQuery(
        `UPDATE orders SET status = 'cash_collected', confirmed_by = 'staff', confirmed_at = ${now}, updated_at = ${now} WHERE id = '${esc(orderId)}'`
      ).catch(() => {});
      await zcql.executeZCQLQuery(
        `UPDATE order_items SET status = 'ready_to_print' WHERE order_id = '${esc(orderId)}' AND status = 'waiting_payment'`
      ).catch(() => {});
    }

    o.status = 'cash_collected';
    o.confirmed_by = 'staff';
    o.confirmed_at = now;
    o.updated_at = now;
    memOrders.set(orderId, o);

    for (const it of memOrderItems.values()) {
      if (it.order_id === orderId && (it.status === 'waiting_payment' || it.status === 'preparing')) {
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

    if (!orderId) {
      for (const [oid, o] of memOrders) {
        try {
          const b = typeof o.basket === 'string' ? JSON.parse(o.basket || '{}') : (o.basket || {});
          if (b.typedItems && b.typedItems.some(it => it.id === itemId)) {
            orderId = oid;
            break;
          }
        } catch (_) {}
      }
    }

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required to verify payment' });
    }

    let order = memOrders.get(orderId);
    if (!order && zcql) {
      const orderRows = await zcql.executeZCQLQuery(`SELECT id, status FROM orders WHERE id = '${esc(orderId)}'`).catch(() => null);
      if (orderRows && orderRows.length > 0) order = orderRows[0].orders;
    }
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const isPaid = ['cash_collected', 'upi_claimed', 'paid', 'processing', 'printing'].includes(order.status);
    if (!isPaid) {
      return res.status(409).json({ error: 'Cannot print: payment has not been collected or verified' });
    }

    // Queue print job for print agent
    const printJobId = crypto.randomUUID();
    const targetPrinter = kind.includes('colour') ? 'EPSON L3110 (Colour)' : 'EPSON L3110 (B&W)';

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
    order.status = 'processing';
    order.updated_at = now;

    if (zcql) {
      await zcql.executeZCQLQuery(
        `INSERT INTO print_jobs (id, item_id, attempt, status, pages_done, pages_total, printer, created_at, updated_at) VALUES ('${printJobId}', '${esc(itemId)}', 1, 'queued', 0, 1, '${esc(targetPrinter)}', ${now}, ${now})`
      ).catch(() => {});
      await zcql.executeZCQLQuery(
        `UPDATE order_items SET status = 'sending' WHERE id = '${esc(itemId)}'`
      ).catch(() => {});
      await zcql.executeZCQLQuery(
        `UPDATE orders SET status = 'processing', updated_at = ${now} WHERE id = '${esc(orderId)}'`
      ).catch(() => {});
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
    const { amount = 0, notes = '' } = req.body;

    const it = memOrderItems.get(itemId);
    if (it) {
      it.status = 'quote_sent';
      it.price = Number(amount);
    }

    if (zcql) {
      try {
        await zcql.executeZCQLQuery(`UPDATE order_items SET status = 'quote_sent', price = ${Number(amount)} WHERE id = '${esc(itemId)}'`);
      } catch (_) {}
    }

    res.json({ ok: true, itemId, status: 'quote_sent' });
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

// H. Update Shop Settings
router.put('/settings', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const { rates, services, payments, shop_info, delete_delay_minutes = 5, mixed_colour_mode = 'split', open = true, announcement = '' } = req.body;
    const now = nowSec();

    const ratesJson = esc(JSON.stringify(rates || {}));
    const servicesJson = esc(JSON.stringify(services || {}));
    const paymentsJson = esc(JSON.stringify(payments || {}));
    const shopJson = esc(JSON.stringify(shop_info || {}));

    try {
      await zcql.executeZCQLQuery(
        `UPDATE shop_settings SET rates = '${ratesJson}', services = '${servicesJson}', payments = '${paymentsJson}', shop_info = '${shopJson}', delete_delay_minutes = ${Number(delete_delay_minutes)}, mixed_colour_mode = '${esc(mixed_colour_mode)}', open = ${!!open}, announcement = '${esc(announcement)}', updated_at = ${now} WHERE id = 'default'`
      );
    } catch (_) {
      try {
        await zcql.executeZCQLQuery(
          `INSERT INTO shop_settings (id, rates, services, payments, shop_info, delete_delay_minutes, mixed_colour_mode, open, announcement, updated_at) VALUES ('default', '${ratesJson}', '${servicesJson}', '${paymentsJson}', '${shopJson}', ${Number(delete_delay_minutes)}, '${esc(mixed_colour_mode)}', ${!!open}, '${esc(announcement)}', ${now})`
        );
      } catch (_) {}
    }

    res.json({ ok: true, updated: true });
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

    let query = `SELECT id, order_number, status, total, basket, created_at FROM orders WHERE status IN ('completed', 'cancelled', 'rejected', 'expired')`;
    if (search) {
      query += ` AND order_number = ${Number(search) || 0}`;
    }
    query += ` ORDER BY created_at DESC LIMIT 50`;

    const rows = zcql ? (await zcql.executeZCQLQuery(query).catch(() => [])) : [];
    const list = (rows || []).map(r => {
      const o = r.orders;
      let b = {};
      try { b = JSON.parse(o.basket || '{}'); } catch (_) {}
      return {
        order: Number(o.order_number || 1000),
        time: new Date(Number(o.created_at) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        code: b.pickupCode || String(o.order_number || '0000').slice(-4),
        files: (b.files || []).map(f => f.name).join(' · ') || 'Document',
        pages: (b.files || []).reduce((acc, f) => acc + (f.pages || 1), 0),
        colour: (b.files || []).some(f => f.settings?.colorMode !== 'bw') ? 'Colour' : 'B&W',
        payment: o.status === 'cash_collected' ? 'cash_collected' : 'upi',
        amount: Number(o.total || 0),
        status: o.status.charAt(0).toUpperCase() + o.status.slice(1),
        speed: '5m 30s'
      };
    });

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

    const rows = zcql ? (await zcql.executeZCQLQuery(`SELECT status, total, basket FROM orders WHERE created_at >= ${startOfDay}`).catch(() => [])) : [];
    for (const r of (rows || [])) {
      const o = r.orders;
      if (['cash_collected', 'upi_claimed', 'processing', 'printing', 'ready', 'completed'].includes(o.status)) {
        orderCount++;
        const tot = Number(o.total || 0);
        collected += tot;
        if (o.status === 'cash_collected') cash += tot;
        else upi += tot;

        try {
          const b = JSON.parse(o.basket || '{}');
          for (const f of (b.files || [])) {
            totalPages += Number(f.pages || 1) * Number(f.settings?.copies || 1);
          }
        } catch (_) {}
      }
    }

    res.json({
      ok: true,
      collected,
      orders: orderCount,
      pages: totalPages,
      cash,
      online: upi,
      averageWait: '5m 12s'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to aggregate today KPI: ' + err.message });
  }
});

module.exports = router;
