#!/usr/bin/env bash
# install-python.sh <version> — install Python via uv.
# Requires: OC_REGION=CN|INTL in env, uv on PATH.
set -euo pipefail

VERSION="$1"

if [ "$OC_REGION" = "CN" ]; then
  UV_PYTHON_INSTALL_MIRROR="https://mirrors.ustc.edu.cn/github-release/astral-sh/python-build-standalone" \
    uv python install "$VERSION" \
    || { unset UV_PYTHON_INSTALL_MIRROR; uv python install "$VERSION"; }
else
  uv python install "$VERSION"
fi
