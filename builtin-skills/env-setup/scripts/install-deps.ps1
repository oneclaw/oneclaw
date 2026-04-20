# install-deps.ps1 <python> <packages...> -- create venv + install PyPI packages via uv (Windows).
# Requires: $env:OC_REGION=CN|INTL, uv on PATH.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new() } catch { }
try { $OutputEncoding = [System.Text.UTF8Encoding]::new() } catch { }
try {
    [Net.ServicePointManager]::SecurityProtocol =
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

if ($args.Count -lt 2) {
    throw "Usage: $PSCommandPath <python> <packages...>"
}

$pythonTarget = $args[0]
$packages = $args[1..($args.Count - 1)]

if ($pythonTarget -notmatch '^[0-9]+\.[0-9]+(\.[0-9]+)?$') {
    throw "Invalid python version '$pythonTarget'. Expected X.Y or X.Y.Z (e.g. 3.11 or 3.11.9)."
}

$parts = $pythonTarget.Split('.')
$pythonMinor = "$($parts[0]).$($parts[1])"

$venvDir = Join-Path $env:USERPROFILE ".openclaw\venvs\venv$pythonMinor"

if (-not (Test-Path $venvDir)) {
    uv venv --python $pythonTarget $venvDir
}

if ($env:OC_REGION -eq 'CN') {
    $env:UV_DEFAULT_INDEX = 'https://pypi.org/simple'
    $env:UV_INDEX = 'https://mirrors.aliyun.com/pypi/simple/ https://pypi.tuna.tsinghua.edu.cn/simple https://pypi.mirrors.ustc.edu.cn/simple'
}

$venvPython = Join-Path $venvDir 'Scripts\python.exe'
uv pip install --python $venvPython @packages
