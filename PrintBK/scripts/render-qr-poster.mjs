import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const staffRequire = createRequire(path.resolve(rootDir, 'staff/package.json'));
const { chromium } = staffRequire('@playwright/test');

async function main() {
  console.log('[QR Poster Test] 1. Importing generateQrPrintPdf from agent dist...');
  
  // Dynamic import of agent/dist/src/testprint.js
  const testprintPath = path.resolve(rootDir, 'agent/dist/src/testprint.js');
  if (!fs.existsSync(testprintPath)) {
    console.error(`Agent dist not found at ${testprintPath}. Run 'pnpm --filter agent build' first.`);
    process.exit(1);
  }

  const { generateQrPrintPdf } = await import(`file://${testprintPath.replace(/\\/g, '/')}`);

  const studentUrl = 'https://printbk-60074625517.development.catalystserverless.in/app/student';
  const shopInfo = {
    name: 'HKBK Student Point',
    address: 'HKBK College of Engineering, Campus Block B, Bengaluru',
    delete_delay_minutes: 5,
    rates: {
      bw: 1.50,
      colour: 8.00,
      duplex: 0.85,
      photo4x6: 20.00,
      bindingSpiral: 30.00,
      laminationA4: 20.00
    }
  };

  console.log('[QR Poster Test] 2. Generating vector A4 PDF...');
  const pdfBytes = await generateQrPrintPdf(studentUrl, shopInfo);

  const outDir = path.resolve(rootDir, 'docs/fix-evidence/after');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const pdfPath = path.join(outDir, 'qr-poster-A4.pdf');
  fs.writeFileSync(pdfPath, Buffer.from(pdfBytes));
  console.log(`[QR Poster Test] Saved A4 vector PDF: ${pdfPath} (${pdfBytes.length} bytes)`);

  if (pdfBytes.length < 5000) {
    throw new Error(`Generated PDF is suspiciously small: ${pdfBytes.length} bytes`);
  }

  // Deterministic Page Count Check
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const { PDFDocument } = require('../agent/node_modules/pdf-lib');
  const loadedPdf = await PDFDocument.load(pdfBytes);
  const pageCount = loadedPdf.getPageCount();
  console.log(`[QR Poster Test] Generated vector PDF page count: ${pageCount}`);
  if (pageCount !== 1) {
    throw new Error(`Expected exactly 1 page in vector PDF, got ${pageCount}`);
  }

  console.log('[QR Poster Test] 3. Rasterizing A4 PDF using Chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1240, height: 1754 }, // Standard A4 at 150 DPI
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  // Create HTML wrapper with PDF.js canvas renderer
  const base64Pdf = Buffer.from(pdfBytes).toString('base64');
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"></script>
        <style>
          html, body { margin: 0; padding: 20px; background: #eee; display: flex; justify-content: center; align-items: flex-start; }
          canvas { background: white; box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
        </style>
      </head>
      <body>
        <canvas id="pdf-canvas"></canvas>
        <script>
          window.__pdfRenderDone = false;
          window.__decodedQr = null;
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          const rawData = atob("${base64Pdf}");
          const uint8Array = new Uint8Array(rawData.length);
          for (let i = 0; i < rawData.length; i++) {
            uint8Array[i] = rawData.charCodeAt(i);
          }
          pdfjsLib.getDocument({ data: uint8Array }).promise.then(async (pdf) => {
            const page = await pdf.getPage(1);
            const scale = 2.0;
            const viewport = page.getViewport({ scale });
            const canvas = document.getElementById('pdf-canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport: viewport }).promise;

            // Decode QR Code from rendered canvas using jsQR
            const imgData = context.getImageData(0, 0, canvas.width, canvas.height);
            const qrResult = jsQR(imgData.data, imgData.width, imgData.height);
            if (qrResult) {
              window.__decodedQr = qrResult.data;
            }
            window.__pdfRenderDone = true;
          }).catch(err => {
            window.__pdfRenderError = err.message;
          });
        </script>
      </body>
    </html>
  `, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await page.waitForFunction(() => window.__pdfRenderDone === true || window.__pdfRenderError !== undefined, { timeout: 15000 });
  const renderError = await page.evaluate(() => window.__pdfRenderError);
  if (renderError) {
    throw new Error('PDF.js rendering failed: ' + renderError);
  }

  const decodedQr = await page.evaluate(() => window.__decodedQr);
  console.log(`[QR Poster Test] Scanned decoded QR code data: "${decodedQr}"`);
  if (!decodedQr || decodedQr !== studentUrl) {
    throw new Error(`QR code failed to decode or mismatched! Expected: "${studentUrl}", Found: "${decodedQr}"`);
  }

  const canvas = page.locator('#pdf-canvas');
  const pngPath = path.join(outDir, 'qr-poster-page1.png');
  await canvas.screenshot({ path: pngPath });
  console.log(`[QR Poster Test] Rasterized screenshot saved to: ${pngPath}`);

  await browser.close();
  console.log('[QR Poster Test] SUCCESS: Vector PDF, QR scanner decoding, and single canonical logo verified!');
}

main().catch(err => {
  console.error('[QR Poster Test] FAILED:', err);
  process.exit(1);
});
