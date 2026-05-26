/**
 * Pure derivation for the Kimi usage panel rendered in the Provider tab.
 * Kept free of Lit / DOM imports so node:test can exercise it directly.
 */

export type Locale = "zh" | "en";

export interface UsageLabels {
  rateFallback: string;   // "速率限制" / "Rate Limit"
  hourUsage: string;      // "{n} 小时用量" / "{n}h usage"
  minuteUsage: string;    // "{n} 分钟用量" / "{n}m usage"
}

export interface UsageCardView {
  title: string;
  pct: number;            // 0-100 for the progress bar width
  pctText: string;        // "48%"
  rawText: string;        // "480 / 1000" — used as tooltip
  resetText: string;      // "5小时后重置" / "5h reset" / "" when no reset info
}

export interface UsageView {
  week: UsageCardView | null;
  rate: UsageCardView | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function toInt(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function parseResetAt(val: unknown): number {
  if (typeof val !== "string" || !val) return 0;
  try {
    let str = val;
    // Trim sub-millisecond precision the Date constructor doesn't accept.
    if (str.includes(".") && str.endsWith("Z")) {
      const parts = str.slice(0, -1).split(".");
      str = parts[0] + "." + parts[1].slice(0, 3) + "Z";
    }
    const dt = new Date(str);
    const diff = (dt.getTime() - Date.now()) / 1000;
    return diff > 0 ? Math.round(diff) : 0;
  } catch {
    return 0;
  }
}

export function parseResetSeconds(data: unknown): number {
  if (!isRecord(data)) return 0;
  const timestamps = ["reset_at", "resetAt", "reset_time", "resetTime"];
  for (const k of timestamps) {
    const v = data[k];
    if (typeof v === "string" && v) return parseResetAt(v);
  }
  const durations = ["reset_in", "resetIn", "ttl", "window"];
  for (const k of durations) {
    const raw = data[k];
    if (typeof raw === "number" || typeof raw === "string") {
      const v = toInt(raw);
      if (v > 0) return v;
    }
  }
  return 0;
}

export function formatResetText(seconds: number, locale: Locale): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const isZh = locale === "zh";
  if (h > 0) return h + (isZh ? "小时后重置" : "h reset");
  if (m > 0) return m + (isZh ? "分钟后重置" : "m reset");
  return isZh ? "即将重置" : "resetting soon";
}

interface WindowMeta {
  duration: number;
  timeUnit: string;
}

function readWindowMeta(item: unknown): WindowMeta | null {
  if (!isRecord(item)) return null;
  // Priority: limits[0].window → limits[0].detail.window → limits[0] → limits[0].detail
  const detail = isRecord(item.detail) ? (item.detail as Record<string, unknown>) : null;
  const sources: Array<Record<string, unknown> | null> = [
    isRecord(item.window) ? (item.window as Record<string, unknown>) : null,
    detail && isRecord(detail.window) ? (detail.window as Record<string, unknown>) : null,
    item,
    detail,
  ];
  for (const src of sources) {
    if (!src) continue;
    const duration = toInt(src.duration);
    const timeUnit = typeof src.timeUnit === "string" ? src.timeUnit : "";
    if (duration > 0 && timeUnit) return { duration, timeUnit };
  }
  return null;
}

function applyTemplate(template: string, value: number): string {
  return template.replace(/\{n\}/g, String(value));
}

export function computeRateWindowLabel(
  limits: unknown,
  locale: Locale,
  labels: UsageLabels,
): string {
  if (!Array.isArray(limits) || limits.length === 0) return labels.rateFallback;
  const meta = readWindowMeta(limits[0]);
  if (!meta) return labels.rateFallback;

  const unit = meta.timeUnit.toUpperCase();
  if (unit.includes("MINUTE")) {
    if (meta.duration % 60 === 0) {
      return applyTemplate(labels.hourUsage, meta.duration / 60);
    }
    return applyTemplate(labels.minuteUsage, meta.duration);
  }
  if (unit.includes("HOUR")) {
    return applyTemplate(labels.hourUsage, meta.duration);
  }
  return labels.rateFallback;
}

function deriveUsedLimit(source: Record<string, unknown>): { used: number; limit: number } {
  const limit = toInt(source.limit);
  const usedRaw = source.used;
  if (usedRaw !== undefined && usedRaw !== null && usedRaw !== "") {
    return { used: toInt(usedRaw), limit };
  }
  const remaining = source.remaining;
  if (remaining !== undefined && remaining !== null && remaining !== "") {
    return { used: Math.max(0, limit - toInt(remaining)), limit };
  }
  return { used: 0, limit };
}

function buildCard(
  source: Record<string, unknown>,
  title: string,
  locale: Locale,
): UsageCardView {
  const { used, limit } = deriveUsedLimit(source);
  const pct = limit > 0
    ? Math.min(100, Math.max(0, Math.round((used / limit) * 100)))
    : 0;
  return {
    title,
    pct,
    pctText: `${pct}%`,
    rawText: `${used} / ${limit}`,
    resetText: formatResetText(parseResetSeconds(source), locale),
  };
}

export function deriveUsageView(
  data: unknown,
  locale: Locale,
  labels: UsageLabels,
): UsageView {
  if (!isRecord(data)) return { week: null, rate: null };

  const weekSource = isRecord(data.usage) ? (data.usage as Record<string, unknown>) : null;
  const week = weekSource ? buildCard(weekSource, "", locale) : null;

  const limits = Array.isArray(data.limits) ? data.limits : [];
  let rate: UsageCardView | null = null;
  if (limits.length > 0 && isRecord(limits[0])) {
    const item = limits[0] as Record<string, unknown>;
    const detail = isRecord(item.detail) ? (item.detail as Record<string, unknown>) : item;
    rate = buildCard(detail, computeRateWindowLabel(limits, locale, labels), locale);
  }

  return { week, rate };
}
