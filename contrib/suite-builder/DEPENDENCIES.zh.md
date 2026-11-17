---
description: "插件与依赖的对应关系、可选语音模型及 Windows 安装负载实测体积。"
kind: "package-library"
---

# 插件、依赖及体积清单

[English](DEPENDENCIES.md) | 中文

## 摘要

目标依赖清单按维护者确认更新：行研插件不再需要 Codex CLI。已发布安装包仍包含原来的负载；本文档不会删除文件或发布新安装包。

## 目录

- [插件依赖](#plugin-dependencies)
- [额外运行程序](#external-programs)
- [统计口径与可选功能](#measurement-and-optional-features)
- [开发说明](#dev-note)

<a id="plugin-dependencies"></a>
## 插件依赖

以下大小来自已审计的 Windows 基线，包含随插件携带的私有依赖及独享 npm 依赖。单位为十进制 MB，统计解压后的文件大小，不是下载大小，也不是对修订后行研插件的新测量。

| 插件 | 实测版本 | 插件及 npm 依赖 | 目标额外运行依赖 |
|---|---|---:|---|
| 品牌插件（`dsh-brand`） | 0.2.0-rc.6 | 0.10 MB | 无 |
| 插件市场（`dshmarket`） | 1.73.19 | 4.36 MB | 无 |
| IM 插件（`@xmanrui/dsh-im`） | 5.10.0 | 78.26 MB | 无另行内置的独立程序 |
| 悬浮球（`dsh-orb`） | 0.2.1 | 149.46 MB | Orb Electron |
| 免费模型（`dsh-our-free-model`） | 2.8.3 | 34.14 MB | OpenCode 免费通道需要 Bun；出口支持使用 mihomo |
| 行研插件（`dsh-industry-research`） | 0.13.2 基线 | 115.37 MB | Lark CLI；当前行研依赖要求已移除 Codex CLI |
| Codex 订阅（`dsh-codex-subscription`） | 3.2.19 | 3.30 MB | 基础 OAuth 和模型接入不需要另外内置的 Codex CLI |

共享 Profile 依赖共 1.77 MB，只计一次；插件及 Profile 依赖总计 386.74 MB。Harness 宿主本身提供的依赖未计入。订阅插件的可选子任务功能单独管理 Profile 内的 CLI，不能据此认定旧包中的全局 Codex CLI 必须保留。

<a id="external-programs"></a>
## 额外运行程序

| 程序 | Windows 实测大小 | 对应关系与当前要求 |
|---|---:|---|
| Orb Electron | 383.65 MB | 悬浮球辅助进程的运行环境；使用的是悬浮球插件，不是完整 Orb 桌面改版 |
| Bun | 230.58 MB | 免费模型插件的 OpenCode 免费通道 |
| mihomo | 61.23 MB | 免费模型插件的出口支持 |
| Lark CLI | 50.54 MB | 行研插件的飞书授权与操作 |
| Git | 96.24 MB | 公共命令行工具，不全部归属某一个插件 |
| Codex CLI | 515.19 MB | 已发布包仍带有的历史负载；不再列为当前行研依赖；未来打包移除前需复核其他使用方 |

这些额外程序未包含在插件表的体积中。Orb 加上其 Electron 运行环境合计约 533.11 MB。现有已发布 Windows 负载压缩后为 906,587,873 字节，在线安装入口为 13,312 字节；修改本清单不会改变这两个文件。

<a id="measurement-and-optional-features"></a>
## 统计口径与可选功能

数据来自 [Windows 体积审计](https://github.com/zaki-zeyi/deepseek-harness/actions/runs/44070796774)，使用的负载与 [Windows 在线安装器发布版](https://github.com/zaki-zeyi/deepseek-harness/releases/tag/community-windows-online-1.1.0-build-1) 相同。共享依赖归属与全部实测 Profile 模块完成总量核对；表格四舍五入后可能与总量略有差异。

不预装 Orb 语音模型权重：实测负载中为 0 MB。语音默认关闭，由用户自行选择启用并下载模型。语音推理库继续保留，它们与模型权重不同。打包检查会拒绝携带 Orb 模型权重。

[插件选择列表](plugins.md)、[固定输入来源](automation/ci-inputs.json) 和 [运行依赖规则](automation/runtime-rules.json) 控制实际构建。它们仍对应此前发布的负载，包含 Codex CLI；上面的行研目标依赖修订不代表这些构建规则或已发布安装包已经完成裁剪。

<a id="dev-note"></a>
## 开发说明

本清单记录依赖归属及实测基线。删除依赖需要另行修改构建规则，并在安装包发布前完成实际运行检查。
