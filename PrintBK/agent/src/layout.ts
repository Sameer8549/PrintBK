import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';

export interface LayoutOptions {
  copies?: number;
  colorMode?: 'bw' | 'colour' | 'color' | 'auto' | 'custom';
  colorPlan?: {
    mode?: string;
    colorPages?: number[];
  };
  sided?: 'single' | 'double';
  paper?: 'A4' | 'A3' | 'Legal';
  orientation?: 'portrait' | 'landscape' | 'auto';
  range?: string;
  pageRotations?: Record<string, number>;
  nUp?: number;
  layout?: 'standard' | 'handout' | 'booklet';
  duplexEdge?: 'long' | 'short';
}

export interface PrintPart {
  role: 'bw' | 'colour' | 'both';
  pdfBytes: Uint8Array;
  pageCount: number;
  pagesList: number[];
  combineNote?: string;
}

export interface ProcessedJobResult {
  parts: PrintPart[];
  totalPages: number;
}

export function parsePageRange(rangeStr: string, maxPages: number): number[] {
  if (!rangeStr || rangeStr.toLowerCase() === 'all') {
    return Array.from({ length: maxPages }, (_, i) => i + 1);
  }

  const selected = new Set<number>();
  const tokens = rangeStr.split(',').map(t => t.trim()).filter(Boolean);

  for (const token of tokens) {
    if (token.includes('-')) {
      const [startStr, endStr] = token.split('-');
      const start = Math.max(1, parseInt(startStr, 10) || 1);
      const end = Math.min(maxPages, parseInt(endStr, 10) || maxPages);
      for (let p = start; p <= end; p++) {
        selected.add(p);
      }
    } else {
      const p = parseInt(token, 10);
      if (p >= 1 && p <= maxPages) {
        selected.add(p);
      }
    }
  }

  return Array.from(selected).sort((a, b) => a - b);
}

export async function processDocumentLayout(
  pdfBuffer: Buffer | Uint8Array,
  options: LayoutOptions = {},
  mixedColourMode: 'split' | 'colour' = 'split',
  orderContext?: { orderNumber?: number | string; pickupCode?: string }
): Promise<ProcessedJobResult> {
  const sourceDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const originalPageCount = sourceDoc.getPageCount();

  // 1. Filter pages by range
  const activePageNumbers = parsePageRange(options.range || 'all', originalPageCount);

  // 2. Build target document with rotations and orientations
  const processedDoc = await PDFDocument.create();
  const copiedPages = await processedDoc.copyPages(
    sourceDoc,
    activePageNumbers.map(p => p - 1)
  );

  for (let i = 0; i < copiedPages.length; i++) {
    const page = copiedPages[i];
    const pageNum = activePageNumbers[i];

    // Apply explicit page rotations if provided
    if (options.pageRotations && options.pageRotations[String(pageNum)]) {
      const rot = options.pageRotations[String(pageNum)] || 0;
      page.setRotation(degrees((page.getRotation().angle + rot) % 360));
    }

    // Apply orientation enforcement if requested
    if (options.orientation === 'portrait') {
      const { width, height } = page.getSize();
      if (width > height) {
        page.setRotation(degrees((page.getRotation().angle + 90) % 360));
      }
    } else if (options.orientation === 'landscape') {
      const { width, height } = page.getSize();
      if (width < height) {
        page.setRotation(degrees((page.getRotation().angle + 90) % 360));
      }
    }

    processedDoc.addPage(page);
  }

  const finalPageCount = processedDoc.getPageCount();

  // 3. Colour Plan Page Splitting
  const isCustomColour = options.colorMode === 'custom' || options.colorPlan?.mode === 'custom';
  const colorPagesSet = new Set<number>(options.colorPlan?.colorPages || []);

  if (isCustomColour && colorPagesSet.size > 0) {
    if (mixedColourMode === 'split') {
      // Split into two distinct PDF documents
      const colourIndices: number[] = [];
      const bwIndices: number[] = [];
      const colourPageNums: number[] = [];
      const bwPageNums: number[] = [];

      for (let i = 0; i < activePageNumbers.length; i++) {
        const pageNum = activePageNumbers[i];
        if (colorPagesSet.has(pageNum)) {
          colourIndices.push(i);
          colourPageNums.push(pageNum);
        } else {
          bwIndices.push(i);
          bwPageNums.push(pageNum);
        }
      }

      const parts: PrintPart[] = [];

      if (colourIndices.length > 0) {
        const colourDoc = await PDFDocument.create();
        const colourPages = await colourDoc.copyPages(processedDoc, colourIndices);
        colourPages.forEach(p => colourDoc.addPage(p));
        const bytes = await colourDoc.save();
        parts.push({
          role: 'colour',
          pdfBytes: bytes,
          pageCount: colourIndices.length,
          pagesList: colourPageNums,
          combineNote: `Colour portion: ${colourPageNums.length} page(s) [${colourPageNums.join(', ')}]`
        });
      }

      if (bwIndices.length > 0) {
        const bwDoc = await PDFDocument.create();
        const bwPages = await bwDoc.copyPages(processedDoc, bwIndices);
        bwPages.forEach(p => bwDoc.addPage(p));

        // Insert combine instructions slip at the beginning if both parts exist
        if (colourIndices.length > 0) {
          const slipPage = bwDoc.insertPage(0, [595.28, 841.89]); // A4
          const font = await bwDoc.embedFont(StandardFonts.HelveticaBold);
          const regularFont = await bwDoc.embedFont(StandardFonts.Helvetica);

          slipPage.drawText('PRINTBK COMBINE SLIP', { x: 50, y: 780, size: 24, font, color: rgb(0, 0, 0) });
          slipPage.drawText(`Order: #${orderContext?.orderNumber || '----'} (Pickup: ${orderContext?.pickupCode || '----'})`, { x: 50, y: 740, size: 16, font: regularFont });
          slipPage.drawText(`This document was split for economical counter printing:`, { x: 50, y: 710, size: 14, font: regularFont });
          slipPage.drawText(`- B&W Pages: ${bwPageNums.length} page(s) on B&W Printer`, { x: 70, y: 685, size: 14, font: regularFont });
          slipPage.drawText(`- Colour Pages: ${colourPageNums.length} page(s) on Colour Printer [pages: ${colourPageNums.join(', ')}]`, { x: 70, y: 660, size: 14, font: regularFont });
          slipPage.drawText(`Please combine these two batches before stapling/binding.`, { x: 50, y: 620, size: 14, font });
        }

        const bytes = await bwDoc.save();
        parts.push({
          role: 'bw',
          pdfBytes: bytes,
          pageCount: bwIndices.length,
          pagesList: bwPageNums,
          combineNote: `B&W portion: ${bwPageNums.length} page(s) [combine with colour pages: ${colourPageNums.join(', ')}]`
        });
      }

      return {
        parts,
        totalPages: finalPageCount
      };
    } else {
      // Mixed mode: Send everything to colour printer
      const bytes = await processedDoc.save();
      return {
        parts: [{
          role: 'colour',
          pdfBytes: bytes,
          pageCount: finalPageCount,
          pagesList: activePageNumbers
        }],
        totalPages: finalPageCount
      };
    }
  }

  // Uniform document (All B&W or All Colour)
  const isColour = options.colorMode === 'colour' || options.colorMode === 'color';
  const bytes = await processedDoc.save();

  return {
    parts: [{
      role: isColour ? 'colour' : 'bw',
      pdfBytes: bytes,
      pageCount: finalPageCount,
      pagesList: activePageNumbers
    }],
    totalPages: finalPageCount
  };
}
