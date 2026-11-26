#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
APP="${1:-$PWD/DeepSeek Harness Suite.app}"
[[ -d "$APP" ]] || APP=$(osascript -e 'POSIX path of (choose file with prompt "选择已安装的 DeepSeek Harness Suite.app")')
RES="$APP/Contents/Resources"
BIN="$RES/dependencies/bin"
echo "系统架构：$(uname -m)"
for TOOL in bun lark-cli; do "$BIN/$TOOL" --version; done
"$BIN/mihomo" -v
"$RES/runtime/primary-runtime/dependencies/node/bin/node" --version
if [[ -f "$RES/dependencies/orb-electron/Electron.app/Contents/MacOS/Electron" ]]; then
  ELECTRON_RUN_AS_NODE=1 "$RES/dependencies/orb-electron/Electron.app/Contents/MacOS/Electron" -p 'process.versions.electron'
fi
if ! xcode-select -p >/dev/null 2>&1; then
  echo "Git 功能需要 Apple Command Line Tools，可运行：xcode-select --install"
else /usr/bin/git --version; fi
echo "命令启动检查完成。插件登录和 GUI 功能仍需在应用内验证。"
read -r -p "按回车退出…"
