# PrintBK Counter — Windows Desktop & Installer Architecture Audit

> **Document Version:** 1.0.0  
> **Status:** Final Architecture Specification (Phase 0)  
> **Audience:** Core Engineering, Release Engineering, Product & QA

---

## 1. Executive Summary

Today, deploying the PrintBK counter workstation at a partner campus print shop requires high-friction manual technical steps:
1. Installing Git, Node.js (>= v18), and `pnpm`.
2. Cloning the repository or unzipping source code.
3. Compiling `@printbk/shared`, `staff`, and `agent` via terminal commands.
4. Manually finding and installing SumatraPDF and LibreOffice.
5. Launching `install-service.bat` / PowerShell scripts to schedule Windows tasks.
6. Pairing the agent CLI with `printbk-agent pair --code <AGENT_SETUP_CODE>`.
7. Opening Chrome/Edge, navigating to `/staff/`, and entering a separate `STAFF_SETUP_CODE`.

For a non-technical shopkeeper running a commercial Xerox/print shop, this operational barrier is unacceptable. A printer disconnection, node process crash, or Windows reboot often leaves the system in a broken state without clear diagnostic feedback.

**The Solution:** Build **PrintBK Counter**, a single, self-contained Windows executable installer (`PrintBK-Counter-Setup-<version>.exe`). A single double-click installs the entire counter ecosystem (runtime, agent, staff UI, silent PDF printer, document converter). On initial launch, a single 24-character setup code pairs both the agent and the counter UI permanently.

---

## 2. Current State Audit

### 2.1 Agent Execution & Lifecycle Today
- **Startup:** Handled via `install-service.bat`, which registers a Windows Scheduled Task (`PrintBK_Agent`) executing `start-agent.vbs` (`wscript.exe start-agent.vbs`), which invokes `node dist/src/index.js`.
- **Process Management:** The agent writes a PID file (`agent.pid`). If the process crashes or unhandled exceptions occur, Task Scheduler has limited auto-recovery logic. No automated crash dump or proactive heartbeat supervisor exists.
- **System Tray:** A secondary PowerShell script (`tray.ps1`) is spawned by `TrayManager` (`agent/src/tray.ts`) using WinForms notification components (`System.Windows.Forms.NotifyIcon`). This creates a fragile child process dependency that fails if PowerShell script execution is restricted.

### 2.2 Pairing & Credential Storage
- **Agent Pairing:** Handled via `POST /server/api/agent/pair` using `AGENT_SETUP_CODE`.
- **Agent Storage:** Stored in `%APPDATA%\PrintBK\agent-config.json`. The token is protected on Windows using DPAPI (`CryptProtectData`) through PowerShell or raw fallback.
- **Staff UI Pairing:** Separate web-based pairing via `POST /server/api/staff/pair` using `STAFF_SETUP_CODE`.
- **Staff Storage:** Stored in browser `localStorage` (`printbk_staff_token`, `printbk_staff_device_id`) and an `HttpOnly` cookie.
- **Flaw:** The shopkeeper must pair **twice** with two different setup codes. If one token is revoked, the system enters a desynchronized state where the staff app sees orders but the agent cannot poll them.

### 2.3 Printer Discovery & Physical Printing
- **Discovery:** `agent/src/printers.ts` executes `powershell -NoProfile -Command "Get-CimInstance -ClassName Win32_Printer | Select-Object Name, Default, PrinterStatus, WorkOffline, PortName | ConvertTo-Json -Compress"`.
- **Heuristics:** Classifies printers as `bw`, `colour`, or `both` using regex keywords (`color`, `l3150`, `laserjet`, `mono`).
- **Silent Printing:** Dispatched via SumatraPDF (`agent/src/sumatra.ts`). Looks for SumatraPDF in:
  1. `process.cwd()/bin/SumatraPDF.exe`
  2. `C:\Program Files\SumatraPDF\SumatraPDF.exe`
  3. `C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe`
  4. `%LOCALAPPDATA%\SumatraPDF\SumatraPDF.exe`
  If not found, print jobs fail with `SumatraPDF executable not found`.
- **Document Conversion:** `agent/src/converter.ts` searches for `soffice.exe` (LibreOffice) or falls back to COM automation with MS Word (`New-Object -ComObject Word.Application`). If neither is present, Office files fail.

---

## 3. Architecture Decision: Electron Desktop Application ("PrintBK Counter")

We adopt an **Electron + TypeScript** application architecture (`counter-app/`) packaged with **electron-builder** into an NSIS installer.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PrintBK Counter Desktop                         │
│                                                                        │
│   ┌────────────────────────────────┐  ┌────────────────────────────┐   │
│   │   Electron Main Process        │  │   Embedded Print Agent     │   │
│   │   - Single Instance Lock       │  │   (Supervised Node Worker) │   │
│   │   - Native System Tray         │  │   - DPAPI Credential Store │   │
│   │   - Windows Auto-Start         │  │   - Adaptive Polling Loop  │   │
│   │   - Silent Auto-Updater        │  │   - Heartbeat & Spooler    │   │
│   │   - IPC Dispatcher             │  │   - Bundled SumatraPDF     │   │
│   └──────────────┬─────────────────┘  │   - Bundled LibreOffice    │   │
│                  │ IPC                └──────────────┬─────────────┘   │
│   ┌──────────────┴─────────────────┐                 │                 │
│   │   Staff Window (Chromium)      │                 │ Local Spooler   │
│   │   - Preload Script (Sandboxed) │                 ▼                 │
│   │   - Loads Live Staff Web App   │       Windows Print Queue         │
│   │     (Zero Reinstall Updates)   │       (Physical Printers)         │
│   └────────────────────────────────┘                                   │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Core Components
1. **Supervised Agent Subprocess:**
   - The Electron main process acts as a robust watchdog.
   - It forks the compiled print agent module as a child process using Node's native `child_process.fork()` (bundled directly inside Electron's Node runtime).
   - If the agent process encounters an unhandled exception or terminates unexpectedly, the watchdog logs the crash to rotating log files in `%APPDATA%\PrintBK\logs\agent.log` and automatically restarts it with exponential backoff (1s, 2s, 5s).
2. **Chromium Counter Window:**
   - Instead of bundling static web assets that become stale, the main window navigates to the configured staff web app URL (e.g. `https://<domain>/staff/`).
   - All bug fixes, UI improvements, and feature updates pushed to the web client arrive on the counter PC immediately without requiring an installer update.
   - When offline or unreachable, the window presents a local, branded Paper & Ink offline screen with an automatic reconnect timer.
3. **Native System Tray & Lifecycle:**
   - Standard Windows system tray icon showing real-time operational status (`Connected`, `Printing`, `Offline`, `Error`).
   - Context menu: `Open Counter`, `Test Print (B&W)`, `Test Print (Colour)`, `View Logs`, `Check for Updates`, `Health Check`, `Reset Pairing`, and `Quit`.
   - Window close button (`X`) minimizes the window to the tray rather than terminating the application, guaranteeing continuous printing.
4. **Single-Instance Mutex:**
   - `app.requestSingleInstanceLock()` ensures only one instance of PrintBK Counter runs on the PC. Attempting to launch a second instance focuses the existing window.
5. **Windows Auto-Start:**
   - Configured via `app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false })`.
   - Runs in the interactive user session, ensuring full access to user-specific Windows network printers and spoolers.

---

## 4. Evaluated & Rejected Alternatives

| Candidate Architecture | Key Fatal Flaw / Rationale for Rejection |
| :--- | :--- |
| **Windows Service (LocalSystem / SCM)** | **Session 0 Isolation:** Windows Services run in Session 0. Network printers, user-mapped USB queues, and GUI dialogs from printer drivers are invisible or blocked in Session 0. Furthermore, installing a Windows Service requires elevated administrator privileges and complex service wrappers. |
| **Tauri (Rust + Webview2)** | **Runtime Duplication:** The PrintBK agent is written in Node.js/TypeScript using libraries like `pdf-lib` and `qrcode`. Bundling a separate Node.js runtime sidecar alongside a Tauri Rust binary increases build complexity and IPC overhead without offering advantages over Electron's unified Node/Chromium environment. |
| **C# / WPF Native Wrapper** | **Toolchain Fragmentation:** Demands maintaining a .NET codebase alongside the TypeScript monorepo, increasing maintenance overhead and diverging from shared validation and schema libraries (`@printbk/shared`). |
| **Packaged Static Staff UI inside Electron** | **Stale Deployment Risk:** Packaging the staff web client inside the desktop binary requires rebuilding and redistributing the entire installer every time a staff UI bug is resolved. Loading the live URL ensures instant, zero-touch web updates. |

---

## 5. Environment & Configuration Strategy

To eliminate hardcoded URLs and ensure strict separation of concerns, the app uses build-time and runtime environment configuration files:

- `counter-app/config/dev.json`:
  ```json
  {
    "environment": "development",
    "apiBase": "https://printbk-60074625517.development.catalystserverless.in",
    "staffAppUrl": "https://printbk-60074625517.development.catalystserverless.in/staff/",
    "updateFeedUrl": "https://github.com/glittercowboy/printbk-releases/releases/latest/download",
    "autoUpdate": false
  }
  ```
- `counter-app/config/prod.json`:
  ```json
  {
    "environment": "production",
    "apiBase": "https://api.printbk.com",
    "staffAppUrl": "https://counter.printbk.com",
    "updateFeedUrl": "https://releases.printbk.com/counter/win32",
    "autoUpdate": true
  }
  ```

Build commands:
- `pnpm --filter printbk-counter build:dev`
- `pnpm --filter printbk-counter build:prod`
- `pnpm build:installer:dev`
- `pnpm build:installer:prod`

---

## 6. Execution Roadmap

| Phase | Focus Area | Deliverables |
| :--- | :--- | :--- |
| **Phase 1** | Backend Pairing | `POST /counter/pair`, unified counter records, `GET /staff/counters`, revocation, version endpoint. |
| **Phase 2** | Desktop App Core | `counter-app/` package, Electron main process, tray, sandbox, preload IPC, single-instance. |
| **Phase 3** | Embedded Agent | Agent refactored into library module, watchdog supervisor, Windows printer discovery, test print. |
| **Phase 4** | Bundled Dependencies | SumatraPDF portable binary, LibreOffice silent installer/detection, self-test health check. |
| **Phase 5** | First-Run Wizard | Single-screen setup wizard: setup code input, printer detection, test print, auto-start toggle. |
| **Phase 6** | Auto-Update & Maintenance | `electron-updater` background checks, non-disruptive update application, reset pairing. |
| **Phase 7** | NSIS Installer Packaging | `electron-builder` configuration, desktop shortcut, uninstaller, SmartScreen runbook. |
| **Phase 8** | Verification & Evidence | Clean Windows testing, test print evidence, crash recovery test, screenshot captures. |
| **Phase 9** | Documentation | Updated `docs/shop-pc-checklist.md`, `docs/auth.md`, release guide, and PR summary. |
