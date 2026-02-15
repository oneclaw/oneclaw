/**
 * Type stubs for the chat-ui project.
 *
 * These types are used across the UI layer for gateway data shapes,
 * channel statuses, session/agent/config snapshots, and log entries.
 */

// ---------------------------------------------------------------------------
// Log types
// ---------------------------------------------------------------------------

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type LogEntry = {
  level?: LogLevel;
  msg?: string;
  message?: string;
  time?: string;
  ts?: number;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

export type PresenceEntry = {
  id?: string;
  host?: string;
  ip?: string;
  mode?: string;
  version?: string;
  ts?: number;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export type GatewaySessionRow = {
  key: string;
  kind?: string;
  label?: string;
  displayName?: string;
  updatedAt?: number;
  totalTokens?: number;
  contextTokens?: number;
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  modelProvider?: string;
  [key: string]: unknown;
};

export type SessionsListResult = {
  path?: string;
  sessions: GatewaySessionRow[];
};

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export type AgentsListResult = {
  defaultId?: string | null;
  agents: Array<{
    id: string;
    name?: string;
    identity?: {
      name?: string;
      emoji?: string;
      avatar?: string;
      avatarUrl?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>;
};

export type AgentIdentityResult = {
  name?: string;
  emoji?: string;
  avatar?: string;
  avatarUrl?: string;
  [key: string]: unknown;
};

export type AgentFileEntry = {
  name: string;
  size?: number;
  content?: string;
  updatedAt?: number;
  [key: string]: unknown;
};

export type AgentsFilesListResult = {
  agentId: string;
  workspace?: string;
  files: AgentFileEntry[];
};

export type AgentsFilesGetResult = {
  file?: AgentFileEntry;
};

export type AgentsFilesSetResult = {
  file?: AgentFileEntry;
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type ConfigSnapshot = {
  [key: string]: unknown;
};

export type ConfigSchemaResponse = {
  schema?: unknown;
  version?: string;
  uiHints?: ConfigUiHints;
};

export type ConfigUiHints = Record<
  string,
  | {
      label?: string;
      description?: string;
      placeholder?: string;
      inputType?: string;
      hidden?: boolean;
      readonly?: boolean;
      [key: string]: unknown;
    }
  | undefined
>;

// ---------------------------------------------------------------------------
// Health / Debug
// ---------------------------------------------------------------------------

export type HealthSnapshot = {
  [key: string]: unknown;
};

export type StatusSummary = {
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export type ChannelAccountSnapshot = {
  accountId: string;
  name?: string;
  configured?: boolean;
  running?: boolean;
  connected?: boolean | null;
  lastInboundAt?: number;
  lastError?: string;
  probe?: unknown;
  [key: string]: unknown;
};

export type ChannelUiMetaEntry = {
  id: string;
  label?: string;
  [key: string]: unknown;
};

export type ChannelsStatusSnapshot = {
  channels?: Record<string, unknown>;
  channelOrder?: string[];
  channelLabels?: Record<string, string>;
  channelMeta?: ChannelUiMetaEntry[];
  channelAccounts?: Record<string, ChannelAccountSnapshot[]>;
  [key: string]: unknown;
};

export type WhatsAppStatus = {
  configured?: boolean;
  linked?: boolean;
  running?: boolean;
  connected?: boolean;
  lastConnectedAt?: number;
  lastMessageAt?: number;
  authAgeMs?: number;
  [key: string]: unknown;
};

export type TelegramStatus = {
  configured?: boolean;
  running?: boolean;
  connected?: boolean;
  lastStartAt?: number;
  [key: string]: unknown;
};

export type DiscordStatus = {
  configured?: boolean;
  running?: boolean;
  lastStartAt?: number;
  [key: string]: unknown;
};

export type GoogleChatStatus = {
  configured?: boolean;
  running?: boolean;
  credential?: string;
  [key: string]: unknown;
};

export type SlackStatus = {
  configured?: boolean;
  running?: boolean;
  lastStartAt?: number;
  [key: string]: unknown;
};

export type SignalStatus = {
  configured?: boolean;
  running?: boolean;
  baseUrl?: string;
  [key: string]: unknown;
};

export type IMessageStatus = {
  configured?: boolean;
  running?: boolean;
  lastStartAt?: number;
  [key: string]: unknown;
};

export type NostrStatus = {
  configured?: boolean;
  running?: boolean;
  connected?: boolean;
  [key: string]: unknown;
};

export type NostrProfile = {
  name?: string;
  displayName?: string;
  about?: string;
  picture?: string;
  banner?: string;
  nip05?: string;
  lud16?: string;
  website?: string;
  [key: string]: string | undefined;
};

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

export type CronJob = {
  id: string;
  name?: string;
  enabled?: boolean;
  schedule: {
    kind: "at" | "every" | "cron";
    at?: string;
    everyMs?: number;
    expr?: string;
    tz?: string;
    [key: string]: unknown;
  };
  payload: {
    kind: "agentTurn" | "systemEvent";
    message?: string;
    text?: string;
    [key: string]: unknown;
  };
  delivery?: {
    mode?: string;
    channel?: string;
    to?: string;
    [key: string]: unknown;
  };
  state?: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type CronRunLogEntry = {
  ts: number;
  jobId?: string;
  status?: string;
  [key: string]: unknown;
};

export type CronStatus = {
  enabled?: boolean;
  jobs?: number;
  nextWakeMs?: number;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export type SkillStatusEntry = {
  id?: string;
  name?: string;
  source: string;
  bundled?: boolean;
  enabled?: boolean;
  error?: string;
  [key: string]: unknown;
};

export type SkillStatusReport = {
  skills: SkillStatusEntry[];
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export type SessionsUsageResult = {
  sessions: Array<{
    key: string;
    label?: string;
    agentId?: string;
    channel?: string;
    model?: string;
    modelOverride?: string;
    modelProvider?: string;
    providerOverride?: string;
    updatedAt?: number;
    usage?: {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      totalTokens?: number;
      totalCost?: number;
      inputCost?: number;
      outputCost?: number;
      cacheReadCost?: number;
      cacheWriteCost?: number;
      durationMs?: number;
      firstActivity?: number;
      lastActivity?: number;
      messageCounts?: {
        total: number;
        user: number;
        assistant: number;
        toolCalls: number;
        toolResults: number;
        errors: number;
        [key: string]: number;
      };
      toolUsage?: {
        tools: Array<{ name: string; count: number }>;
      };
      modelUsage?: Array<{
        provider?: string;
        model?: string;
        count: number;
        totals: {
          input?: number;
          output?: number;
          cacheRead?: number;
          cacheWrite?: number;
          totalTokens?: number;
          totalCost?: number;
          inputCost?: number;
          outputCost?: number;
          cacheReadCost?: number;
          cacheWriteCost?: number;
          missingCostEntries?: number;
        };
      }>;
      latency?: {
        count: number;
        avgMs: number;
        minMs: number;
        maxMs: number;
        p95Ms: number;
      };
      dailyBreakdown?: Array<{
        date: string;
        tokens: number;
        cost: number;
      }>;
      dailyMessageCounts?: Array<{
        date: string;
        total: number;
        toolCalls: number;
        errors: number;
      }>;
      dailyLatency?: Array<{
        date: string;
        count: number;
        avgMs: number;
        minMs: number;
        maxMs: number;
        p95Ms: number;
      }>;
      dailyModelUsage?: Array<{
        date: string;
        provider?: string;
        model?: string;
        tokens: number;
        cost: number;
        count: number;
      }>;
      contextWeight?: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

export type CostUsageSummary = {
  daily?: Array<{
    date: string;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    inputCost?: number;
    outputCost?: number;
    cacheReadCost?: number;
    cacheWriteCost?: number;
    totalCost: number;
  }>;
  [key: string]: unknown;
};

export type SessionUsageTimeSeries = {
  points?: Array<{
    ts: number;
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
    totalCost?: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};
