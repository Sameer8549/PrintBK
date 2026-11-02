@echo off
title PrintBK Real-Time Print Agent
echo ====================================================
echo           PrintBK Real-Time Print Agent
echo ====================================================
echo Connecting to live store printers...
cd /d "%~dp0\PrintBK\counter-app"
node dist/agent/worker.js
pause
