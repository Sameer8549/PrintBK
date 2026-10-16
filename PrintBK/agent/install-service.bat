@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo        PrintBK Windows Print Agent - Auto-Start Setup      
echo ==========================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-service.ps1"

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Setup encountered an issue. Running fallback via schtasks...
  schtasks /Create /TN "PrintBK_Agent" /TR "wscript.exe \"%~dp0start-agent.vbs\"" /SC ONLOGON /RL HIGHEST /F
  schtasks /Run /TN "PrintBK_Agent"
)

echo.
echo Setup finished. Press any key to close this window.
pause >nul
