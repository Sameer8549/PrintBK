# PrintBK End-to-End Real-Time Audit & Architecture Specification

**Date**: 2026-10-14  
**Target Environment**: Zoho Catalyst Serverless (`printbk-60074625517`)  
**Git Branch**: `feat/end-to-end-realtime`  
**Engineer**: Principal Full-Stack & Security Engineer  

---

## 1. Executive Summary & Verification of Student Enhancement

We audited all components of PrintBK to establish the baseline for real-time, zero-mock, end-to-end operation across the **Student Web App**, **Staff Counter App**, **Zoho Catalyst Backend**, and **PC Print Agent**.

### 1.1 Prerequisites Verification (Phase 0 Step 1)
All student enhancement prerequisites were verified and are present in the repository:
- **UPI States**: `pending_payment`, `pending_cash`, `upi_started`, `upi_claimed`, `processing`, `printing`, `ready`, `completed`, `cancelled`, `rejected`, `failed`, `expired` defined in `packages/shared/src/schemas.ts` and enforced in `functions/api/index.js`.
- **Typed Order Items by Kind**: `packages/shared/src/orderItems.ts` maps basket files and services into typed items: `document_bw`, `document_colour`, `photo`, `binding`, `lamination`, `scanning`, `photocopy`, `typing_custom`. All unit tests (`packages/shared/src/orderItems.test.ts`) pass.
- **Per-Page Colour Plan**: `ColorPlanSchema` in `packages/shared/src/schemas.ts` and dual-rate pricing calculation (`packages/shared/src/pricing.ts`) allowing custom colour page ranges (e.g., Cover colour, rest B&W) with tests passing.
- **Shared Layout Engine**: `packages/shared/src/layout.ts` (`layoutSheets`) calculating physical sheet layouts, N-up placement, booklet imposition, auto-rotation, and margin bounding. 14 unit tests pass.
- **Strict Receipt Gating Rule**: Gated in `functions/api/index.js` and `student/src/features/receipt/ReceiptSheet.tsx` (receipts and order numbers only accessible post payment commitment).

---

## 2. Component Audits

### 2.1 Backend (`functions/api/index.js` & Catalyst Architecture)
- **Runtime**: Node 18 Express running on Zoho Catalyst Basic I/O function.
- **Data Store**: ZCQL tables `orders`, `files` (metadata), `order_events` (audit).
- **Authentication**:
  - Student: Capability token (`X-Order-Token` per order, `order_token` stored in cookie/header).
  - Staff: Currently uses shared `STAFF_TOKEN` environment variable with IP/token exponential backoff lockout.
- **Current Limitations to Upgrade**:
  - Staff currently polls or calls single endpoints. Needs `/server/api/staff/pair` (setup code to long-lived device token hash), `/staff/live` (delta feed with ETag/cursor), and typed action endpoints (`approve-print`, `collect-cash`, `retry-print`, `done`, `send-quote`, `reject`, `undo`).
  - No `order_items`, `print_jobs`, `staff_devices`, `agent_devices`, `printers`, or `shop_settings` tables yet.
  - File retention is currently global 60-minute cron. Needs item-specific `delete_after = printed_at + 5 minutes`.

### 2.2 Staff App (`staff/src/App.tsx`)
- **Framework**: React 19, Vite 8, Tailwind v4.
- **Current State**: Visual prototype from Figma Make. All data is mock.
- **UI Structure**:
  - One-page dashboard with dynamic tables per service (B&W Documents, Colour Documents, Photos, Binding, Lamination, Scanning, Photocopy, Typing & Custom Requests).
  - Next Up bar at the bottom.
  - Recently printed dropdown with 5-minute countdown.
  - Slide-out panels: Order Details, Printer Settings, Today Analytics, Order History, Setup Wizard, and Dev Components page.
- **Layout & Readability Flaws (to fix in Phase 4)**:
  - Text floors below 14px/16px (10px headers, 9px chips, 11px progress).
  - Column overflow on Order # (40px mono in 108px col) and Amount (88px col).
  - Approve & Print button wrapping inside 170px slot.
  - Tables grid constrained to 2 columns on 1440px displays with nested 480px scrolling containers.

### 2.3 Print Agent (`agent/`)
- **Current State**: Package skeleton exists (`agent/package.json`, `agent/src/index.ts`).
- **Target Architecture**:
  - Outbound HTTPS long-polling/adaptive short-polling to `/agent/jobs/next`.
  - Windows SumatraPDF CLI integration (`-print-to "PrinterName" -print-settings ...`).
  - Early preparation of jobs upon `pending_cash` / `upi_claimed`.
  - LibreOffice / Office headless conversion for DOCX/PPTX to PDF.
  - Immediate temp file deletion after print; reporting progress (`pages_done / pages_total`).

---

## 3. Comprehensive Mock Data Inventory

Every item below must be eliminated from production bundles and replaced with real backend data:

| Location | Identifier / Data | Description | Real Replacement |
| :--- | :--- | :--- | :--- |
| `staff/src/App.tsx:44-46` | `pickupCodes` | Hardcoded map of orders 1019–1026 to pickup codes (`4821`, `1194`, etc.) | Backend `order.pickup_code` |
| `staff/src/App.tsx:115-218` | `initialJobs` | Hardcoded array of 9 mock jobs across all services | `/staff/live` items array |
| `staff/src/App.tsx:772-780` | `todayHistory` | 7 hardcoded past order records | `GET /staff/history` |
| `staff/src/App.tsx:801-845` | `TodayView` hardcoded metrics | `₹3,240`, `41`, `624`, `6m 42s`, `₹1,102`, `₹2,138`, `52 of 52` | `GET /staff/today` real KPI aggregation |
| `staff/src/App.tsx:915-920` | `OwnerPhoneView` printed fallback | Mock job `#1014`, pickup `5520`, expiresAt `+180000` | Real `recentlyPrinted` list |
| `staff/src/App.tsx:1243-1259` | `action()` fake timers | `setTimeout` 700ms (Printing 14/30), 2600ms (PRINTED), 3000ms removal | Real agent progress updates via `/staff/live` |
| `staff/src/App.tsx:444-447` | `PrinterSettingsPanel` scanning timer | `setTimeout(700ms)` simulating looking for printers | Real agent heartbeat printer list |
| `staff/src/App.tsx:469-470` | `onTest` simulation | Hardcoded string toggle: "Printed correctly" vs "Something is wrong" | Real test print job queued to agent |
| `staff/src/App.tsx:331` | `PrinterDropdownRow` hardcoded options | Static list: "EPSON L3110 Series", "Microsoft Print to PDF", "Canon G3010 Series" | Real printers reported by agent |
| `staff/src/App.tsx:402-403` | Default rates and shop info | Static rates and HKBK campus address/phone in state | `GET /staff/settings` from `shop_settings` table |
| `staff/src/App.tsx:1160-1162` | `SetupFlow` fake verification | `code.length < 4` without server exchange | `POST /staff/pair` exchanging `STAFF_SETUP_CODE` |
| `staff/src/App.tsx:870` | `HistoryView` fake loading | `setTimeout(450ms)` simulating DB query | Real fetch to `/staff/history` |
| `staff/src/App.tsx:1208-1224` | Sound chime | Inline Web Audio oscillator | Reusable audio chime tied to real new orders |
| `student/src/lib/payments/RazorpayProvider.ts` | `contact: '9999999999'` | Mock phone number in dormant payment provider | Real student phone if saved, or omit |

---

## 4. CI Mock Data Enforcement Strategy

A new script `scripts/no-mock-data.mjs` will be introduced. It will:
1. Scan `staff/src` and `student/src` for all blacklisted mock identifiers (`initialJobs`, `todayHistory`, `pickupCodes`, `sample-10page`, `Printing 14/30`, `Mechanics Unit 3 notes`, etc.).
2. Exclude test directories (`tests/`, `*.test.ts`, `*.spec.ts`) and dev-only components (`ComponentsPage`).
3. Check the production build bundle (`dist/assets/*.js`) to guarantee that zero mock fixtures are packaged into production assets.
4. Fail with exit code 1 if any mock data or markers are detected.
