import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:8443';
const OUTPUT_DIR = path.resolve(__dirname, '../docs/design/student/baseline');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const SCREENS = [
  'splash', 'entry', 'uploading', 'basket', 'empty', 'preview',
  'services', 'photo', 'checkout', 'confirming', 'failed', 'paid',
  'ticket', 'quoteTicket', 'orderError', 'history', 'settings'
];

const SHEETS = [
  'settings', 'picker', 'breakdown', 'receipt', 'report', 
  'binding', 'lamination', 'scanning', 'typing', 'custom'
];

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureScreenshots() {
  console.log('Starting puppeteer...');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 390, height: 844 });
  
  console.log('Navigating to app...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  
  let i = 1;
  
  for (const theme of ['light', 'dark']) {
    console.log(`Setting theme: ${theme}`);
    await page.evaluate((t) => window.setTheme(t), theme);
    await delay(200);

    for (const screen of SCREENS) {
      console.log(`Capturing screen: ${screen}`);
      await page.evaluate((s) => {
        window.setSheet(null);
        window.setScreen(s);
      }, screen);
      
      await delay(500); // let animations settle
      
      const idx = String(i++).padStart(2, '0');
      await page.screenshot({ path: path.join(OUTPUT_DIR, `S${idx}-${screen}-${theme}.png`) });
    }

    for (const sheet of SHEETS) {
      console.log(`Capturing sheet: ${sheet}`);
      await page.evaluate((s) => {
        window.setScreen('basket'); // set a backdrop
        window.setSheet(s);
      }, sheet);
      
      await delay(500);
      
      const idx = String(i++).padStart(2, '0');
      await page.screenshot({ path: path.join(OUTPUT_DIR, `S${idx}-sheet-${sheet}-${theme}.png`) });
    }
  }

  console.log('Finished capturing.');
  await browser.close();
}

captureScreenshots().catch(console.error);
