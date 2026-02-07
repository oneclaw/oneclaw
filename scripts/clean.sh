#!/usr/bin/env bash
set -euo pipefail

# 清理 OneClaw 的所有运行痕迹，用于"第一次启动"测试（含 Setup 向导）。
# 用法: scripts/clean.sh [--dry-run]

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  echo "=== DRY RUN — 只打印要删除的内容，不执行 ==="
fi

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "  [dry] $*"
  else
    "$@"
  fi
}

BUNDLE_ID="com.oneclaw.app"

# 终止 OneClaw 进程（包括 Electron 主进程和 gateway 子进程）
echo "终止 OneClaw 进程"
run killall OneClaw 2>/dev/null || true
run killall -9 OneClaw 2>/dev/null || true
sleep 0.5

# 清理 Electron UserDefaults / 应用缓存
echo "清理 Electron 应用数据"
run defaults delete "$BUNDLE_ID" 2>/dev/null || true
run rm -f "$HOME/Library/Preferences/$BUNDLE_ID.plist"
run rm -f "$HOME/Library/Preferences/ByHost/$BUNDLE_ID."*.plist 2>/dev/null || true
run rm -rf "$HOME/Library/Caches/$BUNDLE_ID"
run rm -rf "$HOME/Library/Saved Application State/$BUNDLE_ID.savedState"
run rm -rf "$HOME/Library/HTTPStorages/$BUNDLE_ID"
run rm -rf "$HOME/Library/HTTPStorages/$BUNDLE_ID.binarycookies"
run rm -rf "$HOME/Library/WebKit/$BUNDLE_ID"
run rm -rf "$HOME/Library/Application Support/$BUNDLE_ID"

# 刷新偏好设置缓存（cfprefsd 会被 launchd 自动重启）
echo "刷新偏好设置缓存"
run killall cfprefsd 2>/dev/null || true

# 清理 openclaw 共享数据（~/.openclaw/ 含 openclaw.json 配置）
echo "清理 openclaw 共享数据"
run rm -rf "$HOME/.openclaw"

echo "清理完成。可以执行全新 Setup 测试了。"
