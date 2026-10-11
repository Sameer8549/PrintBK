import type { Basket, ShopConfig, PrintFile } from './schemas';
import { parsePageRange } from './parsePageRange';

export { defaultShopConfig } from './defaultConfig';

export interface PriceLine {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  detail: string;
  formula?: string;
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
    const s = file.settings || ({} as any);
    const copies = s.copies ?? 1;
    const nUp = s.nUp ?? 1;
    const colorMode = s.colorMode ?? 'bw';
    const sided = s.sided ?? 'single';
    const range = s.range ?? 'all';
    const paper = s.paper ?? 'A4';
    
    const { pages } = parsePageRange(range, file.pages || 1);
    let physicalPages = pages.length;

    physicalPages = Math.ceil(physicalPages / nUp);
    
    if (s.booklet) {
       physicalPages = Math.ceil(pages.length / 4) * 2;
    }

    let sheets = physicalPages;
    if (sided === 'double') {
      sheets = Math.ceil(physicalPages / 2);
    }
    const totalSheets = sheets * copies;
    
    let colorPages = 0;
    let bwPages = 0;
    
    if (colorMode === 'color') {
      colorPages = physicalPages;
    } else if (colorMode === 'bw') {
      bwPages = physicalPages;
    } else {
      const ratio = pages.length > 0 ? ((file.colorPages || 0) / (file.pages || 1)) : 0;
      colorPages = Math.ceil(physicalPages * ratio);
      bwPages = physicalPages - colorPages;
    }

    // User-defined exact rates:
    // B&W single: ₹1.50, double: ₹0.85 per page
    // Colour single: ₹8.00, double: ₹8.00 per page
    const paperMult = config.rates.paperMultipliers[paper] || 1;
    
    let pricePerPageBW = (sided === 'double' ? 0.85 : 1.50) * paperMult;
    let pricePerPageColor = (sided === 'double' ? 8.00 : 8.00) * paperMult;

    // Bulk tier check for high-volume orders
    if (totalSheets >= (config.rates.bulkTierThreshold || 100)) {
      pricePerPageBW = Math.min(pricePerPageBW, 0.80 * paperMult);
    }
    
    const fileTotal = (bwPages * pricePerPageBW + colorPages * pricePerPageColor) * copies;
    const roundedTotal = Math.round(fileTotal * 100) / 100;

    let formulaStr = '';
    if (colorMode === 'bw') {
      formulaStr = `${bwPages} pgs × ₹${pricePerPageBW.toFixed(2)} (${sided === 'double' ? '2-sided' : '1-sided'}) × ${copies} cop${copies > 1 ? 'ies' : 'y'}`;
    } else if (colorMode === 'color') {
      formulaStr = `${colorPages} pgs × ₹${pricePerPageColor.toFixed(2)} (Colour) × ${copies} cop${copies > 1 ? 'ies' : 'y'}`;
    } else {
      formulaStr = `(${bwPages} BW @ ₹${pricePerPageBW.toFixed(2)} + ${colorPages} Col @ ₹${pricePerPageColor.toFixed(2)}) × ${copies}`;
    }

    lines.push({
      id: file.id,
      name: file.name,
      qty: copies,
      unitPrice: Math.round((roundedTotal / copies) * 100) / 100,
      total: roundedTotal,
      detail: `${physicalPages} pages · ${colorMode === 'bw' ? 'B&W' : 'Colour'} · ${sided === 'double' ? 'Double-sided' : 'Single-sided'}${nUp > 1 ? ` · ${nUp}-up` : ''}`,
      formula: formulaStr
    });
    subtotal += roundedTotal;

    if (sided === 'single' && !s.booklet) {
      const duplexTotal = (bwPages * 0.85 + colorPages * 8.00) * copies;
      const savings = roundedTotal - (Math.round(duplexTotal * 100) / 100);
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
      const lineTotal = Math.round(svc.price * svc.qty * 100) / 100;
      lines.push({
        id: svc.id,
        name: svc.name,
        qty: svc.qty,
        unitPrice: svc.price,
        total: lineTotal,
        detail: svc.detail || svc.type,
        formula: `${svc.qty} qty × ₹${svc.price.toFixed(2)}`
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
