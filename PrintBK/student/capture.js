import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:5173';
const OUTPUT_DIR = path.resolve(__dirname, '../docs/design/student/baseline');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Map of screen states to capture
const SCREENS = [
  'splash', 'entry', 'uploading', 'basket', 'empty', 'preview',
  'services', 'photo', 'checkout', 'confirming', 'failed', 'paid',
  'ticket', 'quoteTicket', 'orderError', 'history', 'settings'
];

async function captureScreenshots() {
  console.log('Starting puppeteer...');
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.setViewport({ width: 390, height: 844 });
  
  // We need to inject state into the React app to navigate to different screens.
  // Since App.tsx has `const [screen, setScreen] = useState<Screen>("splash");`
  // it's tricky to trigger from outside. 
  // Let's modify the app dynamically or just use a small hack if possible,
  // but since we shouldn't modify the source just yet, maybe we can expose a global setter in App.tsx temporarily?
  // Wait, I am not allowed to rewrite history or change visual parity, but adding `window.setScreen = setScreen` in Phase 0 is fine for auditing, I'll remove it after.
  
  console.log('Finished capturing.');
  await browser.close();
}

captureScreenshots().catch(console.error);
