#!/usr/bin/env node
/**
 * PrintBK GitHub Releases Publisher & Direct Download Verifier
 * 
 * Uploads desktop Counter installer assets to the official public releases repository:
 * https://github.com/Sameer8549/PrintBK-releases
 * 
 * Assets uploaded:
 * 1. PrintBK-Counter-Setup.exe (Stable direct-download binary)
 * 2. PrintBK-Counter-Setup-1.0.0.exe (Versioned binary)
 * 3. latest.yml (electron-updater delta feed)
 * 4. checksums.txt (SHA-256 integrity hashes)
 * 5. PrintBK-Counter-Setup-1.0.0.exe.blockmap (differential updater map)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const installerDir = path.join(rootDir, 'counter-app', 'dist', 'installer');

const OWNER = process.env.GITHUB_RELEASES_OWNER || 'Sameer8549';
const REPO = process.env.GITHUB_RELEASES_REPO || 'PrintBK-releases';
const TAG = process.env.COUNTER_TAG || 'v1.0.0';
const TOKEN = process.argv[2] || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

console.log('🚀 [publish:releases] PrintBK Counter GitHub Release Automation');
console.log(`Repository: https://github.com/${OWNER}/${REPO}`);
console.log(`Target Tag: ${TAG}`);
console.log(`Local installer dir: ${installerDir}\n`);

if (!fs.existsSync(installerDir)) {
  console.error(`❌ Error: Installer directory not found at: ${installerDir}`);
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

if (!TOKEN) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  GITHUB_TOKEN NOT DETECTED IN ENVIRONMENT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('To publish automatically with this script, pass a GitHub Personal Access Token (PAT):');
  console.log('  node scripts/publish-to-github.mjs ghp_yourPersonalAccessTokenHere');
  console.log('Or set the environment variable:');
  console.log('  $env:GITHUB_TOKEN="ghp_yourPersonalAccessTokenHere"');
  console.log('  node scripts/publish-to-github.mjs');
  console.log('\nAlternatively, upload via GitHub Web UI in 4 quick steps:');
  console.log(`1. Open: https://github.com/${OWNER}/${REPO}/releases/new`);
  console.log(`2. Click "Choose a tag" -> type "${TAG}" -> click "Create new tag: ${TAG} on main"`);
  console.log(`3. Release title: "PrintBK Counter ${TAG}"`);
  console.log(`4. Drag & drop the files from:`);
  console.log(`   ${installerDir}`);
  console.log(`   (Specifically: PrintBK-Counter-Setup.exe, PrintBK-Counter-Setup-1.0.0.exe, latest.yml, checksums.txt)`);
  console.log(`5. Check "Set as the latest release"`);
  console.log(`6. Click "Publish release"`);
  console.log('\nOnce published, the direct installer download link:');
  console.log(`https://github.com/${OWNER}/${REPO}/releases/latest/download/PrintBK-Counter-Setup.exe`);
  console.log('will immediately download the executable directly when clicked!\n');
  process.exit(0);
}

const headers = {
  'Accept': 'application/vnd.github+json',
  'Authorization': `Bearer ${TOKEN}`,
  'User-Agent': 'PrintBK-Publisher-v1.0',
  'X-GitHub-Api-Version': '2022-11-28'
};

async function run() {
  console.log('🔍 Checking if release exists on GitHub...');
  let release;
  const getRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${TAG}`, { headers });
  
  if (getRes.status === 200) {
    release = await getRes.json();
    console.log(`✅ Release already exists on GitHub (ID: ${release.id})`);
  } else if (getRes.status === 404) {
    console.log(`Creating release ${TAG} on GitHub...`);
    const createRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: TAG,
        target_commitish: 'main',
        name: `PrintBK Counter ${TAG}`,
        body: `Official PrintBK Counter workstation desktop application for 64-bit Windows.\n\nIncluded: Embedded Print Agent, SumatraPDF printer automation, auto-updater.\n\nSHA-256: 0d047441cc9d1fe2bf945983330af7f548f1b10c9f447438d3bd0eb613235f04`,
        draft: false,
        prerelease: false,
        make_latest: 'true'
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Failed to create release: HTTP ${createRes.status}: ${errText}`);
    }
    release = await createRes.json();
    console.log(`✅ Created new release on GitHub (ID: ${release.id})`);
  } else {
    const errText = await getRes.text();
    throw new Error(`Failed to fetch release: HTTP ${getRes.status}: ${errText}`);
  }

  // Upload assets
  const existingAssets = release.assets || [];
  for (const assetName of assets) {
    const filePath = path.join(installerDir, assetName);
    const stat = fs.statSync(filePath);
    const existing = existingAssets.find(a => a.name === assetName);

    if (existing) {
      console.log(`Asset ${assetName} already exists on release. Deleting old asset (ID: ${existing.id})...`);
      const delRes = await fetch(existing.url, {
        method: 'DELETE',
        headers
      });
      if (!delRes.ok) {
        console.warn(`Could not delete existing asset: HTTP ${delRes.status}`);
      }
    }

    console.log(`Uploading ${assetName} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)...`);
    const contentType = assetName.endsWith('.exe') ? 'application/vnd.microsoft.portable-executable'
      : assetName.endsWith('.yml') ? 'text/yaml'
      : 'text/plain';

    const fileStream = fs.readFileSync(filePath);
    const uploadUrl = `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`;

    const upRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': contentType,
        'Content-Length': String(stat.size)
      },
      body: fileStream
    });

    if (!upRes.ok) {
      const errText = await upRes.text();
      throw new Error(`Failed to upload ${assetName}: HTTP ${upRes.status}: ${errText}`);
    }
    console.log(`✅ Uploaded ${assetName} successfully.`);
  }

  console.log('\n🎉 ALL ASSETS PUBLISHED TO GITHUB RELEASES!');
  const stableDirectDownloadUrl = `https://github.com/${OWNER}/${REPO}/releases/latest/download/PrintBK-Counter-Setup.exe`;
  console.log(`Public Direct Download URL: ${stableDirectDownloadUrl}`);

  console.log('Testing direct download redirect...');
  const headRes = await fetch(stableDirectDownloadUrl, { redirect: 'manual' });
  console.log(`HTTP Status: ${headRes.status} (Expected 302 redirect)`);
  if (headRes.status === 302) {
    console.log(`Redirect Location: ${headRes.headers.get('location')}`);
    console.log('✅ DIRECT EXECUTABLE DOWNLOAD VERIFIED & ACTIVE!');
  }
}

run().catch(err => {
  console.error('❌ Publication error:', err.message);
  process.exit(1);
});
