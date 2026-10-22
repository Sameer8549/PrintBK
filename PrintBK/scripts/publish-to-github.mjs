#!/usr/bin/env node
/**
 * PrintBK GitHub Releases Publisher & Direct Download Verifier
 * 
 * Uses official GitHub CLI (gh) to upload desktop Counter installer assets to:
 * https://github.com/Sameer8549/PrintBK-releases
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const installerDir = path.join(rootDir, 'counter-app', 'dist', 'installer');

const OWNER = process.env.GITHUB_RELEASES_OWNER || 'Sameer8549';
const REPO = process.env.GITHUB_RELEASES_REPO || 'PrintBK-releases';
const TAG = process.env.COUNTER_TAG || 'v1.0.0';

function resolveGhPath() {
  const defaultPath = 'C:\\Program Files\\GitHub CLI\\gh.exe';
  if (fs.existsSync(defaultPath)) return defaultPath;
  try {
    const which = execSync('where gh', { encoding: 'utf8' }).trim().split('\n')[0].trim();
    if (fs.existsSync(which)) return which;
  } catch (e) {
    // ignore
  }
  return 'gh';
}

function resolveToken() {
  const direct = process.argv[2] || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (direct) return direct;

  try {
    const input = 'protocol=https\nhost=github.com\n\n';
    const output = execSync('git credential fill', { input, encoding: 'utf8' });
    for (const line of output.split('\n')) {
      if (line.startsWith('password=')) {
        return line.substring(9).trim();
      }
    }
  } catch (err) {
    // ignore
  }
  return null;
}

const GH_BIN = resolveGhPath();
const TOKEN = resolveToken();

console.log('🚀 [publish:releases] PrintBK Counter GitHub Release Automation via gh CLI');
console.log(`GitHub CLI Path: ${GH_BIN}`);
console.log(`Repository: https://github.com/${OWNER}/${REPO}`);
console.log(`Target Tag: ${TAG}`);
console.log(`Local installer dir: ${installerDir}\n`);

if (!fs.existsSync(installerDir)) {
  console.error(`❌ Error: Installer directory not found at: ${installerDir}`);
  process.exit(1);
}

if (!TOKEN) {
  console.error('❌ Error: Could not retrieve GitHub token.');
  process.exit(1);
}

const assets = [
  'PrintBK-Counter-Setup.exe',
  'PrintBK-Counter-Setup-1.0.0.exe',
  'latest.yml',
  'checksums.txt',
  'PrintBK-Counter-Setup-1.0.0.exe.blockmap'
].filter(f => fs.existsSync(path.join(installerDir, f)));

console.log('Found local release assets:');
for (const a of assets) {
  const stat = fs.statSync(path.join(installerDir, a));
  console.log(`  - ${a} (${(stat.size / (1024 * 1024)).toFixed(2)} MB, ${stat.size} bytes)`);
}
console.log('');

const env = {
  ...process.env,
  GH_TOKEN: TOKEN,
  GITHUB_TOKEN: TOKEN
};

async function uploadFileWithGh(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      'release',
      'upload',
      TAG,
      filePath,
      '--repo',
      `${OWNER}/${REPO}`,
      '--clobber'
    ];

    const proc = spawn(GH_BIN, args, {
      env,
      stdio: ['ignore', 'inherit', 'inherit']
    });

    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`gh exited with code ${code}`));
    });
  });
}

async function run() {
  console.log('🔍 Checking release via gh CLI...');
  try {
    const viewOutput = execSync(`"${GH_BIN}" release view ${TAG} --repo ${OWNER}/${REPO}`, { env, encoding: 'utf8' });
    console.log(`✅ Release ${TAG} found:\n` + viewOutput.split('\n').slice(0, 5).join('\n'));
  } catch (e) {
    console.log(`Creating release ${TAG} on GitHub...`);
    execSync(`"${GH_BIN}" release create ${TAG} --repo ${OWNER}/${REPO} --title "PrintBK Counter ${TAG}" --notes "Official PrintBK Counter workstation desktop release (Windows 64-bit)" --latest`, { env, stdio: 'inherit' });
  }

  // Upload each asset using gh CLI
  for (const assetName of assets) {
    const filePath = path.join(installerDir, assetName);
    const stat = fs.statSync(filePath);
    console.log(`\n📦 [gh release upload] Uploading ${assetName} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)...`);
    const startTime = Date.now();
    await uploadFileWithGh(filePath);
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Uploaded ${assetName} in ${elapsedSec}s.`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 ALL ASSETS PUBLISHED TO GITHUB RELEASES!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const stableDirectDownloadUrl = `https://github.com/${OWNER}/${REPO}/releases/latest/download/PrintBK-Counter-Setup.exe`;
  console.log(`Public Direct Download URL: ${stableDirectDownloadUrl}`);

  console.log('\nVerifying release assets from GitHub API...');
  const verifyRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${TOKEN}`,
      'User-Agent': 'PrintBK-Publisher-v1.0'
    }
  });
  if (verifyRes.ok) {
    const latestRelease = await verifyRes.json();
    console.log(`Latest Release: ${latestRelease.tag_name} (${latestRelease.name})`);
    console.log('Published Assets:');
    for (const a of latestRelease.assets) {
      console.log(`  - ${a.name} (${(a.size / (1024 * 1024)).toFixed(2)} MB, downloads: ${a.download_count}, state: ${a.state})`);
    }
  }

  console.log('\nTesting direct download HTTP redirect...');
  const headRes = await fetch(stableDirectDownloadUrl, { redirect: 'manual' });
  console.log(`HTTP Status: ${headRes.status} (Expected 302)`);
  if (headRes.status === 302) {
    console.log(`Redirect Target: ${headRes.headers.get('location')}`);
    console.log('✅ DIRECT EXECUTABLE DOWNLOAD VERIFIED & ACTIVE IN PRODUCTION!');
  } else {
    console.warn(`⚠️ Warning: Expected 302 redirect but received ${headRes.status}`);
  }
}

run().catch(err => {
  console.error('\n❌ Publication error:', err.message);
  process.exit(1);
});
