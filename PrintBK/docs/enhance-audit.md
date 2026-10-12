# PrintBK Student App Enhancement, Architecture & Security Audit

**Date**: 2026-10-12  
**Target Environment**: Zoho Catalyst (`printbk-60074625517`)  
**Git Branch**: `feat/student-enhance-secure`  
**Engineer**: Principal Full-Stack & Security Engineer  

---

## 1. Scope & System Architecture

This audit examines the complete end-to-end flow of the PrintBK Student App:
1. **File Ingestion & Page Counting**: `student/src/lib/filePicker.ts`, `student/src/lib/pdfPages.ts`, `student/src/store/basket.ts`.
2. **Preview Engine**: `student/src/features/basket/Basket.tsx`, `student/src/features/preview/PrintPreview.tsx`, and PPTX viewer `@aiden0z/pptx-renderer`.
3. **Settings & Pricing Engine**: `student/src/components/ui/SettingsSheet.tsx`, `packages/shared/src/pricing.ts`, `packages/shared/src/schemas.ts`.
4. **Checkout & Payment Providers**: `student/src/features/checkout/Checkout.tsx`, `student/src/lib/payments/`, `functions/api/index.js`.
5. **Ticket, Receipt & State Lifecycle**: `student/src/features/order/Ticket.tsx`, `student/src/features/receipt/ReceiptSheet.tsx`, and Data Store schema in `functions/api/index.js`.
6. **Shared Imposition Engine**: `packages/shared/src/layout.ts`.

---

## 2. Audited Components & Code Findings

### 2.1 File Upload & Client Page Counting (`pdfPages.ts`, `store.ts`)
- **PDF**: Uses `pdf-lib` to load documents client-side and count `doc.getPageCount()`.
- **PPTX**: Uses `jszip` to scan `ppt/slides/slide*.xml` and count presentation slides accurately.
- **DOCX**: Unzips and inspects `word/document.xml`.
- **Images & Office Fallbacks**: Handled with fallback estimators.
- **Security Gap**: No archive entry count limit, maximum decompression size limit, or compression ratio check before unzipping PPTX/DOCX files. A malicious zip-bomb could cause client denial of service.

### 2.2 Preview & PPTX Rendering Engine (`Basket.tsx`, `PrintPreview.tsx`)
- In `Basket.tsx`, PDF preview uses PDF.js on `<canvas>`, while PPTX uses `@aiden0z/pptx-renderer` mounted inside `pptxContainerRef`.
- `PrintPreview.tsx` was a static placeholder mockup ("Sheet 2 of 9") without any real document rendering or page layout imposition.
- **Critical Root Cause of the PPT "Second Slide Sideways/Rotated" Bug**:
  1. **Presentation-Global Sizing**: `@aiden0z/pptx-renderer`'s `PptxViewer` computes container scale in `getDisplayMetrics()` using the presentation-wide `this.presentation.width` and `this.presentation.height` from `ppt/presentation.xml`.
  2. **Slide Dimension Mismatch**: When a presentation mixes landscape (e.g., 16:9 widescreen: 12192000 × 6858000 EMU) and portrait slides, or contains rotated slides/group transforms (`rot="5400000"`), `renderSingleSlide` creates a wrapper fixed to the global aspect ratio and scales it into that container.
  3. **Container State Persistence**: In `Basket.tsx`, the outer preview frame is hardcoded to `maxWidth: 320, minHeight: 180` (16:9). When switching from slide 1 to slide 2 via `goToSlide(page - 1)`, no per-slide dimensions or orientations are measured or adapted.
  4. **Absence of Shared Imposition Engine**: `packages/shared/src/layout.ts` only contained a mock `photoLayout` function. There was no layout engine calculating sheet positions, scale, or rotation for 1-up, 2-up, 4-up, or 6-up printing.

### 2.3 Mixed-Orientation PDFs & `/Rotate` Flags
- In `Basket.tsx`, `pageObj.getViewport({ scale: 2.0 })` respects the PDF `/Rotate` dictionary entry, but the preview canvas is constrained by the fixed container style (`maxWidth: 260, minHeight: 280`).
- When a document mixes A4 portrait (595 × 842 pt) and A4 landscape (842 × 595 pt) or A3 sheets, the canvas is scaled uniformly into a portrait frame, resulting in letterboxing or distorted aspect expectations.
- In print generation, without a sheet imposition engine, landscape pages printed on portrait sheets either clip or rotate incorrectly.

### 2.4 Lack of Per-Page Colour Selection
- `packages/shared/src/schemas.ts` and `pricing.ts` strictly defined `colorMode` as `'bw' | 'color' | 'auto'`.
- If an order has 30 pages and the student wants only Page 1 (cover) in colour and Pages 2–30 in B&W, the student is forced to pay for all 30 pages as colour (₹240) or print everything B&W.
- No UI exists in `SettingsSheet.tsx` for entering colour page ranges (e.g. `1, 5-7`) or visual thumbnail badges.

### 2.5 Receipt & Order ID Premature Reachability
- In `Checkout.tsx`, clicking checkout immediately invoked `api.createOrder()`, which wrote to the database and returned `orderId` and `orderNumber` before any payment option was executed.
- `router.tsx` routed directly to `/order/:id` (`Ticket.tsx`) which displayed the order number `#1037` and status `pending_cash` without an explicit user payment action.
- `ReceiptSheet.tsx` could be triggered directly via sheet state from any screen without verifying order token authorization or payment status.

### 2.6 Current UPI Behavior & Platform Differences
- `ManualUpiProvider.ts` hardcoded `upiId: 'printbk@upi'` in the client bundle.
- **Android**: Launching `upi://pay?pa=...` triggers Android's intent resolver if UPI apps (GPay, PhonePe, Paytm, BHIM) are installed. If none are installed, the browser throws `ERR_UNKNOWN_URL_SCHEME`.
- **iOS**: Apple Safari does not handle `upi://` generically and alerts "Safari cannot open the page because the address is invalid". iOS requires specific URL schemes (`gpay://`, `phonepe://`, `paytmmp://`) or a clean fallback (QR code / Copy UPI ID).
- **Payment Verification**: Neither client nor server possessed an intent return listener, claim state (`upi_claimed`), or staff verification gate.

---

## 3. Bug Reproduction Matrix & Action Plan

| ID | Issue Description | Root Cause | Target Fix Phase |
| :--- | :--- | :--- | :--- |
| **BUG-01** | PPTX slide 2+ rotated or sideways in preview and print layout | Fixed 16:9 container; `PptxViewer` global metrics; lack of per-slide dimension detection and shared imposition engine | **Phase 1** (`layoutSheets` engine + per-slide measurement + auto-orientation) |
| **BUG-02** | Mixed-orientation PDFs & `/Rotate` flags | No auto sheet-fit or rotation logic for N-up and duplex printing | **Phase 1** (`layoutSheets` with /Rotate normalization and duplex edge selection) |
| **BUG-03** | Inability to select per-page colour | Data model & pricing restricted to binary document-wide colorMode | **Phase 2** (`custom` colour plan, range parser, dual-rate pricing) |
| **BUG-04** | Receipt / Order ID visible before payment or cash choice | Order created and navigated to ticket before payment commitment | **Phase 3** (Strict state machine, receipt gating, token validation) |
| **BUG-05** | Fragile UPI URL scheme across Android & iOS | Generic `upi://` fails on iOS; no server-generated payload; no return listener | **Phase 3** (NPCI-compliant server payload, platform-aware intent, QR fallback) |

---

## 4. Test Fixtures Strategy

The following fixtures are being generated in `test-fixtures/`:
1. `mixed-slides.pptx`: Multi-slide presentation containing 16:9 landscape, 4:3 landscape, portrait slide, and rotated elements.
2. `rotate-0-90-180-270.pdf`: 4-page PDF with `/Rotate` flags at 0°, 90°, 180°, and 270°.
3. `mixed-a4-a3.pdf`: Multi-page document with alternating A4 and A3 page sizes.
4. `sample-10page.pdf`: Standard 10-page document for N-up, duplex, and custom colour range testing.
