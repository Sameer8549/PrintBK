@echo off
:: ============================================================================
:: PrintBK Counter PC - Campus Ethernet & IPv6 Optimization Utility
:: ============================================================================
:: This utility optimizes Windows networking on campus/enterprise Ethernet:
:: 1. Tells Windows to prefer IPv4 over IPv6 in RFC 3484/6724 prefix policies,
::    eliminating connection timeouts caused by unroutable synthetic NAT64 addresses (64:ff9b::/96).
:: 2. Flushes and refreshes the Windows DNS resolver cache.
:: ============================================================================

title PrintBK - Ethernet Network Optimization
echo ============================================================================
echo       PrintBK Counter - Ethernet ^& IPv6 Network Optimizer
echo ============================================================================
echo.

:: Check for Administrator privileges
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [!] Administrator privileges required to update Windows prefix policies.
  echo [!] Attempting to elevate...
  powershell -Command "Start-Process cmd -ArgumentList '/c `\"%~f0`\"' -Verb RunAs"
  exit /b
)

echo [*] Applying RFC 3484 IPv4 precedence over IPv6...
netsh interface ipv6 set prefixpolicy ::ffff:0:0/96 46 4
if %ERRORLEVEL% EQU 0 (
  echo [OK] IPv4 priority successfully set to Precedence 46 (higher than IPv6 ::/0 Precedence 40).
) else (
  echo [!] Could not set prefix policy via netsh. Continuing...
)

echo [*] Flushing local DNS resolver cache...
ipconfig /flushdns

echo.
echo ============================================================================
echo [SUCCESS] Windows Ethernet network settings optimized for PrintBK Counter!
echo ============================================================================
echo.
pause
