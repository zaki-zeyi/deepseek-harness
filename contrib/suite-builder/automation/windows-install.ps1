param([string]$Installer,[string]$Destination)
$ErrorActionPreference='Stop'
$start=New-Object System.Diagnostics.ProcessStartInfo
$start.FileName=$Installer
# NSIS parses /D through the end of the raw command line, without quotes.
$start.Arguments='/S /D='+$Destination
$start.UseShellExecute=$true
$child=[System.Diagnostics.Process]::Start($start)
$child.WaitForExit()
if($child.ExitCode -ne 0){throw "NSIS exited $($child.ExitCode)"}
if(!(Test-Path -LiteralPath (Join-Path $Destination 'DeepSeek Harness Suite.exe'))){throw 'Application missing from selected directory'}
