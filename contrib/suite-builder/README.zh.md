---
description: "通过 GitHub Actions 构建包含插件和运行依赖的社区 Harness 安装包。"
kind: "package-library"
---

# 社区整合打包工具

[English](README.md) | 中文

## 摘要

本独立工具把 Harness 桌面应用与 [插件列表](plugins.md) 中的插件整合打包，包含 npm 依赖和已适配的外部运行程序。依赖对应关系及 Windows 实测基线：[English](DEPENDENCIES.md) / [中文](DEPENDENCIES.zh.md)。

## 目录

- [构建教程](#build-tutorial)
- [运行依赖规则](#runtime-rules)
- [模型体验](#model-experience)
- [已知限制](#known-limitations)
- [开发检查](#developer-checks)
- [开发说明](#dev-note)

<a id="build-tutorial"></a>
## 构建教程

1. 修改 `plugins.md` 中唯一的 `dsh-plugins` 代码块：填写 npm 包名、固定 npm 版本、具有对应已发布 npm 元数据的 GitHub 仓库，或使用 `seed:<name>` 引用 `automation/ci-inputs.json` 中的固定预设。
2. 将列表推送到 GitHub。[整合包工作流](../../.github/workflows/suite-package.yml) 也会在打包源码变化时运行；进入默认分支后支持手动触发。插件更新期间，`automation/ci-settings.json` 中的 `publishInstallers` 保持 false，只运行测试构建并上传报告。需要自动交付安装包时将其设为 true，或在手动触发时勾选发布选项。
3. 工作流下载经过 SHA-512 校验的官方桌面输入，通过 DSH 插件管理器创建全新 Profile，解析依赖及必需 peer，再内置已适配的运行程序。分别使用原生 Windows x64 和 Mac arm64 构建机。Intel Mac 可用官方底座与所选插件存在依赖冲突，暂缓交付。
4. 启用安装包发布后，在成功的 Actions 运行页面下载 `suite-win32-x64-*` 和 `suite-darwin-arm64-*`。每份包含安装包、报告及 SHA-256 校验值，保留三天。Windows 生成 `.exe`；Mac ZIP 包含应用和安装、签名脚本。两者均支持自定义安装位置。
5. 本地构建时，在目标系统安装 Node.js 24.9+，执行 `npm ci` 和 `npm --prefix tools ci`。Windows 先执行 `node automation/ci-bootstrap.mjs`，再执行 `npm run build`。Mac 需 Python 3.12 和 Go 1.27.1，完成 bootstrap 后执行 `python3 automation/build_macos.py arm64`（或 `x64`）、`python3 automation/verify_macos.py arm64` 和 `node automation/ci-mac-smoke.mjs arm64`，保持架构一致。Bootstrap 需要全新暂存目录；仍可通过 `inputs.example.json` 指定已准备的输入。

<a id="runtime-rules"></a>
## 运行依赖规则

[运行依赖规则](automation/runtime-rules.json) 固定已适配插件版本及额外二进制。npm 依赖和缺失的必需 peer 自动解析；发现新的外部程序需要补充适配器，未审核版本或新的 peer 冲突会阻止构建。已有预设的 peer 警告保留在报告中，不执行 README 中任意安装命令。需要保持版本时应在列表固定版本；只修改其他仓库的 README 不会触发本仓库工作流。
Windows 构建不再携带过时的全局 Codex CLI，将未压缩的插件种子与应用统一压缩，最终安装包达到 600,000,000 字节即构建失败。此限制覆盖完整下载负载。订阅插件自身的可选 CLI 依赖另计。手动选择 `windows_only` 可只上传 Windows 产物，不创建 Windows/Mac 合并发布。

<a id="model-experience"></a>
## 模型体验

打包工具不增加模型工具或提示词，安装后的应用行为由所选插件决定。

<a id="known-limitations"></a>
## 已知限制

Git 中不包含桌面模板、插件负载、运行库下载、安装包、用户 Profile 或凭据。CI 从固定公开来源准备输入，无需个人 Profile 或账号令牌。下载、依赖检查或运行检查失败时，不发布安装包。
Windows 探针覆盖内置 CLI 启动、原生模块及 Desktop Host 注册。Mac 检查覆盖 ZIP 完整性、架构、执行权限及 Framework 链接；原生构建机还运行内置 CLI、Electron、sharp 和 node-pty。Mac 图形界面交互和账号授权不自动验收。Mac 安装使用本机 ad-hoc 签名，不含 Apple 公证；Git 功能需要 Apple Command Line Tools。
用户自行授权账号。已有非空桌面 Profile 会保留，因此升级程序不会自动向已有 Profile 注入新插件。Orb 初始化警告保留在报告中。

<a id="developer-checks"></a>
## 开发检查

执行 `npm test` 检查列表解析、暂存目录边界、下载失败、子进程失败和已有 Profile 保护。Actions 还会构建并检查各平台的实际安装包；单元测试通过不能替代安装包验收。

<a id="dev-note"></a>
## 开发说明

无。
