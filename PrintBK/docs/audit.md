# Frontend Audit

## Screen Inventory & State
The current application renders all screens from `student/src/App.tsx`, controlled by the `screen` state inside the `App` component.

| Screen State | Component | Description |
|---|---|---|
| `splash` | `Splash` | Initial loading screen warming up printer. |
| `entry` | `Entry` | Home page showing queue status, drop zone, and tabbed categories (Documents, Photos, Other Services). |
| `uploading` | `Uploading` | File preparation UI with progress bars, pause/resume, retry states. |
| `basket` | `Basket` | Pre-checkout list of files and active services (addons and walkins). |
| `empty` | `EmptyBasket` | View when basket has no files. |
| `preview` | `PrintPreview` | Visual print preview with warnings (blank pages, tiny text, rotation) and fixes. |
| `services` | `OtherServices` | Catalog of extra services with search and filtering. |
| `photo` | `PhotoTool` | Photo editing and preset layout tool with visual slot manipulation. |
| `checkout` | `Checkout` | Payment method selection (UPI, Cash, Wallet). |
| `confirming` | `PaymentState` | Interim state waiting for payment verification. |
| `paid` | `PaymentState` | Success screen showing PAID stamp. |
| `failed` | `FailedPayment` | Payment failure fallback (wallet insufficient funds). |
| `ticket` | `Ticket` | Live order tracking with progress stages (Queued, Printing, Ready). |
| `quoteTicket` | `QuoteTicket` | Tracking screen for request-type services waiting for quotes. |
| `orderError` | `OrderError` | Paper jam/error state. |
| `history` | `History` | Past orders and wallet balance. |
| `settings` | `Settings` | App settings, language, theme. |

## Sheets & Modals
Controlled by `sheet` state:
- `settings`: `SettingsSheet` - Print options (Colour, Sides, N-up).
- `picker`: `PickerSheet` - Visual page picker (Odd, Even, 1-5, Custom).
- `breakdown`: `BreakdownSheet` - Detailed price itemisation and savings tips.
- `receipt`: `ReceiptSheet` - Digital PDF receipt for download/share.
- `report`: `ReportSheet` - "Report a problem" form.
- `binding`: `BindingSheet` - Binding service configurator (Spiral, Comb, Staple).
- `lamination`: `LaminationSheet` - Lamination options (ID, A4, A3).
- `scanning`: `ScanningSheet` - Scanning to PDF options.
- `typing`: `TypingSheet` - Request typing/resume quote.
- `custom`: `CustomRequestSheet` - Custom request quote form.

## Hard-coded / Mock Data
- **Global:**
  - Order total defaults to `86`.
  - Wallet balance mock defaults to `42`.
  - Phone number prefix mock `+91`.
- **Files (`files` array):**
  - "Engineering_Mathematics_Unit-4.pdf" (40 pages, B&W, 2-up, Double-side, ₹18)
  - "Thermodynamics_Lab_Record.docx" (18 pages, Auto colour, Single-side, ₹54)
  - "ID_card_front.png" (1 page, Colour, A4, ID card size, ₹14)
- **Services (`services` array in `OtherServices`):**
  - Prices (`₹5`, `from ₹30`), Names (`Spiral binding`), Details (`Neat, flexible binding...`).
- **Ticket Stages:** Hard-coded `stage` state transitioning using `setTimeout` (from 0 to 2).
- **Payment Success:** Transition to `paid` and `ticket` uses `setTimeout` inside `PaymentState`.
- **Receipt:** `printReceipt` creates a hardcoded HTML document with order #1042 and mocked line items.
- **Preview Warnings:** `warnings` array in `PrintPreview`.

## Dead Buttons / No-op Interactions
- `shareReceipt` uses `navigator.share` or clipboard but data is mocked.
- Download/PDF buttons trigger `printReceipt()` which is fake HTML.
- In `Ticket`, copying pickup code is functional to clipboard but has no actual code source (`4821`).
- Notification icons (`notify` function) dispatch `printbk:toast` to show fake toasts for saving settings, fixing pages, pausing uploads.
- Wallet payment option immediately transitions to `failed` screen.
- The Theme toggle in `Settings` only toggles fake state and doesn't change `index.css` variables dynamically.
- "Clear device data" shows an alert toast.
- The photo file upload triggers a dummy state change but does not parse actual image blobs.
- Support link "Printer issue?" goes to `orderError` (paper jam).

## CSS Class Groups Per Screen
- **Global / Shell:** `.topbar`, `.icon`, `.brand`, `.mobile-nav`, `.sheet`, `.sheet-layer`
- **Splash:** `.splash`, `.splash-rings`, `.paper-feed`
- **Entry:** `.entry`, `.shop-intro`, `.drop-zone`, `.reprint-card`, `.printer-note`, `.price-strip`
- **Other Services:** `.other-services-page`, `.services-hero`, `.service-search`, `.service-filters`, `.service-list`, `.custom-service-row`
- **Upload:** `.upload-page`, `.upload-heading`, `.upload-stack`, `.upload-card`, `.progress`, `.upload-foot`
- **Preview:** `.preview-page`, `.preview-label`, `.a4-preview`, `.pager`, `.warning-list`
- **Basket / Files:** `.has-dock`, `.basket-heading`, `.file-list`, `.file-card`, `.attached-service`, `.bottom-dock`
- **Checkout:** `.checkout-ticket`, `.payment-section`, `.payment-row`, `.phone-field`
- **Ticket / Receipt:** `.ticket-page`, `.order-ticket`, `.step-track`, `.ticket-files`, `.pdf-receipt`, `.receipt-code`
- **Settings Sheet:** `.setting-group`, `.preview-strip`, `.range-input`, `.chip-row`
- **Photo Tool:** `.photo-tool`, `.photo-canvas`, `.photo-toolbar`, `.zoom-slider`, `.photo-grid`
- **Empty / Error:** `.state-page`, `.empty-state`, `.failure-state`, `.jam-visual`
