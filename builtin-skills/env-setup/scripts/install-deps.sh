#!/usr/bin/env bash
# install-deps.sh <python> <packages...> — create venv + install PyPI packages via uv.
# Requires: OC_REGION=CN|INTL in env, uv on PATH.
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <python> <packages...>" >&2
  exit 64
fi

PYTHON_TARGET=$1
shift

VENV_DIR="$HOME/.openclaw/venvs/venv$PYTHON_TARGET"

if [ ! -d "$VENV_DIR" ]; then
  uv venv --python "$PYTHON_TARGET" "$VENV_DIR"
fi

if [ "$OC_REGION" = "CN" ]; then
  export UV_DEFAULT_INDEX="https://pypi.org/simple"
  export UV_INDEX="https://mirrors.aliyun.com/pypi/simple/ https://pypi.tuna.tsinghua.edu.cn/simple https://pypi.mirrors.ustc.edu.cn/simple"
fi

uv pip install --python "$VENV_DIR/bin/python" "$@"
