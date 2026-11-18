---
description: "Plugin dependency ownership, optional voice models, and measured Windows package sizes."
kind: "package-library"
---

# Plugin dependencies and sizes

English | [中文](DEPENDENCIES.zh.md)

## Summary

Industry research no longer requires Codex CLI, and current Windows build rules omit that global runtime. The measurements below retain the published older package's baseline; the new complete offline installer's size must come from its own build report.

## Table of Contents

- [Plugin dependencies](#plugin-dependencies)
- [External programs](#external-programs)
- [Measurement and optional features](#measurement-and-optional-features)
- [Dev Note](#dev-note)

<a id="plugin-dependencies"></a>
## Plugin dependencies

Sizes below are the audited Windows baseline, including private bundled and exclusive npm dependencies. They are uncompressed file sizes in decimal MB, not download sizes or a new measurement of the revised industry plugin.

| Plugin | Audited version | Plugin and npm dependencies | Target external programs |
|---|---|---:|---|
| Brand (`dsh-brand`) | 0.2.0-rc.6 | 0.10 MB | None |
| Market (`dshmarket`) | 1.73.19 | 4.36 MB | None |
| IM (`@xmanrui/dsh-im`) | 5.10.0 | 78.26 MB | None separately bundled |
| Floating ball (`dsh-orb`) | 0.2.1 | 149.46 MB | Orb Electron |
| Free models (`dsh-our-free-model`) | 2.8.3 | 34.14 MB | Bun for the OpenCode free lane; mihomo for its egress support |
| Industry research (`dsh-industry-research`) | 0.13.2 baseline | 115.37 MB | Lark CLI; Codex CLI is removed from the current industry dependency requirement |
| Codex subscription (`dsh-codex-subscription`) | 3.2.19 | 3.30 MB | Basic OAuth/model access does not require the separately bundled Codex CLI |

Shared profile dependencies total 1.77 MB and are counted once. The plugin/profile total is 386.74 MB. Dependencies supplied by Harness itself are excluded. The subscription plugin's optional subtask feature manages a separate profile-owned CLI; it does not establish a requirement for the old package's global Codex CLI.

<a id="external-programs"></a>
## External programs

| Program | Audited Windows size | Ownership and current requirement |
|---|---:|---|
| Orb Electron | 383.65 MB | Floating-ball helper runtime; the bundle uses the floating-ball plugin, not the full Orb desktop fork |
| Bun | 230.58 MB | Free-model plugin's OpenCode free lane |
| mihomo | 61.23 MB | Free-model plugin's egress support |
| Lark CLI | 50.54 MB | Industry research's Feishu authentication and operations |
| Git | 96.24 MB | Shared command-line tool; not assigned exclusively to one plugin |
| Codex CLI | 515.19 MB | Legacy payload in the published older installer; removed from current Windows builds and unnecessary for basic industry and subscription features |

These external programs are not included in the plugin table. Orb plus its Electron runtime totals approximately 533.11 MB. The unchanged published Windows payload is 906,587,873 bytes compressed, and its online bootstrapper is 13,312 bytes; editing this inventory changes neither file.

<a id="measurement-and-optional-features"></a>
## Measurement and optional features

Measurements come from the [Windows size audit](https://github.com/zaki-zeyi/deepseek-harness/actions/runs/44070796774), using the same payload as the [Windows online installer release](https://github.com/zaki-zeyi/deepseek-harness/releases/tag/community-windows-online-1.1.0-build-1). Shared dependency attribution reconciles with all measured profile modules; rounded rows may differ from totals.

Orb voice model weights are not bundled: 0 MB in the audited payload. Voice is off by default; the user chooses whether to enable it and download models. Voice inference libraries remain available and are distinct from model weights. The build checks reject packaged Orb model weights.

The [plugin selection list](plugins.md), [pinned input sources](automation/ci-inputs.json), and [runtime rules](automation/runtime-rules.json) control builds. Current Windows rules omit global Codex CLI and pin subscription to 3.2.21; the measurements above describe the older package and do not establish that a newer installer has been published.

<a id="dev-note"></a>
## Dev Note

This inventory records dependency ownership and a measured baseline. A dependency removal needs a separate build-rule change and runnable package checks before installer publication.
