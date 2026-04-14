---
name: env-setup
description: "安装 uv、Python 解释器，创建独立 venv 并安装 PyPI 依赖。自动按 CN/INTL 选择镜像。"
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

按版本隔离 venv：`~/.openclaw/venvs/venv<python-version>`。先检查是否可用；不可用才按 0 → 3 执行。镜像细节见 `references/mirrors.md`。

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
