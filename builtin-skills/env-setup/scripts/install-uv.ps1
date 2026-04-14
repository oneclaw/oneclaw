# install-uv.ps1 -- install uv package manager (Windows).
# Requires: $env:OC_REGION=CN|INTL.
$ErrorActionPreference = 'Stop'
# PowerShell 5.1 defaults: progress bar throttles Invoke-WebRequest ~40x on slow
# links, and SecurityProtocol excludes TLS 1.2, so USTC / astral.sh handshakes fail.
# Console.OutputEncoding defaults to the system ANSI codepage on Windows
# (cp936 on zh-CN), which garbles stderr when the caller captures it as UTF-8.
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new() } catch { }
try { $OutputEncoding = [System.Text.UTF8Encoding]::new() } catch { }
try {
    [Net.ServicePointManager]::SecurityProtocol =
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

function Resolve-CommandPath($commandInfo) {
    if ($commandInfo.Source) {
        return $commandInfo.Source
    }
    if ($commandInfo.Path) {
        return $commandInfo.Path
    }
    return $commandInfo.Name
}

function Get-PythonUserScriptsDir($pythonExe) {
    if (-not $pythonExe) {
        return $null
    }
    $dir = & $pythonExe -c "import os, site; print(os.path.join(site.USER_BASE, 'Scripts'))" 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $dir) {
        return $null
    }
    return $dir.Trim()
}

function Test-UsablePip($pythonExe) {
    if (-not $pythonExe) {
        return $false
    }
    & $pythonExe -m pip --version *> $null
    return $LASTEXITCODE -eq 0
}

function Get-UsablePythonCommand {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) {
        return $null
    }

    $source = Resolve-CommandPath $python
    if ($source -and $source -match '[\\/]WindowsApps[\\/]python(?:3(?:\.\d+)?)?\.exe$') {
        return $null
    }

    $pythonExe = & $source -c "import sys; print(sys.executable)" 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $pythonExe) {
        return $null
    }

    return $python
}

function Install-UvViaBinary($localBin) {
    # Path B -- binary download
    if ($env:OC_REGION -eq 'INTL') {
        irm https://astral.sh/uv/install.ps1 | iex
        return
    }

    $arch = if ([Environment]::Is64BitOperatingSystem) {
        if ($env:PROCESSOR_ARCHITECTURE -match 'ARM64') { 'aarch64' } else { 'x86_64' }
    } else { $null }
    $pkg = if ($arch) { "uv-$arch-pc-windows-msvc.zip" } else { $null }
    $ustcBase = 'https://mirrors.ustc.edu.cn/github-release/astral-sh/uv/LatestRelease'
    New-Item -ItemType Directory -Force -Path $localBin | Out-Null
    $ok = $false
    if ($pkg) {
        $zipPath = Join-Path $env:TEMP 'uv.zip'
        $extractDir = Join-Path $env:TEMP ("uv-extract-" + [guid]::NewGuid().ToString('N'))
        try {
            Invoke-WebRequest -Uri "$ustcBase/$pkg" -OutFile $zipPath -UseBasicParsing
            # Validate the download is actually a ZIP (USTC may return an HTML error page with HTTP 200)
            $hdr = New-Object byte[] 2
            $fs = [System.IO.File]::OpenRead($zipPath)
            try { [void]$fs.Read($hdr, 0, 2) } finally { $fs.Close() }
            if ($hdr[0] -ne 0x50 -or $hdr[1] -ne 0x4B) {
                throw "USTC mirror returned non-ZIP content (possibly an error page); skipping"
            }
            New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
            Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

            $pkgDir = Join-Path $extractDir ([System.IO.Path]::GetFileNameWithoutExtension($pkg))
            $uvExe = Join-Path $pkgDir 'uv.exe'
            $uvxExe = Join-Path $pkgDir 'uvx.exe'
            if (-not (Test-Path $uvExe -PathType Leaf) -or -not (Test-Path $uvxExe -PathType Leaf)) {
                throw "Extracted archive is missing uv.exe or uvx.exe: $pkgDir"
            }

            Copy-Item $uvExe, $uvxExe -Destination $localBin -Force
            $ok = $true
        } catch {
            Write-Warning "USTC uv download failed: $($_.Exception.Message)"
        } finally {
            Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
            if (Test-Path $extractDir) {
                Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }
    if (-not $ok) {
        try {
            irm https://astral.sh/uv/install.ps1 | iex
            $ok = $true
        } catch {
            Write-Warning "astral.sh installer failed: $($_.Exception.Message)"
        }
    }
    if (-not $ok) {
        Write-Error 'Failed to fetch uv binary from USTC or GitHub'
        exit 1
    }
}

$pathEntries = New-Object System.Collections.Generic.List[string]
$localBin = "$env:USERPROFILE\.local\bin"
$cargoBin = "$env:USERPROFILE\.cargo\bin"
$python = Get-UsablePythonCommand

if ($python -and (Test-UsablePip (Resolve-CommandPath $python))) {
    $pythonExe = Resolve-CommandPath $python
    $pythonUserScripts = Get-PythonUserScriptsDir $pythonExe
    # Path A -- pip install
    if ($env:OC_REGION -eq 'CN') {
        & $pythonExe -m pip install --user uv `
            -i https://mirrors.aliyun.com/pypi/simple/ `
            --extra-index-url https://pypi.tuna.tsinghua.edu.cn/simple `
            --extra-index-url https://pypi.mirrors.ustc.edu.cn/simple `
            --extra-index-url https://pypi.org/simple
    } else {
        & $pythonExe -m pip install --user uv
    }
    if ($pythonUserScripts) {
        $pathEntries.Add($pythonUserScripts)
    }
} else {
    Install-UvViaBinary $localBin
}

$pathEntries.Add($localBin)
$pathEntries.Add($cargoBin)
foreach ($entry in ($pathEntries | Select-Object -Unique)) {
    if ($entry -and -not ($env:Path -split ';' | Where-Object { $_ -eq $entry })) {
        $env:Path = "$entry;$env:Path"
    }
}
