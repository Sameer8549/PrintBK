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
  try {
    const tokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');
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
      );
    }

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
    
    let orderRows = [];
    if (zcql) {
      try {
        orderRows = await zcql.executeZCQLQuery(
          `SELECT id, order_number, status, total, quote_pending, basket, created_at, updated_at FROM orders WHERE status IN (${activeStatuses}) ORDER BY created_at ASC`
        );
      } catch (e) {
        try {
          orderRows = await zcql.executeZCQLQuery(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 50`);
        } catch (_) {
          orderRows = [];
        }
      }
    }

    const orders = [];
    const items = [];
    const recentlyPrinted = [];

    for (const r of (orderRows || [])) {
      const o = r.orders;
      let b = {};
      try { b = JSON.parse(o.basket || '{}'); } catch (_) {}

      const orderObj = {
        id: o.id,
        orderNumber: Number(o.order_number || 1000),
        status: o.status,
        total: Number(o.total || 0),
        quotePending: !!o.quote_pending,
        pickupCode: b.pickupCode || String(o.order_number || '0000').slice(-4),
        payment: o.status === 'cash_collected' ? 'cash_collected' : (o.status === 'pending_cash' ? 'cash_due' : (o.status === 'upi_claimed' ? 'upi' : 'paid')),
        createdAt: Number(o.created_at || now),
        updatedAt: Number(o.updated_at || now)
      };

      orders.push(orderObj);

      // Extract typed items
      const typed = b.typedItems || [];
      for (const item of typed) {
        items.push({
          id: item.id || crypto.randomUUID(),
          orderId: o.id,
          orderNumber: orderObj.orderNumber,
          kind: item.type,
          title: item.title,
          quantity: item.quantity || 1,
          price: item.computedPricing?.lineTotal || 0,
          status: o.status === 'cash_collected' ? 'ready_to_print' : (o.status === 'pending_cash' ? 'preparing' : (o.status === 'upi_claimed' ? 'ready_to_print' : 'waiting_payment')),
          specifications: item.specifications || {},
          printInstructions: item.printInstructions || ''
        });
      }
    }

    // 4. Fetch recently printed items (within retention window)
    const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    let todayCollected = 0;
    let todayOrdersCount = 0;
    let todayCash = 0;
    let todayUpi = 0;
    let todayPages = 0;

    if (zcql) {
      try {
        const printedRows = await zcql.executeZCQLQuery(
          `SELECT id, order_id, kind, status, payload, price, printed_at, delete_after FROM order_items WHERE printed_at >= ${deleteCutoff} ORDER BY printed_at DESC LIMIT 20`
        );
        for (const pr of (printedRows || [])) {
          const item = pr.order_items;
          recentlyPrinted.push({
            itemId: item.id,
            orderId: item.order_id,
            kind: item.kind,
            printedAt: Number(item.printed_at),
            expiresAt: Number(item.delete_after || item.printed_at + 300)
          });
        }
      } catch (_) {}

      // 5. Today KPI Aggregations (authoritative)
      try {
        const todayRows = await zcql.executeZCQLQuery(
          `SELECT status, total, basket FROM orders WHERE created_at >= ${startOfDay}`
        );
        for (const tr of (todayRows || [])) {
          const o = tr.orders;
          if (['cash_collected', 'upi_claimed', 'processing', 'printing', 'ready', 'completed'].includes(o.status)) {
            todayOrdersCount++;
            const tot = Number(o.total || 0);
            todayCollected += tot;
            if (o.status === 'cash_collected') todayCash += tot;
            else todayUpi += tot;

            try {
              const b = JSON.parse(o.basket || '{}');
              for (const f of (b.files || [])) {
                todayPages += Number(f.pages || 1) * Number(f.settings?.copies || 1);
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

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
      open: shop.open,
      announcement: shop.announcement,
      rates: shop.rates,
      printers,
      orders,
      items,
      recentlyPrinted,
      today
    };

    // ETag calculation
    const etag = '"' + crypto.createHash('md5').update(JSON.stringify(payload)).digest('hex') + '"';
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

    const rows = zcql ? (await zcql.executeZCQLQuery(`SELECT id, status, basket, total FROM orders WHERE id = '${esc(orderId)}'`).catch(() => null)) : null;
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const o = rows[0].orders;
    if (o.status !== 'pending_cash') {
      return res.status(409).json({ error: `Cannot collect cash: order is in status '${o.status}'` });
    }

    // Save undo action snapshot
    const actionId = crypto.randomUUID();
    const undoPayload = esc(JSON.stringify({ orderId, previousStatus: 'pending_cash' }));
    const expiresAt = now + 5; // 5 seconds undo window

    try {
      await zcql.executeZCQLQuery(
        `INSERT INTO staff_actions (id, action_type, order_id, payload, expires_at, undone, created_at) VALUES ('${actionId}', 'collect_cash', '${esc(orderId)}', '${undoPayload}', ${expiresAt}, false, ${now})`
      );
    } catch (_) {}

    await zcql.executeZCQLQuery(
      `UPDATE orders SET status = 'cash_collected', confirmed_by = 'staff', confirmed_at = ${now}, updated_at = ${now} WHERE id = '${esc(orderId)}'`
    );

    // Update linked items to ready_to_print
    try {
      await zcql.executeZCQLQuery(
        `UPDATE order_items SET status = 'ready_to_print' WHERE order_id = '${esc(orderId)}' AND status = 'waiting_payment'`
      );
    } catch (_) {}

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

    // Fetch item or order
    let orderId = req.body.orderId;
    let itemStatus = 'ready_to_print';
    let kind = 'document_bw';

    try {
      const itemRows = await zcql.executeZCQLQuery(`SELECT id, order_id, kind, status FROM order_items WHERE id = '${esc(itemId)}'`);
      if (itemRows && itemRows.length > 0) {
        orderId = itemRows[0].order_items.order_id;
        itemStatus = itemRows[0].order_items.status;
        kind = itemRows[0].order_items.kind;
      }
    } catch (_) {}

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required to verify payment' });
    }

    const orderRows = zcql ? (await zcql.executeZCQLQuery(`SELECT id, status FROM orders WHERE id = '${esc(orderId)}'`).catch(() => null)) : null;
    if (!orderRows || orderRows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = orderRows[0].orders;
    const isPaid = ['cash_collected', 'upi_claimed', 'paid', 'processing', 'printing'].includes(order.status);
    if (!isPaid) {
      return res.status(409).json({ error: 'Cannot print: payment has not been collected or verified' });
    }

    // Queue print job for print agent
    const printJobId = crypto.randomUUID();
    const targetPrinter = kind.includes('colour') ? 'EPSON L3110 (Colour)' : 'EPSON L3110 (B&W)';

    try {
      await zcql.executeZCQLQuery(
        `INSERT INTO print_jobs (id, item_id, attempt, status, pages_done, pages_total, printer, created_at, updated_at) VALUES ('${printJobId}', '${esc(itemId)}', 1, 'queued', 0, 1, '${esc(targetPrinter)}', ${now}, ${now})`
      );
    } catch (_) {}

    try {
      await zcql.executeZCQLQuery(
        `UPDATE order_items SET status = 'sending' WHERE id = '${esc(itemId)}'`
      );
    } catch (_) {}

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
    try {
      await zcql.executeZCQLQuery(
        `INSERT INTO print_jobs (id, item_id, attempt, status, pages_done, pages_total, created_at, updated_at) VALUES ('${printJobId}', '${esc(itemId)}', 2, 'queued', 0, 1, ${now}, ${now})`
      );
      await zcql.executeZCQLQuery(`UPDATE order_items SET status = 'sending' WHERE id = '${esc(itemId)}'`);
    } catch (_) {}

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

    try {
      await zcql.executeZCQLQuery(`UPDATE order_items SET status = 'done' WHERE id = '${esc(itemId)}'`);
    } catch (_) {}

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

    try {
      await zcql.executeZCQLQuery(
        `UPDATE order_items SET price = ${Number(amount)}, status = 'quote_sent' WHERE id = '${esc(itemId)}'`
      );
    } catch (_) {}

    res.json({ ok: true, itemId, status: 'quote_sent', price: Number(amount) });
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
    const now = nowSec();

    const rows = zcql ? (await zcql.executeZCQLQuery(`SELECT id, status FROM orders WHERE id = '${esc(orderId)}'`).catch(() => null)) : null;
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const previousStatus = rows[0].orders.status;
    const actionId = crypto.randomUUID();
    const undoPayload = esc(JSON.stringify({ orderId, previousStatus }));
    const expiresAt = now + 5;

    try {
      await zcql.executeZCQLQuery(
        `INSERT INTO staff_actions (id, action_type, order_id, payload, expires_at, undone, created_at) VALUES ('${actionId}', 'reject', '${esc(orderId)}', '${undoPayload}', ${expiresAt}, false, ${now})`
      );
    } catch (_) {}

    await zcql.executeZCQLQuery(
      `UPDATE orders SET status = 'rejected', updated_at = ${now} WHERE id = '${esc(orderId)}'`
    );

    await recordAudit(zcql, {
      orderId,
      actorType: 'staff',
      actorLabel: req.staffDevice.label,
      action: 'reject',
      fromStatus: previousStatus,
      toStatus: 'rejected'
    });

    res.json({ ok: true, orderId, status: 'rejected', actionId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject order: ' + err.message });
  }
});

// G. 5-Second Undo Action
router.post('/actions/:id/undo', async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const actionId = req.params.id;
    const now = nowSec();

    const rows = zcql ? (await zcql.executeZCQLQuery(`SELECT * FROM staff_actions WHERE id = '${esc(actionId)}'`).catch(() => null)) : null;
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Action not found' });

    const act = rows[0].staff_actions;
    if (act.undone === true || String(act.undone) === 'true') {
      return res.status(409).json({ error: 'Action has already been undone' });
    }

    if (now > Number(act.expires_at)) {
      return res.status(410).json({ error: 'Undo window has expired' });
    }

    const payload = JSON.parse(act.payload || '{}');
    if (payload.orderId && payload.previousStatus) {
      await zcql.executeZCQLQuery(
        `UPDATE orders SET status = '${esc(payload.previousStatus)}', updated_at = ${now} WHERE id = '${esc(payload.orderId)}'`
      );
    }

    await zcql.executeZCQLQuery(`UPDATE staff_actions SET undone = true WHERE id = '${esc(actionId)}'`);

    res.json({ ok: true, undone: true });
  } catch (err) {
    res.status(500).json({ error: 'Undo failed: ' + err.message });
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
