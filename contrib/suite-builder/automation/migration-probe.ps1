param([ValidateSet('create','removed','preserved','cleanup')][string]$Mode,[string]$Guid,[string]$AppRoot)
$ErrorActionPreference='Stop'
if($Guid -notmatch '^[0-9a-f-]{36}$' -or $Guid -eq '300b6a8d-07ad-5ad6-95e0-3aeba88c5a0d'){throw 'Probe identity must be isolated'}
$install='HKCU:\Software\'+$Guid
$uninstall='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\'+$Guid
function Confirm-ProbeRoot([string]$value){
  $full=[IO.Path]::GetFullPath($value)
  $prefix=[IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')+'\DSH Inno migration '
  if(!$full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected probe path'}
  $marker=Get-Content -LiteralPath (Join-Path $full 'migration-probe-owner.json') -Raw | ConvertFrom-Json
  if($marker.guid -ne $Guid){throw 'Probe path belongs to a different invocation'}
}
if($Mode -eq 'cleanup'){
  if(Test-Path -LiteralPath $install){
    $location=(Get-ItemProperty -LiteralPath $install).InstallLocation
    Confirm-ProbeRoot $location
    if(Test-Path -LiteralPath $uninstall){Remove-Item -LiteralPath $uninstall -Recurse}
    Remove-Item -LiteralPath $install -Recurse
  }elseif(Test-Path -LiteralPath $uninstall){throw 'Cannot establish ownership of remaining probe registration'}
  exit 0
}
Confirm-ProbeRoot $AppRoot
if($Mode -eq 'create'){
  if((Test-Path -LiteralPath $install) -or (Test-Path -LiteralPath $uninstall)){throw 'Probe identity already registered'}
  New-Item -Path $install | Out-Null
  New-ItemProperty -LiteralPath $install -Name InstallLocation -Value $AppRoot | Out-Null
  New-Item -Path $uninstall | Out-Null
  New-ItemProperty -LiteralPath $uninstall -Name DisplayName -Value 'DSH installer migration probe' | Out-Null
  New-ItemProperty -LiteralPath $uninstall -Name UninstallString -Value ('"'+(Join-Path $AppRoot 'Uninstall DeepSeek Harness Suite.exe')+'" /currentuser') | Out-Null
}elseif($Mode -eq 'removed'){
  if((Test-Path -LiteralPath $install) -or (Test-Path -LiteralPath $uninstall)){throw 'Legacy probe registration was not retired'}
  if(Test-Path -LiteralPath (Join-Path $AppRoot 'Uninstall DeepSeek Harness Suite.exe')){throw 'Legacy uninstaller was not retired'}
}else{
  if(!(Test-Path -LiteralPath $install) -or !(Test-Path -LiteralPath $uninstall)){throw 'Unrelated legacy probe registration was removed'}
  if((Get-ItemProperty -LiteralPath $install).InstallLocation -ne $AppRoot){throw 'Legacy probe location changed'}
  if(!(Test-Path -LiteralPath (Join-Path $AppRoot 'Uninstall DeepSeek Harness Suite.exe'))){throw 'Unrelated uninstaller was removed'}
}
