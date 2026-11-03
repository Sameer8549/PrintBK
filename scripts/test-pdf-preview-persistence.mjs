import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const staffRequire = createRequire(path.join(rootDir, 'PrintBK', 'staff', 'package.json'));
const { chromium } = staffRequire('@playwright/test');

const TARGET_URL = process.env.TARGET_URL || 'https://printbk-60074625517.development.catalystserverless.in/app/index.html';

async function testPdfPreviewPersistence() {
  console.log('🧪 Starting Student App Preview Persistence & Multi-Viewport Verification...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const viewports = [
    { name: 'Mobile (iPhone 14)', width: 390, height: 844, isMobile: true },
    { name: 'Tablet (iPad Mini)', width: 768, height: 1024, isMobile: true },
    { name: 'Desktop (Laptop)', width: 1280, height: 800, isMobile: false }
  ];

  let allPassed = true;

  for (const vp of viewports) {
    console.log(`\n======================================================`);
    console.log(`📱 Testing Viewport: ${vp.name} (${vp.width}x${vp.height})`);
    console.log(`======================================================`);

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile
    });

    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];

    page.on('pageerror', err => {
      pageErrors.push(err.message);
      console.error(`  ❌ [${vp.name}] Unhandled Exception:`, err.message);
    });

    page.on('response', res => {
      if (res.status() >= 400) {
        console.warn(`  ⚠️ [${vp.name}] HTTP ${res.status()}: ${res.url()}`);
      }
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.error(`  ⚠️ [${vp.name}] Console Error:`, msg.text());
      }
    });

    // Navigate to student app
    await page.goto(TARGET_URL, { waitUntil: 'networkidle' });

    // Clean storage
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      if (window.indexedDB) {
        indexedDB.deleteDatabase('keyval-store');
      }
    });
    await page.reload({ waitUntil: 'networkidle' });

    // 1. Upload 2 sample PDFs
    console.log(`  ➕ Adding 2 PDF documents...`);
    const samplePdfBytes = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n193\n%%EOF';

    await page.evaluate((pdfStr) => {
      const pdfBlob = new Blob([pdfStr], { type: 'application/pdf' });
      const f1 = new File([pdfBlob], 'Physics_Assignment_Term1.pdf', { type: 'application/pdf' });
      const f2 = new File([pdfBlob], 'Math_Formula_CheatSheet.pdf', { type: 'application/pdf' });

      const dt = new DataTransfer();
      dt.items.add(f1);
      dt.items.add(f2);

      const dropZone = document.querySelector('.drop-zone');
      if (dropZone) {
        dropZone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      }
    }, samplePdfBytes);

    // Wait for PDF rendering in basket
    try {
      await page.waitForFunction(() => {
        const canvases = Array.from(document.querySelectorAll('canvas'));
        return canvases.some(c => c.offsetWidth > 0 && c.offsetHeight > 0);
      }, { timeout: 8000 });
    } catch {
      console.warn(`  ⚠️ Canvas wait timed out, continuing with inspection...`);
    }

    // Verify Basket items
    const basketState = await page.evaluate(() => {
      const cards = document.querySelectorAll('.file-card, [style*="border-radius: 14px"]');
      const canvases = Array.from(document.querySelectorAll('canvas'));
      const activeCanvas = canvases.find(c => c.offsetWidth > 0 && c.offsetHeight > 0);
      return {
        cardCount: cards.length,
        canvasFound: !!activeCanvas,
        canvasDimensions: activeCanvas ? { w: activeCanvas.offsetWidth, h: activeCanvas.offsetHeight } : null
      };
    });

    console.log(`  📊 Initial Basket State:`, JSON.stringify(basketState));
    if (!basketState.canvasFound) {
      console.error(`  ❌ Failed: PDF preview canvas not rendered on initial add!`);
      allPassed = false;
    } else {
      console.log(`  ✅ PDF preview canvas rendered cleanly: ${basketState.canvasDimensions.w}x${basketState.canvasDimensions.h}`);
    }

    // 2. Simulate User Exiting/Reloading Page
    console.log(`  🔄 Simulating Exit & Re-entry (Page Reload)...`);
    await page.reload({ waitUntil: 'networkidle' });
    try {
      await page.waitForFunction(() => {
        const canvases = Array.from(document.querySelectorAll('canvas'));
        return canvases.some(c => c.offsetWidth > 0 && c.offsetHeight > 0 && c.width > 300);
      }, { timeout: 8000 });
    } catch {
      console.warn(`  ⚠️ Post-reload canvas wait timed out, inspecting current DOM...`);
    }

    const rehydratedState = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('canvas'));
      const activeCanvas = canvases.find(c => c.offsetWidth > 0 && c.offsetHeight > 0);
      const isBlank300x150 = activeCanvas && activeCanvas.width === 300 && activeCanvas.height === 150;
      const timeoutText = document.body.innerText.includes('Preview generation timed out');
      return {
        canvasFound: !!activeCanvas,
        isBlank300x150,
        timeoutText,
        canvasDimensions: activeCanvas ? { w: activeCanvas.offsetWidth, h: activeCanvas.offsetHeight, realW: activeCanvas.width, realH: activeCanvas.height } : null
      };
    });

    console.log(`  📊 Post-Reload State:`, JSON.stringify(rehydratedState));
    if (!rehydratedState.canvasFound || rehydratedState.isBlank300x150 || rehydratedState.timeoutText) {
      console.error(`  ❌ Failed: PDF preview broke or went blank after reload!`);
      allPassed = false;
    } else {
      console.log(`  ✅ PDF preview successfully restored from IndexedDB! Real dimensions: ${rehydratedState.canvasDimensions.realW}x${rehydratedState.canvasDimensions.realH}`);
    }

    // 3. Test Accordion expansion
    console.log(`  👆 Testing Accordion toggle to switch expanded document...`);
    const editBtns = await page.$$('button:has-text("Edit")');
    if (editBtns.length > 0) {
      await editBtns[0].click();
      await page.waitForTimeout(1000);
      const accordionState = await page.evaluate(() => {
        const canvases = Array.from(document.querySelectorAll('canvas')).filter(c => c.offsetWidth > 0);
        return { visibleCanvases: canvases.length };
      });
      console.log(`  📊 Accordion Toggled State: ${accordionState.visibleCanvases} visible canvas`);
    }

    // 4. Test Check Overlaps (Bottom bar vs scroll content)
    const overlapCheck = await page.evaluate(() => {
      const bottomBar = document.querySelector('[style*="position: fixed"][style*="bottom: 0"]');
      if (!bottomBar) return { hasOverlap: false, reason: 'No bottom bar' };
      const barRect = bottomBar.getBoundingClientRect();
      const scrollEl = document.querySelector('[style*="overflow-y: auto"], [style*="overflow: auto"]');
      if (!scrollEl) return { hasOverlap: false, reason: 'No scroll container' };

      // Scroll to bottom
      scrollEl.scrollTop = scrollEl.scrollHeight;
      const addMore = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add more files'));
      if (!addMore) return { hasOverlap: false, reason: 'No Add more button' };
      const btnRect = addMore.getBoundingClientRect();
      // When scrolled all the way to bottom, addMore button must be above bottom bar
      const isHiddenUnderBar = btnRect.bottom > barRect.top && btnRect.top < barRect.bottom;
      return {
        hasOverlap: isHiddenUnderBar,
        btnBottom: btnRect.bottom,
        barTop: barRect.top
      };
    });
    console.log(`  🔍 Bottom Bar Overlap Check:`, JSON.stringify(overlapCheck));
    if (overlapCheck.hasOverlap) {
      console.error(`  ❌ Failed: Button overlaps with bottom checkout bar!`);
      allPassed = false;
    } else {
      console.log(`  ✅ No overlapping detected: button is comfortably above bottom bar`);
    }

    // 5. Navigate to Full Sheet Print Preview
    console.log(`  🔍 Opening Full Sheet Print Preview...`);
    const fullPreviewBtn = await page.$('button:has-text("Full Sheet Print Preview")');
    if (fullPreviewBtn) {
      await fullPreviewBtn.click();
      await page.waitForTimeout(1000);
      const printPreviewState = await page.evaluate(() => {
        const title = document.querySelector('header, .topbar')?.textContent || '';
        const pager = Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Next →'));
        const proceedBtn = Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Proceed to Checkout'));
        return {
          isOnPreview: title.includes('Print Preview'),
          pagerPresent: pager,
          proceedBtnPresent: proceedBtn
        };
      });
      console.log(`  📊 Print Preview Status:`, JSON.stringify(printPreviewState));
      if (!printPreviewState.isOnPreview || !printPreviewState.proceedBtnPresent) {
        console.error(`  ❌ Failed: Full Sheet Print Preview failed to load!`);
        allPassed = false;
      } else {
        console.log(`  ✅ Full Sheet Print Preview loaded cleanly with sheet pager & checkout action!`);
      }
    }

    // Screenshot for evidence
    const ssPath = path.join(rootDir, 'docs', 'final-evidence', 'production', `viewport-${vp.name.split(' ')[0].toLowerCase()}.png`);
    await page.screenshot({ path: ssPath, fullPage: false });
    console.log(`  📸 Screenshot saved: ${ssPath}`);

    if (pageErrors.length > 0 || consoleErrors.length > 0) {
      allPassed = false;
    }

    await context.close();
  }

  await browser.close();

  console.log(`\n======================================================`);
  if (allPassed) {
    console.log(`🎉 ALL PREVIEW & VIEWPORT TESTS PASSED 100%! ZERO ERRORS!`);
    process.exit(0);
  } else {
    console.error(`❌ SOME CHECKS FAILED! Inspect logs above.`);
    process.exit(1);
  }
}

testPdfPreviewPersistence().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
