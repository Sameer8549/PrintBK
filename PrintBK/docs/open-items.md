# PrintBK — Open Items & Finish-Everything Inventory

**Date:** October 20, 2026  
**Auditor:** Principal Full-Stack & Release Engineer  
**Status:** Canonical Release Gate Assessment

---

## 1. Executive Summary

This inventory audits the entirety of the PrintBK repository across all sub-systems:
1. **Student Web App** (`student/`)
2. **Staff Counter App** (`staff/`)
3. **Backend API Functions** (`functions/api/`)
4. **Desktop Windows Counter App** (`counter-app/`)
5. **Print Agent Daemon** (`agent/` and `counter-app/src/agent/`)
6. **Shared Imposition & Pricing Engine** (`packages/shared/`)
7. **Unified Client & Deployment Pipeline** (`client/`, `scripts/`)

Per the project directive, **three items are explicitly deferred by design**:
1. **Custom Domain `printbk.tech`**: Parked for future activation; all URLs are driven by environment configuration to use default Catalyst production URLs without code edits.
2. **Code Signing of Installer**: Unsigned for initial release; build hooks and NSIS configurations remain ready for certificate injection.
3. **Razorpay Live API Keys**: Online payment provider remains built and dormant; zero-fee UPI and cash workflows are live and fully verified.

All other features, requirements, and hardening gates must be 100% complete with empirical evidence.

---

## 2. Monorepo Marker Audit (TODO, FIXME, Mocks, Stubs)

A comprehensive regex sweep was conducted across all source files (`.ts`, `.tsx`, `.js`, `.mjs`, `.html`, `.css`, `.json`):

| Search Pattern | Scope | Occurrences Detected | Status / Resolution |
|----------------|-------|----------------------|---------------------|
| `TODO` | All production source files | 0 | ✅ CLEAN |
| `FIXME` | All production source files | 0 | ✅ CLEAN |
| `XXX` | All production source files | 0 | ✅ CLEAN |
| `not implemented` | All production source files | 0 | ✅ CLEAN |
| `coming soon` | All production source files | 0 | ✅ CLEAN |
| `stub` | All production source files | 0 | ✅ CLEAN |
| `test.skip` / `it.skip` | All test suites | 0 | ✅ CLEAN |
| `disabled` without reason | All UI components | 0 | ✅ Verified: All disabled buttons have explicit semantic reasons (`loading`, `busy`, `!fileUrl`, `!query.trim()`) |
| Mock data / test fixtures | Production bundles | 0 | ✅ Verified: `no-mock-data.mjs` passes with zero violations |

---

## 3. End-to-End Subsystem Feature Status Matrix

### A. Student Web Application (`student/`)

| Feature | Promised Behavior | Status | Verification Evidence |
|---------|-------------------|:------:|-----------------------|
| Multi-format File Upload | PDF, DOCX, PPTX, JPG, PNG, WEBP, HEIC | **DONE** | Tested via `verify-upload-sizes.mjs` & `verify-photo-upload-and-bw.mjs` |
| Ultra HD 300 DPI Previews | Crisp non-blurry page rendering on all devices | **DONE** | Verified via `verify-ultrahd-and-preview.mjs` with screenshots |
| Imposition Modes | 1-up, 2-up, 4-up, 6-up, Booklet, Handout | **DONE** | Tested in `verify-phase5-layouts.mjs` |
| Custom Page Color Plan | Granular per-page B&W vs Colour pricing | **DONE** | Tested via `add-custom-color-vectors.mjs` |
| A3 Paper Support | 2× pricing formula, visual sheet watermark, aspect adaptation | **DONE** | Tested via Playwright in `verify-overlap-and-payment.mjs` |
| Photo Studio Suite | Passport 8-up, Stamp 16-up, Wallet 4-up, 4×6, 5×7, 6×8, 8×10 | **DONE** | Tested in `verify-photo-upload-and-bw.mjs` |
| Value-Added Services | Spiral binding, Lamination, Scanning, Typing requests | **DONE** | Verified in basket sheets and orders table |
| Payment Selection | UPI Intent / QR (zero fee) and Cash at Counter | **DONE** | Tested via `test-upi-and-gating.mjs` |
| Return-from-UPI Guard | No premature auto-confirmation; explicit confirmation card | **DONE** | Verified via Playwright in `verify-overlap-and-payment.mjs` |
| Layout Zero-Overlap | Scroll padding bottom 240px; >224px clearance above sticky bar | **DONE** | Verified via Playwright bounding boxes |
| Receipt & Order Ticket | Live pickup codes, queue progress, auto-delete notice | **DONE** | Verified in `receipt-confirmed.png` |

---

### B. Staff Counter Application (`staff/`)

| Feature | Promised Behavior | Status | Verification Evidence |
|---------|-------------------|:------:|-----------------------|
| Live Orders Board | Auto-refreshing queue, order #, payment badge, amount, controls | **DONE** | Verified in `staff-layout-clean.png` |
| B&W and Colour Printer Routing | Separate queue assignments and Windows printer selection | **DONE** | Tested via `test-staff-api.mjs` |
| Test Print Diagnostics | Instant 1-click test pages to verify printer readiness | **DONE** | Tested via `testprint.js` |
| Shop Open/Closed Toggle | Instant real-time barrier sync to student web app | **DONE** | Tested in `verify-live-catalyst-settings.mjs` |
| Printable Shop QR Poster | A4 vector PDF download and browser print modal | **DONE** | Tested via `verify-qr-download.mjs` |
| Responsive Layout & Typography | No button overflow, no clipped topbar actions, font-weight 800 | **DONE** | Verified in `verify-overlap-and-payment.mjs` |
| Paired Counter Detection | Identify PrintBKCounter app vs normal web browser | **NOT DONE** | **Phase 2 Scope**: Needs UA token & preload flag detection |
| Public Download Landing Page | Polished Paper & Ink installer download page for unpaired browsers | **NOT DONE** | **Phase 2 Scope**: To be built in `staff/` |

---

### C. Desktop Counter Application & Print Agent (`counter-app/`)

| Feature | Promised Behavior | Status | Verification Evidence |
|---------|-------------------|:------:|-----------------------|
| Single Windows Installer | 1-click NSIS installer containing Node, Electron, SumatraPDF, agent | **DONE** | Packaged via `pnpm --filter printbk-counter dist` |
| Single Setup Code Pairing | Single COUNTER_SETUP_CODE pairs staff window & background agent | **DONE** | Tested via `test-counter-pairing.mjs` |
| Auto-Start with Windows | Registers login startup and starts minimized to system tray | **DONE** | Verified in `agentSupervisor.ts` & `main.ts` |
| Crash Watchdog & Restart | Automatic agent respawn upon abnormal termination | **DONE** | Verified in `agentSupervisor.ts` |
| Silent PDF Printing | Bundled SumatraPDF with duplex, color, copies, and profile mapping | **DONE** | Verified via `sumatra.ts` |
| LibreOffice DOCX/PPTX Conversion | Native LibreOffice silent conversion with built-in fallback | **DONE** | Verified in `converter.ts` |
| Protocol Handler `printbk-counter://` | Open/focus running Counter app from web browser | **NOT DONE** | **Phase 2 Scope**: Add NSIS protocol registration |
| Public Release Hosting & Hashes | Hosted GitHub Release with SHA-256, SHA-512 in latest.yml | **NOT DONE** | **Phase 3 Scope**: To be executed in Phase 3 |

---

### D. Backend API Functions (`functions/api/`)

| Feature | Promised Behavior | Status | Verification Evidence |
|---------|-------------------|:------:|-----------------------|
| Multi-Device Pairing API | `POST /counter/pair` with rate-limiting and audit log | **DONE** | Tested via `test-counter-pairing.mjs` (8/8 tests pass) |
| Dual Device Revocation | `POST /staff/counters/:id/revoke` revokes agent & staff instantly | **DONE** | Tested via `test-counter-pairing.mjs` |
| Version Info Endpoint | `GET /counter/version` returning latest version, SHA-256, download URL | **DONE** | Tested via `test-counter-pairing.mjs` |
| CORS & Security Headers | Allow only configured origins, strict CSP, nosniff, DENY frame | **PARTIAL** | **Phase 1 Scope**: Drive origins strictly from production URLs |
| Production Environment Config | All cross-app URLs driven by environment variables | **NOT DONE** | **Phase 1 Scope**: Set student, staff, and release feed URLs |
| Pre-Flight & Production Deploy | Deploy to Catalyst Production and smoke-test | **NOT DONE** | **Phase 4 Scope**: Deployment with user confirmation |

---

## 4. Phase-by-Phase Execution Plan to Complete All Items

- [x] **Phase 0: Audit & Open Items Inventory** (Completed here)
- [ ] **Phase 1: URLs as Configuration (Domain-Ready)**
  - Unify `STUDENT_APP_URL`, `STAFF_APP_URL`, `API_BASE_URL`, `DOWNLOAD_URL`, `UPDATE_FEED_URL` across monorepo.
  - Set production defaults to default Catalyst production URLs (`printbk-60074625517.catalystserverless.in`).
  - Configure CORS, CSP, noindex on staff site, SEO metadata on student site.
  - Document domain switch in `docs/domain-later.md`.
- [ ] **Phase 2: Staff Site Download Page & Counter Detection**
  - Implement detection: `PrintBKCounter/<version>` UA and `window.printbkCounter`.
  - Build Download Page in Staff app for unpaired browser visits.
  - Retain "Owner on a phone? Pair this browser" setup code flow.
  - Implement and register `printbk-counter://` protocol handler.
- [ ] **Phase 3: Release Hosting & Complete Hash Verification**
  - Configure release metadata and download URLs.
  - Generate SHA-256 and SHA-512 for installer and third-party binaries.
  - Document all hashes in `docs/integrity.md`.
  - Author automated release script `pnpm release:counter` and `RELEASE.md`.
- [ ] **Phase 4: Pre-Flight, Production Deployment, and Verification**
  - Execute full pre-flight checklist.
  - Provide click-by-click Catalyst console steps for human administrator.
  - STOP for final human authorization.
  - Run production deployment and execute `scripts/verify-production.mjs`.
- [ ] **Phase 5: Finish-Everything Sweep**
  - Verify every screen, viewport, and edge case against live production endpoints.
  - Capture final proof in `docs/completion-checklist.md`.
- [ ] **Phase 6: Final Documentation & Pull Request**
  - Update all runbooks and open PR from `feat/release-and-finish`.
