# PrintBK Staff (counter app)

The shopkeeper's counter app for HKBK Student Point. One full page with a separate table for every service (B&W documents, Colour documents, Photos, Binding, Lamination, Scanning, Photocopy, Typing & custom requests). Orders are listed first uploaded first. Print rows have two controls, COLLECT CASH and APPROVE & PRINT; physical services have DONE; requests have SEND QUOTE. A NEXT UP bar and a Recently printed list sit on the page. No login: the app pairs once on first run.

## Status
- UI: complete (exported from Figma Make).
- Data: **still mock**. Orders, pickup codes, printing progress, Today and History numbers, printer discovery and the setup code check are simulated in `src/App.tsx`. They must be replaced by the real backend (see the backend prompt). No dummy order may remain in the final app.

## Changes made after the Figma export
- Keyboard shortcuts no longer fire while typing in a field, while a panel is open, on key repeat, or on a focused button (typing an order number and pressing Enter could previously approve a print).
- No crash when there are no orders at start.
- The new-order sound reuses one AudioContext.
- First-run pairing screen now shows only until the app has been paired.
- The design Components page is available only in development (`?view=components` in dev).
- Package renamed to `printbk-staff`; `typecheck` script added; site description updated.

## Run
```bash
pnpm install
pnpm dev
```

## Known to-do (handled by the backend prompt)
Real orders via the staff API, real printing through the print agent, real settings, real Today and History, pairing token, live updates, 5-minute file deletion after printing.
