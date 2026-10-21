# PrintBK — Production Release Runbook

**Document:** Canonical Release & Deployment Protocol  
**Target Platform:** Zoho Catalyst Production & Windows Counter Workstations  
**Release Artifact:** `PrintBK-Counter-Setup-1.0.0.exe`  

---

## 1. Overview

This document specifies the exact, reproducible workflow for generating, verifying, publishing, and rolling back production releases across the PrintBK monorepo:
1. **Web Apps (Student & Staff)**: Deployed to Zoho Catalyst Production.
2. **Backend API Functions**: Deployed to Zoho Catalyst Serverless edge.
3. **Desktop Counter Workstation & Print Agent**: Packaged as a single NSIS executable (`PrintBK-Counter-Setup.exe`).

---

## 2. Release Prerequisites & Pre-Flight Checks

Before generating a release, ensure:
1. Working branch is clean and up to date (`git status`).
2. Run automated pre-flight integrity suite:
   ```bash
   node scripts/no-mock-data.mjs
   node scripts/verify-binary-integrity.mjs
   ```
3. Type-check all packages:
   ```bash
   pnpm --filter @printbk/shared build
   pnpm --filter printbk-student build
   pnpm --filter printbk-staff build
   pnpm --filter printbk-counter build
   ```

---

## 3. Desktop Counter Release (`pnpm release:counter`)

To build the official Windows installer and compute all cryptographic fingerprints:

```bash
pnpm release:counter
```

### What this script executes:
1. Validates that bundled `SumatraPDF.exe` matches the pinned SHA-256 (`290e4aa7...`).
2. Builds the desktop app targeting `COUNTER_ENV=prod`.
3. Verifies that no development URLs (`localhost`, `development.catalystserverless.in`) exist in production config.
4. Generates:
   - `PrintBK-Counter-Setup-1.0.0.exe`
   - `PrintBK-Counter-Setup.exe` (stable floating link)
   - `PrintBK-Counter-Setup-1.0.0.exe.blockmap`
   - `latest.yml` (containing SHA-512 in base64 and byte size for `electron-updater`)
   - `checksums.txt` (containing SHA-256 for all release assets)

### Publishing to Public GitHub Releases:
If using GitHub CLI:
```bash
gh release create counter-v1.0.0 \
  "counter-app/dist/installer/PrintBK-Counter-Setup-1.0.0.exe" \
  "counter-app/dist/installer/PrintBK-Counter-Setup.exe" \
  "counter-app/dist/installer/latest.yml" \
  "counter-app/dist/installer/checksums.txt" \
  --title "PrintBK Counter v1.0.0" \
  --notes "Official PrintBK Counter workstation installer. Includes background print agent and Windows printer integration."
```

Or via Web Browser:
1. Open the public release repository `https://github.com/Sameer8549/PrintBK-releases/releases/new`.
2. Tag: `counter-v1.0.0`. Title: `PrintBK Counter v1.0.0`.
3. Drag & drop the four files from `counter-app/dist/installer/`.
4. Click **Publish release**.

---

## 4. Post-Publish Verification

After publication, download the asset back from the public CDN and verify that the hash matches:
```powershell
# In PowerShell:
Invoke-WebRequest -Uri "https://github.com/Sameer8549/PrintBK-releases/releases/latest/download/PrintBK-Counter-Setup.exe" -OutFile "$HOME\Downloads\PrintBK-Counter-Setup.exe"
Get-FileHash "$HOME\Downloads\PrintBK-Counter-Setup.exe" -Algorithm SHA256
```
Compare the resulting hash with `checksums.txt`. Both must match byte-for-byte.

---

## 5. Web Client & Backend Production Deployment

### Pre-Deployment Assembly
```bash
node scripts/build-client.mjs
```
This builds both Student and Staff applications, copies them to `client/` and `client/staff/`, sets up `client/staff.html`, and verifies `client/404.html`.

### Catalyst Production Deployment
```bash
catalyst deploy --only client,functions
```

---

## 6. Emergency Rollback Protocol

If an unexpected regression occurs in production:

### Rollback Web Client & Functions:
1. Re-deploy the previous release tag:
   ```bash
   git checkout <previous-tag-or-commit>
   node scripts/build-client.mjs
   catalyst deploy --only client,functions
   ```
2. Or in the **Zoho Catalyst Console**:
   - Go to **Functions** → `api` → **Version History** → Click **Revert** to previous version.
   - Go to **Web Client Hosting** → Re-deploy previous zip bundle.

### Rollback Desktop Counter:
1. In `functions/api/counter.js` or Catalyst Console environment variables, adjust:
   - `COUNTER_LATEST_VERSION` to previous version (e.g. `1.0.0`).
   - `COUNTER_MIN_VERSION` to enforce rollback.
2. In GitHub Releases, point `PrintBK-Counter-Setup.exe` and `latest.yml` back to previous version artifacts.
3. Connected Counter apps will download and apply the rollback automatically via `electron-updater`.
