# PrintBK Print Agent - Windows Auto-Start Task Installer
# Registers PrintBK_Agent in Windows Task Scheduler to run at user logon with self-healing restarts.

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       PrintBK Windows Print Agent - Task Installer       " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$agentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbsLauncher = Join-Path $agentDir "start-agent.vbs"

if (-not (Test-Path $vbsLauncher)) {
  Write-Error "Launcher script not found: $vbsLauncher"
  exit 1
}

$taskName = "PrintBK_Agent"

Write-Host "Agent directory:  $agentDir"
Write-Host "Launcher script:  $vbsLauncher"
Write-Host "Task name:        $taskName"
Write-Host ""

try {
  # 1. Unregister any existing task with the same name
  $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "[1/3] Removing existing $taskName task..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  }

  # 2. Configure action and triggers
  Write-Host "[2/3] Configuring Task Scheduler trigger (AtLogOn, Highest privileges, auto-restart on crash)..." -ForegroundColor White
  $action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsLauncher`"" -WorkingDirectory $agentDir
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Days 0) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)
  
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest

  # 3. Register the task
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  Write-Host "[3/3] Task $taskName successfully registered!" -ForegroundColor Green

  # Start task now
  Start-ScheduledTask -TaskName $taskName
  Write-Host ""
  Write-Host "SUCCESS: PrintBK Agent is now running in the background and will start automatically on Windows boot/login." -ForegroundColor Green
  Write-Host "Check your Windows system tray for the PrintBK icon." -ForegroundColor Cyan
} catch {
  Write-Host "PowerShell Register-ScheduledTask failed: $_" -ForegroundColor Yellow
  Write-Host "Falling back to schtasks.exe..." -ForegroundColor White
  
  $schCmd = "schtasks /Create /TN `"$taskName`" /TR `"wscript.exe `\`"$vbsLauncher`\`"`" /SC ONLOGON /RL HIGHEST /F"
  Invoke-Expression $schCmd
  schtasks /Run /TN "$taskName"
  Write-Host "SUCCESS: Task scheduled via schtasks.exe" -ForegroundColor Green
}
