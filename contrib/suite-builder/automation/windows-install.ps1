param([string]$Installer,[string]$Destination,[ValidateSet('nsis','inno')][string]$Engine='nsis',[switch]$RequireFreshSuite,[switch]$CheckOnly)
$ErrorActionPreference='Stop'
if($RequireFreshSuite){
  foreach($root in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')){
    foreach($entry in Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue){
      $installed=Get-ItemProperty -LiteralPath $entry.PSPath -ErrorAction SilentlyContinue
      if($installed.DisplayName -eq 'DeepSeek Harness Suite'){throw 'Suite is already installed; use a clean Windows runner to preserve the existing application.'}
    }
  }
}
if($CheckOnly){exit 0}
$start=New-Object System.Diagnostics.ProcessStartInfo
$start.FileName=$Installer
if($Engine -eq 'inno'){
  $start.Arguments='/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /NOICONS /SP- /DIR="'+$Destination+'"'
}else{
  # NSIS parses /D through the end of the raw command line, without quotes.
  $start.Arguments='/S /D='+$Destination
}
$start.UseShellExecute=$true
$child=[System.Diagnostics.Process]::Start($start)
$child.WaitForExit()
if($child.ExitCode -ne 0){throw "Installer exited $($child.ExitCode)"}
if(!(Test-Path -LiteralPath (Join-Path $Destination 'DeepSeek Harness Suite.exe'))){throw 'Application missing from selected directory'}
