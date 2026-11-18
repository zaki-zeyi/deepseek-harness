#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
APP="$PWD/DeepSeek Harness Suite.app"
[[ -d "$APP" ]] || { echo "请先完整解压安装包。"; exit 1; }
DEST=$(osascript -e 'POSIX path of (choose folder with prompt "选择 DeepSeek Harness Suite 的安装位置")') || exit 1
TARGET="${DEST%/}/DeepSeek Harness Suite.app"
echo "正在准备本机签名…"
/bin/bash "$PWD/修复签名.command" "$APP"
if [[ -e "$TARGET" ]]; then
  answer=$(osascript -e 'button returned of (display dialog "目标目录已有同名应用，将保留备份后安装。" buttons {"取消", "继续"} default button "取消")')
  [[ "$answer" == "继续" ]] || exit 1
  mv "$TARGET" "$TARGET.backup-$(date +%Y%m%d%H%M%S)"
fi
ditto "$APP" "$TARGET"
echo "安装完成：$TARGET"
open "$TARGET"
