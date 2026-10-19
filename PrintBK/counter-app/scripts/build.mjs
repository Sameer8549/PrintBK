import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const args = process.argv.slice(2);
const envArg = args.find(a => a.startsWith('--env='));
const targetEnv = envArg ? envArg.split('=')[1] : 'dev';

console.log(`[Build] Building PrintBK Counter (${targetEnv})...`);

// 1. Compile TypeScript
console.log('[Build] Step 1: Compiling TypeScript...');
try {
  execSync('npx tsc', { stdio: 'inherit' });
} catch (e) {
  console.error('[Build] TypeScript compilation failed');
  process.exit(1);
}

// 2. Ensure dist directories exist
const distDir = path.resolve('dist');
const uiDist = path.join(distDir, 'ui');
const configDist = path.join(distDir, 'config');
const publicDist = path.join(distDir, 'public');
const binDist = path.join(distDir, 'bin');

[uiDist, configDist, publicDist, binDist].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// 3. Copy UI HTML files
console.log('[Build] Step 2: Copying UI templates...');
const uiSrc = path.resolve('src/ui');
if (fs.existsSync(uiSrc)) {
  fs.readdirSync(uiSrc).forEach(f => {
    if (f.endsWith('.html')) {
      fs.copyFileSync(path.join(uiSrc, f), path.join(uiDist, f));
    }
  });
}

// 4. Copy Config file for target environment
console.log(`[Build] Step 3: Copying config/${targetEnv}.json...`);
const configSrc = path.resolve(`config/${targetEnv}.json`);
if (fs.existsSync(configSrc)) {
  fs.copyFileSync(configSrc, path.join(configDist, `${targetEnv}.json`));
  // Also copy as active default
  fs.copyFileSync(configSrc, path.join(configDist, 'active.json'));
}

// 5. Copy Public assets
console.log('[Build] Step 4: Copying icons and public assets...');
const publicSrc = path.resolve('public');
if (fs.existsSync(publicSrc)) {
  fs.readdirSync(publicSrc).forEach(f => {
    fs.copyFileSync(path.join(publicSrc, f), path.join(publicDist, f));
  });
}

// 6. Copy Binaries (SumatraPDF)
console.log('[Build] Step 5: Bundling SumatraPDF portable binary...');
const binSrc = path.resolve('bin');
if (fs.existsSync(binSrc)) {
  fs.readdirSync(binSrc).forEach(f => {
    fs.copyFileSync(path.join(binSrc, f), path.join(binDist, f));
  });
}

// 7. Copy agent daemon bundle into dist/bundled-agent
console.log('[Build] Step 6: Bundling print agent daemon...');
const agentSrc = path.resolve('../agent/dist');
const agentTarget = path.join(distDir, 'bundled-agent');
if (fs.existsSync(agentSrc)) {
  if (!fs.existsSync(agentTarget)) fs.mkdirSync(agentTarget, { recursive: true });
  fs.cpSync(agentSrc, agentTarget, { recursive: true });
}

console.log('[Build] SUCCESS: PrintBK Counter desktop build assembled in dist/!');
