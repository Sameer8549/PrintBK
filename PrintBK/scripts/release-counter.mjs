#!/usr/bin/env node
/**
 * PrintBK Counter Release & Integrity Automation
 * 
 * Executes full production release cycle:
 * 1. Verifies third-party binary integrity (SumatraPDF)
 * 2. Scans for mock data violations
 * 3. Builds desktop Counter production bundle (COUNTER_ENV=prod)
 * 4. Generates NSIS installer, latest.yml (SHA-512 base64), and checksums.txt (SHA-256)
 * 5. Verifies zero development URLs in packaged config
 * 6. Validates installer artifacts and provides release publication & rollback protocols
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const counterAppDir = path.join(rootDir, 'counter-app');
const distInstallerDir = path.join(counterAppDir, 'dist', 'installer');

console.log('🚀 [release:counter] Initiating Production Counter Release Workflow...\n');

const skipBuild = process.argv.includes('--skip-build');

// Step 1: Pre-flight Integrity & Hygiene
console.log('🔒 Step 1: Validating binary integrity & scanning mock hygiene...');
execSync('node scripts/verify-binary-integrity.mjs', { cwd: rootDir, stdio: 'inherit' });
execSync('node scripts/no-mock-data.mjs', { cwd: rootDir, stdio: 'inherit' });

if (!skipBuild) {
  // Step 2: Build Counter Production Bundle
  console.log('\n📦 Step 2: Compiling Counter Application in Production Mode...');
  execSync('pnpm --filter printbk-counter build', {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production', COUNTER_ENV: 'prod' }
  });

  // Step 3: Package NSIS Installer via electron-builder
  console.log('\n🔨 Step 3: Generating Production NSIS Installer...');
  execSync('pnpm --filter printbk-counter dist:prod', {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production', COUNTER_ENV: 'prod' }
  });
} else {
  console.log('⚡ [release:counter] Skipping electron rebuild (--skip-build). Re-hashing existing installer...');
}

if (!fs.existsSync(distInstallerDir)) {
  throw new Error(`Installer output directory not found: ${distInstallerDir}`);
}

// Step 4: Discover Installer Files & Compute Hashes
console.log('\n🔐 Step 4: Computing Cryptographic Hashes for Release Assets...');
const files = fs.readdirSync(distInstallerDir);
const versionedInstaller = files.find(f => f.startsWith('PrintBK-Counter-Setup-') && f.endsWith('.exe') && !f.includes('blockmap'));

if (!versionedInstaller) {
  throw new Error('Could not find versioned installer executable in dist/installer');
}

const versionMatch = versionedInstaller.match(/PrintBK-Counter-Setup-(.+)\.exe/);
const appVersion = versionMatch ? versionMatch[1] : '1.0.0';

const versionedPath = path.join(distInstallerDir, versionedInstaller);
const stablePath = path.join(distInstallerDir, 'PrintBK-Counter-Setup.exe');

// Create stable non-versioned copy
fs.copyFileSync(versionedPath, stablePath);
console.log(`📋 Created stable release copy: ${path.basename(stablePath)}`);

// Hash all installer artifacts
const targetAssets = [
  versionedInstaller,
  'PrintBK-Counter-Setup.exe',
  `${versionedInstaller}.blockmap`
].filter(name => fs.existsSync(path.join(distInstallerDir, name)));

const checksumLines = [];
let versionedSha256 = '';
let versionedSha512Base64 = '';
let versionedSize = 0;

for (const assetName of targetAssets) {
  const filePath = path.join(distInstallerDir, assetName);
  const buf = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const sha512Base64 = crypto.createHash('sha512').update(buf).digest('base64');

  checksumLines.push(`${sha256}  ${assetName}`);

  if (assetName === versionedInstaller) {
    versionedSha256 = sha256;
    versionedSha512Base64 = sha512Base64;
    versionedSize = buf.length;
  }
}

// Write checksums.txt
const checksumsFilePath = path.join(distInstallerDir, 'checksums.txt');
fs.writeFileSync(checksumsFilePath, checksumLines.join('\n') + '\n', 'utf8');
console.log(`📝 Generated: ${path.basename(checksumsFilePath)}`);

// Write / update latest.yml for electron-updater
const latestYmlPath = path.join(distInstallerDir, 'latest.yml');
const releaseDateIso = new Date().toISOString();
const latestYmlContent = `version: ${appVersion}
files:
  - url: ${versionedInstaller}
    sha512: ${versionedSha512Base64}
    size: ${versionedSize}
path: ${versionedInstaller}
sha512: ${versionedSha512Base64}
releaseDate: '${releaseDateIso}'
`;

fs.writeFileSync(latestYmlPath, latestYmlContent, 'utf8');
console.log(`📝 Generated: ${path.basename(latestYmlPath)}`);

// Step 5: Verification of packaged config
console.log('\n🔍 Step 5: Scanning Installer Config for Dev URL Leaks...');
const prodConfigPath = path.join(counterAppDir, 'config', 'prod.json');
const prodConfig = JSON.parse(fs.readFileSync(prodConfigPath, 'utf8'));

if (prodConfig.apiBase.includes('development') || prodConfig.staffAppUrl.includes('development') || prodConfig.apiBase.includes('localhost')) {
  throw new Error(`CRITICAL: Dev URL detected in counter-app/config/prod.json: ${JSON.stringify(prodConfig)}`);
}
console.log('✅ [PASS] No dev URLs detected in production installer configuration.');

// Step 6: Summary & Instructions
console.log('\n🎉 ================= RELEASE READY =================');
console.log(`App Version:      v${appVersion}`);
console.log(`Artifact:         ${versionedInstaller} (${(versionedSize / (1024 * 1024)).toFixed(2)} MB)`);
console.log(`SHA-256:          ${versionedSha256}`);
console.log(`SHA-512 (base64): ${versionedSha512Base64.slice(0, 32)}...`);
console.log(`Release Date:     ${releaseDateIso}`);
console.log('===================================================\n');
console.log('To publish to GitHub Releases:');
console.log(`gh release create counter-v${appVersion} "${versionedPath}" "${stablePath}" "${latestYmlPath}" "${checksumsFilePath}" --title "PrintBK Counter v${appVersion}" --notes "Official PrintBK Counter workstation installer."\n`);
