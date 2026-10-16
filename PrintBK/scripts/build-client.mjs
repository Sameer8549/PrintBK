#!/usr/bin/env node
/**
 * PrintBK Unified Client Builder
 * 
 * Compiles both the Student Web Client and Staff Counter Client into
 * a single unified directory structure ready for Zoho Catalyst Web Client Hosting:
 *   /              -> Student Web Application (index.html, assets/...)
 *   /staff/        -> Staff Counter Application (staff/index.html, staff/assets/...)
 *   /staff.html    -> Direct alias to Staff Counter Application
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
console.log('💼 [build-client] Step 3: Building Staff Counter Client (base: /staff/)...');
execSync('pnpm --filter printbk-staff build', { cwd: rootDir, stdio: 'inherit' });

// 4. Assemble into client/ directory
console.log('📁 [build-client] Step 4: Assembling unified client directory...');
const clientDir = path.join(rootDir, 'client');
if (fs.existsSync(clientDir)) {
  fs.rmSync(clientDir, { recursive: true, force: true });
}
fs.mkdirSync(clientDir, { recursive: true });

// Copy student/dist to client/
const studentDist = path.join(rootDir, 'student', 'dist');
fs.cpSync(studentDist, clientDir, { recursive: true });

// Copy staff/dist to client/staff/
const staffDist = path.join(rootDir, 'staff', 'dist');
const clientStaffDir = path.join(clientDir, 'staff');
fs.cpSync(staffDist, clientStaffDir, { recursive: true });

// Also copy staff/dist/index.html to client/staff.html for direct URL compatibility
fs.copyFileSync(
  path.join(staffDist, 'index.html'),
  path.join(clientDir, 'staff.html')
);

// Ensure client-package.json exists with correct metadata
const clientPkgPath = path.join(clientDir, 'client-package.json');
fs.writeFileSync(
  clientPkgPath,
  JSON.stringify(
    {
      name: 'printbk_student',
      version: '1.0.0',
      homepage: 'index.html',
    },
    null,
    2
  )
);

console.log('✅ [build-client] Unified client assembled successfully:');
console.log(`   - Student App: / (index.html)`);
console.log(`   - Staff App:   /staff/ (staff/index.html) & /staff.html`);
