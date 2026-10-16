@echo off
setlocal
cd /d "%~dp0"

echo Removing PrintBK Print Agent auto-start task...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-service.ps1"
echo Done. Press any key to close.
pause >nul
