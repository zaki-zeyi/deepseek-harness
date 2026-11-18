param(
    [ValidateSet('Preflight','SignFile','SignGenerated','VerifyFile','SignTree','VerifyTree')][string]$Mode = 'Preflight',
    [string]$Target,
    [string]$ReportPath
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-SigningTools {
    if (-not $IsWindows) { throw 'Windows signing requires Windows and PowerShell 7.' }
    if ($env:DSH_SIGNING_CERT_SHA1 -notmatch '^[A-Fa-f0-9]{40}$') {
        throw 'Configure DSH_SIGNING_CERT_SHA1 with a publicly trusted code-signing certificate on the signing runner. Self-signed certificates are not suitable for release.'
    }
    $store = if ($env:DSH_SIGNING_STORE -eq 'LocalMachine') { 'LocalMachine' } else { 'CurrentUser' }
    if ($env:DSH_SIGNING_STORE -and $env:DSH_SIGNING_STORE -notin @('CurrentUser','LocalMachine')) { throw 'Invalid DSH_SIGNING_STORE.' }
    $cert = Get-Item -LiteralPath "Cert:\$store\My\$env:DSH_SIGNING_CERT_SHA1"
    if (-not $cert.HasPrivateKey -or $cert.NotAfter -le (Get-Date) -or $cert.NotBefore -gt (Get-Date)) { throw 'Signing certificate is expired, not yet valid, or has no accessible private-key association.' }
    $eku = @($cert.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } | ForEach-Object { $_.EnhancedKeyUsages } | ForEach-Object { $_.Value })
    if ('1.3.6.1.5.5.7.3.3' -notin $eku) { throw 'Certificate must have the Code Signing extended key usage.' }
    $chain = [System.Security.Cryptography.X509Certificates.X509Chain]::new()
    try {
        $chain.ChainPolicy.RevocationMode = 'Online'
        $chain.ChainPolicy.UrlRetrievalTimeout = [TimeSpan]::FromSeconds(15)
        if (-not $chain.Build($cert) -or $chain.ChainElements.Count -lt 2) { throw 'Signing certificate must chain to a trusted CA and pass revocation checks.' }
    } finally { $chain.Dispose() }
    $tool = $env:DSH_SIGNTOOL_PATH
    if (-not $tool) {
        $tool = Get-ChildItem -Path "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
    }
    if (-not $tool -or -not (Test-Path -LiteralPath $tool -PathType Leaf)) { throw 'Install Windows SDK SignTool or configure DSH_SIGNTOOL_PATH.' }
    $timestamp = if ($env:DSH_SIGNING_TIMESTAMP_URL) { $env:DSH_SIGNING_TIMESTAMP_URL } else { 'http://timestamp.digicert.com' }
    $uri = [uri]$timestamp
    if (-not $uri.IsAbsoluteUri -or $uri.Scheme -notin @('http','https') -or $uri.UserInfo) { throw 'Invalid RFC 3161 timestamp URL.' }
    return @{ Tool = $tool; Store = $store; Certificate = $cert; Timestamp = $timestamp }
}

function Assert-Signature([string]$File, [switch]$OwnPublisher) {
    $sig = Get-AuthenticodeSignature -LiteralPath $File
    if ($sig.Status -ne 'Valid' -or -not $sig.TimeStamperCertificate) { throw "Missing trusted, timestamped signature: $File ($($sig.Status))" }
    if ($OwnPublisher -and $sig.SignerCertificate.Thumbprint -ne $env:DSH_SIGNING_CERT_SHA1) { throw "Unexpected publisher: $File" }
    & $script:settings.Tool verify /pa /all /tw $File | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "SignTool verification failed: $File" }
    return @{ file = $File; publisher = $sig.SignerCertificate.Subject; thumbprint = $sig.SignerCertificate.Thumbprint }
}

function Sign-One([string]$File, [switch]$Generated) {
    $sig = Get-AuthenticodeSignature -LiteralPath $File
    if ($sig.Status -eq 'Valid' -and $sig.TimeStamperCertificate -and (-not $Generated -or $sig.SignerCertificate.Thumbprint -eq $env:DSH_SIGNING_CERT_SHA1)) {
        return Assert-Signature $File
    }
    if (-not $Generated -and $sig.Status -notin @('Valid','NotSigned')) { throw "Refusing to replace an invalid signature: $File ($($sig.Status))" }
    $signArgs = @('sign','/sha1',$env:DSH_SIGNING_CERT_SHA1,'/s','My','/fd','SHA256','/tr',$script:settings.Timestamp,'/td','SHA256')
    if ($script:settings.Store -eq 'LocalMachine') { $signArgs += '/sm' }
    # No automatic retries: an HSM or token failure requires operator inspection.
    & $script:settings.Tool @signArgs $File | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Code signing failed; no retry attempted: $File" }
    return Assert-Signature $File -OwnPublisher
}

function Get-PortableExecutables([string]$Root) {
    foreach ($file in Get-ChildItem -LiteralPath $Root -File -Recurse) {
        if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Unexpected linked file in signing tree: $($file.FullName)" }
        $stream = [IO.File]::OpenRead($file.FullName)
        try { $isPE = $stream.Length -ge 2 -and $stream.ReadByte() -eq 0x4d -and $stream.ReadByte() -eq 0x5a }
        finally { $stream.Dispose() }
        if ($isPE) { $file.FullName }
    }
}

$script:settings = Get-SigningTools
if ($Mode -eq 'Preflight') { Write-Host 'Signing certificate chain, validity, key association and SignTool available. No private-key operation performed.'; exit 0 }
if (-not $Target -or -not (Test-Path -LiteralPath $Target)) { throw 'Signing target does not exist.' }
if ($Mode -eq 'SignFile') { $null = Sign-One ([IO.Path]::GetFullPath($Target)); exit 0 }
if ($Mode -eq 'SignGenerated') { $null = Sign-One ([IO.Path]::GetFullPath($Target)) -Generated; exit 0 }
if ($Mode -eq 'VerifyFile') { $null = Assert-Signature ([IO.Path]::GetFullPath($Target)) -OwnPublisher; exit 0 }
$entries = @(Get-PortableExecutables $Target | ForEach-Object {
    if ($Mode -eq 'SignTree') { Sign-One $_ } else { Assert-Signature $_ }
})
if (-not $entries.Count) { throw 'No portable executables found in application tree.' }
if ($ReportPath) { @{ status = 'passed'; files = $entries } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding utf8 }
Write-Host "Verified $($entries.Count) timestamped PE signatures."
