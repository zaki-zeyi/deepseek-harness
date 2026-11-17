# 整合插件列表

只修改下面代码块：每行一个 npm 包名（可带版本）或 GitHub 仓库地址。
`seed:` 表示沿用现有整合包中已经固定的版本。删除一行会从新包中移除该插件。
GitHub 地址优先使用仓库 package.json 对应的 npm 已发布版本；不会直接执行 README 中的命令。

```dsh-plugins
seed:dsh-brand
seed:dshmarket
seed:@xmanrui/dsh-im
seed:dsh-orb
seed:dsh-our-free-model
seed:dsh-industry-research
https://github.com/WSL043/dsh-codex-subscription
```

修改后双击“一键打包.cmd”；要自动响应修改，先打开“监听插件列表.cmd”，保持窗口运行。
也可把整个代码块复制到 README.md，使用 `node automation/build.cjs --list README.md`。
账号登录由最终用户完成。Windows 产物通过本机验证后才会出现在 dist/automated。
