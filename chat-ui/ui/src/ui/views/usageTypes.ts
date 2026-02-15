/**
 * Types for the usage analytics views.
 */

export type UsageTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  missingCostEntries: number;
};

export type UsageSessionEntry = {
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
    missingCostEntries?: number;
    durationMs?: number;
    firstActivity?: number;
    lastActivity?: number;
    contextWeight?: number;
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
      totals: Partial<UsageTotals>;
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
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type CostDailyEntry = {
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
};

export type UsageAggregates = {
  messages: {
    total: number;
    user: number;
    assistant: number;
    toolCalls: number;
    toolResults: number;
    errors: number;
  };
  tools: {
    totalCalls: number;
    uniqueTools: number;
    tools: Array<{ name: string; count: number }>;
  };
  byModel: Array<{
    provider?: string;
    model?: string;
    count: number;
    totals: UsageTotals;
  }>;
  byProvider: Array<{
    provider?: string;
    model?: string;
    count: number;
    totals: UsageTotals;
  }>;
  byAgent?: Array<{
    agentId: string;
    totals: UsageTotals;
  }>;
  byChannel?: Array<{
    channel: string;
    totals: UsageTotals;
  }>;
  daily: Array<{
    date: string;
    tokens: number;
    cost: number;
    messages: number;
    toolCalls: number;
    errors: number;
  }>;
  latency?: {
    count: number;
    avgMs: number;
    minMs: number;
    maxMs: number;
    p95Ms: number;
  };
  dailyLatency?: Array<{
    date: string;
    count: number;
    avgMs: number;
    minMs: number;
    maxMs: number;
    p95Ms: number;
  }>;
  modelDaily?: Array<{
    date: string;
    provider?: string;
    model?: string;
    tokens: number;
    cost: number;
    count: number;
  }>;
};

export type TimeSeriesPoint = {
  ts: number;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  totalCost?: number;
  [key: string]: unknown;
};

export type SessionLogRole = "user" | "assistant" | "tool" | "system" | (string & {});

export type SessionLogEntry = {
  role?: SessionLogRole;
  content?: unknown;
  ts?: number;
  toolName?: string;
  toolCallId?: string;
  error?: boolean;
  [key: string]: unknown;
};

export type UsageColumnId =
  | "channel"
  | "agent"
  | "provider"
  | "model"
  | "messages"
  | "tools"
  | "errors"
  | "duration"
  | (string & {});

export type UsageProps = {
  loading: boolean;
  error: string | null;
  sessions: UsageSessionEntry[];
  totals: UsageTotals | null;
  aggregates: UsageAggregates | null;
  costDaily: CostDailyEntry[];
  startDate: string;
  endDate: string;
  selectedSessions: string[];
  selectedDays: string[];
  selectedHours: number[];
  chartMode: "tokens" | "cost";
  dailyChartMode: "total" | "by-type";
  timeSeriesMode: "cumulative" | "per-turn";
  timeSeriesBreakdownMode: "total" | "by-type";
  timeSeries: TimeSeriesPoint[] | null;
  timeSeriesLoading: boolean;
  sessionLogs: SessionLogEntry[] | null;
  sessionLogsLoading: boolean;
  sessionLogsExpanded: boolean;
  query: string;
  queryDraft: string;
  sessionSort: string;
  sessionSortDir: "desc" | "asc";
  recentSessions: string[];
  timeZone: "local" | "utc";
  contextExpanded: boolean;
  headerPinned: boolean;
  sessionsTab: "all" | "recent";
  visibleColumns: string[];
  logFilterRoles: SessionLogRole[];
  logFilterTools: string[];
  logFilterHasTools: boolean;
  logFilterQuery: string;
  basePath: string;
  onDateChange: (start: string, end: string) => void;
  onRefresh: () => void;
  onSessionSelect: (key: string) => void;
  onDaySelect: (day: string) => void;
  onHourSelect: (hour: number, shiftKey: boolean) => void;
  onChartModeChange: (mode: "tokens" | "cost") => void;
  onDailyChartModeChange: (mode: "total" | "by-type") => void;
  onTimeSeriesModeChange: (mode: "cumulative" | "per-turn") => void;
  onTimeSeriesBreakdownModeChange: (mode: "total" | "by-type") => void;
  onQueryChange: (query: string) => void;
  onQueryDraftChange: (draft: string) => void;
  onSortChange: (sort: string, dir: "desc" | "asc") => void;
  onTimeZoneChange: (zone: "local" | "utc") => void;
  onContextToggle: () => void;
  onHeaderPinToggle: () => void;
  onSessionsTabChange: (tab: "all" | "recent") => void;
  onColumnsChange: (columns: string[]) => void;
  onSessionLogsExpandToggle: () => void;
  onLogFilterChange: (filter: {
    roles?: SessionLogRole[];
    tools?: string[];
    hasTools?: boolean;
    query?: string;
  }) => void;
  [key: string]: unknown;
};
