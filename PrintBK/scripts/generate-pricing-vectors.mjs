import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const { priceOrder, defaultShopConfig } = await import('../packages/shared/dist/index.js');

const vectors = [];

// Specific edge cases
const papers = ['A4', 'A3', 'Legal'];
const sides = ['single', 'double'];
const colorModes = ['bw', 'color', 'auto'];

let caseId = 1;

function addVector(desc, basket, customConfig = null) {
  const config = customConfig || defaultShopConfig;
  const result = priceOrder(basket, config);
  vectors.push({
    id: `case-${String(caseId++).padStart(3, '0')}`,
    description: desc,
    basket,
    configRates: config.rates,
    rushEnabled: config.rushEnabled,
    expected: {
      subtotal: result.subtotal,
      rushFee: result.rushFee,
      gatewayFee: result.gatewayFee,
      total: result.total,
      quotePending: result.quotePending,
      linesCount: result.lines.length
    }
  });
}

// 1. Basic Single page B&W
addVector('Single page B&W single sided A4', {
  files: [{ id: 'f1', name: '1page.pdf', pages: 1, settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4' } }],
  services: [], rush: false
});

addVector('Single page B&W double sided A4', {
  files: [{ id: 'f1', name: '1page.pdf', pages: 1, settings: { copies: 1, colorMode: 'bw', sided: 'double', paper: 'A4' } }],
  services: [], rush: false
});

// 2. Duplex page counts 2, 3, 4
addVector('2 pages B&W double sided A4 (1 sheet)', {
  files: [{ id: 'f1', name: '2page.pdf', pages: 2, settings: { copies: 1, colorMode: 'bw', sided: 'double', paper: 'A4' } }],
  services: [], rush: false
});

addVector('3 pages B&W double sided A4 (2 sheets)', {
  files: [{ id: 'f1', name: '3page.pdf', pages: 3, settings: { copies: 1, colorMode: 'bw', sided: 'double', paper: 'A4' } }],
  services: [], rush: false
});

// 3. Bulk Tier Transitions (Threshold 100)
addVector('99 sheets B&W single sided A4 (below bulk tier)', {
  files: [{ id: 'f1', name: '99pg.pdf', pages: 99, settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4' } }],
  services: [], rush: false
});

addVector('100 sheets B&W single sided A4 (at bulk tier)', {
  files: [{ id: 'f1', name: '100pg.pdf', pages: 100, settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4' } }],
  services: [], rush: false
});

addVector('101 sheets B&W single sided A4 (above bulk tier)', {
  files: [{ id: 'f1', name: '101pg.pdf', pages: 101, settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4' } }],
  services: [], rush: false
});

addVector('99 sheets B&W double sided A4 (198 pages)', {
  files: [{ id: 'f1', name: '198pg.pdf', pages: 198, settings: { copies: 1, colorMode: 'bw', sided: 'double', paper: 'A4' } }],
  services: [], rush: false
});

addVector('100 sheets B&W double sided A4 (200 pages, bulk tier)', {
  files: [{ id: 'f1', name: '200pg.pdf', pages: 200, settings: { copies: 1, colorMode: 'bw', sided: 'double', paper: 'A4' } }],
  services: [], rush: false
});

addVector('101 sheets B&W double sided A4 (202 pages, bulk tier)', {
  files: [{ id: 'f1', name: '202pg.pdf', pages: 202, settings: { copies: 1, colorMode: 'bw', sided: 'double', paper: 'A4' } }],
  services: [], rush: false
});

// 4. Color prints & Mixed ratios
addVector('1 page Color single sided A4', {
  files: [{ id: 'f1', name: 'color1.pdf', pages: 1, settings: { copies: 1, colorMode: 'color', sided: 'single', paper: 'A4' } }],
  services: [], rush: false
});

addVector('10 pages Color single sided A4', {
  files: [{ id: 'f1', name: 'color10.pdf', pages: 10, settings: { copies: 1, colorMode: 'color', sided: 'single', paper: 'A4' } }],
  services: [], rush: false
});

addVector('10 pages Color double sided A4', {
  files: [{ id: 'f1', name: 'color10d.pdf', pages: 10, settings: { copies: 1, colorMode: 'color', sided: 'double', paper: 'A4' } }],
  services: [], rush: false
});

addVector('Auto color mode: 10 pages, 3 color pages, single sided', {
  files: [{ id: 'f1', name: 'mixed.pdf', pages: 10, colorPages: 3, settings: { copies: 1, colorMode: 'auto', sided: 'single', paper: 'A4' } }],
  services: [], rush: false
});

addVector('Auto color mode: 10 pages, 3 color pages, double sided', {
  files: [{ id: 'f1', name: 'mixed_d.pdf', pages: 10, colorPages: 3, settings: { copies: 1, colorMode: 'auto', sided: 'double', paper: 'A4' } }],
  services: [], rush: false
});

// 5. Paper multipliers
addVector('A3 paper B&W single sided (2x multiplier)', {
  files: [{ id: 'f1', name: 'a3_bw.pdf', pages: 5, settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A3' } }],
  services: [], rush: false
});

addVector('A3 paper B&W double sided (2x multiplier)', {
  files: [{ id: 'f1', name: 'a3_bwd.pdf', pages: 6, settings: { copies: 1, colorMode: 'bw', sided: 'double', paper: 'A3' } }],
  services: [], rush: false
});

addVector('A3 paper Color single sided (2x multiplier)', {
  files: [{ id: 'f1', name: 'a3_col.pdf', pages: 4, settings: { copies: 1, colorMode: 'color', sided: 'single', paper: 'A3' } }],
  services: [], rush: false
});

addVector('Legal paper B&W single sided (1.2x multiplier)', {
  files: [{ id: 'f1', name: 'legal_bw.pdf', pages: 10, settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'Legal' } }],
  services: [], rush: false
});

addVector('Legal paper Color single sided (1.2x multiplier)', {
  files: [{ id: 'f1', name: 'legal_col.pdf', pages: 5, settings: { copies: 1, colorMode: 'color', sided: 'single', paper: 'Legal' } }],
  services: [], rush: false
});

// 6. N-up & Booklet
addVector('2-up printing B&W 10 pages', {
  files: [{ id: 'f1', name: '2up.pdf', pages: 10, settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4', nUp: 2 } }],
  services: [], rush: false
});

addVector('4-up printing B&W 16 pages', {
  files: [{ id: 'f1', name: '4up.pdf', pages: 16, settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4', nUp: 4 } }],
  services: [], rush: false
});

addVector('Booklet printing B&W 8 pages', {
  files: [{ id: 'f1', name: 'booklet8.pdf', pages: 8, settings: { copies: 1, colorMode: 'bw', sided: 'double', paper: 'A4', booklet: true } }],
  services: [], rush: false
});

addVector('Booklet printing B&W 9 pages', {
  files: [{ id: 'f1', name: 'booklet9.pdf', pages: 9, settings: { copies: 1, colorMode: 'bw', sided: 'double', paper: 'A4', booklet: true } }],
  services: [], rush: false
});

// 7. Rush surcharge
addVector('Rush enabled with 15% surcharge', {
  files: [{ id: 'f1', name: 'rush.pdf', pages: 20, settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4' } }],
  services: [], rush: true
}, { ...defaultShopConfig, rushEnabled: true });

addVector('Rush requested but disabled in config', {
  files: [{ id: 'f1', name: 'rush_off.pdf', pages: 20, settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4' } }],
  services: [], rush: true
}, { ...defaultShopConfig, rushEnabled: false });

// 8. Services & Addons
addVector('Staple service addon', {
  files: [{ id: 'f1', name: 'doc.pdf', pages: 10, settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4' } }],
  services: [{ id: 's1', type: 'addon', name: 'Corner Staple', price: 5, qty: 1 }], rush: false
});

addVector('Spiral binding service addon', {
  files: [{ id: 'f1', name: 'thesis.pdf', pages: 50, settings: { copies: 1, colorMode: 'bw', sided: 'double', paper: 'A4' } }],
  services: [{ id: 's1', type: 'addon', name: 'Spiral Binding', price: 30, qty: 1 }], rush: false
});

addVector('Hardcover binding service addon', {
  files: [{ id: 'f1', name: 'project.pdf', pages: 120, settings: { copies: 1, colorMode: 'bw', sided: 'double', paper: 'A4' } }],
  services: [{ id: 's1', type: 'addon', name: 'Hard Cover Book', price: 150, qty: 1 }], rush: false
});

addVector('Lamination A4 addon (qty 2)', {
  files: [],
  services: [{ id: 's1', type: 'addon', name: 'A4 Lamination', price: 25, qty: 2 }], rush: false
});

addVector('Walkin Photocopy (qty 15)', {
  files: [],
  services: [{ id: 's1', type: 'walkin', name: 'Photocopy B&W', price: 1.5, qty: 15 }], rush: false
});

addVector('Walkin Scanning (qty 8)', {
  files: [],
  services: [{ id: 's1', type: 'walkin', name: 'Document Scanning', price: 5, qty: 8 }], rush: false
});

addVector('Custom Request quote pending', {
  files: [{ id: 'f1', name: 'custom.pdf', pages: 5, settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4' } }],
  services: [{ id: 's1', type: 'request', name: 'Custom Glossy Foil Print', qty: 1 }], rush: false
});

// 9. Combinatorial Generation to exceed 100 distinct test vectors
const pageCounts = [1, 2, 4, 7, 15, 25, 48, 80, 150];
const copyCounts = [1, 2, 3, 5];

for (const p of pageCounts) {
  for (const c of copyCounts) {
    for (const paper of papers) {
      if (caseId > 110) break;
      addVector(`${p} pgs × ${c} copies on ${paper} (B&W double)`, {
        files: [{ id: `f-${p}-${c}`, name: `doc_${p}.pdf`, pages: p, settings: { copies: c, colorMode: 'bw', sided: 'double', paper } }],
        services: [], rush: false
      });
      if (caseId > 110) break;
      addVector(`${p} pgs × ${c} copies on ${paper} (Color single)`, {
        files: [{ id: `f-${p}-${c}-c`, name: `doc_${p}_c.pdf`, pages: p, settings: { copies: c, colorMode: 'color', sided: 'single', paper } }],
        services: [], rush: false
      });
    }
  }
}

const outDir = path.join(root, 'packages', 'shared', 'test-vectors');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const outFile = path.join(outDir, 'pricing.json');
fs.writeFileSync(outFile, JSON.stringify(vectors, null, 2), 'utf-8');
console.log(`Generated ${vectors.length} golden test vectors at: packages/shared/test-vectors/pricing.json`);
