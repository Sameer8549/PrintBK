# PrintBK

Self-service campus printing for students at HKBK Student Point, Bengaluru. Students scan a QR code, upload documents, pay by UPI or cash, and pick up their prints. Shopkeepers manage everything from a dashboard.

## Repository layout

```text
PrintBK/
├── student/   Student-side app (React 19 + Vite + Tailwind 4), exported from Figma Make
├── seller/    Shopkeeper dashboard (planned)
├── brand/     Original logo files (PNG and SVG)
└── README.md
```

## Run the student app

```bash
cd student
pnpm install
pnpm dev
```

See `student/README.md` for screens, structure and known limitations.
