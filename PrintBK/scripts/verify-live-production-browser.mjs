import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const staffRequire = createRequire(path.join(rootDir, 'staff', 'package.json'));
const { chromium } = staffRequire('@playwright/test');

const PROD_URL = (process.env.PROD_URL || 'https://printbk-60074625517.catalystserverless.in').replace(/\/$/, '');
const evidenceDir = path.join(rootDir, 'docs', 'final-evidence', 'production');
fs.mkdirSync(evidenceDir, { recursive: true });

async function verifyLiveProduction() {
  console.log(`🚀 [verify-live-prod] Verifying live production web apps at: ${PROD_URL}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // Mobile Viewport (iPhone 13/14)
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
  });
  const page = await context.newPage();

  try {
    // 1. Student App Home / Landing
    console.log('1. Loading Live Production Student Web App...');
    const studentUrl = PROD_URL.endsWith('/app/index.html') ? PROD_URL : `${PROD_URL}/app/index.html`;
    await page.goto(studentUrl, { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    const title = await page.title();
    console.log(`  -> Page title: "${title}"`);
    const homeScreenshot = path.join(evidenceDir, '01-prod-student-home.png');
    await page.screenshot({ path: homeScreenshot, fullPage: true });
    console.log(`  ✅ Student Home loaded. Saved: ${homeScreenshot}`);

    // 2. Settings Page
    console.log('\n2. Navigating to Settings Page...');
    await page.evaluate(() => { window.location.hash = '#/settings'; });
    await page.waitForTimeout(1000);
    const settingsText = await page.textContent('body');
    assert(settingsText.includes('Campus Hub & Support'), 'Must contain Campus Hub & Support');
    assert(!settingsText.includes('87068'), 'Must NOT contain contact phone number');
    const settingsScreenshot = path.join(evidenceDir, '02-prod-student-settings.png');
    await page.screenshot({ path: settingsScreenshot, fullPage: true });
    console.log(`  ✅ Student Settings verified. Saved: ${settingsScreenshot}`);

    // 3. About Page
    console.log('\n3. Navigating to About Page...');
    await page.click('button:has-text("About PrintBK")');
    await page.waitForTimeout(1000);
    const scrollYAbout = await page.evaluate(() => window.scrollY || document.documentElement.scrollTop || 0);
    console.log(`  -> About page scroll position on open: ${scrollYAbout}px`);
    assert.strictEqual(scrollYAbout, 0, 'About page must open from the absolute top (0px)');

    const aboutText = await page.textContent('body');
    assert(aboutText.includes('Across All HKBK Institutions'), 'Must state Across All HKBK Institutions');
    assert(!aboutText.includes('HKBK College of Engineering'), 'Must NOT list specific institutions or departments');
    assert(!aboutText.includes('CSE, ISE'), 'Must NOT list specific departments');
    assert(!aboutText.includes('87068'), 'Must NOT contain contact phone number');
    assert(aboutText.includes('Abdul Sameer'), 'Must feature Abdul Sameer');

    const aboutScreenshot = path.join(evidenceDir, '03-prod-student-about.png');
    await page.screenshot({ path: aboutScreenshot, fullPage: true });
    console.log(`  ✅ Student About verified. Saved: ${aboutScreenshot}`);

    // 4. Privacy Policy Page
    console.log('\n4. Navigating to Privacy Policy Page...');
    await page.evaluate(() => { window.location.hash = '#/privacy'; });
    await page.waitForTimeout(1000);
    const scrollYPrivacy = await page.evaluate(() => window.scrollY || document.documentElement.scrollTop || 0);
    console.log(`  -> Privacy page scroll position on open: ${scrollYPrivacy}px`);
    assert.strictEqual(scrollYPrivacy, 0, 'Privacy page must open from the absolute top (0px)');

    const privacyText = await page.textContent('body');
    assert(privacyText.includes('Zero-Retention Guarantee'), 'Must contain Zero-Retention Guarantee');
    assert(privacyText.includes('Automated Privacy File Purge'), 'Must contain Automated Privacy File Purge');
    assert(!privacyText.includes('Call Counter'), 'Must NOT contain Call Counter phone button');
    assert(!privacyText.includes('87068'), 'Must NOT contain contact phone number');

    const privacyScreenshot = path.join(evidenceDir, '04-prod-student-privacy.png');
    await page.screenshot({ path: privacyScreenshot, fullPage: true });
    console.log(`  ✅ Student Privacy verified. Saved: ${privacyScreenshot}`);

    // 5. Staff Counter Download Page
    console.log('\n5. Loading Live Production Staff Counter App (Unpaired Desktop View)...');
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });
    const staffPage = await desktopContext.newPage();
    await staffPage.goto(`${PROD_URL}/app/staff/index.html`, { waitUntil: 'load' });
    await staffPage.waitForTimeout(1000);

    const staffText = await staffPage.textContent('body');
    assert(staffText.includes('PrintBK Counter'), 'Must display PrintBK Counter heading');
    assert(staffText.includes('DOWNLOAD FOR WINDOWS'), 'Must show Windows download button');
    const downloadHref = await staffPage.getAttribute('#download-windows-btn, a.download-primary-button', 'href');
    assert(downloadHref?.includes('Sameer8549') && downloadHref?.includes('PrintBK-releases'), `Download button must point to Sameer8549 repo (got ${downloadHref})`);
    assert(!staffText.includes('wa.me/919999999999'), 'Must NOT contain fake WhatsApp support link');

    // Verify Favicon and Branding
    const faviconHref = await staffPage.getAttribute('link[rel~="icon"]', 'href');
    assert(faviconHref?.includes('favicon.svg') || faviconHref?.includes('printbk-logo'), `Must link PrintBK logo favicon (got ${faviconHref})`);
    const pageTitle = await staffPage.title();
    assert(pageTitle === 'PrintBK Counter', `Title must be "PrintBK Counter" (got "${pageTitle}")`);
    const ogTitle = await staffPage.getAttribute('meta[property="og:title"]', 'content');
    assert(ogTitle === 'PrintBK Counter', `og:title must be "PrintBK Counter" (got "${ogTitle}")`);
    console.log(`  ✅ Staff App Favicon & Branding verified: title="${pageTitle}", icon="${faviconHref}"`);

    const staffScreenshot = path.join(evidenceDir, '05-prod-staff-download-page.png');
    await staffPage.screenshot({ path: staffScreenshot, fullPage: true });
    console.log(`  ✅ Staff Counter Download Page verified. Saved: ${staffScreenshot}`);

    console.log('\n============================================================');
    console.log('🎉 ALL LIVE PRODUCTION BROWSER CHECKS PASSED EMPIRICALLY!');
    console.log('============================================================\n');
  } finally {
    await browser.close();
  }
}

verifyLiveProduction().catch((err) => {
  console.error('\n❌ LIVE PRODUCTION VERIFICATION FAILED:', err);
  process.exit(1);
});
