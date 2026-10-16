# PrintBK Windows Print Agent — Setup & Operations Guide

> **Production Setup for Shop Counter PC**  
> Enables automatic, background printing to local USB and network printers without manual terminal execution.

---

## 1. Overview

The **PrintBK Print Agent** is a background Windows service and system-tray application that runs directly on the shop counter PC. It connects the shop's physical printers (B&W laser, Colour inkjet/tank) directly to the cloud backend and counter terminal:

- **No manual node start**: Runs automatically on Windows user login.
- **Zero console clutter**: Invisible execution in the background without keeping a CMD/PowerShell window open.
- **Native System Tray**: Displays live status in the taskbar with quick-access controls.
- **Self-Healing**: Windows Task Scheduler automatically restarts the agent within 1 minute if a crash or process termination occurs.
- **Secure Credentials**: Shop authentication tokens are protected using Windows DPAPI encryption in `%APPDATA%\PrintBK\agent-config.json`.

---

## 2. Prerequisites

1. **Windows 10 or 11 (64-bit)**.
2. **Node.js (v18 or newer)** installed and available in PATH.
3. **Physical Printers** connected via USB or Local Network / Wi-Fi, installed in Windows Settings → *Printers & Scanners*.
4. **SumatraPDF (Optional, recommended for physical printing)**: If installed, the agent automatically detects it at standard locations (`C:\Program Files\SumatraPDF\SumatraPDF.exe`) or via the `SUMATRA_PATH` environment variable.

---

## 3. One-Click Installation (For Shopkeeper)

1. Open File Explorer and navigate to the `agent` folder:
   ```
   C:\PrintBK\agent
   ```
2. Right-click **`install-service.bat`** and select **Run as administrator** (or simply double-click).
3. The script will:
   - Configure Windows Task Scheduler to run `PrintBK_Agent` at user logon with high privileges.
   - Configure automatic restarts on failure (up to 3 retries, 1-minute interval).
   - Launch the agent immediately in the background using `start-agent.vbs` (completely hidden).
   - Display a notification in the Windows System Tray.

---

## 4. System Tray Controls

Look for the **PrintBK icon** in the Windows taskbar notification area (bottom-right corner, near the clock):

- **Hover tooltip**: Shows current connectivity and printer count (e.g. `PrintBK Agent (Online - 2 printers)`).
- **Double-click icon**: Opens the Staff App in your default web browser.
- **Right-click menu**:
  - **Open Staff App**: Launches counter dashboard.
  - **Test Print**: Instantly sends a diagnostic test page to the assigned B&W printer without needing a browser.
  - **View Log**: Opens `agent\logs\agent.log` in Notepad for troubleshooting.
  - **Check for Update**: Triggers an immediate heartbeat and printer status synchronization.
  - **Exit**: Cleanly shuts down the agent and frees all temporary spool files.

---

## 5. First-Time Pairing

1. On initial startup, if the agent has not yet been paired with your shop, the tray will display a balloon notification:
   > *"PrintBK Agent Needs Setup — Click to configure counter"*
2. Clicking the notification opens the Staff App pairing page.
3. The agent automatically submits the shop setup code (`PBK-SETUP-9021` or your custom code) and receives an encrypted device capability token.
4. The token is persisted securely to `%APPDATA%\PrintBK\agent-config.json` via Windows DPAPI. You will never need to pair again on this PC.

---

## 6. Verifying Connection in Staff App

1. Open the **Staff Counter App** (`http://localhost:5173` or your production domain).
2. Open **Settings → Printers**.
3. Under *Printers on this PC*, verify that the status badge displays:
   ```
   ● PRINT AGENT ONLINE
   ```
4. Your detected printers will be listed in the B&W and Colour dropdowns.
5. Click **TEST PRINT** next to any printer to confirm physical spooling.

---

## 7. How to Uninstall or Stop the Auto-Start Task

To remove the auto-start task:

1. Navigate to `C:\PrintBK\agent`.
2. Double-click **`uninstall-service.bat`** (or run `uninstall-service.ps1` in PowerShell).
3. The scheduled task `PrintBK_Agent` will be stopped and removed.

---

## 8. Diagnostic Logs & Troubleshooting

- **Log File**: `agent\logs\agent.log`
  Every heartbeat, discovered printer, spooling job, and error is recorded with ISO-8601 timestamps.
- **PID File**: `agent\agent.pid`
  Stores the current running process ID while active and is automatically cleaned up on exit.
- **Printer appears offline**:
  1. Power-cycle the physical printer and ensure USB cable is connected.
  2. In the tray icon right-click menu, select **Check for Update**.
  3. In the Staff App, click **REFRESH** in Settings → Printers.
