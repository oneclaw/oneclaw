# 镜像注册表

`env-setup` 仅使用下列可信源；SKILL.md 只保留执行流程，这里放镜像与判定细节。

## 覆盖范围

| 资源 | 上游 | CN 可信镜像 | CN 用法 |
| --- | --- | --- | --- |
| uv（路径 A，有 Python） | PyPI | 阿里 / 清华 / USTC | `pip -i` + `--extra-index-url` |
| uv（路径 B，无 Python） | `astral-sh/uv` Release | 仅 USTC | 直下 tarball / zip → GitHub 官方脚本 → 报错 |
| Python 解释器 | `python-build-standalone` Release | 仅 USTC | `UV_PYTHON_INSTALL_MIRROR` → USTC → GitHub → 报错 |
| PyPI 包 | `pypi.org` | 阿里 / 清华 / USTC | `UV_DEFAULT_INDEX` + `UV_INDEX` |

`UV_INSTALLER_GHE_BASE_URL` 需要 `api/v3/repos/...` JSON metadata 端点并能改写 `browser_download_url`，USTC 静态目录不支持，所以路径 B CN 只能直下 tarball / zip。第三方 GitHub 代理（`ghfast.top`、`gh-proxy.org` 等）不在信任清单。

## 档位检测阈值

- CN 时区白名单（IANA）：`Asia/Shanghai`、`Asia/Urumqi`、`Asia/Chongqing`、`Asia/Harbin`、`Asia/Kashgar`、`PRC`
- Windows 的 CN 时区 ID：`China Standard Time`
- 其余常见东亚 / 东南亚时区（如 `Asia/Hong_Kong`、`Asia/Taipei`、`Asia/Singapore`、`Hong Kong Standard Time`、`Taipei Standard Time`）默认归 `INTL`
- 延迟探针：`aliyun_time_total < pypi_time_total * 0.6` → `CN`；探针 URL 为 `https://mirrors.aliyun.com/pypi/simple/` 与 `https://pypi.org/simple/`，超时 2 秒

## uv 二进制（路径 B, CN）

USTC 基址：`https://mirrors.ustc.edu.cn/github-release/astral-sh/uv/LatestRelease/`。2026-04-09 实测同步到 release `0.11.6`，包含全平台二进制、`sha256.sum` 和 `dist-manifest.json`。

| 平台 | 文件名 | 解压后路径 |
| --- | --- | --- |
| macOS arm64 | `uv-aarch64-apple-darwin.tar.gz` | `uv-aarch64-apple-darwin/uv` |
| macOS x64 | `uv-x86_64-apple-darwin.tar.gz` | `uv-x86_64-apple-darwin/uv` |
| Linux glibc x64 | `uv-x86_64-unknown-linux-gnu.tar.gz` | `uv-x86_64-unknown-linux-gnu/uv` |
| Linux glibc arm64 | `uv-aarch64-unknown-linux-gnu.tar.gz` | `uv-aarch64-unknown-linux-gnu/uv` |
| Linux musl x64 | `uv-x86_64-unknown-linux-musl.tar.gz` | `uv-x86_64-unknown-linux-musl/uv` |
| Linux musl arm64 | `uv-aarch64-unknown-linux-musl.tar.gz` | `uv-aarch64-unknown-linux-musl/uv` |
| Windows x64 | `uv-x86_64-pc-windows-msvc.zip` | `uv-x86_64-pc-windows-msvc\uv.exe` |
| Windows arm64 | `uv-aarch64-pc-windows-msvc.zip` | `uv-aarch64-pc-windows-msvc\uv.exe` |

Linux 由脚本按 libc 自动选择 `gnu` 或 `musl` 变体（优先看 `ldd --version`，再看 `getconf GNU_LIBC_VERSION`）。落盘目标是 `~/.local/bin/{uv,uvx}`；Windows 为 `%USERPROFILE%\.local\bin\{uv.exe,uvx.exe}`。

## Python 解释器

`UV_PYTHON_INSTALL_MIRROR` 用于替换 `https://github.com/astral-sh/python-build-standalone/releases/download` 前缀。

| 档位 | 取值 | Fallback |
| --- | --- | --- |
| CN | `https://mirrors.ustc.edu.cn/github-release/astral-sh/python-build-standalone` | `unset` 后直连 GitHub，再失败报错 |
| INTL | 不设置 | — |

2026-04-13 实测：USTC 同步延迟约 1 天（上游 `20260408` → USTC `2026-04-09`），目录结构 `<tag>/<filename>` 与 GitHub Release 兼容；清华 TUNA 与阿里云都不镜像该项目。

## PyPI 包索引

`UV_DEFAULT_INDEX` 作为主索引，`UV_INDEX` 为空格分隔的附加索引，按顺序查询；第一个能返回目标版本的索引生效。

| 档位 | `UV_DEFAULT_INDEX` | `UV_INDEX`（顺序） |
| --- | --- | --- |
| CN | `https://mirrors.aliyun.com/pypi/simple/` | `https://pypi.tuna.tsinghua.edu.cn/simple https://pypi.mirrors.ustc.edu.cn/simple https://pypi.org/simple` |
| INTL | 不设置 | 不设置 |

旧名 `UV_INDEX_URL` / `UV_EXTRA_INDEX_URL` 已废弃。`pypi.org` 始终放在 `UV_INDEX` 末位，用于镜像缺新版或延迟时兜底正确性。

## 镜像可用性（2026-04-13 实测）

- Aliyun `mirrors.aliyun.com` — PyPI 可用；`astral-sh/uv` 与 `python-build-standalone` 的 GitHub Release 不可用
- Tsinghua TUNA `pypi.tuna.tsinghua.edu.cn` + `mirrors.tuna.tsinghua.edu.cn/github-release/` — PyPI 可用；`github-release/` 下无 `astral-sh` 目录
- USTC `pypi.mirrors.ustc.edu.cn` + `mirrors.ustc.edu.cn/github-release/` — PyPI 可用，且是唯一同时镜像 `astral-sh/uv` 与 `python-build-standalone` 的 CN 源，延迟约 1 天
