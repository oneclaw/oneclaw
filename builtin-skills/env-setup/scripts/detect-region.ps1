# detect-region.ps1 -- print "CN" or "INTL" to stdout (single line).
#
# Decision order:
#   1. Honor $env:OC_REGION if it is "CN" or "INTL" (escape hatch for VPN users).
#   2. Read the user's system timezone via Get-TimeZone / [TimeZoneInfo]::Local.
#      On Windows the IDs are Windows-format strings (e.g. "China Standard Time"),
#      not IANA. Match against the canonical CN string.
#   3. If the timezone names mainland China -> CN.
#      Any other named timezone -> INTL.
#      Missing or ambiguous (UTC) -> fall through.
#   4. Otherwise run a latency probe against mirrors.aliyun.com vs pypi.org.
#
# Diagnostic logging goes to stderr; stdout has exactly one line: "CN" or "INTL".

$ErrorActionPreference = 'Continue'
# See install-uv.ps1 preamble for why these three lines are needed.
# Latency probe uses Invoke-WebRequest with a 2s timeout; the progress bar
# can still push it past that budget on slow terminals.
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new() } catch { }
try { $OutputEncoding = [System.Text.UTF8Encoding]::new() } catch { }
try {
    [Net.ServicePointManager]::SecurityProtocol =
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

function Write-Log([string]$msg) {
    [Console]::Error.WriteLine("[detect-region] $msg")
}

# 1. Escape hatch
if ($env:OC_REGION -eq 'CN' -or $env:OC_REGION -eq 'INTL') {
    Write-Output $env:OC_REGION
    exit 0
}

# 2. Read system timezone
$tzId = $null
try { $tzId = (Get-TimeZone).Id } catch { }
if (-not $tzId) {
    try { $tzId = [System.TimeZoneInfo]::Local.Id } catch { }
}
$tzDisplay = if ($tzId) { $tzId } else { '<unknown>' }
Write-Log "system timezone: $tzDisplay"

# 3. Decide from timezone (Windows IDs)
if ($tzId) {
    if ($tzId -eq 'China Standard Time') {
        Write-Output 'CN'
        exit 0
    }

    $offsetHours = $null
    try {
        $offsetHours = [TimeZoneInfo]::Local.GetUtcOffset([DateTime]::UtcNow).TotalHours
    } catch { }

    if ($tzId -eq 'UTC') {
        Write-Log 'UTC -- falling through to latency probe'
    } elseif ($offsetHours -eq 8) {
        # UTC+8 but not 'China Standard Time'. Windows ships several neighbour
        # IDs at this offset (Singapore / Taipei / Ulaanbaatar / N. Korea /
        # North Asia East / W. Australia); enterprise images and English-locale
        # installs in mainland China sometimes default to one of these. The
        # user might genuinely be in that region, or a Beijing user whose
        # machine just has the wrong ID. Latency probe disambiguates.
        Write-Log "UTC+8 timezone '$tzId' -- falling through to latency probe"
    } else {
        # Non-UTC+8 named timezone (Americas, Europe, etc.) -- definitively INTL.
        Write-Output 'INTL'
        exit 0
    }
}

# 4. Latency probe fallback
function Measure-Probe([string]$url) {
    try {
        $r = Measure-Command {
            Invoke-WebRequest -UseBasicParsing -Method Head -Uri $url -TimeoutSec 2 | Out-Null
        }
        return [double]$r.TotalSeconds
    } catch {
        return $null
    }
}

$aliyun = Measure-Probe 'https://mirrors.aliyun.com/pypi/simple/'
$pypi   = Measure-Probe 'https://pypi.org/simple/'
$aliyunDisplay = if ($null -ne $aliyun) { "${aliyun}s" } else { 'fail' }
$pypiDisplay   = if ($null -ne $pypi)   { "${pypi}s" }   else { 'fail' }
Write-Log "latency probe: aliyun=$aliyunDisplay pypi=$pypiDisplay"

if ($null -eq $aliyun -and $null -eq $pypi) {
    Write-Log 'both probes failed; defaulting to INTL'
    Write-Output 'INTL'; exit 0
}
if ($null -eq $aliyun) { Write-Output 'INTL'; exit 0 }
if ($null -eq $pypi)   { Write-Output 'CN';   exit 0 }

# CN if aliyun is meaningfully faster (>= 40% improvement); otherwise INTL.
if ($aliyun -lt ($pypi * 0.6)) {
    Write-Output 'CN'
} else {
    Write-Output 'INTL'
}
