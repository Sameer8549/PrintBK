import type { Basket, ShopConfig, PrintFile, ServiceLine } from './schemas';
import {
  OrderItem,
  OrderItemSchema,
  DocumentBwSpecs,
  DocumentColourSpecs,
  PhotoSpecs,
  BindingSpecs,
  LaminationSpecs,
  ScanningSpecs,
  PhotocopySpecs,
  TypingCustomSpecs
} from './schemas';
import { defaultShopConfig } from './defaultConfig';
import { computeFilePrintDetails } from './pricing';
import { parsePageRange } from './parsePageRange';

/**
 * Maps a student's basket (files and services) into strongly-typed, validated
 * OrderItem records for the staff counter tables and print agent.
 */
export function basketToOrderItems(basket: Basket, cfg?: ShopConfig): OrderItem[] {
  const config = cfg || defaultShopConfig;
  const items: OrderItem[] = [];

  // 1. Process files
  for (const file of basket.files || []) {
    const s = file.settings || ({} as any);
    const copies = s.copies ?? 1;
    const sided = s.sided ?? 'single';
    const paper = s.paper ?? 'A4';
    const orientation = s.orientation ?? 'auto';
    const nUp = s.nUp ?? 1;
    const layout = s.layout ?? (s.booklet ? 'booklet' : 'standard');
    const duplexEdge = sided === 'double'
      ? (s.duplexEdge ?? (orientation === 'landscape' ? 'short' : 'long'))
      : undefined;

    const details = computeFilePrintDetails(file);
    const { pages } = parsePageRange(s.range ?? 'all', file.pages || 1);

    // Compute pricing matching calculateOrderPrice
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
    const colorMode = s.colorPlan?.mode ?? s.colorMode ?? 'bw';

    if (colorMode === 'color' || colorMode === 'colour') {
      colorPages = physicalPages;
      bwPages = 0;
    } else if (colorMode === 'bw') {
      colorPages = 0;
      bwPages = physicalPages;
    } else if (colorMode === 'custom') {
      const colorSet = new Set<number>(s.colorPlan?.colorPages || (s as any).colorPages || []);
      if (s.booklet) {
        for (let i = 0; i < pages.length; i += 2) {
          const slot = pages.slice(i, i + 2);
          if (slot.some((p: number) => colorSet.has(p))) colorPages++;
          else bwPages++;
        }
      } else {
        for (let i = 0; i < pages.length; i += nUp) {
          const slot = pages.slice(i, i + nUp);
          if (slot.some((p: number) => colorSet.has(p))) colorPages++;
          else bwPages++;
        }
      }
    } else {
      const ratio = pages.length > 0 ? ((file.colorPages || 0) / (file.pages || 1)) : 0;
      colorPages = Math.ceil(physicalPages * ratio);
      bwPages = physicalPages - colorPages;
    }

    const paperMult = config.rates.paperMultipliers[paper] || 1;
    let pricePerPageBW = (sided === 'double' ? 0.85 : 1.50) * paperMult;
    const pricePerPageColor = 8.00 * paperMult;

    if (totalSheets >= (config.rates.bulkTierThreshold || 100)) {
      pricePerPageBW = Math.min(pricePerPageBW, 0.80 * paperMult);
    }

    const bwSubtotal = bwPages * pricePerPageBW * copies;
    const colourSubtotal = colorPages * pricePerPageColor * copies;
    const fileTotal = Math.round((bwSubtotal + colourSubtotal) * 100) / 100;
    const unitPrice = Math.round((fileTotal / copies) * 100) / 100;

    // Check if colour item or pure B&W
    const hasColour = colorPages > 0 || details.colorPrintedPages.length > 0;

    if (hasColour) {
      const specs: DocumentColourSpecs = {
        pages: file.pages || 1,
        copies,
        sides: sided,
        paper,
        orientation,
        nUp,
        duplexEdge,
        fileId: file.id,
        originalFilename: file.name,
        layout,
        colorPlan: details.colorPlan,
        bwPagesCount: details.bwPrintedPages.length,
        colourPagesCount: details.colorPrintedPages.length
      };

      const colorDesc = specs.bwPagesCount > 0
        ? `Colour (${specs.colourPagesCount} colour, ${specs.bwPagesCount} B&W)`
        : `Colour (${specs.colourPagesCount} pages)`;
      const sidesDesc = sided === 'double' ? `2-sided, ${duplexEdge}-edge` : '1-sided';
      const combineNote = (specs.bwPagesCount > 0 && specs.colourPagesCount > 0)
        ? ` · COMBINE: Col p${details.colorPrintedPages.join(',')} + BW p${details.bwPrintedPages.join(',')}`
        : '';
      const printInstructions = `${paper}, ${colorDesc}, ${sidesDesc}, ${nUp}-up, ${copies} ${copies > 1 ? 'copies' : 'copy'}${combineNote}`;

      const item: OrderItem = {
        id: `doc-${file.id}`,
        type: 'document_colour',
        title: file.name,
        quantity: copies,
        specifications: specs,
        computedPricing: {
          baseRate: pricePerPageColor,
          unitPrice,
          lineTotal: fileTotal,
          bwSubtotal: Math.round(bwSubtotal * 100) / 100,
          colourSubtotal: Math.round(colourSubtotal * 100) / 100
        },
        printInstructions
      };

      items.push(OrderItemSchema.parse(item));
    } else {
      const specs: DocumentBwSpecs = {
        pages: file.pages || 1,
        copies,
        sides: sided,
        paper,
        orientation,
        nUp,
        duplexEdge,
        fileId: file.id,
        originalFilename: file.name,
        layout
      };

      const sidesDesc = sided === 'double' ? `2-sided, ${duplexEdge}-edge` : '1-sided';
      const printInstructions = `${paper}, B&W, ${sidesDesc}, ${nUp}-up, ${copies} ${copies > 1 ? 'copies' : 'copy'}`;

      const item: OrderItem = {
        id: `doc-${file.id}`,
        type: 'document_bw',
        title: file.name,
        quantity: copies,
        specifications: specs,
        computedPricing: {
          baseRate: pricePerPageBW,
          unitPrice,
          lineTotal: fileTotal,
          bwSubtotal: fileTotal,
          colourSubtotal: 0
        },
        printInstructions
      };

      items.push(OrderItemSchema.parse(item));
    }
  }

  // 2. Process services
  for (let i = 0; i < (basket.services || []).length; i++) {
    const s = basket.services[i] as any;
    const sName = (s.name || s.title || '').toLowerCase();
    const sId = (s.id || s.category || '').toLowerCase();
    const sDetail = (s.detail || (s.details ? (typeof s.details === 'string' ? s.details : JSON.stringify(s.details)) : '')).toLowerCase();
    const qty = s.qty || s.quantity || 1;
    const unitPrice = s.price ?? 0;
    const lineTotal = Math.round(unitPrice * qty * 100) / 100;

    let type: OrderItem['type'] = 'typing_custom';
    let specs: any = {};
    let printInstructions = '';

    if ((sName.includes('photo') || sId.startsWith('photo') || sId === 'photo') && !sName.includes('photocopy')) {
      type = 'photo';
      const sizeMatch = sDetail.match(/(passport|stamp|4x6|5x7|a4)/i);
      const size = (sizeMatch ? sizeMatch[1].toLowerCase() : 'passport') as any;
      const paperType = sDetail.includes('matte') ? 'matte' : 'glossy';
      specs = {
        size,
        paperType,
        copies: qty,
        fileId: s.attachTo || s.attachedToFileId
      } satisfies PhotoSpecs;
      printInstructions = `Photo print (${size}), ${qty} ${qty > 1 ? 'copies' : 'copy'}, ${paperType}`;
    } else if (sName.includes('binding') || sId.startsWith('binding') || sId === 'binding') {
      type = 'binding';
      const kind = (sName.includes('spiral') || sDetail.includes('spiral')) ? 'spiral' : (sName.includes('hard') || sDetail.includes('hard')) ? 'hard' : 'soft';
      const pageMatch = sDetail.match(/(\d+)\s*pages?/i);
      const pageCount = pageMatch ? Number(pageMatch[1]) : 1;
      const colorCover = sDetail.includes('color cover');
      specs = {
        kind,
        pageCount,
        colorCover,
        attachedToFileId: s.attachTo || s.attachedToFileId
      } satisfies BindingSpecs;
      printInstructions = `${kind.charAt(0).toUpperCase() + kind.slice(1)} binding (${pageCount} pages${colorCover ? ', color cover' : ''})`;
    } else if (sName.includes('lamination') || sId.startsWith('lamination') || sId === 'lamination') {
      type = 'lamination';
      const size = sDetail.includes('a3') ? 'A3' : sDetail.includes('id') ? 'ID' : 'A4';
      const thickness = sDetail.includes('thick') ? 'thick' : 'standard';
      specs = {
        size,
        thickness,
        quantity: qty,
        attachedToFileId: s.attachTo || s.attachedToFileId
      } satisfies LaminationSpecs;
      printInstructions = `${size} lamination (${thickness}), ${qty} pcs`;
    } else if (sName.includes('scan') || sId.startsWith('scan') || sId === 'scan') {
      type = 'scanning';
      const dpi = sDetail.includes('600') ? 600 : 300;
      const colour = sDetail.includes('bw') ? 'bw' : 'colour';
      const format = sDetail.includes('jpeg') ? 'jpeg' : 'pdf';
      const delivery = sDetail.includes('whatsapp') ? 'whatsapp' : sDetail.includes('email') ? 'email' : 'download';
      specs = {
        pages: qty,
        dpi,
        colour,
        format,
        delivery
      } satisfies ScanningSpecs;
      printInstructions = `Scan ${qty} pages at ${dpi} DPI (${colour}, ${format} via ${delivery})`;
    } else if (sName.includes('photocopy') || sId.startsWith('photocopy') || sId === 'photocopy') {
      type = 'photocopy';
      const sides = sDetail.includes('double') ? 'double' : 'single';
      const colour = sDetail.includes('colour') || sDetail.includes('color') ? 'colour' : 'bw';
      specs = {
        pages: qty,
        copies: 1,
        sides,
        colour
      } satisfies PhotocopySpecs;
      printInstructions = `Photocopy ${qty} pages (${colour}, ${sides === 'double' ? '2-sided' : '1-sided'})`;
    } else {
      type = 'typing_custom';
      specs = {
        description: (s.name || s.title || 'Custom Service') + (sDetail ? `: ${sDetail}` : ''),
        pagesEstimated: qty,
        urgency: sDetail.includes('urgent') ? 'urgent' : 'normal',
        notes: s.counterNote || sDetail
      } satisfies TypingCustomSpecs;
      printInstructions = `Typing / Custom service: ${s.name || s.title || 'Service'} (${qty} pages estimated)`;
    }

    const item: OrderItem = {
      id: s.id || (s.category ? `${s.category.toLowerCase()}-${i + 1}` : `srv-${i + 1}`),
      type,
      title: s.title || s.name || 'Service',
      quantity: qty,
      specifications: specs,
      computedPricing: {
        unitPrice,
        lineTotal
      },
      printInstructions
    };

    items.push(OrderItemSchema.parse(item));
  }

  return items;
}
