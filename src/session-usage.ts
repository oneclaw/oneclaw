import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { pathToFileURL } from "url";
import { resolveGatewayPackageDir, resolveUserStateDir } from "./constants";

const MAX_ROWS = 200;

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
};

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
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

type EstimateTokensFn = (message: Record<string, unknown>) => number;

const nativeImport = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<Record<string, unknown>>;

let estimateTokensPromise: Promise<EstimateTokensFn> | null = null;

function resolveEstimateTokensModulePath(): string | null {
  try {
    const gatewayNodeModules = path.dirname(resolveGatewayPackageDir());
    return path.join(gatewayNodeModules, "@mariozechner", "pi-coding-agent", "dist", "index.js");
  } catch {
    return null;
  }
}

async function loadEstimateTokens(): Promise<EstimateTokensFn> {
  if (!estimateTokensPromise) {
    estimateTokensPromise = (async () => {
      const modulePath = resolveEstimateTokensModulePath();
      if (modulePath && fs.existsSync(modulePath)) {
        try {
          const mod = await nativeImport(pathToFileURL(modulePath).href);
          if (typeof mod.estimateTokens === "function") {
            return mod.estimateTokens as EstimateTokensFn;
          }
        } catch {
          // Fall through to the compatible local copy when the bundled ESM cannot be loaded.
        }
      }
      return estimateTokensCompatible;
    })();
  }
  return estimateTokensPromise;
}

function estimateTokensCompatible(message: Record<string, unknown>): number {
  let chars = 0;
  switch (message.role) {
    case "user": {
      const content = message.content;
      if (typeof content === "string") {
        chars = content.length;
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
            chars += block.text.length;
          }
        }
      }
      return Math.ceil(chars / 4);
    }
    case "assistant": {
      const content = Array.isArray(message.content) ? message.content : [];
      for (const block of content) {
        if (!isRecord(block)) continue;
        if (block.type === "text" && typeof block.text === "string") {
          chars += block.text.length;
        } else if (block.type === "thinking" && typeof block.thinking === "string") {
          chars += block.thinking.length;
        } else if (block.type === "toolCall") {
          chars += String(block.name ?? "").length + JSON.stringify(block.arguments ?? {}).length;
        }
      }
      return Math.ceil(chars / 4);
    }
    case "custom":
    case "toolResult": {
      const content = message.content;
      if (typeof content === "string") {
        chars = content.length;
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (!isRecord(block)) continue;
          if (block.type === "text" && typeof block.text === "string") chars += block.text.length;
          if (block.type === "image") chars += 4800;
        }
      }
      return Math.ceil(chars / 4);
    }
    case "bashExecution": {
      chars = String(message.command ?? "").length + String(message.output ?? "").length;
      return Math.ceil(chars / 4);
    }
    case "branchSummary":
    case "compactionSummary": {
      chars = String(message.summary ?? "").length;
      return Math.ceil(chars / 4);
    }
  }
  return 0;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function textFromContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return stringifyUnknown(value);
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (!isRecord(item)) return "";
    if (typeof item.text === "string") return item.text;
    if (typeof item.content === "string") return item.content;
    return "";
  }).filter(Boolean).join("\n");
}

function normalizeTextContent(content: unknown): string | Array<Record<string, unknown>> {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return stringifyUnknown(content);
  const blocks: Array<Record<string, unknown>> = [];
  for (const block of content) {
    if (typeof block === "string") {
      blocks.push({ type: "text", text: block });
      continue;
    }
    if (!isRecord(block)) continue;
    const type = typeof block.type === "string" ? block.type : "";
    if ((type === "text" || type === "input_text") && typeof block.text === "string") {
      blocks.push({ type: "text", text: block.text });
    } else if (type === "tool_result") {
      const text = textFromContent(block.content);
      if (text) blocks.push({ type: "text", text });
    } else if (type === "image") {
      blocks.push(block);
    } else if (typeof block.text === "string") {
      blocks.push({ type: "text", text: block.text });
    }
  }
  return blocks;
}

function normalizeAssistantContent(content: unknown): Array<Record<string, unknown>> {
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (!Array.isArray(content)) return [];
  const blocks: Array<Record<string, unknown>> = [];
  for (const block of content) {
    if (typeof block === "string") {
      blocks.push({ type: "text", text: block });
      continue;
    }
    if (!isRecord(block)) continue;
    const type = typeof block.type === "string" ? block.type : "";
    if ((type === "text" || type === "output_text") && typeof block.text === "string") {
      blocks.push({ type: "text", text: block.text });
    } else if (type === "thinking" && typeof block.thinking === "string") {
      blocks.push({ type: "thinking", thinking: block.thinking });
    } else if (type === "toolCall") {
      blocks.push({
        type: "toolCall",
        name: String(block.name ?? ""),
        arguments: block.arguments ?? {},
      });
    } else if (type === "tool_use" || type === "tool_call" || type === "function_call") {
      blocks.push({
        type: "toolCall",
        name: String(block.name ?? ""),
        arguments: block.input ?? block.arguments ?? {},
      });
    } else if (typeof block.text === "string") {
      blocks.push({ type: "text", text: block.text });
    }
  }
  return blocks;
}

function normalizeToolCallBlocks(value: unknown): Array<Record<string, unknown>> {
  const calls = Array.isArray(value) ? value : value ? [value] : [];
  const blocks: Array<Record<string, unknown>> = [];
  for (const call of calls) {
    if (!isRecord(call)) continue;
    const fn = isRecord(call.function) ? call.function : null;
    blocks.push({
      type: "toolCall",
      name: String(call.name ?? fn?.name ?? ""),
      arguments: call.arguments ?? call.args ?? fn?.arguments ?? call.input ?? {},
    });
  }
  return blocks;
}

function normalizeMessageForEstimate(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw) || typeof raw.role !== "string") return null;
  switch (raw.role) {
    case "user":
      return { ...raw, role: "user", content: normalizeTextContent(raw.content) };
    case "assistant": {
      const content = normalizeAssistantContent(raw.content);
      content.push(
        ...normalizeToolCallBlocks(raw.tool_calls),
        ...normalizeToolCallBlocks(raw.toolCalls),
        ...normalizeToolCallBlocks(raw.function_call),
        ...normalizeToolCallBlocks(raw.functionCall),
      );
      return { ...raw, role: "assistant", content };
    }
    case "custom":
    case "toolResult":
      return { ...raw, role: raw.role, content: normalizeTextContent(raw.content) };
    case "bashExecution":
      return {
        ...raw,
        role: "bashExecution",
        command: typeof raw.command === "string" ? raw.command : "",
        output: typeof raw.output === "string" ? raw.output : "",
      };
    case "branchSummary":
    case "compactionSummary":
      return { ...raw, role: raw.role, summary: typeof raw.summary === "string" ? raw.summary : "" };
  }
  return null;
}

function normalizeEntryForEstimate(entry: unknown): Record<string, unknown> | null {
  if (!isRecord(entry)) return null;
  if (entry.type === "message") return normalizeMessageForEstimate(entry.message);
  if (entry.type === "custom_message") {
    return normalizeMessageForEstimate({
      role: "custom",
      content: entry.content,
      display: entry.display,
      details: entry.details,
    });
  }
  if (entry.type === "branch_summary") {
    return normalizeMessageForEstimate({ role: "branchSummary", summary: entry.summary });
  }
  if (entry.type === "compaction") {
    return normalizeMessageForEstimate({ role: "compactionSummary", summary: entry.summary });
  }
  return null;
}

function estimateMessageTokens(estimateTokens: EstimateTokensFn, message: Record<string, unknown>): number {
  try {
    const value = estimateTokens(message);
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0;
  } catch {
    const value = estimateTokensCompatible(message);
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0;
  }
}

type SessionNode = {
  id: string;
  parentId: string | null;
  order: number;
  message: Record<string, unknown> | null;
};

function buildSessionNode(entry: unknown, order: number, previousNodeId: string | null): SessionNode | null {
  if (!isRecord(entry)) return null;
  const rawId = asString(entry.id);
  const id = rawId ?? `__line_${order}`;
  const parentId = entry.parentId === null ? null : asString(entry.parentId) ?? previousNodeId;
  const message = normalizeEntryForEstimate(entry);
  return { id, parentId, order, message };
}

function collectActiveChain(nodes: SessionNode[]): SessionNode[] {
  if (nodes.length === 0) return [];
  const byId = new Map(nodes.map(node => [node.id, node]));
  const activeNodeIds = new Set<string>();
  let cursor: SessionNode | undefined = nodes[nodes.length - 1];

  while (cursor && !activeNodeIds.has(cursor.id)) {
    activeNodeIds.add(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }

  return nodes.filter(node => activeNodeIds.has(node.id)).sort((a, b) => a.order - b.order);
}

async function aggregateUsage(sessionFile: string, estimateTokens: EstimateTokensFn): Promise<UsageAggregate | null> {
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
  const nodes: SessionNode[] = [];
  let previousNodeId: string | null = null;

  try {
    let order = 0;
    for await (const line of rl) {
      if (!line) continue;
      let evt: unknown;
      try {
        evt = JSON.parse(line);
      } catch {
        continue;
      }
      const node = buildSessionNode(evt, order, previousNodeId);
      order += 1;
      if (!node) continue;
      nodes.push(node);
      previousNodeId = node.id;
    }

    let contextTokens = 0;
    let pendingInputTokens = 0;
    for (const node of collectActiveChain(nodes)) {
      const msg = node.message;
      if (!msg) continue;
      const tokens = estimateMessageTokens(estimateTokens, msg);
      if (msg.role === "assistant") {
        totals.input += pendingInputTokens;
        totals.cacheRead += Math.max(0, contextTokens - pendingInputTokens);
        totals.output += tokens;
        contextTokens += tokens;
        pendingInputTokens = 0;
      } else {
        contextTokens += tokens;
        pendingInputTokens += tokens;
      }
    }
  } catch {
    return null;
  } finally {
    rl.close();
    stream.destroy();
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
  const estimateTokens = await loadEstimateTokens();

  const rows = await Promise.all(
    capped.map(async ({ agent, agentDir, entry }): Promise<SessionUsageRow> => {
      const sessionId = asString(entry.sessionId)!;
      const sessionFile = asString(entry.sessionFile) ?? path.join(agentDir, "sessions", `${sessionId}.jsonl`);
      const totals = await aggregateUsage(sessionFile, estimateTokens);
      return {
        agent,
        sessionId,
        customLabel: asString(entry.label),
        originLabel: asString(entry.origin?.label),
        updatedAt: asNumber(entry.updatedAt),
        input: totals?.input ?? null,
        output: totals?.output ?? null,
        cacheRead: totals?.cacheRead ?? null,
        outputUnsupported: totals?.outputUnsupported ?? false,
        cacheReadUnsupported: totals?.cacheReadUnsupported ?? false,
      };
    }),
  );

  return rows;
}
