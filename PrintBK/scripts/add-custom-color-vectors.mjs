import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vectorsPath = path.resolve(__dirname, '../packages/shared/test-vectors/pricing.json');

// Import pure priceOrder from built shared package
const { priceOrder, defaultShopConfig } = await import('../packages/shared/dist/index.js');

const existingVectors = JSON.parse(fs.readFileSync(vectorsPath, 'utf8'));
// Keep existing 110 vectors
const baseVectors = existingVectors.filter(v => {
  const num = parseInt(v.id.replace('case-', ''), 10);
  return num <= 110;
});

const defaultRates = {
  bw: 1.5,
  color: 8,
  scan: 5,
  photocopy: 1.5,
  doubleSideDiscount: 0.4333,
  bulkTierThreshold: 100,
  bulkTierRate: 0.8,
  paperMultipliers: { A4: 1, A3: 2, Legal: 1.2 },
  staple: 5,
  spiral: 30,
  comb: 25,
  hardCover: 150,
  laminationID: 10,
  laminationA4: 25,
  laminationA3: 50,
  laminationThickExtra: 5,
  rushSurcharge: 0.15,
  gatewayFee: 0
};

const scenarios = [
  {
    id: "case-111",
    desc: "10 pgs, Custom colour page 1 only, single sided A4, 1 copy",
    pages: 10,
    copies: 1,
    sided: "single",
    paper: "A4",
    nUp: 1,
    colorPages: [1]
  },
  {
    id: "case-112",
    desc: "10 pgs, Custom colour page 1 only, double sided A4, 1 copy",
    pages: 10,
    copies: 1,
    sided: "double",
    paper: "A4",
    nUp: 1,
    colorPages: [1]
  },
  {
    id: "case-113",
    desc: "10 pgs, Custom colour last page only (page 10), single sided A4, 1 copy",
    pages: 10,
    copies: 1,
    sided: "single",
    paper: "A4",
    nUp: 1,
    colorPages: [10]
  },
  {
    id: "case-114",
    desc: "10 pgs, Custom colour last page only (page 10), double sided A4, 1 copy",
    pages: 10,
    copies: 1,
    sided: "double",
    paper: "A4",
    nUp: 1,
    colorPages: [10]
  },
  {
    id: "case-115",
    desc: "10 pgs, Custom colour first & last (pages 1 and 10), single sided A4, 1 copy",
    pages: 10,
    copies: 1,
    sided: "single",
    paper: "A4",
    nUp: 1,
    colorPages: [1, 10]
  },
  {
    id: "case-116",
    desc: "10 pgs, Custom colour first & last (pages 1 and 10), double sided A4, 1 copy",
    pages: 10,
    copies: 1,
    sided: "double",
    paper: "A4",
    nUp: 1,
    colorPages: [1, 10]
  },
  {
    id: "case-117",
    desc: "5 pgs, Custom colour all pages, single sided A4, 1 copy",
    pages: 5,
    copies: 1,
    sided: "single",
    paper: "A4",
    nUp: 1,
    colorPages: [1, 2, 3, 4, 5]
  },
  {
    id: "case-118",
    desc: "5 pgs, Custom colour all pages, double sided A4, 1 copy",
    pages: 5,
    copies: 1,
    sided: "double",
    paper: "A4",
    nUp: 1,
    colorPages: [1, 2, 3, 4, 5]
  },
  {
    id: "case-119",
    desc: "10 pgs, Custom colour none (empty array), single sided A4, 1 copy",
    pages: 10,
    copies: 1,
    sided: "single",
    paper: "A4",
    nUp: 1,
    colorPages: []
  },
  {
    id: "case-120",
    desc: "10 pgs, Custom colour none (empty array), double sided A4, 1 copy",
    pages: 10,
    copies: 1,
    sided: "double",
    paper: "A4",
    nUp: 1,
    colorPages: []
  },
  {
    id: "case-121",
    desc: "10 pgs, Custom colour overlapping ranges ([1, 2, 2, 3, 1]), single sided A4",
    pages: 10,
    copies: 1,
    sided: "single",
    paper: "A4",
    nUp: 1,
    colorPages: [1, 2, 2, 3, 1]
  },
  {
    id: "case-122",
    desc: "10 pgs, Custom colour with out-of-range pages ([1, 15, 99]), single sided A4",
    pages: 10,
    copies: 1,
    sided: "single",
    paper: "A4",
    nUp: 1,
    colorPages: [1, 15, 99]
  },
  {
    id: "case-123",
    desc: "10 pgs, Custom colour with 2 copies, single sided A4, colorPages = [1]",
    pages: 10,
    copies: 2,
    sided: "single",
    paper: "A4",
    nUp: 1,
    colorPages: [1]
  },
  {
    id: "case-124",
    desc: "10 pgs, Custom colour with 3 copies, double sided A4, colorPages = [1, 5]",
    pages: 10,
    copies: 3,
    sided: "double",
    paper: "A4",
    nUp: 1,
    colorPages: [1, 5]
  },
  {
    id: "case-125",
    desc: "10 pgs, 2-up, single sided A4, colorPages = [1] (face 1 has [1, 2])",
    pages: 10,
    copies: 1,
    sided: "single",
    paper: "A4",
    nUp: 2,
    colorPages: [1]
  },
  {
    id: "case-126",
    desc: "10 pgs, 2-up, double sided A4, colorPages = [1]",
    pages: 10,
    copies: 1,
    sided: "double",
    paper: "A4",
    nUp: 2,
    colorPages: [1]
  },
  {
    id: "case-127",
    desc: "10 pgs, 2-up, single sided A4, colorPages = [1, 2] (both on Face 1)",
    pages: 10,
    copies: 1,
    sided: "single",
    paper: "A4",
    nUp: 2,
    colorPages: [1, 2]
  },
  {
    id: "case-128",
    desc: "10 pgs, 2-up, single sided A4, colorPages = [1, 3] (Faces 1 and 2)",
    pages: 10,
    copies: 1,
    sided: "single",
    paper: "A4",
    nUp: 2,
    colorPages: [1, 3]
  },
  {
    id: "case-129",
    desc: "12 pgs, 4-up, single sided A4, colorPages = [1] (Face 1 has [1..4])",
    pages: 12,
    copies: 1,
    sided: "single",
    paper: "A4",
    nUp: 4,
    colorPages: [1]
  },
  {
    id: "case-130",
    desc: "12 pgs, 4-up, double sided A4, colorPages = [1, 5] (Faces 1 and 2)",
    pages: 12,
    copies: 1,
    sided: "double",
    paper: "A4",
    nUp: 4,
    colorPages: [1, 5]
  },
  {
    id: "case-131",
    desc: "12 pgs, 4-up, double sided A4, colorPages = [1, 2, 3, 4] (all on Face 1)",
    pages: 12,
    copies: 1,
    sided: "double",
    paper: "A4",
    nUp: 4,
    colorPages: [1, 2, 3, 4]
  },
  {
    id: "case-132",
    desc: "8 pgs, Custom colour on A3 paper (2.0x), single sided, colorPages = [1]",
    pages: 8,
    copies: 1,
    sided: "single",
    paper: "A3",
    nUp: 1,
    colorPages: [1]
  },
  {
    id: "case-133",
    desc: "8 pgs, Custom colour on A3 paper (2.0x), double sided, colorPages = [1]",
    pages: 8,
    copies: 1,
    sided: "double",
    paper: "A3",
    nUp: 1,
    colorPages: [1]
  },
  {
    id: "case-134",
    desc: "8 pgs, Custom colour on Legal paper (1.2x), single sided, colorPages = [1]",
    pages: 8,
    copies: 1,
    sided: "single",
    paper: "Legal",
    nUp: 1,
    colorPages: [1]
  },
  {
    id: "case-135",
    desc: "8 pgs, Custom colour on Legal paper (1.2x), double sided, colorPages = [1, 2]",
    pages: 8,
    copies: 1,
    sided: "double",
    paper: "Legal",
    nUp: 1,
    colorPages: [1, 2]
  },
  {
    id: "case-136",
    desc: "16 pgs, Booklet mode, colorPages = [1]",
    pages: 16,
    copies: 1,
    sided: "double",
    paper: "A4",
    nUp: 1,
    booklet: true,
    colorPages: [1]
  },
  {
    id: "case-137",
    desc: "16 pgs, Booklet mode, colorPages = [1, 16] (Face 1 has both 1 & 16)",
    pages: 16,
    copies: 1,
    sided: "double",
    paper: "A4",
    nUp: 1,
    booklet: true,
    colorPages: [1, 16]
  },
  {
    id: "case-138",
    desc: "20 pgs, Custom range '1-10', colorPages = [1, 5], single sided A4",
    pages: 20,
    copies: 1,
    sided: "single",
    paper: "A4",
    range: "1-10",
    nUp: 1,
    colorPages: [1, 5]
  },
  {
    id: "case-139",
    desc: "20 pgs, Custom range '5-15', colorPages = [1, 5] (page 1 not printed), single sided A4",
    pages: 20,
    copies: 1,
    sided: "single",
    paper: "A4",
    range: "5-15",
    nUp: 1,
    colorPages: [1, 5]
  },
  {
    id: "case-140",
    desc: "30 pgs, Custom colour [1, 5, 10, 15], 2 copies, double sided A4",
    pages: 30,
    copies: 2,
    sided: "double",
    paper: "A4",
    nUp: 1,
    colorPages: [1, 5, 10, 15]
  },
  {
    id: "case-141",
    desc: "100 pgs, Custom colour [1], single sided A4 (triggers bulk tier at 100 sheets)",
    pages: 100,
    copies: 1,
    sided: "single",
    paper: "A4",
    nUp: 1,
    colorPages: [1]
  },
  {
    id: "case-142",
    desc: "100 pgs, Custom colour [1], double sided A4 (50 sheets < 100, no bulk tier)",
    pages: 100,
    copies: 1,
    sided: "double",
    paper: "A4",
    nUp: 1,
    colorPages: [1]
  },
  {
    id: "case-143",
    desc: "200 pgs, Custom colour [1..10], double sided A4 (100 sheets >= 100, bulk tier applies)",
    pages: 200,
    copies: 1,
    sided: "double",
    paper: "A4",
    nUp: 1,
    colorPages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  },
  {
    id: "case-144",
    desc: "6 pgs, 6-up, single sided A4, colorPages = [3] (face 1 contains [1..6])",
    pages: 6,
    copies: 1,
    sided: "single",
    paper: "A4",
    nUp: 6,
    colorPages: [3]
  },
  {
    id: "case-145",
    desc: "12 pgs, 6-up, single sided A4, colorPages = [3, 9] (Faces 1 and 2)",
    pages: 12,
    copies: 1,
    sided: "single",
    paper: "A4",
    nUp: 6,
    colorPages: [3, 9]
  }
];

const newVectors = scenarios.map(sc => {
  const basket = {
    files: [
      {
        id: `f-${sc.id}`,
        name: `doc_${sc.pages}p.pdf`,
        pages: sc.pages,
        settings: {
          copies: sc.copies,
          colorMode: 'custom',
          colorPlan: {
            mode: 'custom',
            colorPages: sc.colorPages
          },
          sided: sc.sided,
          paper: sc.paper,
          nUp: sc.nUp,
          booklet: sc.booklet || false,
          range: sc.range || 'all'
        }
      }
    ],
    services: [],
    rush: false
  };

  const config = {
    ...defaultShopConfig,
    rates: defaultRates,
    rushEnabled: false
  };

  const calculated = priceOrder(basket, config);

  return {
    id: sc.id,
    description: sc.desc,
    basket,
    configRates: defaultRates,
    rushEnabled: false,
    expected: {
      subtotal: calculated.subtotal,
      rushFee: calculated.rushFee,
      gatewayFee: calculated.gatewayFee,
      total: calculated.total,
      quotePending: calculated.quotePending,
      linesCount: calculated.lines.length
    }
  };
});

const allVectors = [...baseVectors, ...newVectors];
fs.writeFileSync(vectorsPath, JSON.stringify(allVectors, null, 2) + '\n');
console.log(`Successfully written ${allVectors.length} vectors (${newVectors.length} new custom color vectors).`);
