---
description: "Plugin dependency ownership, optional voice models, and measured Windows package sizes."
kind: "package-library"
---

# Plugin dependencies and sizes

English | [中文](DEPENDENCIES.zh.md)

## Summary

Industry research no longer requires Codex CLI, and current Windows build rules omit that global runtime. The tables measure the current Windows offline payload; its release report records the download size.

## Table of Contents

- [Plugin dependencies](#plugin-dependencies)
- [External programs](#external-programs)
- [Measurement and optional features](#measurement-and-optional-features)
- [Dev Note](#dev-note)

<a id="plugin-dependencies"></a>
## Plugin dependencies

Sizes include private bundled and exclusive npm dependencies, measured as installed file sizes in decimal MB, not download sizes.

| Plugin | Audited version | Plugin and npm dependencies | Target external programs |
|---|---|---:|---|
| Brand (`dsh-brand`) | 0.2.0-rc.6 | 0.10 MB | None |
| Market (`dshmarket`) | 1.73.19 | 4.36 MB | None |
| IM (`@xmanrui/dsh-im`) | 5.10.0 | 78.26 MB | None separately bundled |
| Floating ball (`dsh-orb`) | 0.2.1 | 149.46 MB | Orb Electron |
| Free models (`dsh-our-free-model`) | 2.8.3 | 34.14 MB | Bun for the OpenCode free lane; mihomo for its egress support |
| Industry research (`dsh-industry-research`) | 0.13.2 | 115.37 MB | Lark CLI; Codex CLI is removed from the current industry dependency requirement |
| Codex subscription (`dsh-codex-subscription`) | 3.2.21 | 3.24 MB | Basic OAuth/model access does not require the separately bundled Codex CLI |

Shared profile dependencies total 1.77 MB and are counted once. The plugin/profile total is 386.68 MB. Dependencies supplied by Harness itself are excluded. The subscription plugin's optional subtask feature manages a separate profile-owned CLI; it does not establish a requirement for the old package's global Codex CLI.

<a id="external-programs"></a>
## External programs

| Program | Audited Windows size | Ownership and current requirement |
|---|---:|---|
| Orb Electron | 383.65 MB | Floating-ball helper runtime; the bundle uses the floating-ball plugin, not the full Orb desktop fork |
| Bun | 230.58 MB | Free-model plugin's OpenCode free lane |
| mihomo | 61.23 MB | Free-model plugin's egress support |
| Lark CLI | 50.54 MB | Industry research's Feishu authentication and operations |
| Git | 96.24 MB | Shared command-line tool; not assigned exclusively to one plugin |

External programs are excluded from the plugin table. Orb and its Electron runtime total about 533.11 MB. Global Codex CLI is 0 MB. Installed Bun includes identical bun/bunx entries; the Inno archive stores identical content once and restores both entries.

<a id="measurement-and-optional-features"></a>
## Measurement and optional features

The [size audit](automation/audit-plugin-sizes.mjs) measures the current complete offline payload; release attachments include its JSON. Shared dependency attribution reconciles with all measured profile modules; rounded rows may differ from totals.

Orb voice model weights are not bundled: 0 MB in the audited payload. Voice is off by default; the user chooses whether to enable it and download models. Voice inference libraries remain available and are distinct from model weights. The build checks reject packaged Orb model weights.

The [plugin selection list](plugins.md), [pinned input sources](automation/ci-inputs.json), and [runtime rules](automation/runtime-rules.json) control builds. Current Windows rules omit global Codex CLI and pin subscription to 3.2.21; plugin and runtime sizes are separate and cannot be summed to obtain the compressed installer download size.

<a id="dev-note"></a>
## Dev Note

This inventory records dependency ownership and a measured baseline. A dependency removal needs a separate build-rule change and runnable package checks before installer publication.
