#!/usr/bin/env bash

set -u

# 并行启动四个目标打包任务，保留每个任务独立退出码。
declare -a TASKS=(
  "dist:mac:arm64"
  "dist:mac:x64"
  "dist:win:x64"
  "dist:win:arm64"
)

declare -a PIDS=()
declare -a NAMES=()

# 启动单个 npm 打包任务并记录 pid。
start_task() {
  local name="$1"
  echo "[parallel] start ${name}"
  npm run "${name}" &
  PIDS+=("$!")
  NAMES+=("${name}")
}

# 遍历任务列表并行启动。
for task in "${TASKS[@]}"; do
  start_task "${task}"
done

FAILED=0

# 等待所有任务结束并汇总失败项。
for index in "${!PIDS[@]}"; do
  pid="${PIDS[$index]}"
  name="${NAMES[$index]}"
  if wait "${pid}"; then
    echo "[parallel] done ${name}"
  else
    echo "[parallel] fail ${name}"
    FAILED=1
  fi
done

if [[ "${FAILED}" -ne 0 ]]; then
  echo "[parallel] 至少一个打包任务失败"
  exit 1
fi

echo "[parallel] 四个目标打包全部完成"
