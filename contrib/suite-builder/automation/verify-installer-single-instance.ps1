$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Run this wizard-only check on an isolated Windows Actions runner.' }
$latest = Get-Content -LiteralPath 'dist/automated/latest.json' -Raw | ConvertFrom-Json
$installer = [IO.Path]::GetFullPath($latest.artifact)
$owned = Join-Path $env:RUNNER_TEMP ('suite-installer-single-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $owned | Out-Null
$copy = Join-Path $owned 'renamed-installer.exe'
Copy-Item -LiteralPath $installer -Destination $copy
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class SuiteWizardWindows {
  public delegate bool WindowCallback(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback, IntPtr data);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  public static int Count(uint owner) {
    int count=0;
    EnumWindows((window,data)=>{uint pid;GetWindowThreadProcessId(window,out pid);if(pid==owner)count++;return true;},IntPtr.Zero);
    return count;
  }
}
'@
$children = [Collections.Generic.List[Diagnostics.Process]]::new()
function Start-OwnedWizard([string]$file, [string]$case) {
  $p = Start-Process -FilePath $file -ArgumentList @('/D=' + (Join-Path $owned ('not-installed-' + $case))) -PassThru -WindowStyle Hidden
  $children.Add($p)
  return $p
}
function Wait-Wizard([Diagnostics.Process]$p) {
  $clock = [Diagnostics.Stopwatch]::StartNew()
  while ($clock.Elapsed.TotalSeconds -lt 30) {
    $p.Refresh()
    if ($p.HasExited) { throw 'The first installer exited before opening its wizard.' }
    if ([SuiteWizardWindows]::Count([uint32]$p.Id) -gt 0) { return }
    Start-Sleep -Milliseconds 100
  }
  throw 'Installer wizard did not initialize.'
}
function Stop-OwnedWizards {
  foreach ($p in $children) {
    $p.Refresh()
    if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
    if (-not $p.WaitForExit(10000)) { throw 'Owned installer did not stop.' }
  }
}
try {
  $first = Start-OwnedWizard $installer 'first'
  Wait-Wizard $first
  $duplicate = Start-OwnedWizard $copy 'duplicate'
  if (-not $duplicate.WaitForExit(20000)) { throw 'A renamed second installer remained active.' }
  $first.Refresh()
  if ($first.HasExited) { throw 'Repeated launch closed the existing installer.' }
  Write-Output 'PASS repeated launch: original remains, renamed duplicate exits'
  Stop-OwnedWizards
  $a = Start-OwnedWizard $installer 'race-a'
  $b = Start-OwnedWizard $copy 'race-b'
  $clock = [Diagnostics.Stopwatch]::StartNew()
  do {
    $a.Refresh(); $b.Refresh()
    $alive = @(@($a,$b) | Where-Object { -not $_.HasExited })
    if ($alive.Count -eq 1) { break }
    Start-Sleep -Milliseconds 100
  } while ($clock.Elapsed.TotalSeconds -lt 20)
  if ($alive.Count -ne 1) { throw 'Simultaneous launches did not converge to one installer.' }
  Wait-Wizard $alive[0]
  Write-Output 'PASS simultaneous launches: exactly one installer remains'
  Stop-OwnedWizards
  $reopened = Start-OwnedWizard $installer 'reopened'
  Wait-Wizard $reopened
  Write-Output 'PASS installer lock released after previous processes exit'
  $report = Get-Content -LiteralPath $latest.report -Raw | ConvertFrom-Json
  $report.checks += [pscustomobject]@{name='installer-single-instance';status='passed';scenarios=@('renamed duplicate exits','simultaneous launches converge','exit releases mutex')}
  $report | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $latest.report -Encoding utf8NoBOM
  Copy-Item -LiteralPath $latest.report -Destination (Join-Path (Split-Path $installer) 'report.json') -Force
} finally {
  Stop-OwnedWizards
  foreach ($p in $children) { $p.Dispose() }
}
