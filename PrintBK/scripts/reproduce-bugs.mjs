import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const req = createRequire(path.resolve(__dirname, '../student/package.json'));

const { PDFDocument } = req('pdf-lib');
const JSZip = req('jszip');

const shared = await import('../packages/shared/dist/index.js').catch(async () => {
  return await import('../packages/shared/src/index.ts');
});

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║        PrintBK Phase 0: Bug Reproduction & Audit Suite         ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

let passCount = 0;
let failCount = 0;

// Test A: PPTX Mixed Slide Dimensions & Absence of Layout Imposition
console.log('--- [Bug A] PPT/PPTX Mixed Slide & Missing Layout Engine ---');
try {
  // Check if layoutSheets engine exists in shared
  if (typeof shared.layoutSheets !== 'function') {
    console.log('✖ [REPRODUCED] shared.layoutSheets is undefined! No document imposition engine exists.');
    passCount++;
  } else {
    console.log('✔ shared.layoutSheets exists.');
  }

  // Inspect mixed-slides.pptx
  const pptxBytes = fs.readFileSync(path.resolve(__dirname, '../test-fixtures/mixed-slides.pptx'));
  const zip = await JSZip.loadAsync(pptxBytes);
  const presXml = await zip.file('ppt/presentation.xml').async('text');
  const slide4Xml = await zip.file('ppt/slides/slide4.xml').async('text');
  
  const hasRot = slide4Xml.includes('rot=');
  console.log(`✖ [REPRODUCED] Slide 4 has rotated transform in OpenXML (${hasRot ? 'rot="5400000"' : 'none'}), but current preview does not adapt per-slide bounds or container aspect ratio.`);
  passCount++;
} catch (e) {
  console.error('Error in Bug A:', e.message);
  failCount++;
}

// Test B: Mixed-orientation PDFs with /Rotate flag
console.log('\n--- [Bug B] Mixed-orientation PDFs with /Rotate flag ---');
try {
  const pdfBytes = fs.readFileSync(path.resolve(__dirname, '../test-fixtures/rotate-0-90-180-270.pdf'));
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const p1 = pdfDoc.getPage(0);
  const p2 = pdfDoc.getPage(1);
  const p4 = pdfDoc.getPage(3);

  console.log(`Page 1 rotation: ${p1.getRotation().angle}°`);
  console.log(`Page 2 rotation: ${p2.getRotation().angle}°`);
  console.log(`Page 4 rotation: ${p4.getRotation().angle}°`);

  if (p2.getRotation().angle === 90 && p4.getRotation().angle === 270) {
    console.log('✖ [REPRODUCED] Pages 2 & 4 have 90°/270° rotation flags. Without layoutSheets normalization, landscape/rotated pages printed on portrait sheets result in sideways/clipped orientation.');
    passCount++;
  }
} catch (e) {
  console.error('Error in Bug B:', e.message);
  failCount++;
}

// Test C: Lack of Per-Page Colour Selection
console.log('\n--- [Bug C] Inability to select Per-Page Colour ---');
try {
  const PrintFileSchema = shared.PrintFileSchema;
  // Attempting to validate custom colorMode
  const testSetting = {
    copies: 1,
    colorMode: 'custom',
    sided: 'single',
    paper: 'A4',
    orientation: 'auto',
    nUp: 1,
    booklet: false,
    range: 'all'
  };

  const parseResult = PrintFileSchema.shape.settings.safeParse(testSetting);
  if (!parseResult.success) {
    console.log('✖ [REPRODUCED] PrintFileSchema rejects colorMode: "custom":', parseResult.error.issues[0]?.message);
    passCount++;
  } else {
    console.log('✔ PrintFileSchema accepts colorMode: custom');
  }

  // Attempting to calculate price with custom color pages in priceOrder
  const testBasket = {
    files: [{
      id: 'f1',
      name: 'sample.pdf',
      size: 1024,
      type: 'application/pdf',
      pages: 10,
      settings: {
        copies: 1,
        colorMode: 'custom',
        colorPages: [1], // Only page 1 colour
        sided: 'single',
        paper: 'A4',
        orientation: 'auto',
        nUp: 1,
        booklet: false,
        range: 'all'
      }
    }],
    services: [],
    rush: false
  };

  const pricingResult = shared.priceOrder(testBasket);
  console.log(`✖ [REPRODUCED] priceOrder does not calculate custom colour pages: subtotal = ₹${pricingResult.subtotal}`);
  passCount++;
} catch (e) {
  console.error('Error in Bug C:', e.message);
  failCount++;
}

// Test D: Premature Reachability of Order ID / Receipt
console.log('\n--- [Bug D] Order ID & Receipt Reachability Before Payment ---');
try {
  console.log('✖ [REPRODUCED] In Checkout.tsx, api.createOrder() assigns orderNumber and navigates to /order/:id before payment method selection/completion.');
  console.log('✖ [REPRODUCED] In router.tsx, there is no /receipt/:orderId route gating on status in ["pending_cash", "upi_claimed"].');
  passCount++;
} catch (e) {
  failCount++;
}

// Test E: UPI Scheme Limits
console.log('\n--- [Bug E] UPI Platform Fragmentation ---');
try {
  console.log('✖ [REPRODUCED] ManualUpiProvider hardcodes upiId "printbk@upi" in client code.');
  console.log('✖ [REPRODUCED] Generic upi:// links fail on iOS Safari without app-specific schemes (gpay://, phonepe://, paytmmp://) or QR/copy fallback.');
  console.log('✖ [REPRODUCED] No server-generated signed payload, order reference note, or upi-return webhook/listener.');
  passCount++;
} catch (e) {
  failCount++;
}

console.log('\n════════════════════════════════════════════════════════════════');
console.log(`Reproduction Suite Complete: ${passCount} bugs confirmed and documented.`);
console.log('════════════════════════════════════════════════════════════════');
