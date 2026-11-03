import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const staffRequire = createRequire(path.join(rootDir, 'PrintBK', 'staff', 'package.json'));
const { chromium } = staffRequire('@playwright/test');

const TARGET_BASE = process.env.TARGET_BASE || 'https://printbk-60074625517.development.catalystserverless.in';
const STUDENT_URL = `${TARGET_BASE}/app/index.html`;
const STAFF_URL = `${TARGET_BASE}/app/staff/index.html`;

const EVIDENCE_DIR = path.join(rootDir, 'docs', 'final-evidence', 'ui-overlap-audit');
if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

console.log('========================================================================');
console.log('🖥️  PRINTBK COMPREHENSIVE UI OVERLAP & LAYOUT BREAKAGE AUDIT');
console.log(`   Student App Target: ${STUDENT_URL}`);
console.log(`   Counter App Target: ${STAFF_URL}`);
console.log(`   Evidence Output:    ${EVIDENCE_DIR}`);
console.log('========================================================================\n');

async function runAudit() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--host-resolver-rules=MAP *.catalystserverless.in 169.148.148.93, MAP catalystserverless.in 169.148.148.93'
    ]
  });

  const issuesFound = [];
  let totalChecks = 0;
  let passedChecks = 0;

  function recordCheck(passed, category, description, details = null) {
    totalChecks++;
    if (passed) {
      passedChecks++;
      console.log(`  ✅ [PASS] ${category}: ${description}`);
    } else {
      console.error(`  ❌ [FAIL] ${category}: ${description}`);
      if (details) console.error(`     Details:`, details);
      issuesFound.push({ category, description, details });
    }
  }

  // Helper to detect unwanted horizontal overflow
  async function checkHorizontalOverflow(page, screenName) {
    const overflow = await page.evaluate(() => {
      const docWidth = document.documentElement.offsetWidth;
      const scrollWidth = document.documentElement.scrollWidth;
      const bodyScrollWidth = document.body.scrollWidth;
      const windowWidth = window.innerWidth;
      const hasOverflow = scrollWidth > windowWidth + 2 || bodyScrollWidth > windowWidth + 2;
      return {
        hasOverflow,
        windowWidth,
        scrollWidth: Math.max(scrollWidth, bodyScrollWidth),
        delta: Math.max(scrollWidth, bodyScrollWidth) - windowWidth
      };
    });

    recordCheck(!overflow.hasOverflow, screenName, 'No unwanted horizontal page overflow', overflow.hasOverflow ? `Overflow by ${overflow.delta}px (Window: ${overflow.windowWidth}px, Scroll: ${overflow.scrollWidth}px)` : null);
  }

  // Helper to detect element bounding box collision where not expected
  async function checkElementCollisions(page, screenName, selectorList) {
    const collisions = await page.evaluate((selectors) => {
      const elements = [];
      for (const sel of selectors) {
        let found = [];
        try {
          if (sel.includes(':contains(') || sel.includes(':has-text(')) {
            // Text matching helper
            const parts = sel.split(/:(?:contains|has-text)\(["']?([^"']+)["']?\)/);
            const tag = parts[0] || '*';
            const textMatch = parts[1] || '';
            const allOfTag = document.querySelectorAll(tag);
            allOfTag.forEach(el => {
              if (el.textContent && el.textContent.includes(textMatch)) found.push(el);
            });
          } else {
            found = Array.from(document.querySelectorAll(sel));
          }
        } catch (_) {}

        found.forEach((el, idx) => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden') {
            elements.push({
              sel: `${sel}[${idx}]`,
              text: (el.textContent || '').trim().slice(0, 30),
              rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height }
            });
          }
        });
      }

      const clashingPairs = [];
      for (let i = 0; i < elements.length; i++) {
        for (let j = i + 1; j < elements.length; j++) {
          const a = elements[i];
          const b = elements[j];
          // Check intersection
          const xOverlap = Math.max(0, Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left));
          const yOverlap = Math.max(0, Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top));
          const overlapArea = xOverlap * yOverlap;

          // If overlap is significant (>25px area) and they are distinct elements
          if (overlapArea > 25 && a.rect.width !== b.rect.width) {
            clashingPairs.push({
              elemA: `${a.sel} ("${a.text}")`,
              elemB: `${b.sel} ("${b.text}")`,
              overlapArea,
              rectA: a.rect,
              rectB: b.rect
            });
          }
        }
      }
      return clashingPairs;
    }, selectorList);

    recordCheck(collisions.length === 0, screenName, `Zero colliding element pairs among monitored targets`, collisions.length > 0 ? collisions : null);
  }

  // ==========================================================================
  // SECTION 1: STUDENT WEB APP AUDIT (Mobile, Tablet, Desktop)
  // ==========================================================================
  console.log('------------------------------------------------------------------------');
  console.log('📱 PART 1: STUDENT APP UI OVERLAPPING & BREAKAGE AUDIT');
  console.log('------------------------------------------------------------------------\n');

  const studentViewports = [
    { name: 'Mobile_390x844_iPhone14', width: 390, height: 844, isMobile: true },
    { name: 'Mobile_360x740_GalaxyS20', width: 360, height: 740, isMobile: true },
    { name: 'Tablet_768x1024_iPad', width: 768, height: 1024, isMobile: true },
    { name: 'Desktop_1280x800', width: 1280, height: 800, isMobile: false }
  ];

  for (const vp of studentViewports) {
    console.log(`\n--- Auditing Student App on Viewport: ${vp.name} ---`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile
    });

    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    // 1. Home / Entry screen
    await page.goto(STUDENT_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await checkHorizontalOverflow(page, `Student [${vp.name}] Entry Screen`);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, `student-${vp.name}-01-entry.png`) });

    // 2. Add multiple documents (Multi-file stress test)
    console.log(`  ➕ Injecting 4 diverse files into basket...`);
    const samplePdfBytes = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n193\n%%EOF';

    await page.evaluate((pdfStr) => {
      const pdfBlob = new Blob([pdfStr], { type: 'application/pdf' });
      const f1 = new File([pdfBlob], 'Lecture_Algorithms_Semester_Final.pdf', { type: 'application/pdf' });
      const f2 = new File([pdfBlob], 'Database_ER_Diagram_Architecture.pdf', { type: 'application/pdf' });
      const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
      const img1 = new File([pngBytes], 'Student_ID_Scan_Card.png', { type: 'image/png' });

      const dt = new DataTransfer();
      dt.items.add(f1);
      dt.items.add(f2);
      dt.items.add(img1);

      const dropZone = document.querySelector('.drop-zone');
      if (dropZone) {
        dropZone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      }
    }, samplePdfBytes);

    await page.waitForTimeout(1500);

    // Verify basket layout
    await checkHorizontalOverflow(page, `Student [${vp.name}] Basket View`);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, `student-${vp.name}-02-basket.png`) });

    // Check sticky checkout bar vs basket items collision
    await checkElementCollisions(page, `Student [${vp.name}] Sticky Bar`, [
      '.sticky-bottom',
      'button:has-text("Review")',
      'button:has-text("Proceed")',
      '.basket-item',
      '.top-bar'
    ]);

    // 3. Open preview modal if available and verify canvas doesn't overflow
    const previewBtn = await page.$('button[aria-label*="Preview"], button:has-text("Preview"), .preview-trigger');
    if (previewBtn) {
      console.log(`  👁️ Opening preview modal...`);
      await previewBtn.click().catch(() => {});
      await page.waitForTimeout(1000);
      await checkHorizontalOverflow(page, `Student [${vp.name}] Preview Modal`);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `student-${vp.name}-03-preview.png`) });

      // Close modal
      const closeBtn = await page.$('button[aria-label*="Close"], button:has-text("Close"), .modal-close');
      if (closeBtn) await closeBtn.click().catch(() => {});
      await page.waitForTimeout(500);
    }

    // 4. Click Review / Proceed to Checkout
    const checkoutBtn = await page.$('button:has-text("Review & Pay"), button:has-text("Proceed"), button:has-text("Review")');
    if (checkoutBtn) {
      console.log(`  🛒 Navigating to Checkout screen...`);
      await checkoutBtn.click().catch(() => {});
      await page.waitForTimeout(1200);

      await checkHorizontalOverflow(page, `Student [${vp.name}] Checkout Screen`);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `student-${vp.name}-04-checkout.png`) });

      // Check UPI selection buttons collision
      await checkElementCollisions(page, `Student [${vp.name}] Checkout Options`, [
        'input[type="radio"]',
        'button:has-text("Pay")',
        '.price-breakdown',
        '.sticky-bottom'
      ]);
    }

    recordCheck(pageErrors.length === 0, `Student [${vp.name}] Runtime`, 'Zero unhandled client exceptions', pageErrors.length > 0 ? pageErrors : null);
    await context.close();
  }

  // ==========================================================================
  // SECTION 2: COUNTER STAFF APP AUDIT (1024x768, 1280x800, 1920x1080)
  // ==========================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('🖥️  PART 2: COUNTER STAFF APP UI OVERLAPPING & BREAKAGE AUDIT');
  console.log('------------------------------------------------------------------------\n');

  const counterViewports = [
    { name: 'Touchscreen_1024x768', width: 1024, height: 768 },
    { name: 'Standard_1280x800', width: 1280, height: 800 },
    { name: 'FullHD_1920x1080', width: 1920, height: 1080 }
  ];

  for (const vp of counterViewports) {
    console.log(`\n--- Auditing Counter Staff App on Viewport: ${vp.name} ---`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1
    });

    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    // Pre-inject staff pairing token so workbench loads in active state
    await page.goto(STAFF_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('printbk_staff_token', 'PBK-SETUP-9021');
      localStorage.setItem('printbk_staff_device_id', 'desktop_counter_audit');
      localStorage.setItem('printbk-paired', 'true');
      localStorage.setItem('printbk_include_test', 'true');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 1. Counter Workbench Layout
    await checkHorizontalOverflow(page, `Counter [${vp.name}] Workbench`);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, `counter-${vp.name}-01-workbench.png`) });

    // 2. Check collision between Sticky Topbar and Table Headers
    await checkElementCollisions(page, `Counter [${vp.name}] Topbar & Headers`, [
      'header',
      '.sticky',
      'table thead',
      '.status-banner',
      'button:has-text("Shop")'
    ]);

    // 3. Check Table Action Buttons (Approve, Collect Cash, Print)
    await checkElementCollisions(page, `Counter [${vp.name}] Action Buttons`, [
      'button:has-text("Print")',
      'button:has-text("Approve")',
      'button:has-text("Cash")',
      'button:has-text("Collect")'
    ]);

    // 4. Navigate to Downloads / Releases Page if present
    const downloadsLink = await page.$('a[href*="downloads"], button:has-text("Download"), a:has-text("Download")');
    if (downloadsLink) {
      console.log(`  📦 Navigating to Downloads page...`);
      await downloadsLink.click().catch(() => {});
      await page.waitForTimeout(1000);
      await checkHorizontalOverflow(page, `Counter [${vp.name}] Downloads Page`);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `counter-${vp.name}-02-downloads.png`) });
    }

    recordCheck(pageErrors.length === 0, `Counter [${vp.name}] Runtime`, 'Zero unhandled client exceptions', pageErrors.length > 0 ? pageErrors : null);
    await context.close();
  }

  await browser.close();

  console.log('\n========================================================================');
  console.log(`📊 AUDIT SUMMARY: ${passedChecks}/${totalChecks} CHECKS PASSED`);
  if (issuesFound.length === 0) {
    console.log('🎉 ZERO UI OVERLAPS, ZERO PAGE OVERFLOWS, ZERO RUNTIME CRASHES!');
    console.log('   Both Student and Counter Apps passed 100% layout integrity audit.');
  } else {
    console.error(`💥 DETECTED ${issuesFound.length} POTENTIAL UI/LAYOUT ISSUES:`);
    console.error(JSON.stringify(issuesFound, null, 2));
  }
  console.log('========================================================================\n');
}

runAudit().catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
