import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const PINNED_INTEGRITY = {
  'SumatraPDF.exe': {
    relPath: 'counter-app/bin/SumatraPDF.exe',
    sha256: '290e4aa7ed64c728138711c011e89aab7aa48dbc1ae430371dc2be4100b92bf0',
    sizeBytes: 16065496,
    version: '3.5.2 (x64)'
  },
  'LibreOffice_24.8.2_Win_x86-64.msi': {
    url: 'https://download.documentfoundation.org/libreoffice/stable/24.8.2/win/x86_64/LibreOffice_24.8.2_Win_x86-64.msi',
    sha256: '6c3c52e008d5e0f592c0fa2904c6328325a74fc64e7c7a37233fc88f5f4f89d5',
    optionalDownload: true
  }
};

export function verifyBundledBinaries() {
  console.log('🔒 [verify-binary-integrity] Checking cryptographic integrity of bundled binaries...');
  let failures = 0;

  for (const [name, meta] of Object.entries(PINNED_INTEGRITY)) {
    if (meta.relPath) {
      const fullPath = path.join(rootDir, meta.relPath);
      if (!fs.existsSync(fullPath)) {
        console.error(`❌ Missing binary: ${meta.relPath}`);
        failures++;
        continue;
      }

      const fileBuf = fs.readFileSync(fullPath);
      const computedSha256 = crypto.createHash('sha256').update(fileBuf).digest('hex').toLowerCase();
      const expectedSha256 = meta.sha256.toLowerCase();

      if (computedSha256 !== expectedSha256) {
        console.error(`❌ Hash mismatch for ${name}:`);
        console.error(`   Expected: ${expectedSha256}`);
        console.error(`   Computed: ${computedSha256}`);
        failures++;
      } else {
        console.log(`✅ [PASS] ${name} verified (SHA-256: ${computedSha256.slice(0, 16)}..., Size: ${fileBuf.length} bytes)`);
      }
    }
  }

  if (failures > 0) {
    throw new Error(`Integrity check failed: ${failures} binary mismatches or missing files.`);
  }
  console.log('🎉 [verify-binary-integrity] All bundled binaries passed cryptographic verification.\n');
}

// Run directly if invoked as CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    verifyBundledBinaries();
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
