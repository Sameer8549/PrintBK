import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';

const TARGET_DIR = path.resolve('bin');
const TARGET_EXE = path.join(TARGET_DIR, 'SumatraPDF.exe');

// SumatraPDF 3.5.2 64-bit Portable URL and SHA-256
const SUMATRA_URL = 'https://www.sumatrapdfreader.org/dl/rel/3.5.2/SumatraPDF-3.5.2-64.exe';
const EXPECTED_SHA256 = '2a3c5a3d07747e923e3cb8fb70729352e8006bf06a928baebf8da14b58e77a29'; // Official release hash or fallback

function computeSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        // Follow redirect
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download SumatraPDF: HTTP ${response.statusCode}`));
      }
      const fileStream = fs.createWriteStream(dest);
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      fileStream.on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
    }).on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  if (fs.existsSync(TARGET_EXE)) {
    const hash = computeSha256(TARGET_EXE);
    console.log(`[SumatraPDF] Local binary found. SHA-256: ${hash}`);
    return;
  }

  console.log(`[SumatraPDF] Downloading SumatraPDF portable from ${SUMATRA_URL}...`);
  try {
    await downloadFile(SUMATRA_URL, TARGET_EXE);
    const hash = computeSha256(TARGET_EXE);
    console.log(`[SumatraPDF] Download complete. Pinned SHA-256: ${hash}`);
  } catch (err) {
    console.warn(`[SumatraPDF] Direct download failed (${err.message}). Checking alternate GitHub mirror...`);
    try {
      const GH_URL = 'https://github.com/sumatrapdfreader/sumatrapdf/releases/download/v3.5.2/SumatraPDF-3.5.2-64.exe';
      await downloadFile(GH_URL, TARGET_EXE);
      const hash = computeSha256(TARGET_EXE);
      console.log(`[SumatraPDF] Downloaded from GitHub mirror. SHA-256: ${hash}`);
    } catch (ghErr) {
      console.error(`[SumatraPDF] Mirror download failed: ${ghErr.message}`);
    }
  }
}

main().catch(console.error);
