#!/usr/bin/env bash
# install-uv.sh — install uv package manager.
# Requires: OC_REGION=CN|INTL in env.
set -euo pipefail

prepend_path() {
  case ":$PATH:" in
    *":$1:"*) ;;
    *) PATH="$1:$PATH" ;;
  esac
}

python_user_bin() {
  "$1" -c 'import os, site; print(os.path.join(site.USER_BASE, "bin"))'
}

python_has_usable_pip() {
  "$1" -m pip --version >/dev/null 2>&1
}

detect_linux_libc() {
  if command -v ldd >/dev/null 2>&1 && ldd --version 2>&1 | grep -qi musl; then
    echo musl
  elif getconf GNU_LIBC_VERSION >/dev/null 2>&1; then
    echo gnu
  elif command -v ldd >/dev/null 2>&1 && ldd /bin/sh 2>&1 | grep -qi musl; then
    echo musl
  else
    echo gnu
  fi
}

PYTHON=""
PIP_USER_BIN=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
fi

install_via_binary() {
  # Path B — binary download
  if [ "$OC_REGION" = "INTL" ]; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
  else
    OS=$(uname -s); ARCH=$(uname -m)
    LIBC=""
    if [ "$OS" = "Linux" ]; then
      LIBC=$(detect_linux_libc)
    fi
    case "$OS-$ARCH-$LIBC" in
      Darwin-arm64-)      PKG=uv-aarch64-apple-darwin.tar.gz ;;
      Darwin-x86_64-)     PKG=uv-x86_64-apple-darwin.tar.gz ;;
      Linux-x86_64-gnu)   PKG=uv-x86_64-unknown-linux-gnu.tar.gz ;;
      Linux-aarch64-gnu)  PKG=uv-aarch64-unknown-linux-gnu.tar.gz ;;
      Linux-x86_64-musl)  PKG=uv-x86_64-unknown-linux-musl.tar.gz ;;
      Linux-aarch64-musl) PKG=uv-aarch64-unknown-linux-musl.tar.gz ;;
      *)             PKG="" ;;
    esac
    mkdir -p "$HOME/.local/bin"
    USTC_BASE=https://mirrors.ustc.edu.cn/github-release/astral-sh/uv/LatestRelease
    # Chain all USTC steps in the condition so any failure (bad gzip, missing
    # binary) falls through to the elif fallback instead of tripping set -e.
    if [ -n "$PKG" ] && \
       curl -LsSf -o /tmp/uv.tgz "$USTC_BASE/$PKG" && \
       tar -C /tmp -xzf /tmp/uv.tgz && \
       install -m 755 /tmp/"${PKG%.tar.gz}"/uv  "$HOME/.local/bin/uv" && \
       install -m 755 /tmp/"${PKG%.tar.gz}"/uvx "$HOME/.local/bin/uvx"; then
      :
    elif curl -LsSf https://astral.sh/uv/install.sh | sh; then
      :
    else
      echo "ERROR: 无法从 USTC 或 GitHub 获取 uv 二进制" >&2
      exit 1
    fi
  fi
}

if [ -n "$PYTHON" ] && python_has_usable_pip "$PYTHON"; then
  PIP_USER_BIN=$(python_user_bin "$PYTHON")
  # Path A — pip install
  if [ "$OC_REGION" = "CN" ]; then
    "$PYTHON" -m pip install --user uv \
      -i https://mirrors.aliyun.com/pypi/simple/ \
      --extra-index-url https://pypi.tuna.tsinghua.edu.cn/simple \
      --extra-index-url https://pypi.mirrors.ustc.edu.cn/simple \
      --extra-index-url https://pypi.org/simple
  else
    "$PYTHON" -m pip install --user uv
  fi
else
  install_via_binary
fi

prepend_path "$HOME/.cargo/bin"
prepend_path "$HOME/.local/bin"
if [ -n "$PIP_USER_BIN" ]; then
  prepend_path "$PIP_USER_BIN"
fi
export PATH
