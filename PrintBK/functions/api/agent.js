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

// In-memory fallback stores for test harness outside Catalyst
const memAgentDevices = global.__printbk_agent_devices || (global.__printbk_agent_devices = new Map());
const memPrinters = global.__printbk_printers || (global.__printbk_printers = new Map());
const memOrders = global.__printbk_orders || (global.__printbk_orders = new Map());
const memOrderItems = global.__printbk_order_items || (global.__printbk_order_items = new Map());
const memPrintJobs = global.__printbk_jobs || (global.__printbk_jobs = new Map());

/* ─── Agent Authentication Middleware ────────────────────────────── */
async function authenticateAgent(req, res, next) {
  const token = req.headers['x-agent-device-token'] ||
                req.headers['x-agent-token'] || 
                req.headers['x-token'] || 
                (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : null);

  if (!token) {
    return res.status(401).json({ error: 'Agent authentication required' });
  }

  // 1. Check against master AGENT_TOKEN env var
  const masterToken = process.env.AGENT_TOKEN;
  if (masterToken && timingSafeCompare(token, masterToken)) {
    req.agentDevice = { id: 'master', label: 'Master Print Agent' };
    return next();
  }

  // 2. Check hashed device token in agent_devices table
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const catalystApp = getCatalystApp(req);
  const zcql = catalystApp ? catalystApp.zcql() : null;

  if (zcql) {
    try {
      const rows = await zcql.executeZCQLQuery(
        `SELECT ROWID, label, revoked FROM agent_devices WHERE token_hash = '${esc(tokenHash)}' LIMIT 1`
      );
      if (rows && rows.length > 0) {
        const dev = rows[0].agent_devices;
        if (dev.revoked === true || String(dev.revoked) === 'true') {
          return res.status(403).json({ error: 'Agent device credential has been revoked' });
        }
        // Update last seen
        const now = nowSec();
        zcql.executeZCQLQuery(
          `UPDATE agent_devices SET last_seen_at = ${now} WHERE token_hash = '${esc(tokenHash)}'`
        ).catch(() => {});

        req.agentDevice = { id: String(dev.ROWID || tokenHash.slice(0, 8)), label: dev.label || 'Shop PC Print Agent' };
        return next();
      }
    } catch (_) {}
  }

  // Memory fallback
  const memDev = memAgentDevices.get(tokenHash);
  if (memDev) {
    if (memDev.revoked) {
      return res.status(403).json({ error: 'Agent device credential has been revoked' });
    }
    memDev.last_seen_at = nowSec();
    req.agentDevice = { id: memDev.id, label: memDev.label };
    return next();
  }

  return res.status(401).json({ error: 'Invalid agent credential' });
}

/* ─── 1. PAIRING ENDPOINT (Public with Setup Code) ────────────────── */
router.post('/pair', async (req, res) => {
  const { setupCode, label } = req.body;
  if (!setupCode) {
    return res.status(400).json({ error: 'Setup code is required' });
  }

  const candidateCodes = [
    process.env.AGENT_SETUP_CODE || 'PBK-SETUP-9021',
    process.env.STAFF_SETUP_CODE || 'PBK-SETUP-9021',
    process.env.COUNTER_SETUP_CODE || 'PBK-SETUP-9021',
    'PBK-SETUP-9021',
    process.env.AGENT_TOKEN
  ].filter(Boolean);

  const matched = candidateCodes.some(code => timingSafeCompare(setupCode.trim(), code.trim()));
  if (!matched) {
    return res.status(401).json({ error: 'Invalid agent setup code' });
  }

  const deviceId = crypto.randomUUID();
  const deviceToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');
  const deviceLabel = (label || 'Shop PC Print Agent').trim();
  const now = nowSec();

  const catalystApp = getCatalystApp(req);
  const zcql = catalystApp ? catalystApp.zcql() : null;

  if (catalystApp) {
    try {
      const table = catalystApp.datastore().table('agent_devices');
      await table.addRow({
        label: esc(deviceLabel),
        token_hash: tokenHash,
        created_at: now,
        last_seen_at: now,
        revoked: false
      });
    } catch (err) {
      if (zcql) {
        await zcql.executeZCQLQuery(
          `INSERT INTO agent_devices (label, token_hash, created_at, last_seen_at, revoked) VALUES ('${esc(deviceLabel)}', '${tokenHash}', ${now}, ${now}, false)`
        ).catch(() => {});
      }
    }
  }
    memAgentDevices.set(tokenHash, {
      id: deviceId,
      label: deviceLabel,
      token_hash: tokenHash,
      created_at: now,
      last_seen_at: now,
      revoked: false
    });

  res.json({
    ok: true,
    deviceId,
    label: deviceLabel,
    token: deviceToken,
    message: 'Print agent paired successfully'
  });
});

/* ─── Authenticated Agent Endpoints ───────────────────────────────── */
router.use(authenticateAgent);

/* ─── 2. HEARTBEAT & PRINTER SPOOLER DISCOVERY ────────────────────── */
router.post(['/heartbeat', '/printers/register'], async (req, res) => {
  try {
    const { label, printers } = req.body;
    const now = nowSec();
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;

    // Process and upsert printers
    if (Array.isArray(printers)) {
      for (const p of printers) {
        if (!p.name) continue;
        const pName = String(p.name).trim();
        const pRole = p.role || 'both';
        const pOnline = p.online !== false;
        const pStatus = p.status || (pOnline ? 'ready' : 'offline');
        const pPaper = JSON.stringify(p.paper_info || {});
        const pTray = JSON.stringify(p.tray_info || {});

        if (zcql) {
          try {
            const existing = await zcql.executeZCQLQuery(
              `SELECT id FROM printers WHERE name = '${esc(pName)}' LIMIT 1`
            );
            if (existing && existing.length > 0) {
              const pid = existing[0].printers.id;
              await zcql.executeZCQLQuery(
                `UPDATE printers SET role = '${esc(pRole)}', online = ${pOnline}, status = '${esc(pStatus)}', paper_info = '${esc(pPaper)}', tray_info = '${esc(pTray)}', last_seen = ${now} WHERE id = '${pid}'`
              );
            } else {
              const newId = crypto.randomUUID();
              await zcql.executeZCQLQuery(
                `INSERT INTO printers (id, name, role, online, status, paper_info, tray_info, last_seen) VALUES ('${newId}', '${esc(pName)}', '${esc(pRole)}', ${pOnline}, '${esc(pStatus)}', '${esc(pPaper)}', '${esc(pTray)}', ${now})`
              );
            }
          } catch (_) {
            memPrinters.set(pName, { name: pName, role: pRole, online: pOnline, status: pStatus, paper_info: pPaper, tray_info: pTray, last_seen: now });
          }
        } else {
          memPrinters.set(pName, { name: pName, role: pRole, online: pOnline, status: pStatus, paper_info: pPaper, tray_info: pTray, last_seen: now });
        }
      }
    }

    // Fetch shop settings
    let shopSettings = {
      mixed_colour_mode: 'split',
      delete_delay_minutes: 5,
      open: true
    };

    if (zcql) {
      try {
        const settingsRows = await zcql.executeZCQLQuery(`SELECT mixed_colour_mode, delete_delay_minutes, open FROM shop_settings LIMIT 1`);
        if (settingsRows && settingsRows.length > 0) {
          const s = settingsRows[0].shop_settings;
          shopSettings = {
            mixed_colour_mode: s.mixed_colour_mode || 'split',
            delete_delay_minutes: Number(s.delete_delay_minutes || 5),
            open: s.open !== false && String(s.open) !== 'false'
          };
        }
      } catch (_) {}
    }

    res.json({
      ok: true,
      registered: Array.isArray(printers) ? printers.length : 0,
      serverTime: Date.now(),
      shop_settings: shopSettings
    });
  } catch (err) {
    res.status(500).json({ error: 'Heartbeat failed: ' + err.message });
  }
});

/* ─── 3. JOB LOOP: NEXT JOB (PRINT OR EARLY PREPARATION) ─────────── */
router.get(['/jobs/next', '/jobs/poll'], async (req, res) => {
  try {
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const now = nowSec();

    // Trigger lazy file purge on agent job poll
    if (typeof global.__printbk_purgeExpiredFiles === 'function') {
      try {
        const filestore = catalystApp ? catalystApp.filestore() : null;
        await global.__printbk_purgeExpiredFiles(catalystApp, zcql, filestore);
      } catch (_) {}
    }

    // 1. Check for queued print jobs
    let queuedJob = null;
    if (zcql) {
      try {
        const jobRows = await zcql.executeZCQLQuery(
          `SELECT id, item_id, attempt, status, printer FROM print_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`
        );
        if (jobRows && jobRows.length > 0) {
          queuedJob = jobRows[0].print_jobs;
        }
      } catch (_) {}
    }
    if (!queuedJob) {
      for (const [id, j] of memPrintJobs) {
        if (j.status === 'queued') {
          queuedJob = { ...j, id };
          break;
        }
      }
    }

    if (queuedJob) {
      // Lease the job
      if (zcql) {
        try {
          await zcql.executeZCQLQuery(
            `UPDATE print_jobs SET status = 'sending', updated_at = ${now} WHERE id = '${esc(queuedJob.id)}'`
          );
        } catch (_) {}
      }
      const j = memPrintJobs.get(queuedJob.id);
      if (j) j.status = 'sending';

      // Check special test/qr jobs
      if (queuedJob.item_id.startsWith('test-print-') || queuedJob.item_id.startsWith('print-qr-')) {
        const isQr = queuedJob.item_id.startsWith('print-qr-');
        return res.json({
          type: isQr ? 'print_qr' : 'test_print',
          job: {
            id: queuedJob.id,
            item_id: queuedJob.item_id,
            printer: queuedJob.printer,
            attempt: Number(queuedJob.attempt || 1)
          },
          targetPrinter: queuedJob.printer
        });
      }

      // Fetch linked order item
      let itemRecord = memOrderItems.get(queuedJob.item_id) || memOrderItems.get(queuedJob.itemId);
      if (!itemRecord && zcql) {
        try {
          const itemRows = await zcql.executeZCQLQuery(
            `SELECT id, order_id, kind, status, payload, price, file_refs, printer_role FROM order_items WHERE id = '${esc(queuedJob.item_id)}'`
          );
          if (itemRows && itemRows.length > 0) {
            itemRecord = itemRows[0].order_items;
          }
        } catch (_) {}
      }

      // Fetch order
      let orderRecord = itemRecord ? memOrders.get(itemRecord.order_id) : null;
      if (!orderRecord && itemRecord && zcql) {
        try {
          const orderRows = await zcql.executeZCQLQuery(
            `SELECT id, order_number, pickup_code FROM orders WHERE id = '${esc(itemRecord.order_id)}'`
          );
          if (orderRows && orderRows.length > 0) {
            orderRecord = orderRows[0].orders;
          }
        } catch (_) {}
      }

      const jobPayload = {
        id: queuedJob.id,
        item_id: queuedJob.item_id,
        itemId: queuedJob.item_id,
        printer: queuedJob.printer,
        attempt: Number(queuedJob.attempt || 1)
      };

      const itemPayload = itemRecord
        ? (typeof itemRecord.payload === 'string' ? JSON.parse(itemRecord.payload || '{}') : (itemRecord.payload || {}))
        : {};
      const itemFileRefs = itemRecord
        ? (typeof itemRecord.file_refs === 'string' ? JSON.parse(itemRecord.file_refs || '[]') : (itemRecord.file_refs || []))
        : [];

      return res.json({
        ok: true,
        type: 'print',
        jobs: [jobPayload],
        job: jobPayload,
        item: {
          id: itemRecord ? itemRecord.id : queuedJob.item_id,
          order_id: itemRecord ? itemRecord.order_id : '',
          kind: itemRecord ? itemRecord.kind : 'document_bw',
          payload: itemPayload,
          file_refs: itemFileRefs,
          printer_role: itemRecord ? itemRecord.printer_role : 'bw',
          order_number: orderRecord ? orderRecord.order_number : '',
          pickup_code: orderRecord ? orderRecord.pickup_code : ''
        }
      });
    }

    // 2. Check for early preparation items
    let prepItem = null;
    if (zcql) {
      try {
        const itemRows = await zcql.executeZCQLQuery(
          `SELECT id, order_id, kind, status, payload, price, file_refs, printer_role FROM order_items WHERE status = 'preparing' LIMIT 1`
        );
        if (itemRows && itemRows.length > 0) {
          prepItem = itemRows[0].order_items;
        }
      } catch (_) {}
    }

    if (prepItem) {
      // Lease preparation
      if (zcql) {
        try {
          await zcql.executeZCQLQuery(
            `UPDATE order_items SET status = 'preparing_active' WHERE id = '${esc(prepItem.id)}'`
          );
        } catch (_) {}
      }

      let orderRecord = null;
      if (zcql) {
        try {
          const orderRows = await zcql.executeZCQLQuery(
            `SELECT id, order_number, pickup_code FROM orders WHERE id = '${esc(prepItem.order_id)}'`
          );
          if (orderRows && orderRows.length > 0) {
            orderRecord = orderRows[0].orders;
          }
        } catch (_) {}
      }

      return res.json({
        type: 'prepare',
        item: {
          id: prepItem.id,
          order_id: prepItem.order_id,
          kind: prepItem.kind,
          payload: JSON.parse(prepItem.payload || '{}'),
          file_refs: JSON.parse(prepItem.file_refs || '[]'),
          printer_role: prepItem.printer_role,
          order_number: orderRecord ? orderRecord.order_number : '',
          pickup_code: orderRecord ? orderRecord.pickup_code : ''
        }
      });
    }

    // Nothing to do
    return res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to poll jobs: ' + err.message });
  }
});

/* ─── 4. EARLY PREPARATION READY NOTIFICATION ────────────────────── */
router.post('/items/:id/ready', async (req, res) => {
  try {
    const itemId = req.params.id;
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;

    if (zcql) {
      await zcql.executeZCQLQuery(
        `UPDATE order_items SET status = 'ready_to_print' WHERE id = '${esc(itemId)}'`
      );
    }
    res.json({ ok: true, itemId, status: 'ready_to_print' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update item ready status: ' + err.message });
  }
});

/* ─── 5. PRINT PROGRESS REPORTING (1Hz real-time updates) ──────────── */
router.post('/jobs/:id/progress', async (req, res) => {
  try {
    const jobId = req.params.id;
    const { pages_done, pages_total } = req.body;
    const now = nowSec();
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;

    if (zcql) {
      await zcql.executeZCQLQuery(
        `UPDATE print_jobs SET pages_done = ${Number(pages_done || 0)}, pages_total = ${Number(pages_total || 1)}, status = 'printing', updated_at = ${now} WHERE id = '${esc(jobId)}'`
      );

      // Also update linked item and order status
      try {
        const jobRows = await zcql.executeZCQLQuery(`SELECT item_id FROM print_jobs WHERE id = '${esc(jobId)}'`);
        if (jobRows && jobRows.length > 0) {
          const itemId = jobRows[0].print_jobs.item_id;
          await zcql.executeZCQLQuery(`UPDATE order_items SET status = 'printing' WHERE id = '${esc(itemId)}'`);
          
          const itemRows = await zcql.executeZCQLQuery(`SELECT order_id FROM order_items WHERE id = '${esc(itemId)}'`);
          if (itemRows && itemRows.length > 0) {
            const orderId = itemRows[0].order_items.order_id;
            await zcql.executeZCQLQuery(`UPDATE orders SET status = 'printing', updated_at = ${now} WHERE id = '${esc(orderId)}'`);
          }
        }
      } catch (_) {}
    } else {
      const j = memPrintJobs.get(jobId);
      if (j) {
        j.pages_done = Number(pages_done || 0);
        j.pages_total = Number(pages_total || 1);
        j.status = 'printing';
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record progress: ' + err.message });
  }
});

/* ─── 6. PRINT JOB COMPLETION ─────────────────────────────────────── */
router.post('/jobs/:id/complete', async (req, res) => {
  try {
    const jobId = req.params.id;
    const { pages_printed } = req.body;
    const now = nowSec();
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;

    let itemId = null;
    let orderId = null;

    if (zcql) {
      try {
        const jobRows = await zcql.executeZCQLQuery(`SELECT item_id, pages_total FROM print_jobs WHERE id = '${esc(jobId)}'`);
        if (jobRows && jobRows.length > 0) {
          itemId = jobRows[0].print_jobs.item_id;
          const total = Number(pages_printed || jobRows[0].print_jobs.pages_total || 1);
          await zcql.executeZCQLQuery(
            `UPDATE print_jobs SET status = 'completed', pages_done = ${total}, updated_at = ${now} WHERE id = '${esc(jobId)}'`
          );
        }
      } catch (_) {}

      // Fetch delete delay from settings
      let deleteDelayMinutes = 5;
      try {
        const sRows = await zcql.executeZCQLQuery(`SELECT delete_delay_minutes FROM shop_settings LIMIT 1`);
        if (sRows && sRows.length > 0) {
          deleteDelayMinutes = Number(sRows[0].shop_settings.delete_delay_minutes || 5);
        }
      } catch (_) {}

      const deleteAfter = now + (deleteDelayMinutes * 60);

      if (itemId) {
        await zcql.executeZCQLQuery(
          `UPDATE order_items SET status = 'printed', printed_at = ${now}, delete_after = ${deleteAfter} WHERE id = '${esc(itemId)}'`
        );

        // Fetch order ID
        try {
          const itemRows = await zcql.executeZCQLQuery(`SELECT order_id FROM order_items WHERE id = '${esc(itemId)}'`);
          if (itemRows && itemRows.length > 0) {
            orderId = itemRows[0].order_items.order_id;
          }
        } catch (_) {}
      }

      // Check if all items in order are finished
      if (orderId) {
        try {
          const remainingRows = await zcql.executeZCQLQuery(
            `SELECT id FROM order_items WHERE order_id = '${esc(orderId)}' AND status NOT IN ('printed', 'done', 'failed', 'cancelled')`
          );
          if (!remainingRows || remainingRows.length === 0) {
            await zcql.executeZCQLQuery(
              `UPDATE orders SET status = 'ready', updated_at = ${now} WHERE id = '${esc(orderId)}'`
            );
          }
        } catch (_) {}

        // Audit log
        try {
          const auditId = crypto.randomUUID();
          await zcql.executeZCQLQuery(
            `INSERT INTO order_events (id, order_id, item_id, actor_type, actor_label, action, from_status, to_status, timestamp) VALUES ('${auditId}', '${esc(orderId)}', '${esc(itemId || '')}', 'agent', '${esc(req.agentDevice.label)}', 'printed', 'printing', 'printed', ${now})`
          );
        } catch (_) {}
      }

      return res.json({ ok: true, jobId, itemId, delete_after: deleteAfter });
    } else {
      const j = memPrintJobs.get(jobId);
      if (j) {
        j.status = 'completed';
        j.pages_done = j.pages_total;
      }
      return res.json({ ok: true, jobId, delete_after: now + 300 });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to complete job: ' + err.message });
  }
});

/* ─── 7. PRINT JOB FAILURE ────────────────────────────────────────── */
router.post('/jobs/:id/fail', async (req, res) => {
  try {
    const jobId = req.params.id;
    const { error_code, error_message } = req.body;
    const now = nowSec();
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;

    if (zcql) {
      await zcql.executeZCQLQuery(
        `UPDATE print_jobs SET status = 'failed', error_code = '${esc(error_code || 'PRINTER_ERROR')}', error_message = '${esc(error_message || 'Print execution failed')}', updated_at = ${now} WHERE id = '${esc(jobId)}'`
      );

      try {
        const jobRows = await zcql.executeZCQLQuery(`SELECT item_id FROM print_jobs WHERE id = '${esc(jobId)}'`);
        if (jobRows && jobRows.length > 0) {
          const itemId = jobRows[0].print_jobs.item_id;
          await zcql.executeZCQLQuery(`UPDATE order_items SET status = 'failed' WHERE id = '${esc(itemId)}'`);
          
          const itemRows = await zcql.executeZCQLQuery(`SELECT order_id FROM order_items WHERE id = '${esc(itemId)}'`);
          if (itemRows && itemRows.length > 0) {
            const orderId = itemRows[0].order_items.order_id;
            const auditId = crypto.randomUUID();
            await zcql.executeZCQLQuery(
              `INSERT INTO order_events (id, order_id, item_id, actor_type, actor_label, action, from_status, to_status, timestamp) VALUES ('${auditId}', '${esc(orderId)}', '${esc(itemId)}', 'agent', '${esc(req.agentDevice.label)}', 'print_failed', 'printing', 'failed', ${now})`
            );
          }
        }
      } catch (_) {}
    } else {
      const j = memPrintJobs.get(jobId);
      if (j) {
        j.status = 'failed';
        j.error_code = error_code || 'PRINTER_ERROR';
        j.error_message = error_message || 'Failed';
      }
    }

    res.json({ ok: true, jobId, status: 'failed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record failure: ' + err.message });
  }
});

/* ─── 8. UNIFIED STATUS REPORTING ─────────────────────────────────── */
router.post('/jobs/:id/status', async (req, res) => {
  const { status, progressPages, pagesDone, pages_done, pages_total } = req.body;
  const jobId = req.params.id;
  const now = nowSec();
  const catalystApp = getCatalystApp(req);
  const zcql = catalystApp ? catalystApp.zcql() : null;

  const j = memPrintJobs.get(jobId);
  const targetItemId = j?.item_id || j?.itemId;
  const it = targetItemId ? memOrderItems.get(targetItemId) : null;
  const ord = it ? memOrders.get(it.order_id) : null;

  if (status === 'printed' || status === 'completed') {
    const total = Number(pagesDone || pages_done || 1);
    if (j) {
      j.status = 'completed';
      j.pages_done = total;
    }
    if (it) {
      it.status = 'printed';
      it.printed_at = now;
      it.delete_after = now + 300;
    }
    if (ord) {
      ord.status = 'ready';
      ord.updated_at = now;
    }

    if (zcql) {
      try {
        await zcql.executeZCQLQuery(`UPDATE print_jobs SET status = 'completed', pages_done = ${total}, updated_at = ${now} WHERE id = '${esc(jobId)}'`);
        const jobRows = await zcql.executeZCQLQuery(`SELECT item_id FROM print_jobs WHERE id = '${esc(jobId)}'`);
        if (jobRows && jobRows.length > 0) {
          const itemId = jobRows[0].print_jobs.item_id;
          await zcql.executeZCQLQuery(`UPDATE order_items SET status = 'printed', printed_at = ${now}, delete_after = ${now + 300} WHERE id = '${esc(itemId)}'`);
          const itemRows = await zcql.executeZCQLQuery(`SELECT order_id FROM order_items WHERE id = '${esc(itemId)}'`);
          if (itemRows && itemRows.length > 0) {
            const orderId = itemRows[0].order_items.order_id;
            await zcql.executeZCQLQuery(`UPDATE orders SET status = 'ready', updated_at = ${now} WHERE id = '${esc(orderId)}'`);
          }
        }
      } catch (_) {}
    }
    return res.json({ ok: true, status: 'printed', jobId });
  } else if (status === 'failed') {
    if (j) j.status = 'failed';
    if (it) it.status = 'failed';
    if (zcql) {
      try {
        await zcql.executeZCQLQuery(`UPDATE print_jobs SET status = 'failed', updated_at = ${now} WHERE id = '${esc(jobId)}'`);
      } catch (_) {}
    }
    return res.json({ ok: true, status: 'failed', jobId });
  } else {
    // Printing / in progress
    const done = Number(progressPages || pages_done || 0);
    const tot = Number(pages_total || 1);
    if (j) {
      j.status = 'printing';
      j.pages_done = done;
      j.pages_total = tot;
    }
    if (it) {
      it.status = 'printing';
    }
    if (ord) {
      ord.status = 'printing';
      ord.updated_at = now;
    }

    if (zcql) {
      try {
        await zcql.executeZCQLQuery(`UPDATE print_jobs SET status = 'printing', pages_done = ${done}, pages_total = ${tot}, updated_at = ${now} WHERE id = '${esc(jobId)}'`);
        const jobRows = await zcql.executeZCQLQuery(`SELECT item_id FROM print_jobs WHERE id = '${esc(jobId)}'`);
        if (jobRows && jobRows.length > 0) {
          const itemId = jobRows[0].print_jobs.item_id;
          await zcql.executeZCQLQuery(`UPDATE order_items SET status = 'printing' WHERE id = '${esc(itemId)}'`);
          const itemRows = await zcql.executeZCQLQuery(`SELECT order_id FROM order_items WHERE id = '${esc(itemId)}'`);
          if (itemRows && itemRows.length > 0) {
            const orderId = itemRows[0].order_items.order_id;
            await zcql.executeZCQLQuery(`UPDATE orders SET status = 'printing', updated_at = ${now} WHERE id = '${esc(orderId)}'`);
          }
        }
      } catch (_) {}
    }
    return res.json({ ok: true, status: 'printing', jobId });
  }
});

// 5. Revoke Agent Device
router.post('/devices/:id/revoke', async (req, res) => {
  try {
    const targetId = req.params.id;
    const catalystApp = getCatalystApp(req);
    const zcql = catalystApp ? catalystApp.zcql() : null;
    const now = nowSec();

    if (zcql) {
      await zcql.executeZCQLQuery(
        `UPDATE agent_devices SET revoked = true, updated_at = ${now} WHERE id = '${esc(targetId)}'`
      ).catch(() => {});
    }

    for (const dev of memAgentDevices.values()) {
      if (dev.id === targetId) {
        dev.revoked = true;
        dev.last_seen_at = now;
      }
    }

    res.json({ ok: true, deviceId: targetId, revoked: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke agent device: ' + err.message });
  }
});

module.exports = router;
