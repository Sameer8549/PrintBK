@echo off
title PrintBK Windows Print Agent
echo ====================================================
echo           PrintBK Windows Print Agent
echo ====================================================
echo Starting background printer spooler daemon...
cd /d "%~dp0"
if exist "dist\src\index.js" (
  node --dns-result-order=ipv4first dist\src\index.js
) else if exist "dist\index.js" (
  node --dns-result-order=ipv4first dist\index.js
) else (
  echo Error: Compiled agent binary not found in dist. Run pnpm build first.
  pause
)
