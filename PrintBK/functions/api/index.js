'use strict';
const express = require('express');
const catalyst = require('zcatalyst-sdk-node');
const cors = require('cors');
const crypto = require('crypto');
const multer = require('multer');

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (req, file, cb) => {
    // Security Firewall: Allow only safe print formats
    const allowed = [
      'application/pdf',
      'image/jpeg', 'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Malware protection blocked this upload.'));
    }
  }
});

app.use(cors({
  origin: ['https://printbk-60074625517.development.catalystserverless.in', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '2mb' }));

const defaultShopConfig = {
  rates: {
    bw: 1.50, color: 8.00, scan: 5, photocopy: 1.50,
    doubleSideDiscount: 0.4333, bulkTierThreshold: 100, bulkTierRate: 0.80,
    paperMultipliers: { A4: 1, A3: 2, Legal: 1.2 },
    staple: 5, spiral: 30, comb: 25, hardCover: 150,
    laminationID: 10, laminationA4: 25, laminationA3: 50, laminationThickExtra: 5,
    rushSurcharge: 0.15, gatewayFee: 0,
  },
  rushEnabled: false,
  maxFileMB: 25,
  autoDeleteDelay: 5,
};

function esc(str) { return String(str ?? '').replace(/'/g, "''"); }
function nowSec() { return Math.floor(Date.now() / 1000); }

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get('/config', (_req, res) => res.json(defaultShopConfig));

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const catalystApp = catalyst.initialize(req);
    const filestore = catalystApp.filestore();
    
    // Auto-create or get the 'print_files' folder
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
       console.error("Folder error", err);
       // If folder querying/creation is restricted, try default folder id 1
       folderId = 1; 
    }

    // Upload to cloud
    const folder = filestore.folder(folderId);
    const uploadedFile = await folder.uploadFile({
       code: req.file.buffer,
       name: `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    });

    res.json({ cloudId: uploadedFile.id, name: uploadedFile.file_name, size: req.file.size });
  } catch (err) {
    console.error('POST /upload', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

app.post('/orders', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const { files = [], services = [], rush = false, pickupCode = '' } = req.body;
    const orderId = crypto.randomUUID();
    const now = nowSec();

    let total = 0;
    
    // Security: Calculate exact price on backend to prevent frontend spoofing
    for (const f of files) {
      // 1. Strict Type Validation & Anti-Negative Hack
      const pages = Math.max(1, Number(f.pages) || 1);
      const copies = Math.max(1, Number(f.settings?.copies) || 1);
      const nUp = Math.max(1, Number(f.settings?.nUp) || 1);
      
      const colorMode = String(f.settings?.colorMode || 'bw');
      const sided = String(f.settings?.sided || 'single');
      const paper = String(f.settings?.paper || 'A4');
      const isBooklet = Boolean(f.settings?.booklet);

      // Calculate Physical Pages
      let physicalPages = pages;
      physicalPages = Math.ceil(physicalPages / nUp);
      if (isBooklet) physicalPages = Math.ceil(pages / 4) * 2;

      let sheets = physicalPages;
      if (sided === 'double') sheets = Math.ceil(physicalPages / 2);
      
      const totalSheets = sheets * copies;

      const paperMult = defaultShopConfig.rates.paperMultipliers[paper] || 1;
      
      let pricePerPageBW = (sided === 'double' ? 0.85 : 1.50) * paperMult;
      let pricePerPageColor = (sided === 'double' ? 8.00 : 8.00) * paperMult;

      // Bulk tier check
      if (totalSheets >= defaultShopConfig.rates.bulkTierThreshold) {
        pricePerPageBW = Math.min(pricePerPageBW, 0.80 * paperMult);
      }

      // Color vs BW split
      let colorPages = 0;
      let bwPages = 0;
      if (colorMode === 'color') { colorPages = physicalPages; }
      else if (colorMode === 'bw') { bwPages = physicalPages; }
      else {
        const ratio = pages > 0 ? (Math.max(0, Number(f.colorPages) || 0) / pages) : 0;
        colorPages = Math.ceil(physicalPages * ratio);
        bwPages = physicalPages - colorPages;
      }

      let cost = (bwPages * pricePerPageBW + colorPages * pricePerPageColor) * copies;
      cost = Math.round(cost * 100) / 100;
      total += cost;
    }

    for (const s of services) {
      if (s.price != null) {
         const qty = Math.max(1, Number(s.qty) || 1); // Anti-negative hack
         const price = Math.max(0, Number(s.price));
         total += Math.round(price * qty * 2) / 2;
      }
    }
    
    if (rush) {
      total += Math.round((total * defaultShopConfig.rates.rushSurcharge) * 2) / 2;
    }

    total = Math.round(total * 100) / 100;

    const quotePending = services.some(s => s.price == null);
    const status = quotePending ? 'waiting_quote' : 'pending_payment';
    const basketJson = esc(JSON.stringify({ files, services, rush, pickupCode }));
    const filesJson  = esc(JSON.stringify(files.map(f => f.name)));

    await zcql.executeZCQLQuery(
      `INSERT INTO orders (id, status, basket, file_names, quote_pending, total, created_at, updated_at) VALUES ('${orderId}', '${status}', '${basketJson}', '${filesJson}', ${quotePending}, ${total}, ${now}, ${now})`
    );
    res.json({ orderId, status, total, quotePending, pickupCode });
  } catch (err) {
    console.error('POST /orders', err);
    res.status(500).json({ error: 'DB error', orderId: `fallback-${Date.now()}` });
  }
});

app.get('/orders/:id', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(
      `SELECT id, status, total, quote_pending, basket, file_names, created_at FROM orders WHERE id = '${esc(req.params.id)}'`
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const o = rows[0].orders;
    let basketData = {};
    try { basketData = JSON.parse(o.basket || '{}'); } catch(e) {}
    res.json({
      id: o.id,
      status: o.status,
      total: o.total,
      quotePending: o.quote_pending,
      pickupCode: basketData.pickupCode || '',
      basket: basketData,
      fileNames: JSON.parse(o.file_names || '[]'),
      createdAt: o.created_at
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/orders/:id/pay', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    await zcql.executeZCQLQuery(
      `UPDATE orders SET status = 'processing', updated_at = ${nowSec()} WHERE id = '${esc(req.params.id)}'`
    );
    res.json({ ok: true, status: 'processing' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Missing status' });
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    await zcql.executeZCQLQuery(
      `UPDATE orders SET status = '${esc(status)}', updated_at = ${nowSec()} WHERE id = '${esc(req.params.id)}'`
    );
    res.json({ ok: true, status });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/orders', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(
      `SELECT id, status, total, quote_pending, basket, file_names, created_at FROM orders ORDER BY created_at DESC`
    );
    res.json((rows || []).map(r => {
      let basketData = {};
      try { basketData = JSON.parse(r.orders.basket || '{}'); } catch(e) {}
      return {
        id: r.orders.id,
        status: r.orders.status,
        total: r.orders.total,
        quotePending: r.orders.quote_pending,
        pickupCode: basketData.pickupCode || '',
        basket: basketData,
        fileNames: JSON.parse(r.orders.file_names || '[]'),
        createdAt: r.orders.created_at
      };
    }));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = app;