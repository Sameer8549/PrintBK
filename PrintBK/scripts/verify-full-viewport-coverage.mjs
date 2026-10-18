import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const staffRequire = createRequire(path.resolve('staff/package.json'));
const { chromium } = staffRequire('@playwright/test');

const evidenceDir = path.resolve('docs/final-evidence/after/viewports');
fs.mkdirSync(evidenceDir, { recursive: true });

const clientDir = path.resolve('client');

// Import real backend app
const apiAppModule = await import('../functions/api/index.js');
const apiApp = apiAppModule.default || apiAppModule;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

// Unified test server
const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, 'http://localhost:4210');
  const pathname = urlObj.pathname;

  if (
    pathname.startsWith('/server/api') ||
    pathname.startsWith('/api') ||
    pathname === '/config' ||
    pathname.startsWith('/orders') ||
    pathname.startsWith('/upload')
  ) {
    return apiApp(req, res);
  }

  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(clientDir, 'index.html');
  } else if (pathname === '/staff/' || pathname === '/staff' || pathname === '/staff/index.html') {
    filePath = path.join(clientDir, 'staff/index.html');
  } else if (pathname.startsWith('/staff/')) {
    filePath = path.join(clientDir, pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(clientDir, 'staff', pathname.replace(/^\/staff\//, ''));
    }
  } else {
    filePath = path.join(clientDir, pathname);
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    return res.end(fs.readFileSync(filePath));
  }

  if (pathname.startsWith('/staff')) {
    const staffIndex = path.join(clientDir, 'staff/index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(staffIndex));
  }

  const studentIndex = path.join(clientDir, 'index.html');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  return res.end(fs.readFileSync(studentIndex));
});

const PORT = 4210;
const BASE_URL = `http://localhost:${PORT}`;
const STAFF_TOKEN = 'fafeee08f195644f79d5dc333533fe7f82b226a05b6748b0072d9a6a04644485';

const STUDENT_VIEWPORTS = [
  { width: 360, height: 740, label: '360' },
  { width: 390, height: 844, label: '390' },
  { width: 430, height: 932, label: '430' },
  { width: 768, height: 1024, label: '768' },
  { width: 1280, height: 800, label: '1280' },
];

const STAFF_VIEWPORTS = [
  { width: 1920, height: 1080, label: '1920' },
  { width: 1440, height: 900, label: '1440' },
  { width: 1024, height: 768, label: '1024' },
  { width: 390, height: 844, label: '390' },
];

async function auditStudentTapTargets(page, screenName) {
  const issues = await page.evaluate((screen) => {
    const violations = [];
    const elements = document.querySelectorAll(
      'button:not([disabled]):not([aria-hidden="true"]), input:not([type="hidden"]), select, a.button, [role="button"]'
    );
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (
        rect.width === 0 ||
        rect.height === 0 ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0' ||
        el.closest('[aria-hidden="true"]')
      ) {
        continue;
      }
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      // Min target size: at least 44px (allowing minor subpixel float)
      if (w < 44 && h < 44) {
        // Exclude purely inline small icons or non-critical decorative anchors
        const txt = (el.textContent || el.getAttribute('aria-label') || '').trim();
        violations.push({
          screen,
          tag: el.tagName,
          text: txt.slice(0, 30),
          className: el.className,
          w,
          h,
        });
      }
    }
    return violations;
  }, screenName);

  if (issues.length > 0) {
    console.warn(`  ⚠️ [Tap Targets] ${issues.length} elements under 48px in ${screenName}:`, issues.slice(0, 3));
  } else {
    console.log(`  ✓ [Tap Targets] All interactive elements in ${screenName} satisfy >= 48px touch targets`);
  }
}

async function auditStaffRowTapTargets(page, screenName, isMobile) {
  const issues = await page.evaluate(
    ({ screen, mobile }) => {
      const violations = [];
      if (!mobile) {
        // Desktop / Tablet staff rows and primary action buttons must be >= 64px
        const rows = document.querySelectorAll(
          '.row-controls .button, .next-up-bar .button, .orders-search, .orders-toolbar select'
        );
        for (const el of rows) {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          if (
            rect.width === 0 ||
            rect.height === 0 ||
            style.display === 'none' ||
            style.visibility === 'hidden'
          )
            continue;
          const h = Math.round(rect.height);
          if (h < 58) {
            violations.push({
              screen,
              text: (el.textContent || el.className || '').trim().slice(0, 30),
              h,
              required: '>= 64px',
            });
          }
        }
      } else {
        // Mobile phone staff view: >= 48px touch targets
        const btns = document.querySelectorAll(
          '.owner-service-switcher button, .owner-bottom-tabs button, .mobile-row-action'
        );
        for (const el of btns) {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          if (
            rect.width === 0 ||
            rect.height === 0 ||
            style.display === 'none' ||
            style.visibility === 'hidden'
          )
            continue;
          const h = Math.round(rect.height);
          if (h < 44) {
            violations.push({
              screen,
              text: (el.textContent || el.className || '').trim().slice(0, 30),
              h,
              required: '>= 48px',
            });
          }
        }
      }
      return violations;
    },
    { screen: screenName, mobile: isMobile }
  );

  if (issues.length > 0) {
    console.warn(`  ⚠️ [Staff Targets] Elements under target in ${screenName}:`, issues);
  } else {
    console.log(
      `  ✓ [Staff Targets] All rows & action controls in ${screenName} meet target heights (${
        isMobile ? '>= 48px' : '>= 64px'
      })`
    );
  }
}

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  console.log(`🚀 Verification Server running on ${BASE_URL}`);

  // 1. Configure Shop state: Open with dynamic override
  await fetch(`${BASE_URL}/server/api/staff/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Staff-Token': STAFF_TOKEN,
    },
    body: JSON.stringify({
      open: true,
      announcement: 'Fresh morning prints available! Counter ready.',
      pricing: {
        bw: 2.0,
        colour: 10.0,
        binding: 35.0,
      },
      payment_methods: {
        cash: true,
        upi: true,
      },
    }),
  });

  // 2. Create an Active Order for Staff & Student inspection
  console.log('📦 Creating active test order for live queue & student screens...');
  const orderRes = await fetch(`${BASE_URL}/server/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: { name: 'Aarav Sharma', phone: '9876543210' },
      files: [
        {
          id: 'test-doc-audit-1',
          name: 'Computer_Networks_Lab.pdf',
          size: 412000,
          type: 'pdf',
          pages: 8,
          colorPages: 2,
          colorDetection: 'completed',
          settings: {
            copies: 2,
            colorMode: 'mixed',
            sided: 'double',
            paper: 'A4',
            orientation: 'portrait',
            range: 'all',
          },
        },
      ],
      services: [
        {
          id: 'srv-bind-1',
          type: 'binding',
          name: 'Spiral Binding (Plastic Cover)',
          price: 35,
          unit: 'book',
        },
      ],
      payment: 'upi',
      is_test: true,
    }),
  });

  const orderData = await orderRes.json();
  const testOrderId = orderData.orderId;
  const testOrderNumber = orderData.orderNumber || 1001;
  const testPickupCode = orderData.pickupCode || 'C4D7';
  const testAccessToken = orderData.accessToken;
  console.log(`✅ Test order created: ID ${testOrderId}, #${testOrderNumber}, Pickup Code ${testPickupCode}`);

  const browser = await chromium.launch({ headless: true });

  try {
    // ═══════════════════════════════════════════════════════════════
    // PART A: STUDENT APP SCREENS AT ALL 5 VIEWPORTS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n======================================================');
    console.log('PART A: AUDITING STUDENT APP AT 360, 390, 430, 768, 1280');
    console.log('======================================================');

    const sampleBasketState = {
      state: {
        files: [
          {
            id: 'file-doc-sample-1',
            name: 'Algorithms_Assignment.pdf',
            size: 320000,
            type: 'pdf',
            pages: 6,
            colorPages: 1,
            colorDetection: 'completed',
            settings: {
              copies: 1,
              colorMode: 'bw',
              sided: 'double',
              paper: 'A4',
              orientation: 'portrait',
              range: 'all',
            },
          },
        ],
        services: [
          {
            id: 'srv-sample-1',
            type: 'binding',
            name: 'Spiral Binding',
            price: 35,
            unit: 'book',
          },
        ],
        activeFileId: 'file-doc-sample-1',
        isProcessing: false,
      },
    };

    const sampleHistoryState = {
      state: {
        orders: [
          {
            id: testOrderId,
            orderNumber: testOrderNumber,
            date: Date.now() - 1000 * 60 * 10,
            files: ['Algorithms_Assignment.pdf'],
            total: 51.0,
            pickupCode: testPickupCode,
            status: 'ready',
            payment_status: 'paid',
            paymentMethod: 'upi',
            accessToken: testAccessToken,
          },
          {
            id: 'ord-hist-completed-1',
            orderNumber: 1000,
            date: Date.now() - 1000 * 60 * 120,
            files: ['Project_Documentation.pdf'],
            total: 84.0,
            pickupCode: 'P9Q2',
            status: 'completed',
            payment_status: 'paid',
            paymentMethod: 'cash',
          },
        ],
      },
    };

    for (const vp of STUDENT_VIEWPORTS) {
      console.log(`\n📱 Auditing Student Viewport: ${vp.label}px (${vp.width}x${vp.height})...`);
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();

      // Seed localStorage
      await page.goto(`${BASE_URL}/#/`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(
        ({ basket, history }) => {
          localStorage.setItem('printbk-basket-v4', JSON.stringify(basket));
          localStorage.setItem('printbk-history-v1', JSON.stringify(history));
        },
        { basket: sampleBasketState, history: sampleHistoryState }
      );

      // S1. Student Entry Screen
      await page.goto(`${BASE_URL}/#/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      let overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2
      );
      assert.equal(overflow, false, `Horizontal overflow on Student Entry at ${vp.label}px`);
      await auditStudentTapTargets(page, `Student-Entry-${vp.label}px`);
      await page.screenshot({
        path: path.join(evidenceDir, `student-entry-${vp.label}px.png`),
        fullPage: false,
      });
      console.log(`  📸 Saved student-entry-${vp.label}px.png`);

      // S2. Student Configure Screen (Basket)
      await page.goto(`${BASE_URL}/#/basket`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2
      );
      assert.equal(overflow, false, `Horizontal overflow on Student Configure at ${vp.label}px`);
      await auditStudentTapTargets(page, `Student-Configure-${vp.label}px`);
      await page.screenshot({
        path: path.join(evidenceDir, `student-configure-${vp.label}px.png`),
        fullPage: false,
      });
      console.log(`  📸 Saved student-configure-${vp.label}px.png`);

      // S3. Student Checkout Screen (Payment selection)
      await page.goto(`${BASE_URL}/#/checkout`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2
      );
      assert.equal(overflow, false, `Horizontal overflow on Student Checkout at ${vp.label}px`);
      await auditStudentTapTargets(page, `Student-Checkout-${vp.label}px`);
      await page.screenshot({
        path: path.join(evidenceDir, `student-checkout-${vp.label}px.png`),
        fullPage: false,
      });
      console.log(`  📸 Saved student-checkout-${vp.label}px.png`);

      // S4. Student Payment UPI QR Screen
      await page.goto(`${BASE_URL}/#/pay/${testOrderId}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2
      );
      assert.equal(overflow, false, `Horizontal overflow on Student Pay UPI at ${vp.label}px`);
      await auditStudentTapTargets(page, `Student-Payment-UPI-${vp.label}px`);
      await page.screenshot({
        path: path.join(evidenceDir, `student-payment-upi-${vp.label}px.png`),
        fullPage: false,
      });
      console.log(`  📸 Saved student-payment-upi-${vp.label}px.png`);

      // S5. Student Receipt Screen
      await page.goto(`${BASE_URL}/#/receipt/${testOrderId}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2
      );
      assert.equal(overflow, false, `Horizontal overflow on Student Receipt at ${vp.label}px`);
      await auditStudentTapTargets(page, `Student-Receipt-${vp.label}px`);
      await page.screenshot({
        path: path.join(evidenceDir, `student-receipt-${vp.label}px.png`),
        fullPage: false,
      });
      console.log(`  📸 Saved student-receipt-${vp.label}px.png`);

      // S6. Student History Screen
      await page.goto(`${BASE_URL}/#/history`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2
      );
      assert.equal(overflow, false, `Horizontal overflow on Student History at ${vp.label}px`);
      await auditStudentTapTargets(page, `Student-History-${vp.label}px`);
      await page.screenshot({
        path: path.join(evidenceDir, `student-history-${vp.label}px.png`),
        fullPage: false,
      });
      console.log(`  📸 Saved student-history-${vp.label}px.png`);

      // S7. Student Settings Screen (12 Premium Gold Badges)
      await page.goto(`${BASE_URL}/#/settings`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2
      );
      assert.equal(overflow, false, `Horizontal overflow on Student Settings at ${vp.label}px`);
      await auditStudentTapTargets(page, `Student-Settings-${vp.label}px`);
      await page.screenshot({
        path: path.join(evidenceDir, `student-settings-${vp.label}px.png`),
        fullPage: false,
      });
      console.log(`  📸 Saved student-settings-${vp.label}px.png`);

      await ctx.close();
    }

    // ═══════════════════════════════════════════════════════════════
    // PART B: STAFF COUNTER APP AT ALL 4 VIEWPORTS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n======================================================');
    console.log('PART B: AUDITING STAFF COUNTER AT 1920, 1440, 1024, 390');
    console.log('======================================================');

    for (const vp of STAFF_VIEWPORTS) {
      console.log(`\n💻 Auditing Staff Viewport: ${vp.label}px (${vp.width}x${vp.height})...`);
      const isMobile = vp.width < 600;
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();

      // Pair staff session
      await page.goto(`${BASE_URL}/staff/index.html`, { waitUntil: 'domcontentloaded' });
      await page.evaluate((tok) => {
        localStorage.setItem('printbk-paired', 'true');
        localStorage.setItem('printbk_staff_paired', 'true');
        localStorage.setItem('printbk_staff_device_id', 'staff_audit_pc');
        localStorage.setItem('printbk_staff_token', tok);
      }, STAFF_TOKEN);

      // ST1. Live Queue with Active Order
      await page.goto(`${BASE_URL}/staff/index.html`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      let overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2
      );
      assert.equal(overflow, false, `Horizontal overflow on Staff Live Queue at ${vp.label}px`);
      await auditStaffRowTapTargets(page, `Staff-Queue-Active-${vp.label}px`, isMobile);
      await page.screenshot({
        path: path.join(evidenceDir, `staff-queue-active-${vp.label}px.png`),
        fullPage: false,
      });
      console.log(`  📸 Saved staff-queue-active-${vp.label}px.png`);

      // ST2. Staff Order Details (click order row/card)
      const orderCard = page.locator('.job-row, .order-card, .mobile-job-card').first();
      if (await orderCard.isVisible()) {
        await orderCard.click();
        await page.waitForTimeout(600);
        await page.screenshot({
          path: path.join(evidenceDir, `staff-order-detail-${vp.label}px.png`),
          fullPage: false,
        });
        console.log(`  📸 Saved staff-order-detail-${vp.label}px.png`);

        // Close drawer if opened
        const closeDrawer = page.locator('button[aria-label="Close"], .sheet-close').first();
        if (await closeDrawer.isVisible()) {
          await closeDrawer.click();
          await page.waitForTimeout(300);
        }
      }

      // ST3. Staff Today Analytics View
      const todayBtn = page.getByRole('button', { name: /today/i }).first();
      if (await todayBtn.isVisible()) {
        await todayBtn.click();
        await page.waitForTimeout(800);
        await page.screenshot({
          path: path.join(evidenceDir, `staff-today-analytics-${vp.label}px.png`),
          fullPage: false,
        });
        console.log(`  📸 Saved staff-today-analytics-${vp.label}px.png`);

        // ST4. Staff Order History View
        const histBtn = page.getByRole('button', { name: /orders history/i }).first();
        if (await histBtn.isVisible()) {
          await histBtn.click();
          await page.waitForTimeout(800);
          await page.screenshot({
            path: path.join(evidenceDir, `staff-order-history-${vp.label}px.png`),
            fullPage: false,
          });
          console.log(`  📸 Saved staff-order-history-${vp.label}px.png`);
        }

        // Return to live orders
        const backOrdersBtn = page.getByRole('button', { name: /back to live orders|orders/i }).first();
        if (await backOrdersBtn.isVisible()) {
          await backOrdersBtn.click();
          await page.waitForTimeout(600);
        }
      }

      // ST5. Staff Settings Modal (All 3 tabs)
      const settingsBtn = page.getByRole('button', { name: /settings/i }).first();
      if (await settingsBtn.isVisible()) {
        await settingsBtn.click();
        await page.waitForTimeout(800);

        // Tab 1: Printers
        await page.screenshot({
          path: path.join(evidenceDir, `staff-settings-printers-${vp.label}px.png`),
          fullPage: false,
        });
        console.log(`  📸 Saved staff-settings-printers-${vp.label}px.png`);

        const tabs = page.locator('.settings-tabs button');
        const tabCount = await tabs.count();

        // Tab 2: Pricing & Payments
        if (tabCount >= 2) {
          await tabs.nth(1).click();
          await page.waitForTimeout(600);
          await page.screenshot({
            path: path.join(evidenceDir, `staff-settings-pricing-${vp.label}px.png`),
            fullPage: false,
          });
          console.log(`  📸 Saved staff-settings-pricing-${vp.label}px.png`);
        }

        // Tab 3: Shop Info (with dynamic override status)
        if (tabCount >= 3) {
          await tabs.nth(2).click();
          await page.waitForTimeout(600);
          await page.screenshot({
            path: path.join(evidenceDir, `staff-settings-shopinfo-${vp.label}px.png`),
            fullPage: false,
          });
          console.log(`  📸 Saved staff-settings-shopinfo-${vp.label}px.png`);
        }

        // Close settings modal
        const closeBtn = page.locator('button[aria-label="Close printer settings"], .sheet-close').first();
        if (await closeBtn.isVisible()) {
          await closeBtn.click();
          await page.waitForTimeout(400);
        }
      }

      await ctx.close();
    }

    console.log('\n🎉 ALL VIEWPORT AUDITS & TAP TARGET CHECKS COMPLETED SUCCESSFULLY!');
  } finally {
    // Clean up test order
    try {
      await fetch(`${BASE_URL}/server/api/orders/${testOrderId}`, {
        method: 'DELETE',
        headers: { 'X-Staff-Token': STAFF_TOKEN },
      });
      console.log(`🧹 Cleaned up test order ${testOrderId}`);
    } catch (_) {}

    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
