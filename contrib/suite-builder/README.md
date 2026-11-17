---
description: "Prepare community Harness desktop installers from plugin lists and existing desktop templates."
kind: "package-library"
---

# Community suite builder

English | [中文](README.zh.md)

## Summary

This independent tool packages prepared Harness desktop templates with the plugins in [plugins.md](plugins.md). It does not change the monorepo build.

## Table of Contents

- [Build tutorial](#build-tutorial)
- [Runtime rules](#runtime-rules)
- [Model Experience](#model-experience)
- [Known Limitations](#known-limitations)
- [Developer checks](#developer-checks)
- [Dev Note](#dev-note)

<a id="build-tutorial"></a>
## Build tutorial

1. Use Windows x64 with Node.js 24.9+. Run `npm install` here, then `npm --prefix tools install`.
2. Copy `inputs.example.json` to ignored `inputs.local.json`. Supply a prepared Windows app and materialized desktop Profile. The app needs the suite seed loader and bundled DSH/Node/pnpm support files; a stock executable alone is insufficient.
3. Edit the single `dsh-plugins` block in `plugins.md`: use an npm version, a GitHub repository with matching published npm metadata, or `seed:<name>` to retain an existing dependency.
4. Run `npm run plan`, then `npm run build`. `npm run watch` rebuilds on list changes. Installers and reports appear under `dist/automated`; Windows installation supports a custom directory.
5. For Mac cross-packaging, supply each prepared Mac app and existing suite baseline ZIP. Set `windowsStaging` to a successful Windows staging directory, or leave it unset to select the latest successful build. Run `打包macOS.cmd`.

<a id="runtime-rules"></a>
## Runtime rules

[Runtime rules](automation/runtime-rules.json) pin reviewed plugin versions and additional binaries. npm dependencies and missing required peers are resolved automatically. Unknown external processes require an adapter; new peer version conflicts stop the build. Existing seed peer warnings remain in reports and require host registration checks.

<a id="model-experience"></a>
## Model Experience

The builder adds no model tools or prompts. Included plugins determine the installed application behavior.

<a id="known-limitations"></a>
## Known Limitations

Templates, plugin payloads, runtime downloads, installers, user Profiles and credentials are excluded from Git. A clean clone needs the prepared inputs above; this is not a bootstrap from upstream source and does not configure GitHub Actions.
Windows probes cover bundled CLI startup, native modules and Desktop Host registration. Mac checks on Windows cover binary architecture, ZIP CRC, executable modes and Framework links; actual startup, signing and permissions require a Mac. Mac installation performs local ad-hoc signing; Git features require Apple Command Line Tools.
Users authorize their own accounts. Existing nonempty desktop Profiles are preserved, so upgrades do not inject new plugins into an existing Profile. Orb initialization warnings remain in reports.

<a id="developer-checks"></a>
## Developer checks

Run `npm test` for list parsing and staging-path checks. Syntax/import checks for this source import do not replace complete installer or Mac runtime acceptance.

<a id="dev-note"></a>
## Dev Note

None.
