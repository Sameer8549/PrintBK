import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const sharedDist = path.join(root, 'packages', 'shared', 'dist');
const apiShared = path.join(root, 'functions', 'api', 'shared');

if (!fs.existsSync(apiShared)) {
  fs.mkdirSync(apiShared, { recursive: true });
}

const distFiles = fs.readdirSync(sharedDist).filter(f => f.endsWith('.js') && !f.includes('.test.'));

for (const file of distFiles) {
  const src = path.join(sharedDist, file);
  const dest = path.join(apiShared, file);
  fs.copyFileSync(src, dest);
  console.log(`Synced: ${file} -> functions/api/shared/${file}`);
}
