#!/usr/bin/env node
/**
 * PrintBK Unified Client Builder
 * 
 * Compiles both the Student Web Client and Staff Counter Client into
 * a single unified directory structure ready for Zoho Catalyst Web Client Hosting:
 *   /              -> Student Web Application (index.html, assets/...)
 *   /staff/        -> Staff Counter Application (staff/index.html, staff/assets/...)
 *   /staff.html    -> Direct alias to Staff Counter Application
 *   /404.html      -> SPA routing fallback for Catalyst Web Client Hosting
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🚀 [build-client] Starting unified client build (Student + Staff)...');

// 1. Build shared package & sync to backend functions
console.log('📦 [build-client] Step 1: Building @printbk/shared...');
execSync('pnpm --filter @printbk/shared build', { cwd: rootDir, stdio: 'inherit' });
execSync('node scripts/sync-shared.mjs', { cwd: rootDir, stdio: 'inherit' });

// 2. Build Student Client
console.log('🎓 [build-client] Step 2: Building Student Web Client...');
execSync('pnpm --filter printbk-student build', { cwd: rootDir, stdio: 'inherit' });

// 3. Build Staff Client
console.log('💼 [build-client] Step 3: Building Staff Counter Client...');
execSync('pnpm --filter printbk-staff build', { cwd: rootDir, stdio: 'inherit' });

// 4. Assemble into client/ directory
console.log('📁 [build-client] Step 4: Assembling unified client directory...');
const clientDir = path.join(rootDir, 'client');
if (!fs.existsSync(clientDir)) {
  fs.mkdirSync(clientDir, { recursive: true });
}

// Copy student/dist to client/
const studentDist = path.join(rootDir, 'student', 'dist');
fs.cpSync(studentDist, clientDir, { recursive: true });

// Copy staff/dist to client/staff/
const staffDist = path.join(rootDir, 'staff', 'dist');
const clientStaffDir = path.join(clientDir, 'staff');
fs.cpSync(staffDist, clientStaffDir, { recursive: true });

// CRITICAL FIX: Also copy all staff assets into client/assets/
// This ensures that when staff app is accessed via /app/staff.html or root-relative paths,
// all scripts and styles load cleanly with 200 OK and correct MIME types!
const staffAssetsDir = path.join(staffDist, 'assets');
const clientAssetsDir = path.join(clientDir, 'assets');
if (fs.existsSync(staffAssetsDir)) {
  for (const assetFile of fs.readdirSync(staffAssetsDir)) {
    fs.copyFileSync(
      path.join(staffAssetsDir, assetFile),
      path.join(clientAssetsDir, assetFile)
    );
  }
}

// Also copy staff root images (logos) to client root so staff.html renders them
for (const imgFile of ['hkbk-logo.jpg', 'printbk-logo.svg', 'printbk-logo.png']) {
  const srcImg = path.join(staffDist, imgFile);
  if (fs.existsSync(srcImg)) {
    fs.copyFileSync(srcImg, path.join(clientDir, imgFile));
  }
}

// Also create client/staff.html from staff/dist/index.html
fs.copyFileSync(
  path.join(staffDist, 'index.html'),
  path.join(clientDir, 'staff.html')
);

// Create 404.html fallback for Catalyst Web Client Hosting
// If a user navigates to /app/staff or refreshes any sub-route,
// 404.html gracefully routes them to the proper application
const fallback404Content = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>PrintBK · Loading</title>
  <script>
    (function() {
      var path = window.location.pathname.toLowerCase();
      var search = window.location.search || '';
      var hash = window.location.hash || '';
      if (path.indexOf('staff') !== -1) {
        window.location.replace('/app/staff/index.html' + search + hash);
      } else {
        window.location.replace('/app/index.html' + search + hash);
      }
    })();
  </script>
</head>
<body style="font-family: sans-serif; text-align: center; padding: 40px; background: #F7F4EE; color: #111;">
  <p>Loading PrintBK...</p>
</body>
</html>
`;
fs.writeFileSync(path.join(clientDir, '404.html'), fallback404Content);

// Ensure client-package.json exists with incremented version to bust CDN caching
const clientPkgPath = path.join(clientDir, 'client-package.json');
fs.writeFileSync(
  clientPkgPath,
  JSON.stringify(
    {
      name: 'printbk_student',
      version: '1.1.0',
      homepage: 'index.html',
      '404': '404.html',
    },
    null,
    2
  )
);

console.log('✅ [build-client] Unified client assembled successfully:');
console.log(`   - Student App: / (index.html)`);
console.log(`   - Staff App:   /staff/ (staff/index.html) & /staff.html`);
console.log(`   - Fallback:    /404.html (configured in client-package.json)`);
console.log(`   - Assets:      Combined into /assets/ and /staff/assets/`);
