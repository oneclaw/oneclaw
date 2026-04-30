---
name: env-setup
description: "Use this skill ANY time you need Python on the user's machine — running a .py script, installing PyPI packages, creating a venv, or when you hit `python`/`python3` not found, a Microsoft Store Python stub (Windows: 'Python was not found; run without arguments to install from Microsoft Store'), an externally-managed-environment error, or any broken system Python. ALWAYS route Python through this skill; DO NOT fall back to `pip install`, `pip install --user`, `pipx`, `brew install python`, `apt install python3`, `python -m venv` against system Python, or telling the user to install Python manually. The skill installs uv + an isolated Python interpreter + a per-version venv at `~/.openclaw/venvs/venv<python-version>` and auto-selects CN/INTL mirrors. **Installation is FAST and SILENT — run the steps directly without asking the user for permission, without warning about download time, and without offering manual alternatives.** First-run cost on broadband: uv ~5–15s, Python ~10–30s, per-package deps ~2–10s each; total cold-start typically under 60s. Subsequent runs hit the venv cache and skip Steps 0–3 entirely (the READY check is sub-second). Trigger on: 'python', 'pip', 'venv', 'pandas', 'numpy', 'openpyxl', 'matplotlib', 'requests', 'beautifulsoup', any .py file, or any failed Python invocation."
metadata:
  {
    "openclaw":
      {
        "emoji": "🧰",
        "os": ["darwin", "linux", "win32"],
      },
  }
---

# Env Setup

> [!IMPORTANT]
> **WHEN TO USE — 任何需要 Python 的场景一律走这个 skill**
>
> - 用户要求跑任何 `.py` 脚本，或要装任何 PyPI 包（pandas / openpyxl / requests / pdf 解析库 …）。
> - `python` / `python3` / `pip` 在终端报 `command not found`、`No module named ...`、`externally-managed-environment`。
> - **Windows 命中 Microsoft Store stub**——执行 `python` 弹出 "Python was not found; run without arguments to install from Microsoft Store" 或直接打开 Microsoft Store。这是**头号触发场景**：必须立即转到本 skill，不要再尝试 `python` / `py` / `python3` 任何变体，也不要让用户去 Store 安装。
> - 系统自带 Python 版本不对、被 `PATH` 屏蔽、或 venv 创建失败。
>
> **DO NOT — 反模式**
>
> - ❌ `pip install <pkg>` / `pip install --user <pkg>` / `python -m pip install ...`（会污染系统 Python 或被 PEP 668 拒绝）。
> - ❌ `pipx install` / `brew install python` / `apt install python3` / `choco install python`（绕过项目隔离，跨任务漂移）。
> - ❌ `python -m venv .venv` 对系统 Python 建 venv（用户机器上的 system Python 不可信）。
> - ❌ 让用户"自己去装 Python"或去 Microsoft Store——用户装的是 OneClaw，不是 Python 开发环境。
> - ❌ 改用其他语言绕过 Python 需求（除非用户明确同意）。
> - ❌ **不查 `~/.openclaw/venvs/` 就直接重装 Python**——上次安装的解释器仍然可用，新会话/换 agent 后必须先做下面的"探测已有 venv"。
>
> 上下文被压缩后如果记不清细节，**只要看到 Python 相关诉求或报错，第一反应就是回到本 skill**。
>
> **耗时预期**
>
> | 阶段 | 耗时 |
> | --- | --- |
> | Step 1 装 uv | 5–15s |
> | Step 2 装 Python (cpython-standalone, ~30MB) | 10–30s |
> | Step 3 创建 venv + 装一个常规 PyPI 包 | 2–10s |
> | **首次冷启动总耗时** | **~30s** |
> | 二次及以后（venv 已就位） | < 1s（READY 直接跳过 0–3） |
>
> 数十秒级别是用户可接受的代价，远比让用户手动装 Python 顺滑。直接执行，不要请示。

按版本隔离 venv：`~/.openclaw/venvs/venv<python-version>`。先检查是否可用；不可用才按 0 → 3 执行。镜像细节见 `references/mirrors.md`。

## 探测已有 venv（第一步，永远先做）

新会话 / 新 agent 没有上次的记忆，**绝不能直接挑 `<python-version>` 跑**——必须先列出本机已有的 venv 目录，优先复用最高版本。

```bash
ls -1 ~/.openclaw/venvs/ 2>/dev/null | grep -E '^venv[0-9]+\.[0-9]+$' | sed 's/^venv//' | sort -V
```

```powershell
Get-ChildItem -Directory "$env:USERPROFILE\.openclaw\venvs" -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^venv(\d+\.\d+)$' } |
  ForEach-Object { $Matches[1] } | Sort-Object { [version]$_ }
```

- **有输出**：取列表里最高的版本作为 `<python-version>`（如 `3.11`），进入下面的"前置检查"。
- **无输出**：本机还没装过，`<python-version>` 默认取 `3.11`，按 Step 0 → 3 完整跑一遍。

这一步只决定版本号，不验证包是否安装；是否跳过 Step 0–3 由「前置检查」和下方表格决定。

## 前置检查

```bash
~/.openclaw/venvs/venv<python-version>/bin/python -c "import <package>" 2>/dev/null && echo "READY"
```

```powershell
$vpy = "$env:USERPROFILE\.openclaw\venvs\venv<python-version>\Scripts\python.exe"
if (& $vpy -c "import <package>" 2>$null; $LASTEXITCODE -eq 0) { echo "READY" }
```

输出 `READY` → **跳过 Step 0-3**：

```bash
~/.openclaw/venvs/venv<python-version>/bin/python script.py
```

```powershell
& "$env:USERPROFILE\.openclaw\venvs\venv<python-version>\Scripts\python.exe" script.py
```

---

| 步骤 | 跳过条件 |
| --- | --- |
| 0 检测区域 | `$OC_REGION` 已设置 |
| 1 安装 uv | `command -v uv` / `Get-Command uv` |
| 2 安装 Python | `uv python list --only-installed \| grep -q <python-version>` |
| 3 创建 venv + 装依赖 | 对应 venv 存在且已含目标包 |

## Step 0 — 检测区域

```bash
OC_REGION=$(bash {baseDir}/scripts/detect-region.sh)
```

```powershell
$env:OC_REGION = (& powershell -NoProfile -ExecutionPolicy Bypass -File "{baseDir}\scripts\detect-region.ps1")
```

## Step 1 — 安装 uv

```bash
OC_REGION="$OC_REGION" bash {baseDir}/scripts/install-uv.sh
UV_PIP_BIN="$({ \
  python3 -c 'import os, site; print(os.path.join(site.USER_BASE, "bin"))' 2>/dev/null || \
  python -c 'import os, site; print(os.path.join(site.USER_BASE, "bin"))' 2>/dev/null || \
  printf '%s' "$HOME/.local/bin"; \
} | tail -n 1)"
export PATH="$UV_PIP_BIN:$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
```

```powershell
& powershell -NoProfile -ExecutionPolicy Bypass -File "{baseDir}\scripts\install-uv.ps1"
$uvPipBin = $null
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python -and -not ($python.Source -match '[\\/]WindowsApps[\\/]python(?:3(?:\.\d+)?)?\.exe$')) {
  $uvPipBin = (python -c "import os, site; print(os.path.join(site.USER_BASE, 'Scripts'))" 2>$null).Trim()
}
if ($uvPipBin) { $env:Path = "$uvPipBin;$env:Path" }
$env:Path = "$env:USERPROFILE\.local\bin;$env:USERPROFILE\.cargo\bin;$env:Path"
```

## Step 2 — 安装 Python

```bash
OC_REGION="$OC_REGION" bash {baseDir}/scripts/install-python.sh <python-version>
```

```powershell
& powershell -NoProfile -ExecutionPolicy Bypass -File "{baseDir}\scripts\install-python.ps1" <python-version>
```

## Step 3 — 创建 venv + 装依赖

```bash
OC_REGION="$OC_REGION" bash {baseDir}/scripts/install-deps.sh <python-version> <packages...>
```

```powershell
& powershell -NoProfile -ExecutionPolicy Bypass -File "{baseDir}\scripts\install-deps.ps1" <python-version> <packages...>
```
