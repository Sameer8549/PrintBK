const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

async function buildPdf() {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
  const fontMonoBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const PAGE_WIDTH = 595.28;  // A4
  const PAGE_HEIGHT = 841.89; // A4
  const MARGIN_LEFT = 40;
  const MARGIN_RIGHT = 40;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

  let currentPage = null;
  let cursorY = 0;
  let pageNum = 0;

  function newPage() {
    currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pageNum++;
    cursorY = PAGE_HEIGHT - 45;

    // Running top header line (pages > 1)
    if (pageNum > 1) {
      currentPage.drawLine({
        start: { x: MARGIN_LEFT, y: PAGE_HEIGHT - 35 },
        end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: PAGE_HEIGHT - 35 },
        thickness: 0.5,
        color: rgb(0.8, 0.83, 0.88),
      });
      currentPage.drawText('PrintBK — Student App & Seller Integration Technical Handbook', {
        x: MARGIN_LEFT,
        y: PAGE_HEIGHT - 30,
        size: 8,
        font: fontRegular,
        color: rgb(0.4, 0.45, 0.55),
      });
    }

    // Running bottom footer line
    currentPage.drawLine({
      start: { x: MARGIN_LEFT, y: 35 },
      end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: 35 },
      thickness: 0.5,
      color: rgb(0.8, 0.83, 0.88),
    });
    currentPage.drawText('HKBK Student Point · Confidential System Documentation', {
      x: MARGIN_LEFT,
      y: 24,
      size: 8,
      font: fontRegular,
      color: rgb(0.5, 0.55, 0.65),
    });
    const pageStr = `Page ${pageNum}`;
    const pWidth = fontRegular.widthOfTextAtSize(pageStr, 8);
    currentPage.drawText(pageStr, {
      x: PAGE_WIDTH - MARGIN_RIGHT - pWidth,
      y: 24,
      size: 8,
      font: fontRegular,
      color: rgb(0.5, 0.55, 0.65),
    });
  }

  function ensureSpace(needed) {
    if (!currentPage || cursorY - needed < 50) {
      newPage();
    }
  }

  function drawTitle(text) {
    ensureSpace(35);
    currentPage.drawText(text, {
      x: MARGIN_LEFT,
      y: cursorY,
      size: 18,
      font: fontBold,
      color: rgb(0.06, 0.09, 0.16),
    });
    cursorY -= 8;
    currentPage.drawLine({
      start: { x: MARGIN_LEFT, y: cursorY },
      end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: cursorY },
      thickness: 1.5,
      color: rgb(0.14, 0.38, 0.92),
    });
    cursorY -= 16;
  }

  function drawH2(text) {
    ensureSpace(28);
    currentPage.drawText(text, {
      x: MARGIN_LEFT,
      y: cursorY,
      size: 13,
      font: fontBold,
      color: rgb(0.09, 0.14, 0.24),
    });
    cursorY -= 16;
  }

  function drawH3(text) {
    ensureSpace(20);
    currentPage.drawText(text, {
      x: MARGIN_LEFT,
      y: cursorY,
      size: 10.5,
      font: fontBold,
      color: rgb(0.15, 0.22, 0.35),
    });
    cursorY -= 13;
  }

  function drawParagraph(text, font = fontRegular, size = 9.5, color = rgb(0.18, 0.22, 0.28)) {
    const paragraphs = text.split('\n').filter(p => p.trim().length > 0);
    for (const para of paragraphs) {
      const words = para.trim().split(/\s+/);
      let line = '';
      for (const w of words) {
        const testLine = line ? `${line} ${w}` : w;
        const width = font.widthOfTextAtSize(testLine, size);
        if (width > CONTENT_WIDTH) {
          ensureSpace(size + 4);
          currentPage.drawText(line, { x: MARGIN_LEFT, y: cursorY, size, font, color });
          cursorY -= (size + 4);
          line = w;
        } else {
          line = testLine;
        }
      }
      if (line) {
        ensureSpace(size + 4);
        currentPage.drawText(line, { x: MARGIN_LEFT, y: cursorY, size, font, color });
        cursorY -= (size + 5);
      }
      cursorY -= 3;
    }
  }

  function drawBullet(title, desc) {
    const fullText = `${title}: ${desc}`;
    const bulletIndent = 14;
    const words = desc.split(' ');
    
    ensureSpace(14);
    // Draw bullet dot
    currentPage.drawCircle({
      x: MARGIN_LEFT + 5,
      y: cursorY + 3,
      size: 2,
      color: rgb(0.14, 0.38, 0.92),
    });
    
    // Draw bold title
    currentPage.drawText(`${title}: `, {
      x: MARGIN_LEFT + bulletIndent,
      y: cursorY,
      size: 9.5,
      font: fontBold,
      color: rgb(0.09, 0.14, 0.24),
    });
    
    const titleWidth = fontBold.widthOfTextAtSize(`${title}: `, 9.5);
    let curX = MARGIN_LEFT + bulletIndent + titleWidth;
    let line = '';

    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      const width = fontRegular.widthOfTextAtSize(test, 9.5);
      if (curX + width > PAGE_WIDTH - MARGIN_RIGHT) {
        if (line) {
          currentPage.drawText(line, { x: curX, y: cursorY, size: 9.5, font: fontRegular, color: rgb(0.2, 0.24, 0.3) });
          cursorY -= 13;
          curX = MARGIN_LEFT + bulletIndent;
          line = w;
        } else {
          currentPage.drawText(w, { x: curX, y: cursorY, size: 9.5, font: fontRegular, color: rgb(0.2, 0.24, 0.3) });
          cursorY -= 13;
          curX = MARGIN_LEFT + bulletIndent;
          line = '';
        }
      } else {
        line = test;
      }
    }
    if (line) {
      currentPage.drawText(line, { x: curX, y: cursorY, size: 9.5, font: fontRegular, color: rgb(0.2, 0.24, 0.3) });
      cursorY -= 13;
    }
    cursorY -= 3;
  }

  function drawBox(title, lines, type = 'info') {
    const boxHeight = (lines.length * 13) + 26;
    ensureSpace(boxHeight + 8);

    let bg = rgb(0.96, 0.98, 1);
    let border = rgb(0.14, 0.38, 0.92);
    if (type === 'success') { bg = rgb(0.95, 0.99, 0.96); border = rgb(0.1, 0.65, 0.3); }
    if (type === 'warning') { bg = rgb(1, 0.98, 0.92); border = rgb(0.95, 0.6, 0.05); }

    currentPage.drawRectangle({
      x: MARGIN_LEFT,
      y: cursorY - boxHeight,
      width: CONTENT_WIDTH,
      height: boxHeight,
      color: bg,
      borderColor: border,
      borderWidth: 1,
    });

    // Left accent bar
    currentPage.drawRectangle({
      x: MARGIN_LEFT,
      y: cursorY - boxHeight,
      width: 4,
      height: boxHeight,
      color: border,
    });

    let y = cursorY - 16;
    currentPage.drawText(title, {
      x: MARGIN_LEFT + 14,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.08, 0.12, 0.2),
    });
    y -= 14;

    for (const l of lines) {
      currentPage.drawText(l, {
        x: MARGIN_LEFT + 14,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.2, 0.25, 0.32),
      });
      y -= 13;
    }
    cursorY -= (boxHeight + 12);
  }

  function drawTable(headers, rows, colWidths) {
    const rowHeight = 18;
    const totalHeight = (rows.length + 1) * rowHeight;
    ensureSpace(totalHeight + 10);

    // Header background
    currentPage.drawRectangle({
      x: MARGIN_LEFT,
      y: cursorY - rowHeight,
      width: CONTENT_WIDTH,
      height: rowHeight,
      color: rgb(0.93, 0.95, 0.98),
      borderColor: rgb(0.8, 0.83, 0.88),
      borderWidth: 0.5,
    });

    // Header text
    let xOffset = MARGIN_LEFT;
    for (let i = 0; i < headers.length; i++) {
      currentPage.drawText(headers[i], {
        x: xOffset + 6,
        y: cursorY - 13,
        size: 8.5,
        font: fontBold,
        color: rgb(0.09, 0.14, 0.24),
      });
      xOffset += colWidths[i];
    }
    cursorY -= rowHeight;

    // Rows
    for (let r = 0; r < rows.length; r++) {
      const isAlt = r % 2 === 1;
      if (isAlt) {
        currentPage.drawRectangle({
          x: MARGIN_LEFT,
          y: cursorY - rowHeight,
          width: CONTENT_WIDTH,
          height: rowHeight,
          color: rgb(0.98, 0.99, 1),
        });
      }

      currentPage.drawLine({
        start: { x: MARGIN_LEFT, y: cursorY - rowHeight },
        end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: cursorY - rowHeight },
        thickness: 0.5,
        color: rgb(0.85, 0.88, 0.92),
      });

      xOffset = MARGIN_LEFT;
      for (let c = 0; c < rows[r].length; c++) {
        currentPage.drawText(String(rows[r][c]), {
          x: xOffset + 6,
          y: cursorY - 13,
          size: 8,
          font: fontRegular,
          color: rgb(0.2, 0.25, 0.32),
        });
        xOffset += colWidths[c];
      }
      cursorY -= rowHeight;
    }
    cursorY -= 8;
  }

  // ══════════════════════════════════════════════════════════════
  // PAGE 1: COVER & EXECUTIVE SUMMARY
  // ══════════════════════════════════════════════════════════════
  newPage();

  // Header Title
  currentPage.drawText('PrintBK', {
    x: MARGIN_LEFT,
    y: cursorY - 10,
    size: 34,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });
  const printBkWidth = fontBold.widthOfTextAtSize('PrintBK', 34);
  currentPage.drawText(' System Documentation', {
    x: MARGIN_LEFT + printBkWidth,
    y: cursorY - 10,
    size: 20,
    font: fontBold,
    color: rgb(0.14, 0.38, 0.92),
  });
  cursorY -= 36;

  currentPage.drawText('Self-Service Student Print Web Application & End-to-End Seller Integration', {
    x: MARGIN_LEFT,
    y: cursorY,
    size: 12,
    font: fontBold,
    color: rgb(0.28, 0.35, 0.45),
  });
  cursorY -= 18;

  currentPage.drawLine({
    start: { x: MARGIN_LEFT, y: cursorY },
    end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: cursorY },
    thickness: 2,
    color: rgb(0.06, 0.09, 0.16),
  });
  cursorY -= 20;

  drawBox('System Deployment & Health Status', [
    'Web Client URL:  https://printbk-60074625517.development.catalystserverless.in/app/index.html',
    'API Function:    https://printbk-60074625517.development.catalystserverless.in/server/api/',
    'Cloud Platform:  Zoho Catalyst Serverless (Org ID: 60074625517, Project: printbk)',
    'Status:          100% Deployed, Verified Active with 0 TypeScript/Runtime Errors',
    'Target Counter:  HKBK Student Point (Autonomous Self-Service Campus Print Counter)'
  ], 'success');

  drawH2('1. Executive Overview');
  drawParagraph(
    'PrintBK is a high-speed, zero-cost, self-service print web application designed for campus print shops. ' +
    'Students scan a counter QR code on their smartphone, select files (PDF, DOCX, PPTX, or Photos), customize settings ' +
    'in real-time, view live slide-by-slide visual previews, and submit orders with a secure 4-digit pickup code. ' +
    'The shop counter computer ingests incoming jobs via serverless API endpoints, connects to the local printers, ' +
    'and updates job statuses from processing to ready and completed.'
  );

  drawH2('2. Core Issues Solved & Final User-Side Capabilities');
  drawTable(
    ['Feature Requirement', 'Previous Limitation', 'Final Production Implementation'],
    [
      ['Visual PPTX Preview', 'Missing or extracted plain text', '@aiden0z/pptx-renderer vector slide DOM rendering'],
      ['Accurate Slide Count', 'PPTX stuck at 1 page count', 'Multi-tier OpenXML & CFB OLE2 parser detects all 9+ slides'],
      ['Upload State Hygiene', 'Flashed empty basket / blank screen', 'Instant switch in filePicker.ts to animated processing state'],
      ['Print File Quality', 'Risk of lossy canvas compression', '100% untouched binary buffer cache (rawFileMap) & upload'],
      ['Price Breakdown UI', 'Text overlapping, missing math', 'Expanded cards with explicit math formula (rate x p x copies)'],
      ['Button Layout Hygiene', 'Duplicate floating [x] buttons', 'Suppressed top floating [x]; single red bottom button + delete'],
      ['Pickup Verification', 'Unsaved code on server', 'Persistent 4-digit code in orders table, tickets & receipts']
    ],
    [120, 160, 235]
  );

  // ══════════════════════════════════════════════════════════════
  // PAGE 2: ARCHITECTURE & PRESENTATION RENDERING ENGINE
  // ══════════════════════════════════════════════════════════════
  newPage();

  drawTitle('3. Technical Architecture & Document Processing Pipeline');

  drawH2('3.1 Full-Fidelity Visual PPTX Renderer');
  drawParagraph(
    'Prior versions utilized plain text regex extractions, losing slide layouts, backgrounds, font styles, and shapes. ' +
    'The application now embeds @aiden0z/pptx-renderer to provide a true presentation preview:'
  );
  drawBullet('Safe DOM Initialization', 'The container element (pptxContainerRef) is set to display: block prior to open() so the renderer accurately measures container width, avoiding zero-scale rendering bugs.');
  drawBullet('Interactive Slider', 'The Prev and Next buttons trigger viewer.goToSlide(page - 1) seamlessly while updating the active slide indicator (Slide X of Y).');
  drawBullet('Monochrome Filter Toggle', 'When students toggle B&W mode, the CSS filter grayscale(100%) contrast(140%) brightness(102%) is applied to the live presentation DOM.');
  drawBullet('Dynamic Slide Count Synchronization', 'If PptxViewer detects additional slides during presentation loading, it dispatches an update to the Zustand store, ensuring the price immediately accounts for all slides.');

  drawH2('3.2 Multi-Strategy Slide & Page Counter Engine');
  drawParagraph(
    'In student/src/lib/pdfPages.ts, a multi-tier parsing engine inspects documents entirely inside the browser without requiring heavy server round-trips:'
  );
  drawTable(
    ['File Format', 'Primary Parsing Strategy', 'Secondary Fallback Strategy'],
    [
      ['.pptx (OpenXML)', 'Counts presentationml.slide+xml in [Content_Types].xml', 'Inspects <p:sldId> in presentation.xml & normalized paths'],
      ['.ppt (Binary OLE2)', 'CFB library reads PIDDSI_SLIDES in DocSummary stream', 'Scans RT_SlidePersistAtom (0x03F8) in PowerPoint Doc'],
      ['.docx (Word)', 'Reads <Pages>N</Pages> from docProps/app.xml', 'Clusters paragraph tags in word/document.xml'],
      ['.pdf (Portable Doc)', 'pdf-lib loads buffer with ignoreEncryption: true', 'pdfjs-dist worker fallback parsing']
    ],
    [110, 205, 200]
  );

  drawH2('3.3 100% Original Upload Quality Assurance');
  drawParagraph(
    'PrintBK enforces strict document integrity. When files are dropped or selected, the original browser File object ' +
    'is mapped in memory into rawFileMap. During cloud upload, FormData sends the untouched binary buffer directly ' +
    'to the Catalyst File Store. No downsampling, recompression, or JPEG conversion takes place.'
  );

  drawH2('3.4 Instant Processing State & Life Cycle');
  drawParagraph(
    'In filePicker.ts, fileInputRef.onchange immediately executes useBasket.getState().setProcessing(true) and navigates ' +
    'to the basket screen before parsing starts. An animated "Processing your documents..." overlay displays, eliminating ' +
    'the blank screen or temporary empty basket flash.'
  );

  // ══════════════════════════════════════════════════════════════
  // PAGE 3: PRICING ENGINE, UI HYGIENE & TICKET FLOW
  // ══════════════════════════════════════════════════════════════
  newPage();

  drawTitle('4. Pricing Engine, UI Hygiene & Checkout Flow');

  drawH2('4.1 Authoritative Pricing Structure');
  drawParagraph(
    'PrintBK implements a dual-layer pricing engine (packages/shared/src/pricing.ts on frontend and functions/api/index.js ' +
    'on backend). The backend recalculates every itemized cost to prevent client-side price tampering:'
  );
  drawTable(
    ['Print / Service Type', 'Standard Rate', 'Billing Metric', 'Rules & Discounts'],
    [
      ['B&W Single-Sided', 'Rs 1.50', 'Per printed sheet', 'Standard monochrome printing'],
      ['B&W Double-Sided (Duplex)', 'Rs 0.85', 'Per physical page', 'Economical paper-saving rate'],
      ['Colour (Single or Double)', 'Rs 8.00', 'Per page', 'Full vibrancy laser print'],
      ['Bulk Tier Discount', 'Rs 0.80', 'Per page (B&W)', 'Automatically applied when >= 100 sheets'],
      ['Spiral Binding Add-on', 'Rs 30.00', 'Per book', 'Clear transparent front + opaque black back'],
      ['Hard Cover Project Binding', 'Rs 150.00', 'Per book', 'Golden embossed lettering cover'],
      ['Lamination (A4 / ID)', 'Rs 25 / Rs 10', 'Per document', '125-micron thermal seal']
    ],
    [130, 85, 110, 190]
  );

  drawH2('4.2 UI Cleanliness & Button Hierarchy Fixes');
  drawParagraph(
    'All floating modal sheets (Breakdown, File Settings, Services, Receipt) now utilize noTopClose on SheetShell. ' +
    'The redundant duplicate [x] buttons in the top-right corner have been removed. Every drawer features a clean, single ' +
    'red checkout-style close button ([x Close Settings] / [x Close Price Breakdown]) and an isolated red [Trash Delete] ' +
    'button on the file card to eliminate accidental taps.'
  );

  drawH2('4.3 Checkout, UPI QR & 4-Digit Pickup Code Flow');
  drawBullet('Unique 4-Digit Pickup Code', 'A secure 4-digit code (e.g. 4821) is generated at checkout, included in the order payload, saved in the Catalyst database, and rendered prominently on the student ticket.');
  drawBullet('Instant UPI Intent & Dynamic QR', 'Integrates with UPI IDs (hkbkstudentpoint@upi) with automatic amount population, supporting GPay, PhonePe, and Paytm.');
  drawBullet('Cash Reservation Mode', 'Students can select Cash at Counter, generating their pickup ticket immediately while locking the order in pending_cash state.');
  drawBullet('Live Ticket Screen', 'Displays Order #ID, the 4-digit pickup code in 52pt font, quick copy button, and real-time status steps (Queued -> Printing -> Ready!).');

  // ══════════════════════════════════════════════════════════════
  // PAGE 4: BACKEND API, DATABASE & SELLER INTEGRATION
  // ══════════════════════════════════════════════════════════════
  newPage();

  drawTitle('5. Backend Architecture & Seller Integration Handbook');

  drawH2('5.1 Zoho Catalyst Serverless Function & ZCQL Data Store');
  drawParagraph(
    'The backend runs as a Node 18 Advanced I/O function in functions/api/index.js. ' +
    'Orders are stored in the relational orders table via ZCQL queries:'
  );

  drawTable(
    ['Column', 'Type', 'Description'],
    [
      ['id', 'VarChar (PK)', 'UUID Order identifier (e.g. 34c882d4-f46e-4557...)'],
      ['status', 'VarChar', 'Current order lifecycle state (pending_payment, processing, printing, ready, completed)'],
      ['basket', 'LongText (JSON)', 'Full basket JSON containing files, pages, duplex settings, services, and pickupCode'],
      ['file_names', 'LongText (JSON)', 'Array of uploaded file names for quick counter inspection'],
      ['total', 'Double', 'Server-verified total price in INR (Rs)'],
      ['quote_pending', 'Boolean', 'True if custom counter quote is required'],
      ['created_at / updated_at', 'BigInt', 'Epoch timestamps for chronological sorting']
    ],
    [90, 110, 315]
  );

  drawH2('5.2 API Endpoint Directory');
  drawBullet('POST /server/api/upload', 'Uploads uncompressed raw file stream to Catalyst File Store folder print_files. Returns { cloudId, name, size }.');
  drawBullet('POST /server/api/orders', 'Validates file parameters, recalculates exact math prices, stores pickupCode and basket, and returns { orderId, status, total, quotePending, pickupCode }.');
  drawBullet('GET /server/api/orders', 'Returns live stream of orders ordered by created_at DESC. Parses basket to expose pickupCode and file names for seller counter dashboard.');
  drawBullet('GET /server/api/orders/:id', 'Returns single order state and pickup code for the student ticket screen.');
  drawBullet('POST /server/api/orders/:id/pay', 'Transitions order status from pending_payment to processing upon UPI payment confirmation.');
  drawBullet('POST /server/api/orders/:id/status', 'Allows the seller counter dashboard to transition status to printing, ready, or completed.');

  drawH2('5.3 Counter / Seller Ingestion Workflow');
  drawParagraph(
    '1. Student arrives at counter and shows 4-digit code (e.g. 4821) on their mobile ticket screen.\n' +
    '2. Counter app fetches GET /server/api/orders and filters by pickupCode == "4821".\n' +
    '3. Counter operator or automated agent downloads the original file using the file cloudId.\n' +
    '4. Job is dispatched to printer; operator clicks "Mark Ready" (POST /orders/:id/status { status: "ready" }).\n' +
    '5. Student phone immediately updates to "Ready! Show code 4821 at the counter".'
  );

  drawBox('Final System Verification Summary', [
    'Student Frontend:  BUILT & DEPLOYED (Vite 8 bundle with code-split pptx renderer)',
    'API Endpoints:     DEPLOYED & LIVE on Zoho Catalyst serverless infrastructure',
    'Document Parsers:  Verified on PDF, PPTX (9+ slides), DOCX, and JPG/PNG formats',
    'Pricing Engine:    Authoritative match on client and server (Rs 1.50 / Rs 0.85 / Rs 8.00)',
    'Next Step:         Ready to connect seller side dashboard and counter agent end-to-end.'
  ], 'success');

  const pdfBytes = await pdfDoc.save();
  const outputPath = path.join(__dirname, '..', 'PrintBK_User_Side_Complete_Documentation.pdf');
  fs.writeFileSync(outputPath, pdfBytes);
  console.log('PDF written successfully to:', outputPath);
  console.log('File size:', pdfBytes.length, 'bytes');
  console.log('Total pages:', pageNum);
}

buildPdf().catch(err => {
  console.error('Failed to generate PDF:', err);
  process.exit(1);
});
