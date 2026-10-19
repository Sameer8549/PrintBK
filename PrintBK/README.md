# PrintBK — Campus Print Hub

> Real-time, zero-mock, end-to-end automated campus printing system for HKBK Student Point, Bengaluru.
> Built on Zoho Catalyst Serverless, React 19, and a native Windows Print Agent.

---

## Architecture Overview

PrintBK connects students, counter staff, and shop printers in real-time with **zero dummy data, zero simulated printing, and zero fake timers**:

```
PrintBK/
├── student/          # React 19 + Vite student web app (QR entry, upload, layout engine, UPI intent & cash)
├── staff/            # React 19 + Vite counter staff app (real-time delta feed, payment verify, approve & print)
├── counter-app/      # Electron Windows desktop counter wrapper (supervisor, silent printing, one-code setup)
├── agent/            # Node.js TypeScript Windows print agent (outbound HTTPS, silent SumatraPDF spooling)
├── functions/api/    # Zoho Catalyst serverless backend (ZCQL Data Store, File Store, Cron, capability tokens)
│   ├── index.js      # Public student API, upload with magic-byte checks, orders, UPI flow, auto-delete
│   ├── staff.js      # Staff pairing, real-time live feed delta (/staff/live), cash collect, undo, approve
│   ├── counter.js    # Unified counter pairing, rate-limiting, and version check (/counter/pair)
│   └── agent.js      # Shop PC agent registration, job poll (/agent/jobs/poll), progress reporting
├── packages/shared/  # Shared TypeScript/Zod schemas, pricing engine, typed order item mappers
├── scripts/          # CI, verification and packaging scripts
└── docs/             # Technical specifications, release guide, and runbooks
```

---

## Key Features

1. **Strictly Real-time & Zero Mocks**: Every number, timer, and order status displayed on screen is backed by the authoritative server state.
2. **Student Privacy**: Strict 5-minute file auto-deletion rule after printing completes (`printed_at + 300s`) with an absolute 60-minute ceiling from upload.
3. **One-Time Pairing (No Login)**: Counter PC pairs once via `STAFF_SETUP_CODE` and receives a high-entropy device token (`X-Staff-Device-Token`).
4. **Outbound HTTPS Agent**: Windows print agent polls `/agent/jobs/poll` over outbound HTTPS. No inbound ports, public IPs, or firewall pinholes required.
5. **Direct Silent Printing**: Uses SumatraPDF on Windows for silent command-line printing directly to designated B&W or Colour printers without print dialogs.
6. **Robust Error Handling**: Server-enforced state transitions (invalid transitions return 409 Conflict), 5-second undo window for staff actions, and offline recovery with exponential backoff.

---

## Getting Started

### 1. Prerequisites
- Node.js 18+ LTS
- pnpm 10+ (`npm install -g pnpm`)

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Running Applications Locally

#### Student App
```bash
cd student
pnpm dev
# Opens at http://localhost:5173
```

#### Staff Counter App (Web)
```bash
cd staff
pnpm dev
# Opens at http://localhost:5174
```

#### PrintBK Counter (Single Windows Desktop Application)
```bash
# Build Development Installer
pnpm build:installer:dev

# Build Production Installer
pnpm build:installer:prod
```
The output installer is generated at `counter-app/dist/installer/PrintBK-Counter-Setup-1.0.0.exe`.

---

## Verification & Testing Suites

### 1. End-to-End Real-Time Integration Test
Verifies the complete 12-step lifecycle across student order creation, UPI intent, live feed delta delivery, counter approval, agent polling and execution, physical service completion, cash collect/undo, and 5-minute file deletion:
```bash
node scripts/e2e-live.mjs
```

### 2. Desktop Counter E2E Field Verification
Verifies clean install, one-code dual-pairing, printer detection, direct launch into Orders queue, tray minimize, supervisor auto-restart, and persistence across relaunch:
```bash
node scripts/verify-counter-app.mjs
```

### 3. CI Mock Data Gate (`no-mock-data.mjs`)
Verifies that no mock markers, simulated timers, or sample order datasets exist in source code or production bundles:
```bash
node scripts/no-mock-data.mjs
```

### 4. Production Builds
```bash
pnpm -C student run build
pnpm -C staff run build
pnpm build:installer:prod
```

---

## Documentation

- [Shop PC Setup Checklist](docs/shop-pc-checklist.md) — 3-step shopkeeper onboarding guide for the Windows installer.
- [Release Guide](docs/RELEASE.md) — Building, version bumping, and SmartScreen bypass guide.
- [Installer Architecture Audit](docs/installer-audit.md) — Architecture decision record and electron-builder design.
- [Production Runbook](docs/runbook.md) — Workstation management, pairing, and credential rotation.
- [Security & Reliability Audit](docs/security-audit.md) — Capability tokens, rate limits, audit events, and crash resistance.
- [Data Model & State Machine](docs/data-model.md) — ZCQL tables, item kinds, and transition rules.
- [Environment Configuration](docs/environment.md) — Catalyst environment variables and secrets.
