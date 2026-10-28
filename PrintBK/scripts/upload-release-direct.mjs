import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const installerDir = path.join(rootDir, 'counter-app', 'dist', 'installer');

function resolveToken() {
  const direct = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (direct) return direct;
  try {
    const input = 'protocol=https\nhost=github.com\n\n';
    const output = execSync('git credential fill', { input, encoding: 'utf8' });
    for (const line of output.split('\n')) {
      if (line.startsWith('password=')) return line.substring(9).trim();
    }
  } catch (err) {}
  return null;
}

const token = resolveToken();
if (!token) {
  console.error('No token found');
  process.exit(1);
}

const OWNER = 'Sameer8549';
const REPO = 'PrintBK-releases';
const TAG = 'v1.0.0';

async function uploadAll() {
  console.log('Fetching release info...');
  const relRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${TAG}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'PrintBK-Uploader'
    }
  });
  if (!relRes.ok) throw new Error(`Fetch release failed: ${relRes.status}`);
  const release = await relRes.json();
  const releaseId = release.id;
  console.log(`Release ${TAG} found (ID: ${releaseId})`);

  // Delete existing assets on GitHub to ensure clean overwrite
  for (const a of (release.assets || [])) {
    console.log(`🗑️ Deleting old asset: ${a.name} (ID: ${a.id}, size: ${(a.size/(1024*1024)).toFixed(2)} MB)...`);
    const delRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/assets/${a.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'PrintBK-Uploader'
      }
    });
    if (delRes.status === 204) {
      console.log(`  ✓ Deleted ${a.name}`);
    } else {
      console.log(`  ⚠️ Delete returned ${delRes.status}`);
    }
  }

  // Assets to upload
  const filesToUpload = [
    'PrintBK-Counter-Setup-1.0.0.exe',
    'PrintBK-Counter-Setup.exe',
    'latest.yml',
    'checksums.txt',
    'PrintBK-Counter-Setup-1.0.0.exe.blockmap'
  ].filter(f => fs.existsSync(path.join(installerDir, f)));

  for (const f of filesToUpload) {
    const fullPath = path.join(installerDir, f);
    const stat = fs.statSync(fullPath);
    console.log(`\n📦 Uploading ${f} (${(stat.size / (1024*1024)).toFixed(2)} MB)...`);
    const startTime = Date.now();
    const buffer = fs.readFileSync(fullPath);

    const uploadUrl = `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(f)}`;
    const upRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(buffer.length),
        'User-Agent': 'PrintBK-Uploader'
      },
      body: buffer
    });

    if (!upRes.ok) {
      const errText = await upRes.text();
      throw new Error(`Upload ${f} failed: ${upRes.status} ${errText}`);
    }
    const upData = await upRes.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Uploaded ${f} in ${elapsed}s (ID: ${upData.id}, Download URL: ${upData.browser_download_url})`);
  }

  console.log('\n======================================================');
  console.log('🎉 ALL RELEASE ASSETS UPLOADED AND ACTIVE ON GITHUB!');
  console.log('======================================================\n');
}

uploadAll().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
