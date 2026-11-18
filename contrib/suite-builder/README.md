---
description: "Build community Harness installers with plugins and runtimes on GitHub Actions."
kind: "package-library"
---

# Community suite builder

English | [中文](README.zh.md)

## Summary

This independent tool packages Harness desktop apps with the plugins in [plugins.md](plugins.md), including their npm dependencies and reviewed external runtimes.

## Table of Contents

- [Build tutorial](#build-tutorial)
- [Runtime rules](#runtime-rules)
- [Model Experience](#model-experience)
- [Known Limitations](#known-limitations)
- [Developer checks](#developer-checks)
- [Windows release signing](#windows-release-signing)
- [Dev Note](#dev-note)

<a id="build-tutorial"></a>
## Build tutorial

1. Edit the single `dsh-plugins` block in `plugins.md`: use an npm package, a pinned npm version, a GitHub repository with matching published npm metadata, or `seed:<name>` for a pinned preset from `automation/ci-inputs.json`.
2. Push the list to GitHub. The [suite workflow](../../.github/workflows/suite-package.yml) also runs when builder files change and supports manual dispatch after it reaches the default branch. During plugin updates, `automation/ci-settings.json` keeps `publishInstallers` false: builds run as tests and only reports are uploaded. Set it true when automatic installer delivery is wanted, or opt in through the manual dispatch input.
3. The workflow downloads SHA-512-verified official desktop inputs, creates a fresh Profile through the DSH plugin manager, resolves dependencies and required peers, and bundles the reviewed runtimes. It uses native Windows x64 and Mac arm64 runners. Intel Mac delivery is deferred because its available official core conflicts with the selected plugin dependencies.
4. When installer publication is enabled, download `suite-win32-x64-*` and `suite-darwin-arm64-*` from the successful Actions run. Each contains an installer, a report and SHA-256 checksums. Artifacts are retained for three days. Windows produces an `.exe`; the Mac ZIP includes an app and installation/signing scripts. Both support a custom installation location.
5. For local builds, run `npm ci` and `npm --prefix tools ci` on the target OS with Node.js 24.9+. Run `node automation/ci-bootstrap.mjs` before `npm run build` on Windows. On Mac, install Python 3.12 and Go 1.27.1, bootstrap, then run `python3 automation/build_macos.py arm64` (or `x64`), `python3 automation/verify_macos.py arm64` and `node automation/ci-mac-smoke.mjs arm64` with the matching architecture. Bootstrap requires fresh staging; prepared input overrides remain available through `inputs.example.json`.

<a id="runtime-rules"></a>
## Runtime rules

[Runtime rules](automation/runtime-rules.json) pin reviewed plugin versions and additional binaries. npm dependencies and missing required peers are resolved automatically. A newly detected external program requires a runtime adapter; an unreviewed version or a new peer conflict stops the build. Existing preset peer warnings remain in reports. Arbitrary README installation commands are never executed. To retain a version, pin it in the list; changing a repository README alone does not trigger this repository's workflow.

<a id="model-experience"></a>
## Model Experience

The builder adds no model tools or prompts. Included plugins determine the installed application behavior.

<a id="known-limitations"></a>
## Known Limitations

Desktop templates, plugin payloads, runtime downloads, installers, user Profiles and credentials are excluded from Git. CI prepares its own inputs from the pinned public sources; no personal Profile or account token is needed. A failed download, dependency guard or runtime check prevents publishing an installer.
Windows probes cover bundled CLI startup, native modules and Desktop Host registration. Mac checks cover ZIP integrity, architecture, executable modes and Framework links; native runners also exercise bundled CLIs, Electron, sharp and node-pty. Mac GUI interaction and account authorization are not automated. Mac installation performs local ad-hoc signing without Apple notarization; Git features require Apple Command Line Tools.
Users authorize their own accounts. Existing nonempty desktop Profiles are preserved, so upgrades do not inject new plugins into an existing Profile. Orb initialization warnings remain in reports.

<a id="developer-checks"></a>
## Developer checks

Run `npm test` for list parsing, staging boundaries, download failures, subprocess failures and existing-profile protection. Actions additionally builds and checks each platform's actual package; successful unit tests alone do not establish installer acceptance.

<a id="windows-release-signing"></a>
## Windows release signing

The Windows slim workflow requires a CA-issued code-signing certificate and an accessible private key on a dedicated, trusted Windows signing runner. The certificate may use a hardware token or a certificate-store-compatible cloud HSM. A self-signed certificate does not establish public trust for Smart App Control. Certificate purchase, identity verification, hardware or cloud enrollment, middleware installation and runner registration are operator steps; this repository does not obtain certificates or change Windows security settings.

Configure repository variables `DSH_SIGNING_CERT_SHA1` (40-character certificate thumbprint), `DSH_WINDOWS_SIGNING_RUNNER` (JSON labels, for example `["self-hosted","Windows","X64","suite-signing"]`), and optionally `DSH_SIGNING_STORE` (`CurrentUser` by default, or `LocalMachine`), `DSH_SIGNTOOL_PATH` (Windows SDK SignTool path) and `DSH_SIGNING_TIMESTAMP_URL` (RFC 3161 service; defaults to DigiCert). The signing runner's Windows account must be authorized to use the key. Keep private keys and token PINs outside Git and do not put them in public variables. Run only reviewed branch code on a runner with signing-key access. Direct Azure Artifact Signing API authentication is not wired into this certificate-store adapter.

`pwsh -NoProfile -File automation/windows-sign.ps1 -Mode Preflight` checks certificate validity, Code Signing usage, CA chain, revocation and SignTool without signing or trying a token PIN. Missing credentials stop CI before desktop downloads. The build signs unsigned PE files, including DLLs and Node native modules, and preserves valid timestamped upstream signatures. Invalid input signatures stop the build. The electron-builder hook signs the generated application executable, NSIS installer and embedded uninstaller with SHA-256 and an RFC 3161 timestamp. Signing errors stop the batch without automatic hardware retries. Final verification checks every staged PE and the installer; the publisher requires matching signature evidence and the final installer digest.

New releases remain blocked until a real certificate is configured and an actual signed build passes. Script tests establish failure handling, not certificate acceptance or Smart App Control acceptance. Qualify the final downloaded installer and an installed application's first launch on a clean Windows machine with Smart App Control enabled before distributing it. The existing macOS local ad-hoc signing remains separate and does not provide Apple Developer ID notarization.

<a id="dev-note"></a>
## Dev Note

None.
