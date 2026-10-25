param(
  [string]$Title = "Claude Code",
  [string]$Message = "Claude has finished running."
)

Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show($Message, $Title, "OK", "Information") | Out-Null
