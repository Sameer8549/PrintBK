#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const MOCK_PATTERNS = [
  // Identifiers
  { pattern: /\binitialJobs\b/, description: 'Hardcoded initialJobs array' },
  { pattern: /\bpickupCodes\b/, description: 'Hardcoded pickupCodes map' },
  { pattern: /\btodayHistory\b/, description: 'Hardcoded todayHistory array' },
  
  // Sample file names and text
  { pattern: /Mechanics Unit 3 notes\.pdf/, description: 'Sample document title (Mechanics Unit 3)' },
  { pattern: /DBMS lab record\.pdf/, description: 'Sample document title (DBMS lab record)' },
  { pattern: /Final presentation\.pdf/, description: 'Sample document title (Final presentation)' },
  { pattern: /Passport photos\.jpg/, description: 'Sample photo file title' },
  { pattern: /Type from handwritten English source/, description: 'Sample typing request text' },
  
  // Fake progress & status strings
  { pattern: /Printing 14\/30/, description: 'Fake hardcoded printing progress (14/30)' },
  { pattern: /Printing 14 of 30/, description: 'Fake hardcoded printing progress (14 of 30)' },
  
  // Mock numbers and codes in active order rendering
  { pattern: /"4821"|"1194"|"7318"|"3084"|"6142"|"2059"|"9063"|"5520"/, description: 'Hardcoded sample pickup code' },
  
  // Fake analytics fixtures
  { pattern: /₹3,240/, description: 'Hardcoded revenue figure (₹3,240)' },
  { pattern: /52 of 52/, description: 'Hardcoded deletion stats (52 of 52)' },
  { pattern: /6m 42s/, description: 'Hardcoded average wait time' },
];

let totalViolations = 0;
const violationsReport = [];

function scanFile(filePath, isBundle = false) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');

  // Skip dev-only ComponentsPage if isolated or tests
  if (relativePath.includes('test') || relativePath.includes('spec') || relativePath.includes('fixtures') || relativePath.includes('ComponentsPage')) {
    return;
  }

  for (const { pattern, description } of MOCK_PATTERNS) {
    if (pattern.test(content)) {
      // Find line numbers for non-bundles
      if (!isBundle) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (pattern.test(lines[i])) {
            // Ignore comments or dev-only flags if explicitly marked
            if (lines[i].includes('// dev-only-component') || lines[i].includes('/* dev-only */')) {
              continue;
            }
            totalViolations++;
            violationsReport.push({
              file: relativePath,
              line: i + 1,
              description,
              match: lines[i].trim().slice(0, 100),
            });
          }
        }
      } else {
        totalViolations++;
        violationsReport.push({
          file: relativePath,
          line: 1,
          description: `[BUNDLE LEAK] ${description}`,
          match: 'Production asset contains blacklisted mock fixture',
        });
      }
    }
  }
}

function scanDir(dir, isBundle = false) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      scanDir(fullPath, isBundle);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (isBundle) {
        if (ext === '.js' || ext === '.html') {
          scanFile(fullPath, true);
        }
      } else {
        if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
          scanFile(fullPath, false);
        }
      }
    }
  }
}

console.log('🔍 [no-mock-data] Running CI check for mock and dummy data...');

// 1. Scan staff/src
console.log('  -> Scanning staff/src...');
scanDir(path.join(rootDir, 'staff', 'src'), false);

// 2. Scan student/src
console.log('  -> Scanning student/src...');
scanDir(path.join(rootDir, 'student', 'src'), false);

// 3. Scan production bundles if present
if (fs.existsSync(path.join(rootDir, 'staff', 'dist'))) {
  console.log('  -> Scanning staff/dist production bundle...');
  scanDir(path.join(rootDir, 'staff', 'dist'), true);
}
if (fs.existsSync(path.join(rootDir, 'student', 'dist'))) {
  console.log('  -> Scanning student/dist production bundle...');
  scanDir(path.join(rootDir, 'student', 'dist'), true);
}

console.log('\n📊 [no-mock-data] Results:');
if (totalViolations === 0) {
  console.log('  ✅ PASSED: No mock data or fake timer markers detected in production sources or bundles.\n');
  process.exit(0);
} else {
  console.error(`  ❌ FAILED: Found ${totalViolations} mock data marker(s):\n`);
  for (const v of violationsReport) {
    console.error(`  - ${v.file}:${v.line} [${v.description}]`);
    console.error(`    ↳ "${v.match}"`);
  }
  console.error('\n🚫 CI assertion failed: Eliminate all mock markers from production code before merging.\n');
  process.exit(1);
}
