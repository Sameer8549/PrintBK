# PrintBK — Student Side

PrintBK is a mobile-first self-service printing experience for students at HKBK Student Point, Bengaluru. Students can open the app from a shop QR code, upload documents or photos, configure print settings, review pricing, pay, and track an order through pickup without creating an account.

The interface uses the Paper & Ink visual system: warm paper surfaces, tactile ticket and receipt motifs, hard offset shadows, electric-lime primary actions, Space Grotesk headings, Inter body text, and JetBrains Mono for prices, counts, order numbers, and pickup codes.

## Tech stack

- React 19
- TypeScript 5.7
- Vite 8
- Tailwind CSS 4 through `@tailwindcss/vite`
- pnpm

## Install and run

Requirements:

- Node.js 24 (see `.mise.toml`)
- pnpm 10

```bash
cd student
pnpm install
pnpm dev
```

Vite prints the local development URL in the terminal. Changes in `src/` hot reload automatically.

Build the production app:

```bash
pnpm build
```

Format the project:

```bash
pnpm format
```

## Folder structure

```text
student/
├── .figma/make/          # Figma Make development and deployment helpers
├── public/
│   ├── assets/
│   │   └── printbk-logo.svg
│   └── favicon.svg
├── src/
│   ├── App.tsx           # Screens, flows, state, interactive prototype components
│   ├── index.css         # Paper & Ink tokens, typography, layouts, motion, responsive styles
│   ├── main.tsx          # React entry point
│   └── vite-env.d.ts
├── index.html            # HTML shell and mobile viewport metadata
├── package.json          # Scripts and dependencies
├── pnpm-lock.yaml        # Locked dependency graph
├── tsconfig.json         # TypeScript configuration
├── vite.config.ts        # Vite, React, Tailwind, and Figma Make configuration
├── .mise.toml            # Node and pnpm toolchain versions
└── README.md
```

## Screens and flows

- Splash
- Entry and shop status
- Basket
- Uploading, paused, retry, duplicate, and empty basket states
- File settings bottom sheet
- Visual page picker
- Print preview and one-tap fixes
- Price breakdown
- Other Services list, search, filters, and unavailable state
- Binding, lamination, scanning, typing, and custom-request sheets
- Photos presets and editable A4 live preview
- Passport, ID card, Aadhaar, resume, 4×6, and custom photo layouts
- Checkout
- UPI, wallet, cash, confirming, paid, and failed payment states
- Live order ticket
- Quote-pending ticket
- Printing, ready, collected, and printer-error states
- Receipt, printable PDF view, sharing, and report-a-problem flow
- History and wallet
- Settings
- Offline and empty states

## Prototype behavior

The app is a front-end prototype with realistic local state. Upload actions use the browser file picker, receipt sharing uses the Web Share API when available, pickup codes use the Clipboard API, and Save PDF opens a print-ready receipt through the browser print dialog. No production payment, printer, or backend service is connected.

## Branding

The official supplied HKBK/PrintBK mark is stored at `public/assets/printbk-logo.svg`. The SVG embeds the original PNG bytes without redrawing or altering the logo.

## Known limitations (next build stage)

This is a design-faithful front-end prototype. Before it talks to a real shop it still needs:

- A router (screens are currently switched by one `screen` state value, so there is no back button or deep link)
- Components split out of `App.tsx` into feature folders
- A real pricing engine, per-file settings state and a page-range parser (the order total is currently a fixed amount plus service prices)
- Persistent basket storage (IndexedDB) and real file previews
- A backend, payment verification, queue and print agent
- A seller-side app (planned as `../seller/`)
