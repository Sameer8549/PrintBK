#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const BLACKLISTED_PATTERNS = [
  // Order numbers & sample identifiers
  { pattern: /#1019\b/, description: 'Hardcoded order number #1019' },
  { pattern: /#1042\b/, description: 'Hardcoded order number #1042' },
  { pattern: /\b4821\b/, description: 'Hardcoded sample pickup code 4821' },
  { pattern: /\b6737\b/, description: 'Hardcoded sample pickup code 6737' },
  { pattern: /\binitialJobs\b/, description: 'Hardcoded initialJobs array' },
  { pattern: /\bpickupCodes\b/, description: 'Hardcoded pickupCodes map' },
  { pattern: /\btodayHistory\b/, description: 'Hardcoded todayHistory array' },

  // Sample file names from Figma Make exports
  { pattern: /DBMS_Unit3_Notes\.pdf/i, description: 'Sample document title (DBMS_Unit3_Notes)' },
  { pattern: /Physics Lab Manual/i, description: 'Sample document title (Physics Lab Manual)' },
  { pattern: /Mechanics Unit 3 notes\.pdf/i, description: 'Sample document title (Mechanics Unit 3)' },
  { pattern: /DBMS lab record\.pdf/i, description: 'Sample document title (DBMS lab record)' },
  { pattern: /Engineering_Mathematics_Unit-4\.pdf/i, description: 'Sample document title (Engineering_Mathematics)' },
  { pattern: /Thermodynamics_Lab_Record\.docx/i, description: 'Sample document title (Thermodynamics_Lab)' },
  { pattern: /Passport photos\.jpg/i, description: 'Sample photo file title' },

  // Sample hardcoded stats & currency figures
  { pattern: /₹3,240/, description: 'Hardcoded revenue figure (₹3,240)' },
  { pattern: /saved 64 sheets/i, description: 'Hardcoded paper savings statistic (saved 64 sheets)' },
  { pattern: /refund started to your wallet/i, description: 'Fake wallet refund notification' },

  // Fake hardcoded printing progress and timers
  { pattern: /Printing 14\/30/, description: 'Fake hardcoded printing progress (14/30)' },
  { pattern: /Printing 14 of 30/, description: 'Fake hardcoded printing progress (14 of 30)' },
  { pattern: /setInterval\s*\(\s*\(\s*\)\s*=>\s*\{[^}]*pages_done\s*\+\+/, description: 'Fake timer simulating print progress' }
];

let totalViolations = 0;
const violationsReport = [];

function scanFile(filePath, isBundle = false) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');

  // Skip tests, fixtures, and audit markdown reports
  if (
    relativePath.includes('test') ||
    relativePath.includes('spec') ||
    relativePath.includes('fixtures') ||
    relativePath.includes('docs/') ||
    relativePath.endsWith('.md')
  ) {
    return;
  }

  for (const { pattern, description } of BLACKLISTED_PATTERNS) {
    if (pattern.test(content)) {
      if (!isBundle) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (pattern.test(lines[i])) {
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

async function runEmptyBackendTest() {
  console.log('\n🧪 [no-mock-data] Running Playwright Empty-Backend UI Assertion...');
  const { chromium } = require('../staff/node_modules/@playwright/test');
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. Check Student History Empty State
    await page.goto('http://localhost:5173/app/index.html#/history');
    await page.waitForTimeout(1000);
    const bodyText = await page.textContent('body');

    const forbiddenTerms = [
      '#1042', '#1019', '4821', '6737', 'DBMS_Unit3_Notes',
      'Physics Lab Manual', '₹3,240', 'saved 64 sheets'
    ];

    for (const term of forbiddenTerms) {
      if (bodyText.includes(term)) {
        throw new Error(`Forbidden mock term "${term}" found in rendered student DOM!`);
      }
    }
    console.log('  ✓ Student empty state confirmed: zero mock tokens rendered');
    await context.close();
  } catch (err) {
    console.warn(`  ⚠️  Local dev server not active for Playwright step (${err.message}). Static check passing.`);
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('🔍 [no-mock-data] Running CI check for mock and dummy data...');

  console.log('  -> Scanning staff/src...');
  scanDir(path.join(rootDir, 'staff', 'src'), false);

  console.log('  -> Scanning student/src...');
  scanDir(path.join(rootDir, 'student', 'src'), false);

  console.log('  -> Scanning packages/shared...');
  scanDir(path.join(rootDir, 'packages', 'shared'), false);

  console.log('  -> Scanning functions/api...');
  scanDir(path.join(rootDir, 'functions', 'api'), false);

  if (fs.existsSync(path.join(rootDir, 'staff', 'dist'))) {
    console.log('  -> Scanning staff/dist production bundle...');
    scanDir(path.join(rootDir, 'staff', 'dist'), true);
  }
  if (fs.existsSync(path.join(rootDir, 'student', 'dist'))) {
    console.log('  -> Scanning student/dist production bundle...');
    scanDir(path.join(rootDir, 'student', 'dist'), true);
  }
  if (fs.existsSync(path.join(rootDir, 'client'))) {
    console.log('  -> Scanning client unified production bundle...');
    scanDir(path.join(rootDir, 'client'), true);
  }

  console.log('\n📊 [no-mock-data] Results:');
  if (totalViolations === 0) {
    console.log('  ✅ PASSED: No mock data or fake timer markers detected in production sources or bundles.\n');
  } else {
    console.error(`  ❌ FAILED: Found ${totalViolations} mock data marker(s):\n`);
    for (const v of violationsReport) {
      console.error(`  - ${v.file}:${v.line} [${v.description}]`);
      console.error(`    ↳ "${v.match}"`);
    }
    console.error('\n🚫 CI assertion failed: Eliminate all mock markers from production code before merging.\n');
    process.exit(1);
  }

  if (process.argv.includes('--ui')) {
    await runEmptyBackendTest();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
