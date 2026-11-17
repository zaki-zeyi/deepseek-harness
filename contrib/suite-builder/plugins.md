# 整合插件列表

只修改下面代码块：每行一个 npm 包名（可带版本）或 GitHub 仓库地址。
`seed:` 表示使用 ci-inputs.json 中已经固定的预设版本。删除一行会从新包中移除该插件。
GitHub 地址优先使用仓库 package.json 对应的 npm 已发布版本；不会直接执行 README 中的命令。

```dsh-plugins
seed:dsh-brand
seed:dshmarket
seed:@xmanrui/dsh-im
seed:dsh-our-free-model
seed:dsh-industry-research
dsh-codex-subscription@3.2.19
```

提交并推送此列表后，GitHub Actions 自动测试 Windows x64 和 macOS arm64 打包；插件更新期间仅上传报告。准备交付时，将 automation/ci-settings.json 的 publishInstallers 设为 true，即可自动上传安装包。Intel Mac 暂缓。本机已准备输入时，也可双击“一键打包.cmd”或“监听插件列表.cmd”。
也可把整个代码块复制到 README.md，使用 `node automation/build.mjs --list README.md`。
账号登录由最终用户完成。Windows 产物通过本机验证后才会出现在 dist/automated。
