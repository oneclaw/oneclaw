/**
 * Pure logic for the Session Usage tab — split out so tests can import without
 * pulling in Lit decorators / DOM-side custom-element registrations.
 */

// cacheWrite is intentionally NOT tracked here. KIMI / Moonshot APIs never
// report it, so even with client-side estimation the column was inconsistent
// across providers and didn't aid the user. Removed by design — not missing.
export interface SessionUsageRow {
  sessionId: string;
  key: string;
  isMain: boolean;
  customLabel: string | null;
  originLabel: string | null;
  updatedAt: number;
  input: number | null;
  output: number | null;
  cacheRead: number | null;
}

export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
}

interface MapResult {
  rows: SessionUsageRow[];
  totalSessions: number;
  totals: UsageTotals | null;
}

type GatewayRequest = <T = unknown>(method: string, params?: unknown) => Promise<T>;

export const SESSION_USAGE_DETAIL_VISIBLE_ROW_LIMIT = 10;
export const SESSION_USAGE_DETAIL_ROW_HEIGHT_PX = 36;
export const SESSION_USAGE_DETAIL_LIST_MAX_HEIGHT_PX =
  SESSION_USAGE_DETAIL_VISIBLE_ROW_LIMIT * SESSION_USAGE_DETAIL_ROW_HEIGHT_PX;

export interface SessionUsageLoadFlags {
  initialized: boolean;
  loading: boolean;
}

export function beginSessionUsageLoad(
  state: SessionUsageLoadFlags,
  connected: boolean,
  hasClient: boolean,
): boolean {
  if (state.initialized || state.loading || !connected || !hasClient) return false;
  // Mark before awaiting so a failed request renders its error once, not once per render.
  state.initialized = true;
  state.loading = true;
  return true;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function pickToken(usage: unknown, key: "input" | "output" | "cacheRead"): number | null {
  if (!isRecord(usage)) return null;
  const value = usage[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isMainSessionKey(sessionKey: string, agent: string): boolean {
  const lower = sessionKey.toLowerCase();
  return lower === `agent:${agent.toLowerCase()}:main` || lower === "main";
}

function sumDisplayedTotals(rows: SessionUsageRow[]): UsageTotals | null {
  if (rows.length === 0) return null;
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  for (const row of rows) {
    input += row.input ?? 0;
    output += row.output ?? 0;
    cacheRead += row.cacheRead ?? 0;
  }
  return { input, output, cacheRead };
}

const MAIN_SESSION_DISPLAY_LABEL = "agent:main:main";

export function resolveSessionUsageDisplayLabel(
  row: Pick<SessionUsageRow, "customLabel" | "originLabel" | "key" | "sessionId" | "isMain">,
): string {
  const explicitLabel = row.customLabel || row.originLabel;
  if (row.isMain) {
    return MAIN_SESSION_DISPLAY_LABEL;
  }
  return explicitLabel || row.sessionId;
}

export function mapEntries(payload: unknown): MapResult {
  if (!isRecord(payload)) return { rows: [], totalSessions: 0, totals: null };
  const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
  const rows: SessionUsageRow[] = [];
  for (const entry of sessions) {
    if (!isRecord(entry)) continue;
    const key = asString(entry.key) ?? "";
    const sessionId = asString(entry.sessionId) ?? key;
    if (!sessionId) continue;
    const agent = asString(entry.agentId) ?? "";
    const origin = isRecord(entry.origin) ? entry.origin : null;
    rows.push({
      sessionId,
      key,
      isMain: isMainSessionKey(key, agent),
      customLabel: asString(entry.label),
      originLabel: origin ? asString(origin.label) : null,
      updatedAt: asNumber(entry.updatedAt),
      input: pickToken(entry.usage, "input"),
      output: pickToken(entry.usage, "output"),
      cacheRead: pickToken(entry.usage, "cacheRead"),
    });
  }
  rows.sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    rows,
    totalSessions: rows.length,
    totals: sumDisplayedTotals(rows),
  };
}

export async function loadSessionUsageSnapshot(request: GatewayRequest): Promise<MapResult> {
  // Re-sum totals locally from the mapped rows to stay consistent with what we render.
  // Intentionally rely on the gateway's default scope: last 30 days, max 50 sessions.
  const usage = await request("sessions.usage");
  return mapEntries(usage);
}
