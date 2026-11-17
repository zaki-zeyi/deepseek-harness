---
description: "通过插件列表与已有桌面模板构建社区 Harness 整合安装包。"
kind: "package-library"
---

# 社区整合打包工具

[English](README.md) | 中文

## 摘要

本独立工具把已准备的 Harness 桌面模板与 [插件列表](plugins.md) 中的插件整合打包，不修改主仓库构建。

## 目录

- [构建教程](#build-tutorial)
- [运行依赖规则](#runtime-rules)
- [模型体验](#model-experience)
- [已知限制](#known-limitations)
- [开发检查](#developer-checks)
- [开发说明](#dev-note)

<a id="build-tutorial"></a>
## 构建教程

1. 构建机使用 Windows x64 和 Node.js 24.9+，在本目录执行 `npm install` 和 `npm --prefix tools install`。
2. 复制 `inputs.example.json` 为被 Git 忽略的 `inputs.local.json`，指定已准备的 Windows 应用和完整桌面 Profile。应用必须具有整合包种子加载器及内置 DSH、Node、pnpm 支持文件，普通官方可执行文件不能直接代替。
3. 修改 `plugins.md` 中唯一的 `dsh-plugins` 代码块，填入 npm 版本、具有对应已发布 npm 元数据的 GitHub 仓库，或用 `seed:<name>` 保留已有依赖。
4. 执行 `npm run plan` 和 `npm run build`。`npm run watch` 会监听列表变化。安装器和报告位于 `dist/automated`，Windows 安装支持自定义目录。
5. Mac 交叉打包需提供各架构的 Mac 应用目录和现有整合包基线 ZIP。设置 `windowsStaging` 指向成功的 Windows 构建目录，或留空以选取最新成功构建，然后执行 `打包macOS.cmd`。

<a id="runtime-rules"></a>
## 运行依赖规则

[运行依赖规则](automation/runtime-rules.json) 固定已适配插件版本及额外二进制。npm 依赖和缺失的必需 peer 自动解析；未知外部程序需要适配规则，新 peer 版本冲突会阻止构建。已有种子的 peer 警告保留在报告中，并要求宿主注册检查。

<a id="model-experience"></a>
## 模型体验

打包工具不增加模型工具或提示词，安装后的应用行为由所选插件决定。

<a id="known-limitations"></a>
## 已知限制

Git 中不包含模板、插件负载、运行库下载、安装包、用户 Profile 或凭据。干净克隆仍需准备上述输入；本工具不能从上游源码自动准备全部输入，也不配置 GitHub Actions。
Windows 探针覆盖内置 CLI 启动、原生模块及 Desktop Host 注册。Windows 上的 Mac 检查覆盖二进制架构、ZIP CRC、执行权限及 Framework 链接；实际启动、签名和权限需要 Mac。Mac 安装在本机进行 ad-hoc 签名，Git 功能需要 Apple Command Line Tools。
用户自行授权账号。已有非空桌面 Profile 会保留，因此升级程序不会自动向已有 Profile 注入新插件。Orb 初始化警告保留在报告中。

<a id="developer-checks"></a>
## 开发检查

执行 `npm test` 检查列表解析和构建路径。源码导入的语法及模块检查不能替代完整安装包或 Mac 实机验收。

<a id="dev-note"></a>
## 开发说明

无。
