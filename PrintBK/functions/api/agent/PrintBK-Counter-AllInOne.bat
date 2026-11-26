@echo off
setlocal enabledelayedexpansion

title PrintBK Counter Station & Print Spooler Agent - Unified All-In-One Runner
cd /d "%~dp0"

echo ==============================================================
echo        PrintBK Counter Station & Print Spooler Agent          
echo              Unified All-In-One Master Runner                 
echo                Version 1.0.0 (November 26, 2026)              
echo ==============================================================
echo.

rem Handle Command-Line Arguments
if /i "%1"=="--uninstall" goto do_uninstall
if /i "%1"=="--stop" goto do_stop
if /i "%1"=="--status" goto do_status
if /i "%1"=="--install" goto do_install_only
if /i "%1"=="--staff" goto do_open_staff

rem ─────────────────────────────────────────────────────────────
rem STEP 1: Locate Node.js Runtime
rem ─────────────────────────────────────────────────────────────
echo [1/6] Verifying Node.js Runtime...
set "NODE_CMD="
where node >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set "NODE_CMD=node"
) else (
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "NODE_CMD=%ProgramFiles%\nodejs\node.exe"
    ) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
        set "NODE_CMD=%ProgramFiles(x86)%\nodejs\node.exe"
    ) else if exist "%LocalAppData%\Programs\node\node.exe" (
        set "NODE_CMD=%LocalAppData%\Programs\node\node.exe"
    )
)

if "%NODE_CMD%"=="" (
    echo [!] Node.js was not detected on this PC.
    echo [*] Node.js is required to run the local background print spooler.
    echo [*] Opening Node.js download page...
    start https://nodejs.org/en/download
    echo.
    echo Please install Node.js (LTS version) and run this script again.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('"%NODE_CMD%" -v 2^>nul') do set "NODE_VER=%%v"
echo       Node.js found: %NODE_VER% (%NODE_CMD%)

rem ─────────────────────────────────────────────────────────────
rem STEP 2: Verify or Download Agent Components
rem ─────────────────────────────────────────────────────────────
echo [2/6] Verifying Print Agent Spooler Components...
set "ENTRY_POINT="
if exist "dist\src\index.js" (
    set "ENTRY_POINT=dist\src\index.js"
) else if exist "dist\index.js" (
    set "ENTRY_POINT=dist\index.js"
) else (
    echo [*] Compiled agent components not found in current folder.
    echo [*] Auto-downloading PrintBK Agent Standalone Bundle from cloud...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://printbk-60074625517.development.catalystserverless.in/server/api/counter/agent/download/printbk-agent-standalone.zip', 'printbk-agent-standalone.zip')"
    if exist "printbk-agent-standalone.zip" (
        echo [*] Extracting agent bundle...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path 'printbk-agent-standalone.zip' -DestinationPath '.' -Force"
        if exist "dist\src\index.js" (
            set "ENTRY_POINT=dist\src\index.js"
        ) else if exist "dist\index.js" (
            set "ENTRY_POINT=dist\index.js"
        )
    )
)

if "%ENTRY_POINT%"=="" (
    echo [!] Could not locate or download agent entry point.
    pause
    exit /b 1
)
echo       Agent entry point: %ENTRY_POINT%

rem ─────────────────────────────────────────────────────────────
rem STEP 3: Auto-Configure Production config.json
rem ─────────────────────────────────────────────────────────────
echo [3/6] Configuring Station Settings & Setup Code...
if not exist "config.json" (
    echo       Creating config.json with setup code PBK-SETUP-9021...
    (
        echo {
        echo   "apiBase": "https://printbk-60074625517.development.catalystserverless.in",
        echo   "setupCode": "PBK-SETUP-9021",
        echo   "printerProfiles": {
        echo     "bw": "PrintBK-BW-Virtual",
        echo     "colour": "PrintBK-Colour-Virtual",
        echo     "photo": "PrintBK-Photo-Virtual"
        echo   },
        echo   "dryRun": false
        echo }
    ) > config.json
    echo       [OK] config.json created successfully.
) else (
    echo       [OK] Existing config.json detected.
)

rem Ensure start-agent.vbs exists for silent execution
if not exist "start-agent.vbs" (
    (
        echo Set oShell = CreateObject^("WScript.Shell"^)
        echo Set fso = CreateObject^("Scripting.FileSystemObject"^)
        echo currentDir = fso.GetParentFolderName^(WScript.ScriptFullName^)
        echo oShell.CurrentDirectory = currentDir
        echo If fso.FileExists^(currentDir ^& "\dist\src\index.js"^) Then
        echo   oShell.Run "node --dns-result-order=ipv4first dist\src\index.js", 0, False
        echo Else
        echo   oShell.Run "node --dns-result-order=ipv4first dist\index.js", 0, False
        echo End If
    ) > start-agent.vbs
)

rem ─────────────────────────────────────────────────────────────
rem STEP 4: Inspect Installed Windows Printers
rem ─────────────────────────────────────────────────────────────
echo [4/6] Inspecting Windows System Printers...
powershell -NoProfile -Command "Get-CimInstance Win32_Printer | ForEach-Object { Write-Host ('       - ' + $_.Name) }" 2>nul

rem ─────────────────────────────────────────────────────────────
rem STEP 5: Register Auto-Start Task & Launch Background Agent
rem ─────────────────────────────────────────────────────────────
echo [5/6] Starting Print Agent Spooler Daemon...

rem Stop existing process if PID file exists and process is active
if exist "agent.pid" (
    set /p OLD_PID=<agent.pid
    if not "!OLD_PID!"=="" (
        tasklist /FI "PID eq !OLD_PID!" 2>nul | find /I "!OLD_PID!" >nul
        if %ERRORLEVEL% EQU 0 (
            echo       Print agent is already running under PID !OLD_PID!.
            goto agent_already_running
        )
    )
)

rem Register auto-start in Windows Task Scheduler
schtasks /query /tn "PrintBK_Agent" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo       Registering PrintBK_Agent in Task Scheduler for automatic start at logon...
    schtasks /Create /TN "PrintBK_Agent" /TR "wscript.exe \"%~dp0start-agent.vbs\"" /SC ONLOGON /RL HIGHEST /F >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo       [OK] Task Scheduler auto-start registered.
    )
)

rem Start daemon silently via VBS launcher or min console
if exist "start-agent.vbs" (
    wscript.exe "start-agent.vbs"
) else (
    start "PrintBK Agent Daemon" /min "%NODE_CMD%" --dns-result-order=ipv4first %ENTRY_POINT%
)
echo       [OK] Background print spooler daemon started.

:agent_already_running

rem ─────────────────────────────────────────────────────────────
rem STEP 6: Automatically Launch Staff Counter Web Application
rem ─────────────────────────────────────────────────────────────
echo [6/6] Launching Staff Counter Application in browser...
start "" "https://printbk-60074625517.development.catalystserverless.in/app/staff/index.html"
echo       [OK] Staff Counter Web Workbench opened.

echo.
echo ==============================================================
echo [SUCCESS] PRINTBK COUNTER STATION IS FULLY ACTIVE!
echo.
echo   * Print Agent Daemon:  ACTIVE IN BACKGROUND
echo   * Spooler Network:     IPv4 PINNED (Resilient DNS)
echo   * Windows Auto-Start:  CONFIGURED (At Logon)
echo   * Setup Pairing Code:  PBK-SETUP-9021
echo   * Staff Counter App:   OPENED IN DEFAULT BROWSER
echo   * Date:                November 26, 2026
echo ==============================================================
echo.
echo Leave this window or close it at any time; the print agent
echo will continue running silently in the background.
echo.
timeout /t 6 >nul
exit /b 0

rem ─────────────────────────────────────────────────────────────
rem Subroutines for CLI Arguments
rem ─────────────────────────────────────────────────────────────

:do_uninstall
echo [Uninstall] Stopping PrintBK Agent and removing Windows auto-start task...
schtasks /Delete /TN "PrintBK_Agent" /F >nul 2>&1
if exist "agent.pid" (
    set /p K_PID=<agent.pid
    if not "!K_PID!"=="" (
        taskkill /PID !K_PID! /F >nul 2>&1
    )
    del /f /q "agent.pid" >nul 2>&1
)
taskkill /IM node.exe /FI "WINDOWTITLE eq PrintBK*" /F >nul 2>&1
echo [OK] PrintBK Agent has been uninstalled from auto-start.
exit /b 0

:do_stop
echo [Stop] Stopping PrintBK Agent daemon...
if exist "agent.pid" (
    set /p K_PID=<agent.pid
    if not "!K_PID!"=="" (
        taskkill /PID !K_PID! /F >nul 2>&1
    )
    del /f /q "agent.pid" >nul 2>&1
)
taskkill /IM node.exe /FI "WINDOWTITLE eq PrintBK*" /F >nul 2>&1
echo [OK] PrintBK Agent stopped.
exit /b 0

:do_status
echo [Status] Checking PrintBK Counter Station...
schtasks /Query /TN "PrintBK_Agent" 2>nul
if exist "agent.pid" (
    set /p S_PID=<agent.pid
    echo Agent PID File: !S_PID!
    tasklist /FI "PID eq !S_PID!" 2>nul
) else (
    echo Agent PID File: Not found
)
echo.
echo Installed Printers:
powershell -NoProfile -Command "Get-CimInstance Win32_Printer | ForEach-Object { Write-Host (' - ' + $_.Name) }" 2>nul
exit /b 0

:do_install_only
echo [Install] Registering PrintBK Agent in Windows Task Scheduler...
schtasks /Create /TN "PrintBK_Agent" /TR "wscript.exe \"%~dp0start-agent.vbs\"" /SC ONLOGON /RL HIGHEST /F
echo [OK] Task registered.
exit /b 0

:do_open_staff
echo [Staff App] Launching Staff Counter Application...
start "" "https://printbk-60074625517.development.catalystserverless.in/app/staff/index.html"
exit /b 0
