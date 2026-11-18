---
description: "Build community Harness installers with plugins and runtimes on GitHub Actions."
kind: "package-library"
---

# Community suite builder

English | [中文](README.zh.md)

## Summary

This independent tool packages Harness desktop apps with the plugins in [plugins.md](plugins.md), including their npm dependencies and reviewed external runtimes. Dependency ownership and the measured Windows baseline: [English](DEPENDENCIES.md) / [中文](DEPENDENCIES.zh.md).

## Table of Contents

- [Build tutorial](#build-tutorial)
- [Runtime rules](#runtime-rules)
- [Model Experience](#model-experience)
- [Known Limitations](#known-limitations)
- [Developer checks](#developer-checks)
- [Dev Note](#dev-note)

<a id="build-tutorial"></a>
## Build tutorial

1. Edit the single `dsh-plugins` block in `plugins.md`: use an npm package, a pinned npm version, a GitHub repository with matching published npm metadata, or `seed:<name>` for a pinned preset from `automation/ci-inputs.json`.
2. Push the list to GitHub. The [suite workflow](../../.github/workflows/suite-package.yml) also runs when builder files change and supports manual dispatch after it reaches the default branch. During plugin updates, `automation/ci-settings.json` keeps `publishInstallers` false: builds run as tests and only reports are uploaded. Set it true when automatic installer delivery is wanted, or opt in through the manual dispatch input.
3. The workflow downloads SHA-512-verified official desktop inputs, creates a fresh Profile through the DSH plugin manager, resolves dependencies and required peers, and bundles the reviewed runtimes. It uses native Windows x64 and Mac arm64 runners. Intel Mac delivery is deferred because its available official core conflicts with the selected plugin dependencies.
4. When installer publication is enabled, download `suite-win32-x64-*` and `suite-darwin-arm64-*` from the successful Actions run. Each contains an installer, a report and SHA-256 checksums. Artifacts are retained for three days. Windows produces a complete offline `.exe` containing the application, plugins and required runtimes; installation does not download a payload. The Mac ZIP includes an app and installation/signing scripts. Both support a custom installation location.
5. For local builds, run `npm ci` and `npm --prefix tools ci` on the target OS with Node.js 24.9+. Run `node automation/ci-bootstrap.mjs` before `npm run build` on Windows. On Mac, install Python 3.12 and Go 1.27.1, bootstrap, then run `python3 automation/build_macos.py arm64` (or `x64`), `python3 automation/verify_macos.py arm64` and `node automation/ci-mac-smoke.mjs arm64` with the matching architecture. Bootstrap requires fresh staging; prepared input overrides remain available through `inputs.example.json`.

<a id="runtime-rules"></a>
## Runtime rules

[Runtime rules](automation/runtime-rules.json) pin reviewed plugin versions and additional binaries. npm dependencies and missing required peers are resolved automatically. A newly detected external program requires a runtime adapter; an unreviewed version or a new peer conflict stops the build. Existing preset peer warnings remain in reports. Arbitrary README installation commands are never executed. To retain a version, pin it in the list; changing a repository README alone does not trigger this repository's workflow.
Windows builds omit the obsolete global Codex CLI, install the prepared plugin directory with the application, and fail if the complete offline installer reaches 600,000,000 bytes. The subscription plugin's own optional CLI dependency is separate. Manual `windows_only` runs upload Windows artifacts without creating a combined Windows/Mac release.

Windows installers use the SHA-256-pinned portable Inno Setup 7.1.1 compiler from [installer-toolchain.json](automation/installer-toolchain.json). Setup supports Unicode and long installation paths, directory selection, installation progress and per-user removal. Identical payload bytes are stored once while every installed destination is retained. A same-directory update recognizes the former NSIS Suite identity and retires its old uninstall registration only after successful installation; other directories and unrelated applications are retained. Silent installation uses `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /DIR="C:\Chosen path\Harness"`.

<a id="model-experience"></a>
## Model Experience

The builder adds no model tools or prompts. Included plugins determine the installed application behavior.

<a id="known-limitations"></a>
## Known Limitations

Desktop templates, plugin payloads, runtime downloads, installers, user Profiles and credentials are excluded from Git. CI prepares its own inputs from the pinned public sources; no personal Profile or account token is needed. A failed download, dependency guard or runtime check prevents publishing an installer.
Windows probes cover bundled CLI startup, native modules and Desktop Host registration. Mac checks cover ZIP integrity, architecture, executable modes and Framework links; native runners also exercise bundled CLIs, Electron, sharp and node-pty. Mac GUI interaction and account authorization are not automated. Mac installation performs local ad-hoc signing without Apple notarization; Git features require Apple Command Line Tools.
Users authorize their own accounts. On Windows, first launch registers prepared local plugin packages through the official manager without downloading or extracting them, shows preparation progress, and adds missing suite plugins to existing Profiles. User-installed versions, disabled plugins and account files are retained; only recorded installer-owned links follow a changed installation location. Mac keeps the previous empty-Profile seeding behavior. Orb initialization warnings remain in reports.

<a id="developer-checks"></a>
## Developer checks

Run `npm test` for list parsing, staging boundaries, download failures, subprocess failures, Profile preservation and Windows directory argument handling. Windows installer acceptance requires a clean environment without an installed Suite; it refuses to replace an existing application. The build exercises fresh and existing Profiles against the real Desktop Host, installs the complete offline EXE into a path containing Chinese characters and spaces with an isolated DSH home, reinstalls it while preserving a user-added file, verifies every installed payload file against its source SHA-256, repeats the runtime checks using installed files, and uninstalls the test copy while checking that all payload files are removed and the user-added file remains. Isolated native migration probes cover matching, unrelated and different-directory legacy registrations. Installation has a 30-minute deadline. Actions additionally builds and checks actual platform packages; unit tests alone do not validate an installer. Generated `build`, `dist` and `downloads` trees are excluded from bilingual source-document discovery.

<a id="dev-note"></a>
## Dev Note

None.
