# PrintBK Print Agent Windows System Tray Process
param(
  [string]$AgentPid = "",
  [string]$LogsPath = "",
  [string]$StaffUrl = "https://printbk-60074625517.development.catalystserverless.in/staff"
)

[System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Application
$notify.Text = "PrintBK Agent (Connecting...)"
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$headerItem = $menu.Items.Add("PrintBK Print Agent")
$headerItem.Enabled = $false
$menu.Items.Add("-") | Out-Null

$itemOpen = $menu.Items.Add("Open Staff App")
$itemTest = $menu.Items.Add("Test Print")
$itemLog = $menu.Items.Add("View Log")
$itemCheck = $menu.Items.Add("Check for Update")
$menu.Items.Add("-") | Out-Null
$itemExit = $menu.Items.Add("Exit")

$itemOpen.Add_Click({
  [Console]::Out.WriteLine('{"action":"open_staff"}')
  [Console]::Out.Flush()
  if ($StaffUrl) { Start-Process $StaffUrl }
})

$itemTest.Add_Click({
  [Console]::Out.WriteLine('{"action":"test_print"}')
  [Console]::Out.Flush()
})

$itemLog.Add_Click({
  [Console]::Out.WriteLine('{"action":"view_log"}')
  [Console]::Out.Flush()
  if ($LogsPath -and (Test-Path $LogsPath)) {
    Start-Process "notepad.exe" $LogsPath
  }
})

$itemCheck.Add_Click({
  [Console]::Out.WriteLine('{"action":"check_update"}')
  [Console]::Out.Flush()
})

$itemExit.Add_Click({
  [Console]::Out.WriteLine('{"action":"exit"}')
  [Console]::Out.Flush()
  $notify.Visible = $false
  $notify.Dispose()
  [System.Windows.Forms.Application]::Exit()
})

$notify.ContextMenuStrip = $menu

$notify.Add_DoubleClick({
  [Console]::Out.WriteLine('{"action":"open_staff"}')
  [Console]::Out.Flush()
  if ($StaffUrl) { Start-Process $StaffUrl }
})

$notify.Add_BalloonTipClicked({
  [Console]::Out.WriteLine('{"action":"balloon_clicked"}')
  [Console]::Out.Flush()
  if ($StaffUrl) { Start-Process $StaffUrl }
})

# Background timer to poll parent PID and stdin
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 300
$timer.Add_Tick({
  if ($AgentPid) {
    $proc = Get-Process -Id $AgentPid -ErrorAction SilentlyContinue
    if (-not $proc) {
      $notify.Visible = $false
      $notify.Dispose()
      [System.Windows.Forms.Application]::Exit()
      return
    }
  }

  while ([Console]::In.Peek() -ne -1) {
    $line = [Console]::In.ReadLine()
    if ($line) {
      try {
        $json = $line | ConvertFrom-Json
        if ($json.type -eq "status") {
          $txt = [string]$json.text
          if ($txt.Length -gt 63) { $txt = $txt.Substring(0, 63) }
          $notify.Text = $txt
        } elseif ($json.type -eq "notify") {
          $notify.BalloonTipTitle = [string]$json.title
          $notify.BalloonTipText = [string]$json.text
          $notify.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
          $notify.ShowBalloonTip(6000)
        } elseif ($json.type -eq "exit") {
          $notify.Visible = $false
          $notify.Dispose()
          [System.Windows.Forms.Application]::Exit()
          return
        }
      } catch {}
    }
  }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()
