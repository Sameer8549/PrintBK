# PrintBK Shop PC Print Agent — Setup & Operational Guide

The PrintBK Print Agent is an outbound-only Windows background service that runs on the shop counter PC. It communicates exclusively via outbound HTTPS requests to the Zoho Catalyst backend, discovering installed Windows printers, downloading customer files into encrypted memory/temporary storage, executing silent direct printing via SumatraPDF CLI, and immediately destroying local files upon completion.

---

## 1. System Architecture & Working Rules

- **Zero Inbound Ports / No Tunnels**: The agent makes only outbound HTTPS requests (`/server/api/agent/*`). No firewall port forwarding, DynDNS, or tunnels (e.g. ngrok) are required.
- **Direct Silent Printing**: Uses the lightweight [SumatraPDF](https://www.sumatrapdfreader.org/) CLI for silent background printing without opening any print dialogs or UI windows.
- **Zero Mock / Server Authoritative**: Every print job, progress tick (`pages_done / pages_total`), and status state is authoritatively tracked in Zoho Catalyst (`print_jobs` and `order_items` tables).
- **Strict Privacy & Auto-Deletion**:
  - Immediately after printing, local temporary files are deleted from the PC.
  - The server automatically schedules cloud file deletion at `printed_at + 5 minutes`.
  - A startup and 60-second sweeper eliminates any abandoned temporary files older than 5 minutes.

---

## 2. Installation & Prerequisites

### Prerequisites
1. **Node.js**: v18.0.0 or higher (v20+ recommended).
2. **SumatraPDF**: Download and install SumatraPDF (64-bit). The installer places it in `C:\Program Files\SumatraPDF\SumatraPDF.exe`.
3. **LibreOffice (Optional for Office formats)**: If students upload `.docx`, `.pptx`, or `.xlsx` files, install LibreOffice to enable headless conversion via `soffice.exe`.

### Installation Steps

1. Clone or copy the repository onto the Shop PC:
   ```powershell
   cd C:\PrintBK
   pnpm install
   ```

2. Build the shared schemas and agent package:
   ```powershell
   pnpm --filter @printbk/shared run build
   pnpm --filter agent run build
   ```

3. Create the initial `agent-config.json` in `PrintBK\agent\agent-config.json` (or use environment variables):
   ```json
   {
     "apiBase": "https://printbk-60074625517.development.catalystserverless.in",
     "agentSetupCode": "PBK-SETUP-9021",
     "deviceLabel": "HKBK Counter Shop PC",
     "dryRun": false,
     "printerProfiles": {
       "bw": "HP LaserJet M1005 (B&W)",
       "colour": "EPSON L3150 Series (Colour)",
       "photo": "EPSON L3150 Series (Colour)"
     }
   }
   ```

4. Run the initial pairing test:
   ```powershell
   cd C:\PrintBK\agent
   node dist/index.js
   ```
   *The agent will exchange `PBK-SETUP-9021` for a persistent, cryptographically secure device token and save it into `agent-config.json`.*

---

## 3. Starting the Agent at Login (Windows Task Scheduler)

Printers in Windows are frequently installed per-user session. Therefore, the agent should run automatically when the counter staff user logs into Windows.

### Automated Setup via PowerShell
Run PowerShell as Administrator:
```powershell
$Action = New-ScheduledTaskAction -Execute "C:\Program Files\nodejs\node.exe" -Argument "dist/index.js" -WorkingDirectory "C:\PrintBK\agent"
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "PrintBK_PrintAgent" -Action $Action -Trigger $Trigger -Settings $Settings -Description "PrintBK Shop Counter Real-Time Print Agent"
```

### Manual Setup via Task Scheduler GUI (`taskschd.msc`)
1. Open **Task Scheduler** (`Win + R` -> `taskschd.msc`).
2. Click **Create Task** (not Basic Task).
3. **General Tab**:
   - Name: `PrintBK_PrintAgent`
   - Select: *Run only when user is logged on*.
   - Check: *Run with highest privileges*.
4. **Triggers Tab**:
   - Click *New* -> Begin the task: *At log on*.
5. **Actions Tab**:
   - Program/script: `C:\Program Files\nodejs\node.exe`
   - Add arguments: `dist/index.js`
   - Start in: `C:\PrintBK\agent`
6. **Settings Tab**:
   - Check: *If the task fails, restart every: 1 minute*.
   - Uncheck: *Stop the task if it runs longer than*.

---

## 4. Turning Off "Keep Printed Documents" in Windows

By default, some Windows printer drivers retain raw spooler print files on disk after printing, causing disk accumulation and student privacy exposure.

### Disabling via PowerShell
Run PowerShell as Administrator:
```powershell
Get-Printer | ForEach-Object {
    Set-Printer -Name $_.Name -KeepPrintedJobs $false
}
```

### Disabling via Windows GUI
1. Open **Settings** -> **Bluetooth & devices** -> **Printers & scanners**.
2. Select your printer -> **Printer properties**.
3. Go to the **Advanced** tab.
4. Ensure the checkbox **"Keep printed documents"** is **UNCHECKED**.
5. Click **Apply** -> **OK**.

---

## 5. Building Windows Printer Profiles

Because many manufacturer drivers ignore CLI duplex or paper size flags sent via SumatraPDF, the robust industry practice is to install the printer multiple times in Windows with dedicated hardware defaults:

1. In Windows, go to **Printers & scanners** -> **Add device** -> **Add manually** -> *Add a local printer with existing port (USB or WSD)*.
2. Select the same driver (e.g. *EPSON L3150 Series*).
3. Name the printer specifically for its counter role:
   - `EPSON L3150 (Colour Standard)`: Set Printing Preferences to Colour, A4, Plain Paper.
   - `EPSON L3150 (Photo Glossy)`: Set Printing Preferences to Colour, 4x6 / A4, Ultra Glossy.
   - `HP LaserJet (B&W Duplex)`: Set Printing Preferences to Monochrome, Print on both sides (Long edge).
4. In `agent-config.json` or the Staff App Settings, map each profile:
   ```json
   "printerProfiles": {
     "bw": "HP LaserJet (B&W Duplex)",
     "colour": "EPSON L3150 (Colour Standard)",
     "photo": "EPSON L3150 (Photo Glossy)"
   }
   ```

---

## 6. Dry-Run Mode (Testing Without Physical Hardware)

For software development, automated CI, and demonstrations without hardware printers:
```powershell
cd C:\PrintBK\agent
node dist/index.js --dry-run
```
- Discovered printers will show as online virtual devices (`EPSON L3110 Series`).
- All printed jobs will render their final layout PDFs and a `manifest.json` into `C:\PrintBK\agent\dry-run\<jobId>\`.
- Real-time 1Hz page progress will simulate accurately and update the counter and student screens.

---

## 7. Operational Troubleshooting Matrix

| Symptom | Root Cause | Resolution |
| :--- | :--- | :--- |
| **Agent logs `401 Invalid agent setup code`** | Setup code mismatch between `agent-config.json` and Catalyst environment variables | Verify `AGENT_SETUP_CODE` or `STAFF_SETUP_CODE` in Catalyst Console (`Compute > Functions > api > Environment Variables`). Match with `agent-config.json`. |
| **Printers appear offline in Staff Counter** | Windows printer spooler service stopped or printer powered off | Check USB cable/Wi-Fi connection. Ensure `Spooler` Windows service is running (`Restart-Service Spooler`). |
| **SumatraPDF executable not found** | SumatraPDF not installed or not in standard path | Install SumatraPDF from official website or set `"sumatraPath": "C:\\Path\\To\\SumatraPDF.exe"` in `agent-config.json`. |
| **DOCX/PPTX conversion fails** | LibreOffice not installed on Shop PC | Install LibreOffice 64-bit or save file as PDF before printing. |
| **Paper size / Duplex not honored** | Driver ignores command-line flags | Set up a dedicated Windows Printer Profile with required defaults as explained in Section 5. |
| **Heartbeat drops / live feed disconnects** | Shop PC network connection lost | Agent automatically retries with exponential backoff and recovers as soon as internet connection is restored. |
