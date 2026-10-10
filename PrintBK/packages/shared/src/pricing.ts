import { Basket, ShopConfig, PrintFile } from './schemas';
import { parsePageRange } from './parsePageRange';

export interface PriceLine {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  detail: string;
}

export interface PriceBreakdown {
  lines: PriceLine[];
  subtotal: number;
  rushFee: number;
  gatewayFee: number;
  total: number;
  savingsTip: string | null;
  quotePending: boolean;
}

function roundTo50Paise(val: number): number {
  return Math.round(val * 2) / 2;
}

export function priceOrder(basket: Basket, config: ShopConfig, now: Date = new Date()): PriceBreakdown {
  const lines: PriceLine[] = [];
  let subtotal = 0;
  let quotePending = false;
  
  let potentialSavings = 0;
  let savingsSource = '';

  for (const file of basket.files) {
    const s = file.settings;
    const { pages } = parsePageRange(s.range, file.pages);
    let physicalPages = pages.length;

    physicalPages = Math.ceil(physicalPages / s.nUp);
    
    if (s.booklet) {
       physicalPages = Math.ceil(pages.length / 4) * 2;
    }

    let sheets = physicalPages;
    if (s.sided === 'double') {
      sheets = Math.ceil(physicalPages / 2);
    }
    const totalSheets = sheets * s.copies;
    
    let colorPages = 0;
    let bwPages = 0;
    
    if (s.colorMode === 'color') {
      colorPages = physicalPages;
    } else if (s.colorMode === 'bw') {
      bwPages = physicalPages;
    } else {
      const ratio = pages.length > 0 ? (file.colorPages / file.pages) : 0;
      colorPages = Math.ceil(physicalPages * ratio);
      bwPages = physicalPages - colorPages;
    }

    let rateBW = config.rates.bw;
    let rateColor = config.rates.color;
    
    if (totalSheets >= config.rates.bulkTierThreshold) {
      rateBW = config.rates.bulkTierRate;
    }

    const paperMult = config.rates.paperMultipliers[s.paper] || 1;
    rateBW *= paperMult;
    rateColor *= paperMult;

    let duplexDiscount = 0;
    if (s.sided === 'double') {
      duplexDiscount = config.rates.doubleSideDiscount;
    }

    const pricePerPageBW = rateBW * (1 - duplexDiscount);
    const pricePerPageColor = rateColor * (1 - duplexDiscount);
    
    const fileTotal = (bwPages * pricePerPageBW + colorPages * pricePerPageColor) * s.copies;
    const roundedTotal = roundTo50Paise(fileTotal);

    lines.push({
      id: file.id,
      name: file.name,
      qty: s.copies,
      unitPrice: roundedTotal / s.copies,
      total: roundedTotal,
      detail: `${physicalPages} pages, ${s.colorMode}, ${s.sided}, ${s.paper}`
    });
    subtotal += roundedTotal;

    if (s.sided === 'single' && !s.booklet) {
      const duplexTotal = (bwPages * rateBW * (1 - config.rates.doubleSideDiscount) + colorPages * rateColor * (1 - config.rates.doubleSideDiscount)) * s.copies;
      const savings = roundedTotal - roundTo50Paise(duplexTotal);
      if (savings > potentialSavings) {
        potentialSavings = savings;
        savingsSource = 'printing double-sided';
      }
    }
  }

  for (const svc of basket.services) {
    if (svc.type === 'request') {
      quotePending = true;
      continue;
    }
    
    if (svc.price !== undefined) {
      const lineTotal = roundTo50Paise(svc.price * svc.qty);
      lines.push({
        id: svc.id,
        name: svc.name,
        qty: svc.qty,
        unitPrice: svc.price,
        total: lineTotal,
        detail: svc.detail || svc.type
      });
      subtotal += lineTotal;
    }
  }

  let rushFee = 0;
  if (basket.rush && config.rushEnabled) {
    rushFee = roundTo50Paise(subtotal * config.rates.rushSurcharge);
  }

  const gatewayFee = config.rates.gatewayFee || 0;
  const total = subtotal + rushFee + gatewayFee;

  let savingsTip = null;
  if (potentialSavings > 0) {
    savingsTip = `Save ₹${potentialSavings.toFixed(2)} by ${savingsSource}`;
  }

  return {
    lines,
    subtotal,
    rushFee,
    gatewayFee,
    total,
    savingsTip,
    quotePending
  };
}
