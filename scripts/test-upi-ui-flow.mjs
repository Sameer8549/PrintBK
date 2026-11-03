import dns from 'node:dns';
try { dns.setDefaultResultOrder('ipv4first'); } catch (_) {}

import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const staffRequire = createRequire(path.join(rootDir, 'PrintBK', 'staff', 'package.json'));
const { chromium } = staffRequire('@playwright/test');

const TARGET_URL = process.env.TARGET_URL || 'https://printbk-60074625517.development.catalystserverless.in/app/index.html';

async function testUpiUiFlow() {
  console.log('🧪 Starting Browser UI Test of Student UPI Flow with Playwright...');
  console.log(`🌐 Target: ${TARGET_URL}`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--host-resolver-rules=MAP printbk-60074625517.development.catalystserverless.in 169.148.148.93, MAP printbk-60074625517.catalystserverless.in 169.148.148.93'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14 mobile
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  const page = await context.newPage();
  const pageErrors = [];

  page.on('response', res => {
    if (res.status() >= 400) {
      console.warn(`  [HTTP ${res.status()}]: ${res.url()}`);
    }
  });

  page.on('console', msg => {
    console.log(`  [Browser ${msg.type()}]:`, msg.text());
  });

  page.on('pageerror', err => {
    pageErrors.push(err.message);
    console.error(`  ❌ Page Error:`, err.message);
  });

  // Navigate to student entry
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    if (window.indexedDB) {
      indexedDB.deleteDatabase('keyval-store');
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  // 1. Add sample document
  console.log('  ➕ Adding document to basket...');
  const samplePdfBytes = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n193\n%%EOF';

  await page.evaluate((pdfStr) => {
    const pdfBlob = new Blob([pdfStr], { type: 'application/pdf' });
    const f1 = new File([pdfBlob], 'Assignment_Submission.pdf', { type: 'application/pdf' });
    const dt = new DataTransfer();
    dt.items.add(f1);
    const dropZone = document.querySelector('.drop-zone');
    if (dropZone) {
      dropZone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }
  }, samplePdfBytes);

  await page.waitForTimeout(1500);

  // 2. Click "Checkout" in basket
  console.log('  🛒 Proceeding to Checkout...');
  const checkoutBtn = await page.waitForSelector('button:has-text("Checkout"), button:has-text("Proceed to Checkout")');
  await checkoutBtn.click();
  await page.waitForTimeout(1000);

  // 3. Verify UPI option is visible and selected
  console.log('  💳 Verifying UPI payment method...');
  await page.waitForSelector('text=Pay with UPI', { timeout: 10000 });

  // 4. Click "Pay ₹... via UPI"
  console.log('  🚀 Clicking "Pay via UPI"...');
  const payUpiBtn = await page.waitForSelector('button:has-text("via UPI")');
  await payUpiBtn.click();
  await page.waitForTimeout(2000);
  console.log('  Current URL:', page.url());
  const bodySnippet = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log('  Page text preview:\n' + bodySnippet);

  // 5. Wait for UPI payment screen (/pay/:id)
  await page.waitForSelector('text=TOTAL AMOUNT DUE', { timeout: 10000 });
  console.log('  ✅ Navigated to UPI Payment Screen successfully!');

  // Verify elements on UPI screen
  const upiUiDetails = await page.evaluate(() => {
    const title = document.body.innerText;
    const hasVpa = title.includes('Q098686787@ybl');
    const hasGpay = title.includes('Google Pay');
    const hasPhonepe = title.includes('PhonePe');
    const hasPaytm = title.includes('Paytm');
    const hasAnyUpi = title.includes('Pay via Any UPI App');
    const qrBtn = Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Show QR Code'));
    const iHavePaidBtn = Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('I Have Paid'));
    return { hasVpa, hasGpay, hasPhonepe, hasPaytm, hasAnyUpi, qrBtn, iHavePaidBtn };
  });

  console.log('  📊 UPI Screen Verification:', JSON.stringify(upiUiDetails, null, 2));

  // Save screenshot of UPI screen
  const ss1Path = path.join(rootDir, 'docs', 'final-evidence', 'production', 'upi-01-payment-screen.png');
  await page.screenshot({ path: ss1Path, fullPage: false });
  console.log(`  📸 Screenshot saved: ${ss1Path}`);

  // 6. Test toggling QR Code
  console.log('  📷 Toggling QR code view...');
  const showQrBtn = await page.$('button:has-text("Show QR Code")');
  if (showQrBtn) {
    await showQrBtn.click();
    await page.waitForTimeout(800);
    const hasQrImage = await page.evaluate(() => {
      const img = document.querySelector('img[alt*="UPI Payment QR Code"]');
      return !!img && img.offsetWidth > 0;
    });
    console.log(`  📊 QR Code Rendered: ${hasQrImage ? 'YES (Visible)' : 'NO'}`);
  }

  // 7. Click "I Have Paid (Open My Receipt)"
  console.log('  👆 Clicking "✓ I Have Paid (Open My Receipt)"...');
  const iHavePaidBtn = await page.waitForSelector('button:has-text("I Have Paid")');
  await iHavePaidBtn.click();
  await page.waitForTimeout(2000);
  console.log('  URL after clicking I Have Paid:', page.url());
  console.log('  Body after clicking I Have Paid:\n' + (await page.evaluate(() => document.body.innerText.slice(0, 400))));

  // 8. Verify navigation to ticket / receipt
  await page.waitForSelector('text=ORDER CONFIRMED', { timeout: 10000 });
  console.log('  ✅ Navigated to Receipt Ticket screen successfully!');

  const ticketDetails = await page.evaluate(() => {
    const text = document.body.innerText;
    const isClaimedMessage = text.includes('UPI Payment Claimed') || text.includes('waiting for the shop to verify');
    const isPickupMasked = text.includes('——') || !text.includes('Ready');
    return { isClaimedMessage, isPickupMasked };
  });

  console.log('  📊 Ticket Screen Verification:', JSON.stringify(ticketDetails, null, 2));

  // Save screenshot of Ticket screen
  const ss2Path = path.join(rootDir, 'docs', 'final-evidence', 'production', 'upi-02-ticket-claimed.png');
  await page.screenshot({ path: ss2Path, fullPage: false });
  console.log(`  📸 Screenshot saved: ${ss2Path}`);

  await browser.close();

  if (pageErrors.length === 0 && upiUiDetails.hasVpa && upiUiDetails.hasAnyUpi && ticketDetails.isClaimedMessage) {
    console.log('\n🎉 BROWSER UI TEST OF UPI FLOW PASSED 100% WITH ZERO ERRORS!');
    process.exit(0);
  } else {
    console.error('\n❌ UI TEST FAILED!');
    process.exit(1);
  }
}

testUpiUiFlow().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
