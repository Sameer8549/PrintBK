# Architecture

## PrintBK Student App Architecture

The system is a zero-cost, serverless-based self-service print platform designed for the HKBK Student Point. It enables students to scan a QR code, upload documents, set print options, and pay, all while relying on robust edge computing and local agent processing to handle heavy computational loads securely.

### 1. Components
- **Student Frontend (`student/`)**:
  - React 19, Vite 8, Tailwind 4.
  - Deployed on **Cloudflare Pages**.
  - Client-side heavy lifting: Page counting, thumbnails, color-page detection, and orientation checks using `pdf.js` in a Web Worker (running on the student's phone).
  - PWA support (offline shell, background caching).
  - State management via Zustand (persisted via localStorage and IndexedDB) and TanStack Query.
- **Backend API (`backend/`)**:
  - TypeScript, Hono, Zod.
  - Deployed as a **Cloudflare Worker** on `workers.dev`.
  - Serves as the central state coordinator, orchestrating orders, pricing confirmation, and agent task leasing.
  - Implements Adaptive Short Polling to provide live status updates to the client while remaining well below the 100,000 requests/day Cloudflare Worker limit.
- **Database (`Cloudflare D1`)**:
  - Stores relational data: shops, shop_configs, devices, files, orders, order_items, service_lines, payments, and order_events.
- **File Storage (`Cloudflare R2`)**:
  - Stores uploaded documents.
  - Access is strictly mediated via short-lived pre-signed URLs.
  - Auto-deletion enforced through Cloudflare Cron Triggers.
- **Print Agent (`agent/`)**:
  - Node.js + TypeScript running on the shop PC.
  - Outbound HTTPS calls only. No open ports, no tunnels.
  - Heavy lifting (Desktop side): Converts DOCX/PPTX/XLSX to PDF via headless LibreOffice.
  - Final PDF compilation: Page ranges, N-up, booklet, duplex using `pdf-lib`/`qpdf`.
  - Dispatches to the local printer (Windows SumatraPDF / CUPS `lp`).
- **Shared Package (`packages/shared/`)**:
  - Types, Zod schemas, pricing engine (`priceOrder`), page-range parser, layout math.
  - Utilized by both Frontend (for instant display) and Backend (for authoritative validation).

### 2. Constraints & Trade-offs
- **Zero Cost**: Only Cloudflare's free tiers are utilized. D1, R2, and Workers limits dictate the polling strategy (adaptive backoff) and storage lifecycle (aggressive cleanup).
- **Auto-Deletion**: Security and storage limits demand that files are deleted a few minutes after printing everywhere (R2, Agent, and Previews). Handled heavily by Cloudflare Cron triggers and agent sweeps.
- **Heavy Compute Delegation**: Since Cloudflare Workers have tight CPU time limits (10-50ms), CPU-intensive tasks like image processing, PDF page counting, and file rendering are shifted entirely to the Student's phone (via Web Workers) and the Print Agent.
- **Polling over WebSockets**: Cloudflare Workers WebSocket connections can drain resources and limits quickly on the free tier. Adaptive short polling with ETags/304s is used for tracking order statuses.
- **Data Persistence**: With no sign-up required, devices use anonymous Web Crypto signed tokens, and cart state is kept locally on the device (IndexedDB/localStorage) to survive tab closures.

### 3. Payment Integration
- Payments implement a `PaymentProvider` interface to remain agnostic.
- **Active**: `ManualUpiProvider` (Intent and QR based) and `CashProvider`.
- **Dormant**: `RazorpayProvider` (Server-side HMAC-SHA256 signature verification). Kept behind a feature flag and secrets check.

### 4. Fallback Architecture
If free limits are ever breached, the platform components abstractly utilize `StorageProvider`, `DatabaseClient`, and `PaymentProvider`, ensuring they can be ported to a docker-compose deployment (e.g., on a 2GB DigitalOcean Droplet using Postgres and local storage).

### Checklist
- [x] Phase 0: Audit and Plan
  - [x] Create `docs/audit.md` (screen inventory, mock data, dead buttons, CSS classes)
  - [x] Capture 390x844 screenshot of EVERY screen and state (light and dark) into `docs/design/student/baseline/`
  - [x] Write `docs/architecture.md` and a task checklist
- [ ] Phase 1: Restructure the Frontend (No Visual Change)
- [ ] Phase 2: Shared Logic (packages/shared)
- [ ] Phase 3: Backend (Cloudflare Worker API)
- [ ] Phase 4: Payments (Manual UPI, Cash, Razorpay dormant)
- [ ] Phase 5: Print Agent
- [ ] Phase 6: Connect the Frontend
- [ ] Phase 7: Temporary Shop Tooling
- [ ] Phase 8: PWA, Performance, Accessibility, Privacy
- [ ] Phase 9: Testing and CI
- [ ] Phase 10: Deployment
- [ ] Phase 11: Final Verification and Handoff
