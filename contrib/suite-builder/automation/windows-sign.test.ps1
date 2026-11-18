$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# Load only pure workflow functions; no certificate store, private key or system settings are touched.
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'windows-sign.ps1'), [ref]$tokens, [ref]$parseErrors)
if ($parseErrors) { throw ($parseErrors | Out-String) }
foreach ($name in @('Assert-Signature','Sign-One','Get-PortableExecutables')) {
    $definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    Invoke-Expression $definition.Extent.Text
}
$script:state = 'NotSigned'
$script:timestamp = $false
$script:toolExit = 0
$script:calls = 0
$script:publisher = 'other'
function Get-AuthenticodeSignature {
    param($LiteralPath)
    return [pscustomobject]@{ Status = $script:state; TimeStamperCertificate = $(if ($script:timestamp) { 'timestamp' } else { $null }); SignerCertificate = [pscustomobject]@{ Thumbprint = $script:publisher; Subject = 'fixture publisher' } }
}
function Invoke-FakeSignTool {
    if ($args[0] -eq 'sign') {
        $script:calls++
        $script:state = 'Valid'
        $script:timestamp = $true
        $script:publisher = $env:DSH_SIGNING_CERT_SHA1
    }
    $global:LASTEXITCODE = $script:toolExit
}
function Must-Fail([scriptblock]$Action, [string]$Message) {
    try { & $Action | Out-Null } catch { if ($_.Exception.Message -notlike $Message) { throw }; return }
    throw "Expected rejection: $Message"
}
$script:settings = @{ Tool = 'Invoke-FakeSignTool'; Store = 'CurrentUser'; Timestamp = 'https://timestamp.example.test' }
$oldThumbprint = $env:DSH_SIGNING_CERT_SHA1
$temp = Join-Path ([IO.Path]::GetTempPath()) ('suite-signing-test-' + [guid]::NewGuid())
$null = New-Item -ItemType Directory -Path $temp
try {
    $env:DSH_SIGNING_CERT_SHA1 = 'a' * 40
    $null = Sign-One 'unsigned-fixture.exe'
    if ($script:calls -ne 1) { throw 'Unsigned file was not signed exactly once.' }
    $script:publisher = 'upstream'
    $null = Sign-One 'upstream-fixture.dll'
    if ($script:calls -ne 1) { throw 'Valid upstream signature was replaced.' }
    Must-Fail { Assert-Signature 'wrong-publisher.exe' -OwnPublisher } '*Unexpected publisher*'
    $script:state = 'HashMismatch'
    Must-Fail { Sign-One 'tampered-fixture.node' } '*Refusing to replace*'
    if ($script:calls -ne 1) { throw 'Tampered input reached signer.' }
    $script:state = 'Valid'
    $script:timestamp = $false
    Must-Fail { Assert-Signature 'no-timestamp.exe' } '*Missing trusted, timestamped signature*'
    $script:state = 'NotSigned'
    $script:toolExit = 1
    Must-Fail { Sign-One 'signer-failed.exe' } '*Code signing failed*'
    if ($script:calls -ne 2) { throw 'Failed signing was retried.' }
    $script:toolExit = 2
    Must-Fail { Assert-Signature 'verification-warning.exe' } '*SignTool verification failed*'
    $script:toolExit = 0
    [IO.File]::WriteAllBytes((Join-Path $temp 'native.node'), [byte[]](0x4d,0x5a,0,0))
    [IO.File]::WriteAllText((Join-Path $temp 'script.js'), 'plain text')
    $pe = @(Get-PortableExecutables $temp)
    if ($pe.Count -ne 1 -or [IO.Path]::GetFileName($pe[0]) -ne 'native.node') { throw 'Native PE detection failed.' }
    Write-Host 'PASS signing workflow: unsigned signing, upstream preservation, tamper/publisher/timestamp rejection, failed-sign no retry, verification warning rejection, native PE detection.'
} finally {
    $env:DSH_SIGNING_CERT_SHA1 = $oldThumbprint
    # This GUID directory was allocated by this test under the OS temporary root.
    if ([IO.Path]::GetDirectoryName($temp) -ne [IO.Path]::GetTempPath().TrimEnd([IO.Path]::DirectorySeparatorChar)) { throw 'Unexpected test cleanup root.' }
    Remove-Item -LiteralPath $temp -Recurse -Force
}
