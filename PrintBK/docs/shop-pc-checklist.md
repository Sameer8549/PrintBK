# Shop PC Daily Operations & Real-Printer Counter Checklist

> **PrintBK Shop Counter Operations Manual**  
> Use this checklist for onboarding a new shop counter PC and for daily opening verification before serving students.

---

## 1. Initial Shop PC Setup Checklist (One-Time)

| Step | Component | Action | Verification |
|------|-----------|--------|--------------|
| 1.1 | **Operating System** | Windows 10 or 11 (64-bit) with latest security updates | Check `winver` |
| 1.2 | **Node.js Runtime** | Install Node.js v18 or v20 LTS from [nodejs.org](https://nodejs.org) | Run `node -v` in terminal (should return `>= v18.0.0`) |
| 1.3 | **Printer Hardware** | Connect B&W laser printer & Colour printer via high-speed USB or Gigabit Ethernet | Printers appear in Windows *Settings → Bluetooth & devices → Printers & scanners* |
| 1.4 | **PDF Print Engine** | Install [SumatraPDF](https://www.sumatrapdfreader.org) for zero-dialog, silent physical printing | SumatraPDF located in standard path `C:\Program Files\SumatraPDF\SumatraPDF.exe` |
| 1.5 | **Agent Auto-Start** | Run `C:\PrintBK\agent\install-service.bat` as Administrator | Task `PrintBK_Agent` registered in Windows Task Scheduler (`schtasks /query /tn PrintBK_Agent`) |
| 1.6 | **Device Pairing** | On first startup, complete the pairing prompt via the system tray or Staff App | `%APPDATA%\PrintBK\agent-config.json` created with DPAPI-encrypted token |

---

## 2. Real-Printer Counter Step (Daily Opening & Physical Verification)

Before opening the counter to students each morning, staff must execute this **Real-Printer Counter Step**:

### Step 2.1: Verify Agent & Physical Printer Status
1. Inspect the Windows taskbar notification area (system tray):
   - Locate the **PrintBK icon**. Hover tooltip should state `PrintBK Agent (Online - N printers)`.
2. Open the **Staff Counter App** (`/staff/`):
   - Navigate to **Settings → Printers**.
   - Confirm status badge reads: `● PRINT AGENT ONLINE`.
   - In the **B&W Printer** dropdown, ensure the active laser printer is selected.
   - In the **Colour Printer** dropdown, ensure the active colour tank/inkjet is selected.

### Step 2.2: Physical Test Page
1. In the Staff App under **Settings → Printers**, click **TEST PRINT** for the primary B&W printer.
2. Confirm the physical printer wakes up immediately from sleep/standby and feeds 1 sheet:
   - Verify alignment: 12mm margins intact, crisp black text, no ghosting or toner streaks.
   - If paper jams or fails to feed, clear tray and check Windows print queue (`spoolsv`).

### Step 2.3: Official 1-Page A4 QR Poster Generation & Physical Printout
1. In the Staff App, navigate to **Settings → Shop Details** (or click the prominent **Print your QR** poster action).
2. Click **PRINT YOUR QR**:
   - The app dispatches the vector A4 poster job (595.28 × 841.89 pt) directly to the print agent spooler.
   - The agent prints exactly **1 page** on A4 paper with high-contrast, brand-coloured QR code (no cutoffs, zero second-page spillover).
3. Mount the printed poster at the counter checkout desk or student entry point at eye/counter level.

### Step 2.4: Phone Scanner Readability Verification
1. Open the native Camera app on an iPhone (iOS) and an Android smartphone.
2. Point each phone camera at the physical printed QR poster from a distance of 0.5m – 1.0m under ambient shop lighting:
   - The yellow/gold QR banner prompt must appear within **< 1 second**.
   - Tapping the banner must directly load the student app:
     `https://printbk-60074625517.development.catalystserverless.in/app/index.html`
   - Verify that the shop status indicator shows **OPEN** and the upload zone is active.

### Step 2.5: Low Toner & Paper Monitoring
- **Paper Tray**: Load tray with standard 75/80 GSM A4 paper. Keep an unopened ream adjacent to the printer.
- **Toner / Ink Level**: If prints show faint or fading text, replace cartridge immediately before peak student hours (exam/submission periods).
- **Spool Queue Health**: If Windows displays an error notification or a document hangs:
  1. Right-click the PrintBK system tray icon and select **Check for Update**.
  2. If a physical hardware jam occurred, clear the jam, open Windows *Printers & scanners → Open queue*, and restart the pending job.

---

## 3. Daily Shop Open / Close Operational Rules

1. **Morning Opening**:
   - Verify the 5 checks in Section 2 above.
   - In the Staff App header, toggle the shop switch to **OPEN**.
   - If opening earlier than scheduled hours, the switch engages the **"Open Now" Override** (active until scheduled closing time).
2. **Evening Closing**:
   - In the Staff App header, toggle the shop switch to **CLOSED**.
   - Manual **CLOSED** always takes immediate precedence over scheduled hours and overrides: all new student uploads and orders are blocked instantly (HTTP 503).
   - Outstanding queued jobs finish spooling and printing.
   - Staff confirms all pending cash orders are collected, then locks the terminal.
