# PrintBK Print Agent - Uninstaller
[CmdletBinding()]
param()

$taskName = "PrintBK_Agent"
Write-Host "Stopping and removing $taskName..." -ForegroundColor Yellow

try {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Task $taskName removed successfully." -ForegroundColor Green
} catch {
  schtasks /Delete /TN "$taskName" /F
  Write-Host "Task $taskName removed via schtasks." -ForegroundColor Green
}
