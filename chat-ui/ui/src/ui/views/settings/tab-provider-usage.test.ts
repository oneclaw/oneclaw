import test from "node:test";
import assert from "node:assert/strict";
import {
  computeRateWindowLabel,
  deriveUsageView,
  formatResetText,
  parseResetSeconds,
} from "./tab-provider-usage.lib.ts";

const RATE_FALLBACK_ZH = "速率限制";
const RATE_FALLBACK_EN = "Rate Limit";

const HOUR_USAGE_ZH = "{n} 小时用量";
const HOUR_USAGE_EN = "{n}h usage";
const MINUTE_USAGE_ZH = "{n} 分钟用量";
const MINUTE_USAGE_EN = "{n}m usage";

const labels = (locale: "zh" | "en") => ({
  rateFallback: locale === "zh" ? RATE_FALLBACK_ZH : RATE_FALLBACK_EN,
  hourUsage: locale === "zh" ? HOUR_USAGE_ZH : HOUR_USAGE_EN,
  minuteUsage: locale === "zh" ? MINUTE_USAGE_ZH : MINUTE_USAGE_EN,
});

test("computeRateWindowLabel converts 300 MINUTE to '5 小时用量' (zh)", () => {
  const limits = [{ window: { duration: 300, timeUnit: "MINUTE" } }];
  assert.equal(computeRateWindowLabel(limits, "zh", labels("zh")), "5 小时用量");
});

test("computeRateWindowLabel converts 300 MINUTE to '5h usage' (en)", () => {
  const limits = [{ window: { duration: 300, timeUnit: "MINUTE" } }];
  assert.equal(computeRateWindowLabel(limits, "en", labels("en")), "5h usage");
});

test("computeRateWindowLabel: MINUTE not divisible by 60 stays in minutes", () => {
  const limits = [{ window: { duration: 30, timeUnit: "MINUTE" } }];
  assert.equal(computeRateWindowLabel(limits, "zh", labels("zh")), "30 分钟用量");
  assert.equal(computeRateWindowLabel(limits, "en", labels("en")), "30m usage");
});

test("computeRateWindowLabel: HOUR is used directly", () => {
  const limits = [{ window: { duration: 1, timeUnit: "HOUR" } }];
  assert.equal(computeRateWindowLabel(limits, "zh", labels("zh")), "1 小时用量");
  assert.equal(computeRateWindowLabel(limits, "en", labels("en")), "1h usage");
});

test("computeRateWindowLabel: timeUnit is case insensitive", () => {
  const limits = [{ window: { duration: 60, timeUnit: "minute" } }];
  assert.equal(computeRateWindowLabel(limits, "zh", labels("zh")), "1 小时用量");
});

test("computeRateWindowLabel: reads from limits[0] directly when no window", () => {
  const limits = [{ duration: 120, timeUnit: "MINUTE" }];
  assert.equal(computeRateWindowLabel(limits, "zh", labels("zh")), "2 小时用量");
});

test("computeRateWindowLabel: reads from limits[0].detail as third priority", () => {
  const limits = [{ detail: { duration: 60, timeUnit: "MINUTE" } }];
  assert.equal(computeRateWindowLabel(limits, "zh", labels("zh")), "1 小时用量");
});

test("computeRateWindowLabel: window beats top-level beats detail", () => {
  const limits = [{
    window: { duration: 60, timeUnit: "MINUTE" },
    duration: 30, timeUnit: "MINUTE",
    detail: { duration: 120, timeUnit: "MINUTE" },
  }];
  assert.equal(computeRateWindowLabel(limits, "zh", labels("zh")), "1 小时用量");
});

test("computeRateWindowLabel falls back when limits empty", () => {
  assert.equal(computeRateWindowLabel([], "zh", labels("zh")), RATE_FALLBACK_ZH);
  assert.equal(computeRateWindowLabel([], "en", labels("en")), RATE_FALLBACK_EN);
});

test("computeRateWindowLabel falls back when window metadata missing", () => {
  assert.equal(computeRateWindowLabel([{ used: "10", limit: "100" }], "zh", labels("zh")), RATE_FALLBACK_ZH);
});

test("computeRateWindowLabel falls back when duration is 0 or negative", () => {
  assert.equal(
    computeRateWindowLabel([{ window: { duration: 0, timeUnit: "HOUR" } }], "zh", labels("zh")),
    RATE_FALLBACK_ZH,
  );
  assert.equal(
    computeRateWindowLabel([{ window: { duration: -5, timeUnit: "HOUR" } }], "zh", labels("zh")),
    RATE_FALLBACK_ZH,
  );
});

test("computeRateWindowLabel falls back when timeUnit unknown", () => {
  assert.equal(
    computeRateWindowLabel([{ window: { duration: 5, timeUnit: "DAY" } }], "zh", labels("zh")),
    RATE_FALLBACK_ZH,
  );
});

test("parseResetSeconds: reset_in numeric", () => {
  assert.equal(parseResetSeconds({ reset_in: 3600 }), 3600);
  assert.equal(parseResetSeconds({ resetIn: "1800" }), 1800);
});

test("parseResetSeconds: resetAt ISO timestamp in the future", () => {
  const future = new Date(Date.now() + 3600 * 1000).toISOString();
  const got = parseResetSeconds({ resetAt: future });
  // Allow a few-second drift since clock advances during the call
  assert.ok(got >= 3595 && got <= 3601, `got=${got}`);
});

test("parseResetSeconds: returns 0 when nothing present", () => {
  assert.equal(parseResetSeconds({}), 0);
  assert.equal(parseResetSeconds({ unrelated: 1 }), 0);
});

test("parseResetSeconds: window numeric falls back to duration", () => {
  assert.equal(parseResetSeconds({ window: 600 }), 600);
});

test("formatResetText: '5小时后重置' / '5h reset' — no '重置于' prefix", () => {
  assert.equal(formatResetText(3600 * 5, "zh"), "5小时后重置");
  assert.equal(formatResetText(3600 * 5, "en"), "5h reset");
});

test("formatResetText: minutes when under an hour", () => {
  assert.equal(formatResetText(60 * 30, "zh"), "30分钟后重置");
  assert.equal(formatResetText(60 * 30, "en"), "30m reset");
});

test("formatResetText: 0 returns empty string (no reset row)", () => {
  assert.equal(formatResetText(0, "zh"), "");
  assert.equal(formatResetText(-5, "en"), "");
});

test("deriveUsageView: percentage card displays whole percent", () => {
  const data = {
    usage: { used: "480", limit: "1000" },
    limits: [{ used: "30", limit: "100", window: { duration: 300, timeUnit: "MINUTE" } }],
  };
  const view = deriveUsageView(data, "zh", labels("zh"));
  assert.equal(view.week!.pctText, "48%");
  assert.equal(view.week!.rawText, "480 / 1000");
  assert.equal(view.rate!.pctText, "30%");
  assert.equal(view.rate!.title, "5 小时用量");
  assert.equal(view.rate!.rawText, "30 / 100");
});

test("deriveUsageView: derives used from remaining when used missing", () => {
  const data = {
    usage: { remaining: "200", limit: "1000" },
    limits: [],
  };
  const view = deriveUsageView(data, "zh", labels("zh"));
  assert.equal(view.week!.pctText, "80%");
  assert.equal(view.week!.rawText, "800 / 1000");
});

test("deriveUsageView: limits[0].detail path still drives usage numbers", () => {
  const data = {
    usage: { used: "10", limit: "100" },
    limits: [{ detail: { used: "75", limit: "100", window: { duration: 60, timeUnit: "MINUTE" } } }],
  };
  const view = deriveUsageView(data, "zh", labels("zh"));
  assert.equal(view.rate!.pctText, "75%");
  assert.equal(view.rate!.rawText, "75 / 100");
  assert.equal(view.rate!.title, "1 小时用量");
});

test("deriveUsageView: rate card title falls back to 速率限制 when window missing", () => {
  const data = {
    usage: { used: "10", limit: "100" },
    limits: [{ used: "5", limit: "10" }],
  };
  const view = deriveUsageView(data, "zh", labels("zh"));
  assert.equal(view.rate!.title, RATE_FALLBACK_ZH);
  assert.equal(view.rate!.pctText, "50%");
});

test("deriveUsageView: reset text has no 重置于 prefix", () => {
  const data = {
    usage: { used: "10", limit: "100", reset_in: 7200 },
    limits: [{ used: "5", limit: "10", resetIn: 1800, window: { duration: 60, timeUnit: "MINUTE" } }],
  };
  const view = deriveUsageView(data, "zh", labels("zh"));
  assert.equal(view.week!.resetText, "2小时后重置");
  assert.equal(view.rate!.resetText, "30分钟后重置");
  // English variant
  const enView = deriveUsageView(data, "en", labels("en"));
  assert.equal(enView.week!.resetText, "2h reset");
  assert.equal(enView.rate!.resetText, "30m reset");
});

test("deriveUsageView: rate card omitted when limits empty", () => {
  const data = { usage: { used: "0", limit: "1000" }, limits: [] };
  const view = deriveUsageView(data, "zh", labels("zh"));
  assert.equal(view.week!.pctText, "0%");
  assert.equal(view.rate, null);
});

test("deriveUsageView: tolerates non-object payload", () => {
  const empty = deriveUsageView(null, "zh", labels("zh"));
  assert.equal(empty.week, null);
  assert.equal(empty.rate, null);
});

test("deriveUsageView: zero limit results in 0% (no NaN/Infinity)", () => {
  const data = { usage: { used: "0", limit: "0" }, limits: [] };
  const view = deriveUsageView(data, "zh", labels("zh"));
  assert.equal(view.week!.pctText, "0%");
  assert.equal(view.week!.pct, 0);
});

test("deriveUsageView: percent caps at 100 even if usage exceeds limit", () => {
  const data = { usage: { used: "1200", limit: "1000" }, limits: [] };
  const view = deriveUsageView(data, "zh", labels("zh"));
  assert.equal(view.week!.pctText, "100%");
  assert.equal(view.week!.pct, 100);
});
