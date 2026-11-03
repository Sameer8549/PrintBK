import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const staffRequire = createRequire(path.join(rootDir, 'PrintBK', 'staff', 'package.json'));
const { chromium } = staffRequire('@playwright/test');

// We can test against the hosted development environment or production
const TARGET_URL = process.env.TARGET_URL || 'https://printbk-60074625517.development.catalystserverless.in/app/index.html';

async function diagnose() {
  console.log('🔍 Launching Chromium with Playwright to inspect Student App...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // Mobile viewport (iPhone 14)
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  const page = await context.newPage();

  const consoleLogs = [];
  const pageErrors = [];

  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
    if (msg.type() === 'error') {
      console.error(`  [Browser Error]:`, msg.text());
    }
  });

  page.on('pageerror', err => {
    pageErrors.push(err.message);
    console.error(`  [Browser Unhandled Exception]:`, err.message);
  });

  console.log(`📡 Navigating to: ${TARGET_URL}`);
  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });

  // 1. Check title & basic page structure
  const title = await page.title();
  console.log(`📄 Page Title: "${title}"`);

  // Ensure clean state before test
  await page.evaluate(() => {
    localStorage.removeItem('printbk-basket-v4');
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle' });

  // 2. Add multiple dummy files via file input / store evaluation
  console.log('📦 Step 1: Adding 4 documents to basket (PDFs and Images)...');

  // Create a minimal 1-page PDF buffer and image buffer
  const samplePdfBytes = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n193\n%%EOF';

  await page.evaluate((pdfStr) => {
    // Generate synthetic files
    const pdfBlob = new Blob([pdfStr], { type: 'application/pdf' });
    const pdfFile1 = new File([pdfBlob], 'Assignment_CS101.pdf', { type: 'application/pdf' });
    const pdfFile2 = new File([pdfBlob], 'Lab_Report_Final.pdf', { type: 'application/pdf' });
    const pdfFile3 = new File([pdfBlob], 'Lecture_Notes_Week3.pdf', { type: 'application/pdf' });
    
    // Minimal 1x1 transparent PNG
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
    const imgFile = new File([pngBytes], 'Diagram_Scan.png', { type: 'image/png' });

    // Use filePicker or store directly
    const basketModule = window.__PRINTBK_BASKET__;
    // If not globally exposed, we trigger the drop zone input
    const input = document.querySelector('input[type="file"]') || document.createElement('input');
    input.type = 'file';
    
    // Let's create DataTransfer
    const dt = new DataTransfer();
    dt.items.add(pdfFile1);
    dt.items.add(pdfFile2);
    dt.items.add(pdfFile3);
    dt.items.add(imgFile);

    // Try finding drop-zone button
    const dropZone = document.querySelector('.drop-zone');
    if (dropZone) {
      const dropEvent = new DragEvent('drop', {
        dataTransfer: dt,
        bubbles: true,
        cancelable: true
      });
      dropZone.dispatchEvent(dropEvent);
    }
  }, samplePdfBytes);

  await page.waitForTimeout(1500);

  // Take screenshot of Basket with multiple files
  const screenshotPath1 = path.join(rootDir, 'docs', 'final-evidence', 'production', 'diag-01-multiple-files.png');
  await page.screenshot({ path: screenshotPath1, fullPage: false });
  console.log(`📸 Captured screenshot: ${screenshotPath1}`);

  // Inspect DOM elements in Basket
  const basketInfo = await page.evaluate(() => {
    const fileCards = document.querySelectorAll('.file-card, [style*="border-radius: 14px"]');
    const previews = document.querySelectorAll('canvas, img[alt*="preview"], [style*="DOCUMENT PREVIEW"]');
    const bottomBar = document.querySelector('[style*="position: fixed"][style*="bottom: 0"]');
    const bottomRect = bottomBar ? bottomBar.getBoundingClientRect() : null;

    // Check if bottom bar overlaps with the last file card or button
    const addMoreBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add more files'));
    const addMoreRect = addMoreBtn ? addMoreBtn.getBoundingClientRect() : null;

    let overlapsWithBottomBar = false;
    if (bottomRect && addMoreRect) {
      // If addMoreBtn is partially or fully inside bottomRect while not scrolled
      overlapsWithBottomBar = (addMoreRect.bottom > bottomRect.top && addMoreRect.top < bottomRect.bottom);
    }

    return {
      fileCardCount: fileCards.length,
      previewsCount: previews.length,
      bottomBarVisible: !!bottomBar,
      bottomRect,
      addMoreRect,
      overlapsWithBottomBar,
      localStorageBasket: localStorage.getItem('printbk-basket-v4')
    };
  });

  console.log('📊 Basket State after adding files:', JSON.stringify(basketInfo, null, 2));

  // 3. Simulate exiting the website and returning (PAGE RELOAD)
  console.log('\n🔄 Step 2: Simulating user exiting website and returning (Page Reload)...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const screenshotPath2 = path.join(rootDir, 'docs', 'final-evidence', 'production', 'diag-02-after-reload.png');
  await page.screenshot({ path: screenshotPath2, fullPage: false });
  console.log(`📸 Captured screenshot after reload: ${screenshotPath2}`);

  // Inspect previews after reload
  const reloadInspection = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const canvasStates = canvases.map(c => ({
      width: c.width,
      height: c.height,
      styleDisplay: c.style.display,
      visible: c.offsetWidth > 0 && c.offsetHeight > 0
    }));

    const previewTexts = Array.from(document.querySelectorAll('*')).filter(el => {
      const text = el.textContent || '';
      return text.includes('Preview generation timed out') || text.includes('PAGE 1') || text.includes('DOCUMENT PREVIEW');
    }).map(el => el.textContent.trim().slice(0, 80));

    return {
      canvasStates,
      previewTexts: Array.from(new Set(previewTexts)).slice(0, 10),
      rawFileMapSize: window.__RAW_FILE_MAP__ ? window.__RAW_FILE_MAP__.size : 'unknown'
    };
  });

  console.log('🔍 Inspection after reload:', JSON.stringify(reloadInspection, null, 2));

  // 4. Test clicking into "Full Sheet Print Preview" (/preview)
  console.log('\n🔍 Step 3: Navigating to Full Sheet Print Preview...');
  const previewBtn = await page.$('button:has-text("Full Sheet Print Preview")');
  if (previewBtn) {
    await previewBtn.click();
    await page.waitForTimeout(1000);
    const screenshotPath3 = path.join(rootDir, 'docs', 'final-evidence', 'production', 'diag-03-full-sheet-preview.png');
    await page.screenshot({ path: screenshotPath3, fullPage: false });
    console.log(`📸 Captured screenshot of Full Sheet Preview: ${screenshotPath3}`);
  } else {
    console.log('ℹ️ Full Sheet Print Preview button not visible on current view');
  }

  console.log('\n📋 Summary of Errors:');
  console.log(`  Page Errors: ${pageErrors.length}`);
  pageErrors.forEach(e => console.log(`   - ${e}`));
  const errorLogs = consoleLogs.filter(l => l.type === 'error');
  console.log(`  Console Errors: ${errorLogs.length}`);
  errorLogs.forEach(l => console.log(`   - ${l.text}`));

  await browser.close();
  console.log('🏁 Diagnosis complete.');
}

diagnose().catch(err => {
  console.error('Diagnostic run failed:', err);
  process.exit(1);
});
