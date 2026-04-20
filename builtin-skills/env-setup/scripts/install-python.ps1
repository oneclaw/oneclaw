# install-python.ps1 <version> -- install Python via uv (Windows).
# Requires: $env:OC_REGION=CN|INTL, uv on PATH.
$ErrorActionPreference = 'Stop'
# See install-uv.ps1 preamble for why these three lines are needed.
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new() } catch { }
try { $OutputEncoding = [System.Text.UTF8Encoding]::new() } catch { }
try {
    [Net.ServicePointManager]::SecurityProtocol =
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

$version = $args[0]

if (-not $version) {
    Write-Error 'Usage: install-python.ps1 <python-version>'
    exit 1
}

if ($version -notmatch '^[0-9]+\.[0-9]+(\.[0-9]+)?$') {
    Write-Error "Invalid python version '$version'. Expected X.Y or X.Y.Z (e.g. 3.11 or 3.11.9)."
    exit 64
}

if ($env:OC_REGION -eq 'CN') {
    $env:UV_PYTHON_INSTALL_MIRROR = 'https://mirrors.ustc.edu.cn/github-release/astral-sh/python-build-standalone'
    uv python install $version
    if ($LASTEXITCODE -ne 0) {
        Remove-Item Env:UV_PYTHON_INSTALL_MIRROR
        uv python install $version
    }
} else {
    uv python install $version
}
