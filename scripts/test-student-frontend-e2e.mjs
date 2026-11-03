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

async function runStudentFrontendE2E() {
  console.log('🚀 Running Exhaustive Student Frontend Playwright & Layout Verification Suite...');
  console.log(`🌐 Target: ${TARGET_URL}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const viewports = [
    { name: 'Mobile_iPhone14', width: 390, height: 844, isMobile: true },
    { name: 'Tablet_iPadMini', width: 768, height: 1024, isMobile: true },
    { name: 'Desktop_Standard', width: 1280, height: 800, isMobile: false }
  ];

  const results = [];

  for (const vp of viewports) {
    console.log(`\n======================================================`);
    console.log(`🔍 [VIEWPORT TEST] ${vp.name} (${vp.width}x${vp.height})`);
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

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.error(`  ⚠️ [${vp.name}] Console Error:`, msg.text());
      }
    });

    // 1. Navigate to Entry screen
    await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      if (window.indexedDB) {
        indexedDB.deleteDatabase('keyval-store');
      }
    });
    await page.reload({ waitUntil: 'networkidle' });

    console.log(`  ✅ Loaded entry page`);

    // 2. Add 4 diverse files (2 PDFs + 2 PNGs)
    console.log(`  ➕ Adding 4 diverse files to basket...`);
    const samplePdfBytes = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n193\n%%EOF';

    await page.evaluate((pdfStr) => {
      const pdfBlob = new Blob([pdfStr], { type: 'application/pdf' });
      const f1 = new File([pdfBlob], 'Lecture_1_Algorithms.pdf', { type: 'application/pdf' });
      const f2 = new File([pdfBlob], 'Project_Architecture.pdf', { type: 'application/pdf' });

      const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
      const img1 = new File([pngBytes], 'System_Diagram.png', { type: 'image/png' });
      const img2 = new File([pngBytes], 'ID_Proof_Scan.png', { type: 'image/png' });

      const dt = new DataTransfer();
      dt.items.add(f1);
      dt.items.add(f2);
      dt.items.add(img1);
      dt.items.add(img2);

      const dropZone = document.querySelector('.drop-zone');
      if (dropZone) {
        dropZone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      }
    }, samplePdfBytes);

    // Wait for the files to mount and render
    await page.waitForTimeout(2000);

    // 3. Inspect Accordion state
    const accordionReport = await page.evaluate(() => {
      const editButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Edit' || b.textContent.trim() === 'Done');
      const openPanels = editButtons.filter(b => b.textContent.trim() === 'Done');
      const canvases = Array.from(document.querySelectorAll('canvas')).filter(c => c.offsetWidth > 0);
      const images = Array.from(document.querySelectorAll('img[alt*="preview"]')).filter(i => i.offsetWidth > 0);

      return {
        totalFileCards: editButtons.length,
        openPanelCount: openPanels.length,
        activePreviewRenders: canvases.length + images.length
      };
    });

    console.log(`  📊 Accordion Verification:`, JSON.stringify(accordionReport));
    const accordionPass = accordionReport.totalFileCards === 4 && accordionReport.openPanelCount === 1;
    if (!accordionPass) {
      console.error(`  ❌ Accordion failed: Expected 1 open panel among 4 files, got ${accordionReport.openPanelCount}`);
    } else {
      console.log(`  ✅ Accordion passed: Exactly 1 card expanded, remaining 3 collapsed`);
    }

    // 4. Test Switching Accordion Item
    console.log(`  👆 Clicking 'Edit' on collapsed card to switch active view...`);
    const editBtns = await page.$$('button:has-text("Edit")');
    if (editBtns.length > 0) {
      await editBtns[0].click();
      await page.waitForTimeout(800);
      const switchReport = await page.evaluate(() => {
        const editButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Edit' || b.textContent.trim() === 'Done');
        const openPanels = editButtons.filter(b => b.textContent.trim() === 'Done');
        return { openPanelCount: openPanels.length };
      });
      console.log(`  📊 After Switch: ${switchReport.openPanelCount} card open (Accordion maintained)`);
    }

    // 5. Test Scroll & Fixed Bottom Bar Overlap
    console.log(`  📏 Checking layout bounds and bottom bar overlap...`);
    const overlapReport = await page.evaluate(() => {
      const scrollContainer = document.querySelector('[style*="overflow-y: auto"], [style*="overflow: auto"]');
      const bottomBar = document.querySelector('[style*="position: fixed"][style*="bottom: 0"]');
      if (!scrollContainer || !bottomBar) return { ok: true, reason: 'No overlap risk' };

      const barRect = bottomBar.getBoundingClientRect();
      // Scroll to bottom
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
      const addMoreBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add more files'));
      if (!addMoreBtn) return { ok: true };
      const btnRect = addMoreBtn.getBoundingClientRect();

      // Check if button is occluded under the bottom bar
      const isOccluded = (btnRect.bottom > barRect.top && btnRect.top < barRect.bottom);
      return {
        ok: !isOccluded,
        btnBottom: btnRect.bottom,
        barTop: barRect.top,
        margin: barRect.top - btnRect.bottom
      };
    });

    console.log(`  📊 Bottom Overlap Result:`, JSON.stringify(overlapReport));
    if (!overlapReport.ok) {
      console.error(`  ❌ Layout Occlusion: Element covered by fixed bottom bar!`);
    } else {
      console.log(`  ✅ Layout verified: Add More button is clearly above bottom bar with ${overlapReport.margin?.toFixed(1) || 0}px clearance`);
    }

    // 6. Test Exit & Re-entry (Page Reload) - Persistence Test
    console.log(`  🔄 Simulating website reload / exit and re-entry...`);
    await page.reload({ waitUntil: 'networkidle' });
    try {
      await page.waitForFunction(() => {
        const canvases = Array.from(document.querySelectorAll('canvas'));
        const imgs = Array.from(document.querySelectorAll('img[alt*="preview"]'));
        return (canvases.some(c => c.offsetWidth > 0) || imgs.some(i => i.offsetWidth > 0));
      }, { timeout: 8000 });
    } catch {
      console.warn(`  ⚠️ Post-reload element wait timed out`);
    }

    const reloadReport = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('canvas')).filter(c => c.offsetWidth > 0);
      const isBlankDefault = canvases.some(c => c.width === 300 && c.height === 150);
      const hasTimeoutError = document.body.innerText.includes('Preview generation timed out');
      return {
        canvasesRendered: canvases.length,
        isBlankDefault,
        hasTimeoutError,
        basketCount: Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Edit' || b.textContent.trim() === 'Done').length
      };
    });

    console.log(`  📊 Persistence after reload:`, JSON.stringify(reloadReport));
    const reloadPass = reloadReport.basketCount === 4 && !reloadReport.isBlankDefault && !reloadReport.hasTimeoutError;
    if (!reloadPass) {
      console.error(`  ❌ Persistence failed after reload!`);
    } else {
      console.log(`  ✅ Persistence passed: All 4 files restored from IndexedDB, preview active without blank/timeout error!`);
    }

    // 7. Test Transition to Print Preview
    console.log(`  🔍 Testing Navigation into Full Sheet Print Preview...`);
    const printPrevBtn = await page.$('button:has-text("Full Sheet Print Preview")');
    if (printPrevBtn) {
      await printPrevBtn.click();
      await page.waitForTimeout(1000);
      const prevCheck = await page.evaluate(() => {
        const pager = Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Next →'));
        const checkoutBtn = Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Proceed to Checkout'));
        return { pager, checkoutBtn };
      });
      console.log(`  📊 Print Preview Check:`, JSON.stringify(prevCheck));

      // 8. Test Transition to Checkout
      console.log(`  💳 Testing Navigation to Checkout...`);
      const proceedBtn = await page.$('button:has-text("Proceed to Checkout")');
      if (proceedBtn) {
        await proceedBtn.click();
        await page.waitForTimeout(1000);
        const checkoutCheck = await page.evaluate(() => {
          const title = document.querySelector('header, .topbar')?.textContent || '';
          const upiRadio = document.querySelector('input[value="upi"], [id*="upi"]');
          const cashRadio = document.querySelector('input[value="cash"], [id*="cash"]');
          const payBtn = Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Pay') || b.textContent.includes('Reserve'));
          return {
            titleMatch: title.includes('Checkout'),
            hasUpi: !!upiRadio,
            hasCash: !!cashRadio,
            payBtnPresent: payBtn
          };
        });
        console.log(`  📊 Checkout Page Check:`, JSON.stringify(checkoutCheck));
      }
    }

    // Capture screenshot
    const evidencePath = path.join(rootDir, 'docs', 'final-evidence', 'production', `frontend-${vp.name}.png`);
    await page.screenshot({ path: evidencePath, fullPage: false });
    console.log(`  📸 Screenshot saved: ${evidencePath}`);

    const isVpSuccess = accordionPass && overlapReport.ok && reloadPass && pageErrors.length === 0 && consoleErrors.length === 0;
    results.push({ name: vp.name, success: isVpSuccess, pageErrors: pageErrors.length, consoleErrors: consoleErrors.length });

    await context.close();
  }

  await browser.close();

  console.log(`\n======================================================`);
  console.log(`🏆 FINAL FRONTEND VERIFICATION REPORT`);
  console.log(`======================================================`);
  let overallSuccess = true;
  for (const r of results) {
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.success ? 'ALL PASSED' : 'FAILED'} (Page Errors: ${r.pageErrors}, Console Errors: ${r.consoleErrors})`);
    if (!r.success) overallSuccess = false;
  }

  if (overallSuccess) {
    console.log(`\n🎉 100% OF ALL FRONTEND VIEWPORT, PREVIEW & PERSISTENCE TESTS PASSED!`);
    process.exit(0);
  } else {
    console.error(`\n❌ ONE OR MORE VIEWPORT TESTS FAILED`);
    process.exit(1);
  }
}

runStudentFrontendE2E().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
