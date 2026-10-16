#!/usr/bin/env node
/**
 * PrintBK Shop Configuration Seeder
 * 
 * Seeds authentic initial shop configuration for a fresh deployment.
 * ZERO sample orders or fake history data are created.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const env = fs.readFileSync(path.join(__dirname, '../functions/api/.env'), 'utf8');
let setupCode = '';
for (const line of env.split(/\r?\n/)) {
  if (line.startsWith('STAFF_SETUP_CODE=')) {
    setupCode = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  }
}

const liveBase = process.env.API_BASE || 'https://printbk-60074625517.development.catalystserverless.in';

const INITIAL_SHOP_CONFIG = {
  open: true,
  announcement: '',
  delete_delay_minutes: 5,
  mixed_colour_mode: 'split',
  rates: {
    bw: 1.5,
    colour: 8.0,
    doubleSideDiscount: 0.4333,
    bulkTierThreshold: 100,
    bulkTierRate: 0.8,
    paperMultipliers: { A4: 1.0, A3: 2.0, Legal: 1.25 },
    staple: 5,
    spiral: 30,
    comb: 25,
    hardcover: 150,
    softcover: 80,
    scan: 5,
    photocopy: 1.5
  },
  services: {
    bw: { enabled: true, name: 'B&W Printing' },
    colour: { enabled: true, name: 'Colour Printing' },
    photo: { enabled: true, name: 'Photo Prints' },
    binding: { enabled: true, name: 'Spiral / Hard Binding' },
    lamination: { enabled: true, name: 'Lamination' },
    scanning: { enabled: true, name: 'Document Scanning' },
    photocopy: { enabled: true, name: 'Photocopy' },
    typing: { enabled: true, name: 'Typing & Formatting' }
  },
  payments: {
    cash: true,
    upi: true,
    razorpay: false
  },
  shop_info: {
    name: 'HKBK Student Point',
    address: 'HKBK College Campus, Nagawara, Bengaluru',
    hours: '8:30 AM – 6:00 PM (Mon–Sat)',
    contact: '+91 87068 68815',
    payee: 'PrintBK HKBK',
    upi: 'Q098686787@ybl'
  }
};

async function seed() {
  console.log(`[seed-config] Seeding initial shop settings to ${liveBase}...`);

  // 1. Authenticate with setup code
  const pairRes = await fetch(`${liveBase}/server/api/staff/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupCode, label: 'Seeder Script' })
  });
  const pairData = await pairRes.json();
  if (!pairData.token) {
    throw new Error('Failed to authenticate with setup code: ' + JSON.stringify(pairData));
  }

  // 2. Put settings
  const putRes = await fetch(`${liveBase}/server/api/staff/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Device-Token': pairData.token
    },
    body: JSON.stringify(INITIAL_SHOP_CONFIG)
  });

  const putData = await putRes.json();
  console.log('[seed-config] Success:', putData);
}

seed().catch(console.error);
