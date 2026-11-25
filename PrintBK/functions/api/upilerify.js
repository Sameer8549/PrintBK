'use strict';

const express = require('express');
const crypto = require('crypto');
const { priceOrder, defaultShopConfig } = require('./shared/pricing');
const { basketToOrderItems } = require('./shared/orderItems');
const { computePaymentStatus } = require('./shared/paymentStatus');

const memOrders = global.__printbk_orders || (global.__printbk_orders = new Map());
const memOrderItems = global.__printbk_order_items || (global.__printbk_order_items = new Map());
const memUtrRegistry = global.__printbk_utr_registry || (global.__printbk_utr_registry = new Map());

const UTR_REGEX = /^\d{12}$/;
const EXPIRY_DURATION_MS = 15 * 60 * 1000;

function esc(str) {
  return String(str ?? '').replace(/'/g, "''");
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseBasket(o) {
  if (!o) return {};
  if (typeof o.basket === 'string') {
    try { return JSON.parse(o.basket || '{}'); } catch (_) { return {}; }
  }
  return o.basket && typeof o.basket === 'object' ? o.basket : {};
}

function getExpiryMs(order, basketData) {
  const raw = order.expiresAt || order.expires_at || basketData?.upilerify?.expiresAt;
  if (raw) {
    if (typeof raw === 'number') {
      return raw > 1e12 ? raw : raw * 1000;
    }
    const parsed = Date.parse(String(raw));
    if (!Number.isNaN(parsed)) return parsed;
  }
  const createdMs = Number(order.created_at || order.createdAt || nowSec()) * (Number(order.created_at || 0) > 1e12 ? 1 : 1000);
  return createdMs + EXPIRY_DURATION_MS;
}

function toIsoDate(ms) {
  return new Date(ms).toISOString();
}

/**
 * Checks globally if a 12-digit UTR number is already associated with a different order.
 */
async function findOrderClaimingUtr(zcql, utrNumber, excludeOrderId) {
  const existingMemOrderId = memUtrRegistry.get(utrNumber);
  if (existingMemOrderId && existingMemOrderId !== excludeOrderId) {
    return existingMemOrderId;
  }

  for (const [oid, ord] of memOrders.entries()) {
    if (oid === excludeOrderId) continue;
    const b = parseBasket(ord);
    const ordUtr = ord.utrNumber || ord.utr_number || b?.upilerify?.utrNumber;
    if (ordUtr && String(ordUtr).trim() === utrNumber) {
      memUtrRegistry.set(utrNumber, oid);
      return oid;
    }
  }

  if (zcql) {
    try {
      const rows = await zcql.executeZCQLQuery(
        `SELECT id FROM orders WHERE utrNumber = '${esc(utrNumber)}' LIMIT 1`
      ).catch(() => null);
      if (rows && rows.length > 0 && rows[0].orders?.id && rows[0].orders.id !== excludeOrderId) {
        memUtrRegistry.set(utrNumber, rows[0].orders.id);
        return rows[0].orders.id;
      }
    } catch (_) {}
  }

  return null;
}

/**
 * Executes fulfillment strictly once when an order transitions to PAID.
 */
async function executeOrderFulfillmentOnce({ order, zcql, catalystApp, utrNumber, confirmedBy }) {
  const b = parseBasket(order);
  const alreadyFulfilled = Boolean(
    b.fulfilledAt ||
    b?.upilerify?.fulfilledAt ||
    order.status === 'PAID' ||
    ['processing', 'printing', 'ready', 'completed'].includes(String(order.status || ''))
  );

  if (alreadyFulfilled) {
    return { idempotent: true, status: 'PAID' };
  }

  const now = nowSec();
  const prevStatus = order.status;
  const finalUtr = utrNumber || order.utrNumber || b?.upilerify?.utrNumber || null;

  b.fulfilledAt = now;
  b.events = Array.isArray(b.events) ? b.events : [];
  b.events.push({
    from_status: prevStatus,
    to_status: 'PAID',
    triggered_by: confirmedBy,
    timestamp: now,
    utrNumber: finalUtr
  });
  b.upilerify = {
    ...(b.upilerify || {}),
    status: 'PAID',
    utrNumber: finalUtr,
    confirmedBy,
    verifiedAt: toIsoDate(now * 1000),
    fulfilledAt: now
  };

  order.status = 'PAID';
  order.payment_status = 'paid_verified';
  if (finalUtr) {
    order.utrNumber = finalUtr;
    memUtrRegistry.set(finalUtr, order.id);
  }
  order.confirmed_by = confirmedBy;
  order.confirmed_at = now;
  order.updated_at = now;
  order.updatedAt = toIsoDate(now * 1000);
  order.basket = JSON.stringify(b);
  memOrders.set(order.id, order);

  // Unlock print job queue items immediately upon verified payment
  for (const it of memOrderItems.values()) {
    if (it.order_id === order.id && ['waiting_payment', 'preparing'].includes(it.status)) {
      it.status = 'ready_to_print';
    }
  }

  if (zcql) {
    const updatedBasket = esc(JSON.stringify(b));
    const utrClause = finalUtr ? `, utrNumber = '${esc(finalUtr)}'` : '';
    await zcql.executeZCQLQuery(
      `UPDATE orders SET status = 'PAID', payment_status = 'paid_verified'${utrClause}, confirmed_by = '${esc(confirmedBy)}', confirmed_at = ${now}, basket = '${updatedBasket}', updated_at = ${now} WHERE id = '${esc(order.id)}'`
    ).catch(async () => {
      await zcql.executeZCQLQuery(
        `UPDATE orders SET status = 'PAID', basket = '${updatedBasket}', updated_at = ${now} WHERE id = '${esc(order.id)}'`
      ).catch(() => {});
    });

    await zcql.executeZCQLQuery(
      `UPDATE order_items SET status = 'ready_to_print' WHERE order_id = '${esc(order.id)}' AND (status = 'waiting_payment' OR status = 'preparing')`
    ).catch(() => {});
  }

  if (global.__printbk_invalidateCachedQueue) {
    await global.__printbk_invalidateCachedQueue(catalystApp).catch(() => {});
  }

  return { idempotent: false, status: 'PAID' };
}

async function fetchOrderRecord(zcql, orderId) {
  let rows = null;
  if (zcql) {
    rows = await zcql.executeZCQLQuery(
      `SELECT * FROM orders WHERE id = '${esc(orderId)}' LIMIT 1`
    ).catch(() => null);
  }
  return (rows && rows.length > 0 && rows[0].orders) ? rows[0].orders : memOrders.get(orderId) || null;
}

function buildUpilerifyRouter(deps) {
  const router = express.Router();
  const {
    getCatalystApp,
    getEffectiveShopSettings,
    isStaff,
    validateOrderInput,
    generateUniquePickupCode,
    insertOrderWithUniqueNumber
  } = deps;

  /**
   * 1. POST /api/checkout/create (and /checkout/create)
   * Creates or refreshes an order and calls UPILerify ${UPILERIFY_BASE_URL}/api/orders/create
   * to reserve a unique paise-offset amount, QR code, and 15-min payment intent.
   */
  router.post(['/api/checkout/create', '/checkout/create'], async (req, res) => {
    try {
      const catalystApp = getCatalystApp(req);
      const zcql = catalystApp ? catalystApp.zcql() : null;
      const settings = await getEffectiveShopSettings(catalystApp);

      const upilerifyBase = (process.env.UPILERIFY_BASE_URL || '').trim().replace(/\/+$/, '');
      const upilerifyApiKey = (process.env.UPILERIFY_API_KEY || '').trim();
      const merchantUpiId = (
        process.env.MERCHANT_UPI_ID ||
        process.env.UPI_ID ||
        settings.payments?.upiVpa ||
        settings.rates?.upiVpa ||
        ''
      ).trim();
      const payeeName = (
        process.env.UPI_PAYEE_NAME ||
        settings.payments?.upiName ||
        settings.shop_info?.name ||
        'HKBK Student Point'
      ).trim();

      if (!upilerifyBase || !upilerifyApiKey) {
        return res.status(503).json({
          error: 'UPILerify payment gateway is not configured on this server (missing UPILERIFY_BASE_URL or UPILERIFY_API_KEY).'
        });
      }

      const now = nowSec();
      let order = null;
      let orderToken = null;
      let baseAmount = 0;

      if (req.body?.orderId) {
        order = await fetchOrderRecord(zcql, String(req.body.orderId).trim());
        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }
        if (order.status === 'PAID' || ['processing', 'printing', 'ready', 'completed'].includes(order.status)) {
          return res.status(409).json({ error: 'Order is already paid', status: 'PAID' });
        }
        if (order.status === 'UNDER_REVIEW') {
          return res.status(409).json({ error: 'Order UTR is already under review', status: 'UNDER_REVIEW' });
        }
        baseAmount = Number(order.baseAmount ?? order.total ?? 0);
      } else {
        if (typeof validateOrderInput === 'function') {
          const validationErr = validateOrderInput(req.body);
          if (validationErr) return res.status(400).json({ error: validationErr });
        }

        const { files = [], services = [], rush = false } = req.body || {};
        if (files.length === 0 && services.length === 0) {
          return res.status(400).json({ error: 'Cannot checkout an empty basket' });
        }

        const dynamicConfig = {
          ...defaultShopConfig,
          rates: { ...defaultShopConfig.rates, ...(settings.rates || {}) }
        };
        const pricing = priceOrder({ files, services, rush }, dynamicConfig);
        baseAmount = Number(pricing.total || 0);
        if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
          return res.status(400).json({ error: 'Calculated order amount must be greater than zero' });
        }

        const orderId = crypto.randomUUID();
        const pickupCode = await generateUniquePickupCode(zcql);
        orderToken = crypto.randomBytes(24).toString('base64url');
        const accessTokenHash = crypto.createHash('sha256').update(orderToken).digest('hex');
        const typedItems = basketToOrderItems({ files, services, rush }, dynamicConfig);
        const isTest = Boolean(req.body?.is_test || req.headers['x-test-suite'] || process.env.NODE_ENV === 'test');

        const basketPayload = {
          files,
          services,
          rush,
          phone: req.body?.phone ? String(req.body.phone).trim() : null,
          userId: req.body?.userId ? String(req.body.userId).trim() : null,
          customerEmail: req.body?.customerEmail ? String(req.body.customerEmail).trim() : null,
          deviceId: req.headers['x-device-id'] || req.body?.deviceId || null,
          pickupCode,
          orderNumber: 0,
          paymentMethod: 'upi',
          accessTokenHash,
          breakdown: pricing,
          typedItems,
          is_test: isTest,
          settingsVersion: settings.version || 1
        };

        const orderPayload = {
          id: orderId,
          accessTokenHash,
          status: 'PENDING',
          quotePending: Boolean(pricing.quotePending),
          total: baseAmount,
          isTest,
          now,
          files,
          basketPayload
        };

        const orderNumber = await insertOrderWithUniqueNumber(zcql, orderPayload);
        basketPayload.orderNumber = orderNumber;

        order = {
          id: orderId,
          userId: basketPayload.userId,
          customerEmail: basketPayload.customerEmail,
          order_number: orderNumber,
          access_token_hash: accessTokenHash,
          status: 'PENDING',
          payment_status: 'unpaid',
          baseAmount,
          payableAmount: baseAmount,
          total: baseAmount,
          basket: JSON.stringify(basketPayload),
          file_names: JSON.stringify(files.map(f => f.name)),
          quote_pending: Boolean(pricing.quotePending),
          is_test: isTest,
          created_at: now,
          updated_at: now,
          createdAt: toIsoDate(now * 1000),
          updatedAt: toIsoDate(now * 1000)
        };
        memOrders.set(orderId, order);

        for (const item of typedItems) {
          const itemId = crypto.randomUUID();
          item.id = itemId;
          const kind = item.type;
          const targetFile = (req.body.files || []).find(f => f.id === item.specifications?.fileId);
          const resolvedCloudId = targetFile?.cloudId || item.specifications?.cloudId;
          if (resolvedCloudId && item.specifications) item.specifications.cloudId = resolvedCloudId;
          const rawFileRefs = resolvedCloudId ? [resolvedCloudId] : (item.specifications?.fileId ? [item.specifications.fileId] : []);
          const printerRole = kind.includes('colour') ? 'colour' : (kind.includes('photo') ? 'photo' : (kind.includes('bw') ? 'bw' : 'none'));

          const itemRecord = {
            id: itemId,
            order_id: orderId,
            order_number: orderNumber,
            kind,
            status: 'waiting_payment',
            payload: JSON.stringify(item.specifications || {}),
            price: Number(item.computedPricing?.lineTotal || 0),
            file_refs: JSON.stringify(rawFileRefs),
            printer_role: printerRole,
            print_instructions: item.printInstructions || '',
            printInstructions: item.printInstructions || '',
            created_at: now
          };
          memOrderItems.set(itemId, itemRecord);

          if (zcql) {
            await zcql.executeZCQLQuery(
              `INSERT INTO order_items (id, order_id, kind, status, payload, price, file_refs, printer_role, created_at) VALUES ('${itemId}', '${orderId}', '${kind}', 'waiting_payment', '${esc(itemRecord.payload)}', ${itemRecord.price}, '${esc(itemRecord.file_refs)}', '${printerRole}', ${now})`
            ).catch(() => {});
          }
        }
      }

      if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
        return res.status(400).json({ error: 'Order baseAmount must be greater than zero' });
      }

      const basketData = parseBasket(order);
      const userId = req.body?.userId || order.userId || basketData.userId || null;
      const customerEmail = req.body?.customerEmail || order.customerEmail || basketData.customerEmail || null;

      // Call UPILerify Order Creation API
      const upiRes = await fetch(`${upilerifyBase}/api/orders/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${upilerifyApiKey}`,
          'X-API-Key': upilerifyApiKey
        },
        body: JSON.stringify({
          orderId: order.id,
          baseAmount,
          amount: baseAmount,
          currency: 'INR',
          userId,
          customerEmail,
          upiId: merchantUpiId,
          payeeName
        })
      });

      const upiPayload = await upiRes.json().catch(() => ({}));
      if (!upiRes.ok) {
        return res.status(502).json({
          error: upiPayload.error || upiPayload.message || `UPILerify returned HTTP ${upiRes.status}`
        });
      }

      const payableAmount = Number(
        Number(upiPayload.payableAmount ?? upiPayload.amount ?? baseAmount).toFixed(2)
      );
      const upiIntentUrl = String(
        upiPayload.upiIntentUrl ||
        upiPayload.intentUrl ||
        upiPayload.upiUrl ||
        `upi://pay?pa=${encodeURIComponent(merchantUpiId)}&pn=${encodeURIComponent(payeeName)}&am=${payableAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Order ' + (order.order_number || order.id.slice(0, 8)))}`
      );
      const qrCodeData = String(upiPayload.qrCodeData || upiPayload.qrCode || upiPayload.qr || upiIntentUrl);
      const expiresAt = upiPayload.expiresAt
        ? toIsoDate(Date.parse(upiPayload.expiresAt) || (Date.now() + EXPIRY_DURATION_MS))
        : toIsoDate(Date.now() + EXPIRY_DURATION_MS);

      basketData.upilerify = {
        baseAmount,
        payableAmount,
        qrCodeData,
        upiIntentUrl,
        merchantUpiId,
        payeeName,
        expiresAt,
        status: 'PENDING',
        utrNumber: null
      };

      order.status = 'PENDING';
      order.payment_status = 'unpaid';
      order.baseAmount = baseAmount;
      order.payableAmount = payableAmount;
      order.qrCodeData = qrCodeData;
      order.upiIntentUrl = upiIntentUrl;
      order.expiresAt = expiresAt;
      order.utrNumber = null;
      order.userId = userId;
      order.customerEmail = customerEmail;
      order.updated_at = now;
      order.updatedAt = toIsoDate(now * 1000);
      order.basket = JSON.stringify(basketData);
      memOrders.set(order.id, order);

      if (zcql) {
        const updatedBasket = esc(order.basket);
        await zcql.executeZCQLQuery(
          `UPDATE orders SET status = 'PENDING', payment_status = 'unpaid', baseAmount = ${baseAmount}, payableAmount = ${payableAmount}, qrCodeData = '${esc(qrCodeData)}', upiIntentUrl = '${esc(upiIntentUrl)}', expiresAt = '${esc(expiresAt)}', basket = '${updatedBasket}', updated_at = ${now} WHERE id = '${esc(order.id)}'`
        ).catch(async () => {
          await zcql.executeZCQLQuery(
            `UPDATE orders SET status = 'PENDING', basket = '${updatedBasket}', updated_at = ${now} WHERE id = '${esc(order.id)}'`
          ).catch(() => {});
        });
      }

      if (global.__printbk_invalidateCachedQueue) {
        await global.__printbk_invalidateCachedQueue(catalystApp).catch(() => {});
      }

      return res.json({
        orderId: order.id,
        orderNumber: order.order_number || basketData.orderNumber || null,
        baseAmount,
        payableAmount,
        qrCodeData,
        upiIntentUrl,
        merchantUpiId,
        payeeName,
        expiresAt,
        status: 'PENDING',
        ...(orderToken ? { accessToken: orderToken } : {})
      });
    } catch (err) {
      console.error('[UPILerify] Checkout create error:', err);
      return res.status(500).json({ error: err.message || 'Failed to create checkout session' });
    }
  });

  /**
   * 2. GET /api/checkout/status/:orderId (and /checkout/status/:orderId)
   * Marks PENDING orders as EXPIRED once expiresAt has passed, returns fast polling payload.
   */
  router.get(['/api/checkout/status/:orderId', '/checkout/status/:orderId'], async (req, res) => {
    try {
      const catalystApp = getCatalystApp(req);
      const zcql = catalystApp ? catalystApp.zcql() : null;
      const orderId = String(req.params.orderId || '').trim();
      const order = await fetchOrderRecord(zcql, orderId);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const b = parseBasket(order);
      const nowMs = Date.now();
      const expiresMs = getExpiryMs(order, b);
      const expiresAtIso = toIsoDate(expiresMs);

      let currentStatus = String(order.status || 'PENDING');
      if (['PENDING', 'pending_payment'].includes(currentStatus) && nowMs >= expiresMs) {
        currentStatus = 'EXPIRED';
        order.status = 'EXPIRED';
        order.payment_status = 'not_paid';
        order.updated_at = nowSec();
        if (b.upilerify) b.upilerify.status = 'EXPIRED';
        order.basket = JSON.stringify(b);
        memOrders.set(order.id, order);

        if (zcql) {
          zcql.executeZCQLQuery(
            `UPDATE orders SET status = 'EXPIRED', payment_status = 'not_paid', basket = '${esc(order.basket)}', updated_at = ${order.updated_at} WHERE id = '${esc(order.id)}'`
          ).catch(() => {});
        }
      }

      const isFulfillmentProgressed = ['processing', 'printing', 'ready', 'completed'].includes(currentStatus);
      const paymentStatus = isFulfillmentProgressed ? 'PAID' : currentStatus;
      const payableAmount = Number(
        order.payableAmount ?? b?.upilerify?.payableAmount ?? order.total ?? 0
      );
      const baseAmount = Number(
        order.baseAmount ?? b?.upilerify?.baseAmount ?? order.total ?? 0
      );

      return res.json({
        orderId: order.id,
        orderNumber: order.order_number || b.orderNumber || null,
        status: paymentStatus,
        fulfillmentStatus: currentStatus,
        baseAmount,
        payableAmount,
        qrCodeData: order.qrCodeData || b?.upilerify?.qrCodeData || null,
        upiIntentUrl: order.upiIntentUrl || b?.upilerify?.upiIntentUrl || null,
        merchantUpiId: b?.upilerify?.merchantUpiId || process.env.MERCHANT_UPI_ID || process.env.UPI_ID || '',
        payeeName: b?.upilerify?.payeeName || process.env.UPI_PAYEE_NAME || 'HKBK Student Point',
        utrNumber: order.utrNumber || b?.upilerify?.utrNumber || null,
        expiresAt: order.expiresAt || expiresAtIso,
        pickupCode: paymentStatus === 'PAID' ? (b.pickupCode || null) : null
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to retrieve checkout status' });
    }
  });

  /**
   * 3. POST /api/checkout/manual-utr (and /checkout/manual-utr)
   * Strict 12-digit numeric UTR fallback that marks the order UNDER_REVIEW
   * after enforcing uniqueness across all orders.
   */
  router.post(['/api/checkout/manual-utr', '/checkout/manual-utr'], async (req, res) => {
    try {
      const { orderId: rawOrderId, utrNumber: rawUtr } = req.body || {};
      const orderId = String(rawOrderId || '').trim();
      const utrNumber = String(rawUtr || '').trim();

      if (!orderId) {
        return res.status(400).json({ error: 'orderId is required' });
      }
      if (!UTR_REGEX.test(utrNumber)) {
        return res.status(400).json({ error: 'Invalid UTR format. Enter exact 12-digit numeric UPI Reference ID.' });
      }

      const catalystApp = getCatalystApp(req);
      const zcql = catalystApp ? catalystApp.zcql() : null;
      const order = await fetchOrderRecord(zcql, orderId);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const b = parseBasket(order);
      const expiresMs = getExpiryMs(order, b);
      if (order.status === 'PENDING' && Date.now() >= expiresMs) {
        order.status = 'EXPIRED';
        memOrders.set(order.id, order);
        return res.status(409).json({ error: 'Order payment window has expired. Please create a fresh payment session.' });
      }

      if (order.status === 'PAID' || ['processing', 'printing', 'ready', 'completed'].includes(order.status)) {
        return res.json({
          success: true,
          status: 'PAID',
          redirectUrl: `/order-success?orderId=${encodeURIComponent(order.id)}`
        });
      }

      if (!['PENDING', 'UNDER_REVIEW', 'pending_payment'].includes(order.status)) {
        return res.status(409).json({ error: `Cannot submit UTR for order in status "${order.status}"` });
      }

      const duplicateOrderId = await findOrderClaimingUtr(zcql, utrNumber, order.id);
      if (duplicateOrderId) {
        return res.status(409).json({
          error: 'Duplicate UTR detected: This 12-digit UTR number is already linked to another order.'
        });
      }

      const now = nowSec();
      b.events = Array.isArray(b.events) ? b.events : [];
      b.events.push({
        from_status: order.status,
        to_status: 'UNDER_REVIEW',
        triggered_by: 'customer_manual_utr',
        timestamp: now,
        utrNumber
      });
      b.upilerify = {
        ...(b.upilerify || {}),
        status: 'UNDER_REVIEW',
        utrNumber,
        submittedAt: toIsoDate(now * 1000)
      };

      memUtrRegistry.set(utrNumber, order.id);
      order.utrNumber = utrNumber;
      order.status = 'UNDER_REVIEW';
      order.payment_status = 'upi_claimed';
      order.updated_at = now;
      order.updatedAt = toIsoDate(now * 1000);
      order.basket = JSON.stringify(b);
      memOrders.set(order.id, order);

      if (zcql) {
        const updatedBasket = esc(order.basket);
        await zcql.executeZCQLQuery(
          `UPDATE orders SET status = 'UNDER_REVIEW', utrNumber = '${esc(utrNumber)}', payment_status = 'upi_claimed', basket = '${updatedBasket}', updated_at = ${now} WHERE id = '${esc(order.id)}'`
        ).catch(async () => {
          await zcql.executeZCQLQuery(
            `UPDATE orders SET status = 'UNDER_REVIEW', basket = '${updatedBasket}', updated_at = ${now} WHERE id = '${esc(order.id)}'`
          ).catch(() => {});
        });
      }

      if (global.__printbk_invalidateCachedQueue) {
        await global.__printbk_invalidateCachedQueue(catalystApp).catch(() => {});
      }

      return res.json({
        success: true,
        status: 'UNDER_REVIEW',
        orderId: order.id,
        utrNumber,
        redirectUrl: `/order-pending?orderId=${encodeURIComponent(order.id)}`
      });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to record manual UTR' });
    }
  });

  /**
   * 4. POST /api/webhooks/upilerify (and /webhooks/upilerify)
   * Verifies HMAC-SHA256 signature against UPILERIFY_WEBHOOK_SECRET, checks paise amount
   * and UTR uniqueness, and executes fulfillment strictly once.
   */
  router.post(['/api/webhooks/upilerify', '/webhooks/upilerify'], async (req, res) => {
    try {
      const webhookSecret = (process.env.UPILERIFY_WEBHOOK_SECRET || '').trim();
      if (!webhookSecret) {
        return res.status(401).json({ error: 'UPILerify webhook secret not configured' });
      }

      const rawSig = String(
        req.headers['x-upilerify-signature'] ||
        req.headers['x-webhook-signature'] ||
        req.headers['x-signature'] ||
        ''
      ).trim();

      if (!rawSig) {
        return res.status(401).json({ error: 'Missing webhook signature header' });
      }

      const normalizedSig = rawSig.startsWith('sha256=') ? rawSig.slice(7) : rawSig;
      const rawPayload = req.rawBody ? req.rawBody : Buffer.from(JSON.stringify(req.body || {}), 'utf8');
      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawPayload)
        .digest('hex');

      if (!timingSafeCompare(expectedSig, normalizedSig)) {
        return res.status(401).json({ error: 'Invalid webhook HMAC-SHA256 signature' });
      }

      const eventType = String(req.body?.event || req.body?.type || '').trim();
      if (eventType !== 'payment.verified') {
        return res.status(200).json({ ok: true, ignored: true, event: eventType });
      }

      const data = req.body?.data || req.body?.payload || req.body || {};
      const orderId = String(data.orderId || '').trim();
      const paidAmount = Number(data.amount ?? data.payableAmount);
      const utrNumber = String(data.utrNumber || data.utr || '').trim();

      if (!orderId || !Number.isFinite(paidAmount)) {
        return res.status(400).json({ error: 'Missing orderId or valid amount in webhook payload' });
      }

      const catalystApp = getCatalystApp(req);
      const zcql = catalystApp ? catalystApp.zcql() : null;
      const order = await fetchOrderRecord(zcql, orderId);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const b = parseBasket(order);
      const expectedPayable = Number(order.payableAmount ?? b?.upilerify?.payableAmount ?? order.total ?? 0);
      if (Math.round(paidAmount * 100) !== Math.round(expectedPayable * 100)) {
        return res.status(400).json({
          error: `Amount mismatch: expected ${expectedPayable.toFixed(2)}, got ${paidAmount.toFixed(2)}`
        });
      }

      if (utrNumber) {
        const conflictingOrderId = await findOrderClaimingUtr(zcql, utrNumber, order.id);
        if (conflictingOrderId) {
          return res.status(409).json({ error: 'UTR already claimed by a different order' });
        }
      }

      if (order.status === 'PAID' || ['processing', 'printing', 'ready', 'completed'].includes(order.status)) {
        return res.status(200).json({ ok: true, idempotent: true, status: 'PAID', orderId: order.id });
      }

      if (!['PENDING', 'UNDER_REVIEW', 'pending_payment', 'EXPIRED'].includes(order.status)) {
        return res.status(409).json({ error: `Order in terminal status "${order.status}" cannot be fulfilled` });
      }

      const fulfillment = await executeOrderFulfillmentOnce({
        order,
        zcql,
        catalystApp,
        utrNumber: utrNumber || undefined,
        confirmedBy: 'upilerify_webhook'
      });

      return res.status(200).json({
        ok: true,
        idempotent: fulfillment.idempotent,
        status: 'PAID',
        orderId: order.id,
        utrNumber: order.utrNumber || utrNumber || null
      });
    } catch (err) {
      console.error('[UPILerify] Webhook processing error:', err);
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  /**
   * 5. Admin Verification Endpoints
   * GET /api/admin/orders/under-review
   * POST /api/admin/orders/verify
   */
  router.get(['/api/admin/orders/under-review', '/admin/orders/under-review'], async (req, res) => {
    if (!isStaff(req)) {
      return res.status(401).json({ error: 'Staff authentication required' });
    }

    try {
      const catalystApp = getCatalystApp(req);
      const zcql = catalystApp ? catalystApp.zcql() : null;
      const resultsMap = new Map();

      if (zcql) {
        const rows = await zcql.executeZCQLQuery(
          `SELECT * FROM orders WHERE status = 'UNDER_REVIEW' ORDER BY updated_at DESC`
        ).catch(() => []);
        for (const r of rows || []) {
          if (r.orders?.id) resultsMap.set(r.orders.id, r.orders);
        }
      }
      for (const [id, ord] of memOrders.entries()) {
        if (ord.status === 'UNDER_REVIEW' && !resultsMap.has(id)) {
          resultsMap.set(id, ord);
        }
      }

      const orders = Array.from(resultsMap.values()).map((o) => {
        const b = parseBasket(o);
        return {
          id: o.id,
          orderNumber: o.order_number || b.orderNumber || null,
          userId: o.userId || b.userId || null,
          customerEmail: o.customerEmail || b.customerEmail || null,
          baseAmount: Number(o.baseAmount ?? b?.upilerify?.baseAmount ?? o.total ?? 0),
          payableAmount: Number(o.payableAmount ?? b?.upilerify?.payableAmount ?? o.total ?? 0),
          status: o.status,
          utrNumber: o.utrNumber || b?.upilerify?.utrNumber || null,
          expiresAt: o.expiresAt || toIsoDate(getExpiryMs(o, b)),
          createdAt: o.createdAt || toIsoDate(Number(o.created_at || nowSec()) * 1000)
        };
      });

      return res.json({ ok: true, orders });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to list UNDER_REVIEW orders' });
    }
  });

  router.post(['/api/admin/orders/verify', '/admin/orders/verify'], async (req, res) => {
    if (!isStaff(req)) {
      return res.status(401).json({ error: 'Staff authentication required' });
    }

    try {
      const { orderId, action = 'approve', reason } = req.body || {};
      if (!orderId) {
        return res.status(400).json({ error: 'orderId is required' });
      }
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'action must be "approve" or "reject"' });
      }

      const catalystApp = getCatalystApp(req);
      const zcql = catalystApp ? catalystApp.zcql() : null;
      const order = await fetchOrderRecord(zcql, String(orderId).trim());

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (action === 'approve') {
        const fulfillment = await executeOrderFulfillmentOnce({
          order,
          zcql,
          catalystApp,
          utrNumber: order.utrNumber || undefined,
          confirmedBy: 'staff_admin_verify'
        });

        return res.json({
          ok: true,
          idempotent: fulfillment.idempotent,
          status: 'PAID',
          orderId: order.id,
          utrNumber: order.utrNumber || null
        });
      }

      // Reject manual UTR claim
      const now = nowSec();
      const b = parseBasket(order);
      if (order.utrNumber && memUtrRegistry.get(order.utrNumber) === order.id) {
        memUtrRegistry.delete(order.utrNumber);
      }
      b.events = Array.isArray(b.events) ? b.events : [];
      b.events.push({
        from_status: order.status,
        to_status: 'rejected',
        triggered_by: 'staff_admin_verify',
        timestamp: now,
        reason: reason || 'UTR verification failed'
      });
      b.upilerify = {
        ...(b.upilerify || {}),
        status: 'rejected',
        rejectedReason: reason || 'UTR verification failed'
      };

      order.status = 'rejected';
      order.payment_status = 'not_paid';
      order.updated_at = now;
      order.basket = JSON.stringify(b);
      memOrders.set(order.id, order);

      if (zcql) {
        await zcql.executeZCQLQuery(
          `UPDATE orders SET status = 'rejected', payment_status = 'not_paid', basket = '${esc(order.basket)}', updated_at = ${now} WHERE id = '${esc(order.id)}'`
        ).catch(() => {});
      }

      return res.json({ ok: true, status: 'rejected', orderId: order.id });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Verification failed' });
    }
  });

  return router;
}

module.exports = {
  buildUpilerifyRouter,
  executeOrderFulfillmentOnce
};
