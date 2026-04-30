#!/usr/bin/env bash
# detect-region.sh — print "CN" or "INTL" to stdout (single line, no newline embellishment).
#
# Decision order:
#   1. Honor OC_REGION env var if it is "CN" or "INTL" (escape hatch for VPN users).
#   2. Read the user's system timezone from /etc/localtime, timedatectl, /etc/timezone,
#      $TZ, or Node's Intl API.
#   3. If the timezone unambiguously names mainland China → CN.
#      If it names another region → INTL.
#   4. Otherwise (UTC / Etc/* / unrecognized / unreachable) → run a latency probe
#      against mirrors.aliyun.com vs pypi.org and pick the faster one.
#
# Diagnostic logging goes to stderr; stdout has exactly one line: "CN" or "INTL".

set -u

log() { printf '[detect-region] %s\n' "$*" >&2; }

# 1. Escape hatch
case "${OC_REGION:-}" in
  CN|INTL) printf '%s\n' "$OC_REGION"; exit 0 ;;
esac

# 2. Read system timezone (most reliable source first)
tz=""

# Honor explicit TZ env var (used by tests and tooling)
if [ -n "${TZ:-}" ]; then
  tz="$TZ"
fi

if [ -z "$tz" ] && [ -L /etc/localtime ]; then
  # macOS: /var/db/timezone/zoneinfo/<TZ>
  # Linux: /usr/share/zoneinfo/<TZ>
  tz=$(readlink /etc/localtime 2>/dev/null | sed 's|.*/zoneinfo/||')
fi

if [ -z "$tz" ] && command -v timedatectl >/dev/null 2>&1; then
  tz=$(timedatectl show --property=Timezone --value 2>/dev/null || true)
fi

if [ -z "$tz" ] && [ -r /etc/timezone ]; then
  tz=$(tr -d '[:space:]' </etc/timezone 2>/dev/null || true)
fi

if [ -z "$tz" ] && command -v node >/dev/null 2>&1; then
  tz=$(node -e "process.stdout.write(Intl.DateTimeFormat().resolvedOptions().timeZone||'')" 2>/dev/null || true)
fi

log "system timezone: ${tz:-<unknown>}"

# 3. Decide from timezone
case "$tz" in
  Asia/Shanghai|Asia/Urumqi|Asia/Chongqing|Asia/Harbin|Asia/Kashgar|PRC)
    printf 'CN\n'; exit 0 ;;
  Asia/Hong_Kong|Asia/Macau|Asia/Macao|Asia/Taipei|Asia/Singapore)
    # UTC+8 neighbours with good international links. Users actually in those
    # regions probe to INTL (aliyun isn't 40% faster than pypi from there);
    # a Beijing user whose Mac has one of these set (iCloud sync, custom config)
    # will probe pypi.org → timeout → CN. Either way the probe is correct.
    log "UTC+8 neighbour timezone '$tz' — falling through to latency probe" ;;
  America/*|Europe/*|Australia/*|Africa/*|Pacific/*|Atlantic/*|Antarctica/*|Indian/*)
    printf 'INTL\n'; exit 0 ;;
  Asia/*)
    log "ambiguous Asian timezone '$tz' — falling through to latency probe" ;;
  ""|UTC|Etc/*|GMT*)
    log "non-specific timezone — falling through to latency probe" ;;
  *)
    log "unrecognized timezone '$tz' — falling through to latency probe" ;;
esac

# 4. Latency probe fallback
if ! command -v curl >/dev/null 2>&1; then
  log "no curl available; defaulting to INTL"
  printf 'INTL\n'; exit 0
fi

probe() {
  curl -fsS -o /dev/null -w '%{time_total}' --max-time 2 "$1" 2>/dev/null || true
}

aliyun_t=$(probe https://mirrors.aliyun.com/pypi/simple/)
pypi_t=$(probe https://pypi.org/simple/)
log "latency probe: aliyun=${aliyun_t:-fail}s pypi=${pypi_t:-fail}s"

if [ -z "$aliyun_t" ] && [ -z "$pypi_t" ]; then
  log "both probes failed; defaulting to INTL"
  printf 'INTL\n'; exit 0
fi
if [ -z "$aliyun_t" ]; then printf 'INTL\n'; exit 0; fi
if [ -z "$pypi_t" ];   then printf 'CN\n';   exit 0; fi

# CN if aliyun is meaningfully faster (≥ 40% improvement); otherwise INTL.
result=$(awk -v a="$aliyun_t" -v p="$pypi_t" 'BEGIN { if (p > 0 && a < p * 0.6) print "CN"; else print "INTL" }')
printf '%s\n' "$result"
