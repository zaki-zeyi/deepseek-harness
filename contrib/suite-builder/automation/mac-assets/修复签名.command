#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
APP="${1:-$PWD/DeepSeek Harness Suite.app}"
[[ -d "$APP/Contents" ]] || { echo "找不到应用：$APP"; exit 1; }
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
HELPER="$APP/Contents/Resources/dependencies/orb-electron/Electron.app"
if [[ -d "$HELPER" ]]; then codesign --force --deep --sign - "$HELPER"; fi
codesign --force --deep --sign - "$APP"
codesign --verify --deep --verbose=2 "$APP"
echo "本机签名完成。"
