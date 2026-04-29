import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { resolveUserStateDir } from "./constants";

const MAX_ROWS = 200;

// kimi-coding (Kimi 会员订阅) 走 anthropic-messages stream，openclaw 默认路径不持久化
// final message_delta.usage，所以 output / cacheRead 在 JSONL 里恒为 0。UI 层标注「暂不支持」。
const UNSUPPORTED_PROVIDERS = new Set(["kimi-coding"]);

export type SessionUsageRow = {
  agent: string;
  sessionId: string;
  customLabel: string | null;
  originLabel: string | null;
  updatedAt: number;
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  outputUnsupported: boolean;
  cacheReadUnsupported: boolean;
};

type IndexEntry = {
  sessionId?: unknown;
  updatedAt?: unknown;
  label?: unknown;
  origin?: { label?: unknown } | null;
  sessionFile?: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
  cacheReadTokens?: unknown;
};

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function asOptionalNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

type UsageAggregate = {
  input: number;
  output: number;
  cacheRead: number;
  outputUnsupported: boolean;
  cacheReadUnsupported: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = asNumber(record[key]);
    if (value > 0) return value;
  }
  return 0;
}

function nestedNumber(record: Record<string, unknown>, parentKey: string, childKey: string): number {
  const parent = record[parentKey];
  if (!isRecord(parent)) return 0;
  return asNumber(parent[childKey]);
}

type NormalizedUsage = { input: number; output: number; cacheRead: number };

function normalizeUsage(usage: unknown): NormalizedUsage {
  if (!isRecord(usage)) {
    return { input: 0, output: 0, cacheRead: 0 };
  }

  const cacheReadFlat = firstNumber(usage, [
    "cacheRead",
    "cache_read",
    "cache_read_input_tokens",
    "cached_tokens",
  ]);
  const cacheRead = cacheReadFlat > 0
    ? cacheReadFlat
    : nestedNumber(usage, "prompt_tokens_details", "cached_tokens");

  return {
    input: firstNumber(usage, ["input", "inputTokens", "input_tokens", "promptTokens", "prompt_tokens"]),
    output: firstNumber(usage, ["output", "outputTokens", "output_tokens", "completionTokens", "completion_tokens"]),
    cacheRead,
  };
}

function usageFallback(entry: IndexEntry): {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
} {
  return {
    input: asOptionalNumber(entry.inputTokens),
    output: asOptionalNumber(entry.outputTokens),
    cacheRead: asOptionalNumber(entry.cacheReadTokens),
  };
}

async function aggregateUsage(sessionFile: string): Promise<UsageAggregate | null> {
  try {
    await fs.promises.access(sessionFile, fs.constants.R_OK);
  } catch {
    return null;
  }

  const totals: UsageAggregate = {
    input: 0,
    output: 0,
    cacheRead: 0,
    outputUnsupported: false,
    cacheReadUnsupported: false,
  };
  const stream = fs.createReadStream(sessionFile, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      if (!line) continue;
      let evt: any;
      try {
        evt = JSON.parse(line);
      } catch {
        continue;
      }
      if (!evt || evt.type !== "message") continue;
      const msg = evt.message;
      if (!msg || msg.role !== "assistant") continue;
      const usage = msg.usage;
      if (!usage || typeof usage !== "object") continue;
      const normalized = normalizeUsage(usage);

      // input / cacheRead 是每次请求的"完整上下文快照"（running snapshot），取 max。
      // output 是单轮新增（delta），累加。
      if (normalized.input > totals.input) totals.input = normalized.input;

      const provider = typeof msg.provider === "string" ? msg.provider : "";
      if (UNSUPPORTED_PROVIDERS.has(provider)) {
        totals.outputUnsupported = true;
        totals.cacheReadUnsupported = true;
        continue;
      }
      totals.output += normalized.output;
      if (normalized.cacheRead > totals.cacheRead) totals.cacheRead = normalized.cacheRead;
    }
  } catch {
    return null;
  } finally {
    rl.close();
    stream.close();
  }
  return totals;
}

async function readAgentIndex(agentDir: string): Promise<Array<{ agent: string; agentDir: string; entry: IndexEntry }>> {
  const indexPath = path.join(agentDir, "sessions", "sessions.json");
  let raw: string;
  try {
    raw = await fs.promises.readFile(indexPath, "utf-8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const agent = path.basename(agentDir);
  const out: Array<{ agent: string; agentDir: string; entry: IndexEntry }> = [];
  for (const entry of Object.values(parsed as Record<string, IndexEntry>)) {
    if (entry && typeof entry === "object") out.push({ agent, agentDir, entry });
  }
  return out;
}

export async function listSessionUsage(): Promise<SessionUsageRow[]> {
  const agentsRoot = path.join(resolveUserStateDir(), "agents");
  let agentDirs: string[] = [];
  try {
    const entries = await fs.promises.readdir(agentsRoot, { withFileTypes: true });
    agentDirs = entries
      .filter(e => e.isDirectory())
      .map(e => path.join(agentsRoot, e.name));
  } catch {
    return [];
  }

  const allEntries = (await Promise.all(agentDirs.map(readAgentIndex))).flat();

  const filtered = allEntries.filter(({ entry }) => asString(entry.sessionId));

  filtered.sort((a, b) => asNumber(b.entry.updatedAt) - asNumber(a.entry.updatedAt));
  const capped = filtered.slice(0, MAX_ROWS);

  const rows = await Promise.all(
    capped.map(async ({ agent, agentDir, entry }): Promise<SessionUsageRow> => {
      const sessionId = asString(entry.sessionId)!;
      const sessionFile = asString(entry.sessionFile) ?? path.join(agentDir, "sessions", `${sessionId}.jsonl`);
      const totals = await aggregateUsage(sessionFile);
      const fallback = usageFallback(entry);
      return {
        agent,
        sessionId,
        customLabel: asString(entry.label),
        originLabel: asString(entry.origin?.label),
        updatedAt: asNumber(entry.updatedAt),
        input: totals?.input ?? fallback.input,
        output: totals?.output ?? fallback.output,
        cacheRead: totals?.cacheRead ?? fallback.cacheRead,
        outputUnsupported: totals?.outputUnsupported ?? false,
        cacheReadUnsupported: totals?.cacheReadUnsupported ?? false,
      };
    }),
  );

  return rows;
}
