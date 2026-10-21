# PrintBK — Cryptographic Integrity & Release Hash Verification

**Status:** Canonical Integrity Document  
**Date:** October 2026  
**Auditor:** Principal Release Engineer  

---

## 1. Overview & Verification Policy

PrintBK enforces end-to-end cryptographic integrity across every layer of the deployment stack:
1. **Third-Party Bundled Binaries**: Verified at build time; builds terminate immediately on hash mismatch.
2. **Desktop Windows Installer**: Packaged into NSIS executable, hashed with SHA-256 (hex) and SHA-512 (base64) for auto-updates.
3. **Public Release Distribution**: Every release asset published to GitHub Releases is accompanied by an authoritative `checksums.txt`.
4. **Auto-Updater Manifest**: `latest.yml` contains base64-encoded SHA-512 matching `electron-updater` schema.

---

## 2. Bundled & Third-Party Binaries

| Binary Name | Version / Architecture | Target File Location | SHA-256 Checksum (Hex) | Size | Verification Method |
|---|---|---|---|---|---|
| **SumatraPDF.exe** | v3.5.2 (64-bit Windows) | `counter-app/bin/SumatraPDF.exe` | `290e4aa7ed64c728138711c011e89aab7aa48dbc1ae430371dc2be4100b92bf0` | 16,065,496 B | `node scripts/verify-binary-integrity.mjs` |
| **LibreOffice MSI** | v24.8.2 (x86_64 MSI) | Official Download Mirror | `6c3c52e008d5e0f592c0fa2904c6328325a74fc64e7c7a37233fc88f5f4f89d5` | ~340 MB | Verified upon download before headless execution |

### Build-Time Verification Gate
The build script runs:
```bash
node scripts/verify-binary-integrity.mjs
```
If `SumatraPDF.exe` is altered, corrupted, or missing, the packaging process fails with non-zero exit status.

---

## 3. Desktop Installer Artifacts & Auto-Update Manifests

Every production release of `PrintBK-Counter` produces:
1. `PrintBK-Counter-Setup-<version>.exe` (Versioned installer)
2. `PrintBK-Counter-Setup.exe` (Stable floating latest installer)
3. `PrintBK-Counter-Setup-<version>.exe.blockmap` (Blockmap for differential auto-updates)
4. `latest.yml` (Electron-updater manifest)
5. `checksums.txt` (Consolidated SHA-256 file)

### Manifest Structure (`latest.yml`)
```yaml
version: 1.0.0
files:
  - url: PrintBK-Counter-Setup-1.0.0.exe
    sha512: <base64-encoded-sha512>
    size: <file-size-in-bytes>
path: PrintBK-Counter-Setup-1.0.0.exe
sha512: <base64-encoded-sha512>
releaseDate: '2026-10-20T21:00:00.000Z'
```

---

## 4. How to Verify Hashes

### Windows PowerShell (Recommended for Counter Operators)
```powershell
Get-FileHash "$HOME\Downloads\PrintBK-Counter-Setup.exe" -Algorithm SHA256
```
Compare the output against the checksum displayed directly on the Staff Download Page or in `checksums.txt`.

### Node.js / Linux / macOS
```bash
sha256sum PrintBK-Counter-Setup.exe
```

---

## 5. Release Upload & Post-Verification Protocol

The release automation script (`pnpm release:counter`):
1. Builds the unsigned NSIS installer in production configuration (`COUNTER_ENV=prod`).
2. Computes the SHA-256 and SHA-512 hashes.
3. Generates `latest.yml` and `checksums.txt`.
4. Uploads assets to the public release repository.
5. **Downloads the public assets back from the CDN** and recalculates their hashes.
6. Fails with an alert if the remote assets differ from the generated build artifacts.
