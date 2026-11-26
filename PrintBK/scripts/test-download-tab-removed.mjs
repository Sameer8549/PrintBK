import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const staffRequire = createRequire(path.join(rootDir, 'staff', 'package.json'));
const { chromium } = staffRequire('@playwright/test');

(async () => {
  console.log('🧪 Starting Download Page Tab Removal Verification...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  console.log('Navigating to download page...');
  await page.goto('https://printbk-60074625517.development.catalystserverless.in/app/staff/index.html#/download', { waitUntil: 'networkidle' });

  const bodyText = await page.textContent('body');

  const hasStandaloneWorker = bodyText.includes('STANDALONE BACKGROUND WORKER');
  console.log('Has STANDALONE BACKGROUND WORKER:', hasStandaloneWorker);

  const hasAgentFilesHeader = bodyText.includes('Windows Print Agent Files & Scripts');
  console.log('Has Windows Print Agent Files & Scripts:', hasAgentFilesHeader);

  const primaryBtn = await page.$('#download-windows-btn');
  console.log('Has #download-windows-btn:', Boolean(primaryBtn));
  if (primaryBtn) {
    console.log('Primary btn text:', (await primaryBtn.innerText()).replace(/\r?\n/g, ' '));
  }

  const allInOneBtn = await page.$('#download-allinone-bat-btn');
  console.log('Has #download-allinone-bat-btn:', Boolean(allInOneBtn));
  if (allInOneBtn) {
    console.log('All-in-one bat btn href:', await allInOneBtn.getAttribute('href'));
  }

  await browser.close();

  if (hasStandaloneWorker || hasAgentFilesHeader) {
    console.error('FAIL: Found standalone worker tab!');
    process.exit(1);
  }
  if (!primaryBtn || !allInOneBtn) {
    console.error('FAIL: Missing download buttons!');
    process.exit(1);
  }
  console.log('🎉 VERIFICATION PASSED: Standalone worker tab removed, single Windows download button group verified!');
})();
