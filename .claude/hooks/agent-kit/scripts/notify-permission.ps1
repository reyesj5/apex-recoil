param(
  [string]$Title = "Claude Code",
  [string]$Message = "Your response is needed."
)

Add-Type -AssemblyName System.Windows.Forms

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Information
$notify.Visible = $true
$notify.BalloonTipTitle = $Title
$notify.BalloonTipText = $Message
$notify.BalloonTipIcon = "Info"
$notify.ShowBalloonTip(5000)

Start-Sleep -Seconds 6
$notify.Dispose()
