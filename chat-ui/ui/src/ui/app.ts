import { LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import type { EventLogEntry } from "./app-events.ts";
import type { AppViewState } from "./app-view-state.ts";
import type { DevicePairingList } from "./controllers/devices.ts";
import type { ExecApprovalRequest } from "./controllers/exec-approval.ts";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals.ts";
import type { SkillMessage } from "./controllers/skills.ts";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway.ts";
import type { Tab } from "./navigation.ts";
import type { ResolvedTheme, ThemeMode } from "./theme.ts";
import type {
  AgentsListResult,
  AgentsFilesListResult,
  AgentIdentityResult,
  ConfigSnapshot,
  ConfigUiHints,
  CronJob,
  CronRunLogEntry,
  CronStatus,
  HealthSnapshot,
  LogEntry,
  LogLevel,
  PresenceEntry,
  ChannelsStatusSnapshot,
  SessionsListResult,
  SkillStatusReport,
  StatusSummary,
  NostrProfile,
} from "./types.ts";
import type { NostrProfileFormState } from "./views/channels.nostr-profile-form.ts";
import {
  handleChannelConfigReload as handleChannelConfigReloadInternal,
  handleChannelConfigSave as handleChannelConfigSaveInternal,
  handleNostrProfileCancel as handleNostrProfileCancelInternal,
  handleNostrProfileEdit as handleNostrProfileEditInternal,
  handleNostrProfileFieldChange as handleNostrProfileFieldChangeInternal,
  handleNostrProfileImport as handleNostrProfileImportInternal,
  handleNostrProfileSave as handleNostrProfileSaveInternal,
  handleNostrProfileToggleAdvanced as handleNostrProfileToggleAdvancedInternal,
  handleWhatsAppLogout as handleWhatsAppLogoutInternal,
  handleWhatsAppStart as handleWhatsAppStartInternal,
  handleWhatsAppWait as handleWhatsAppWaitInternal,
} from "./app-channels.ts";
import {
  handleAbortChat as handleAbortChatInternal,
  handleSendChat as handleSendChatInternal,
  removeQueuedMessage as removeQueuedMessageInternal,
} from "./app-chat.ts";
import { DEFAULT_CRON_FORM, DEFAULT_LOG_LEVEL_FILTERS } from "./app-defaults.ts";
import { connectGateway as connectGatewayInternal } from "./app-gateway.ts";
import {
  handleConnected,
  handleDisconnected,
  handleFirstUpdated,
  handleUpdated,
} from "./app-lifecycle.ts";
import { renderApp } from "./app-render.ts";
import {
  exportLogs as exportLogsInternal,
  handleChatScroll as handleChatScrollInternal,
  handleLogsScroll as handleLogsScrollInternal,
  resetChatScroll as resetChatScrollInternal,
  scheduleChatScroll as scheduleChatScrollInternal,
} from "./app-scroll.ts";
import {
  applySettings as applySettingsInternal,
  loadCron as loadCronInternal,
  loadOverview as loadOverviewInternal,
  setTab as setTabInternal,
  setTheme as setThemeInternal,
  onPopState as onPopStateInternal,
} from "./app-settings.ts";
import {
  resetToolStream as resetToolStreamInternal,
  type ToolStreamEntry,
  type CompactionStatus,
} from "./app-tool-stream.ts";
import { resolveInjectedAssistantIdentity } from "./assistant-identity.ts";
import { loadAssistantIdentity as loadAssistantIdentityInternal } from "./controllers/assistant-identity.ts";
import { loadSettings, type UiSettings } from "./storage.ts";
import { type ChatAttachment, type ChatQueueItem, type CronFormState } from "./ui-types.ts";

declare global {
  interface Window {
    __OPENCLAW_CONTROL_UI_BASE_PATH__?: string;
  }
}

const injectedAssistantIdentity = resolveInjectedAssistantIdentity();

function resolveOnboardingMode(): boolean {
  if (!window.location.search) {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("onboarding");
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

@customElement("openclaw-app")
export class OpenClawApp extends LitElement {
  static properties = {
    settings: { state: true },
    password: { state: true },
    tab: { state: true },
    onboarding: { state: true },
    connected: { state: true },
    theme: { state: true },
    themeResolved: { state: true },
    hello: { state: true },
    lastError: { state: true },
    eventLog: { state: true },
    assistantName: { state: true },
    assistantAvatar: { state: true },
    assistantAgentId: { state: true },
    sessionKey: { state: true },
    chatLoading: { state: true },
    chatSending: { state: true },
    chatMessage: { state: true },
    chatMessages: { state: true },
    chatToolMessages: { state: true },
    chatStream: { state: true },
    chatStreamStartedAt: { state: true },
    chatRunId: { state: true },
    compactionStatus: { state: true },
    chatAvatarUrl: { state: true },
    chatThinkingLevel: { state: true },
    chatQueue: { state: true },
    chatAttachments: { state: true },
    chatManualRefreshInFlight: { state: true },
    sidebarOpen: { state: true },
    sidebarContent: { state: true },
    sidebarError: { state: true },
    splitRatio: { state: true },
    nodesLoading: { state: true },
    nodes: { state: true },
    devicesLoading: { state: true },
    devicesError: { state: true },
    devicesList: { state: true },
    execApprovalsLoading: { state: true },
    execApprovalsSaving: { state: true },
    execApprovalsDirty: { state: true },
    execApprovalsSnapshot: { state: true },
    execApprovalsForm: { state: true },
    execApprovalsSelectedAgent: { state: true },
    execApprovalsTarget: { state: true },
    execApprovalsTargetNodeId: { state: true },
    execApprovalQueue: { state: true },
    execApprovalBusy: { state: true },
    execApprovalError: { state: true },
    pendingGatewayUrl: { state: true },
    configLoading: { state: true },
    configRaw: { state: true },
    configRawOriginal: { state: true },
    configValid: { state: true },
    configIssues: { state: true },
    configSaving: { state: true },
    configApplying: { state: true },
    updateRunning: { state: true },
    applySessionKey: { state: true },
    configSnapshot: { state: true },
    configSchema: { state: true },
    configSchemaVersion: { state: true },
    configSchemaLoading: { state: true },
    configUiHints: { state: true },
    configForm: { state: true },
    configFormOriginal: { state: true },
    configFormDirty: { state: true },
    configFormMode: { state: true },
    configSearchQuery: { state: true },
    configActiveSection: { state: true },
    configActiveSubsection: { state: true },
    channelsLoading: { state: true },
    channelsSnapshot: { state: true },
    channelsError: { state: true },
    channelsLastSuccess: { state: true },
    whatsappLoginMessage: { state: true },
    whatsappLoginQrDataUrl: { state: true },
    whatsappLoginConnected: { state: true },
    whatsappBusy: { state: true },
    nostrProfileFormState: { state: true },
    nostrProfileAccountId: { state: true },
    presenceLoading: { state: true },
    presenceEntries: { state: true },
    presenceError: { state: true },
    presenceStatus: { state: true },
    agentsLoading: { state: true },
    agentsList: { state: true },
    agentsError: { state: true },
    agentsSelectedId: { state: true },
    agentsPanel: { state: true },
    agentFilesLoading: { state: true },
    agentFilesError: { state: true },
    agentFilesList: { state: true },
    agentFileContents: { state: true },
    agentFileDrafts: { state: true },
    agentFileActive: { state: true },
    agentFileSaving: { state: true },
    agentIdentityLoading: { state: true },
    agentIdentityError: { state: true },
    agentIdentityById: { state: true },
    agentSkillsLoading: { state: true },
    agentSkillsError: { state: true },
    agentSkillsReport: { state: true },
    agentSkillsAgentId: { state: true },
    sessionsLoading: { state: true },
    sessionsResult: { state: true },
    sessionsError: { state: true },
    sessionsFilterActive: { state: true },
    sessionsFilterLimit: { state: true },
    sessionsIncludeGlobal: { state: true },
    sessionsIncludeUnknown: { state: true },
    usageLoading: { state: true },
    usageResult: { state: true },
    usageCostSummary: { state: true },
    usageError: { state: true },
    usageStartDate: { state: true },
    usageEndDate: { state: true },
    usageSelectedSessions: { state: true },
    usageSelectedDays: { state: true },
    usageSelectedHours: { state: true },
    usageChartMode: { state: true },
    usageDailyChartMode: { state: true },
    usageTimeSeriesMode: { state: true },
    usageTimeSeriesBreakdownMode: { state: true },
    usageTimeSeries: { state: true },
    usageTimeSeriesLoading: { state: true },
    usageSessionLogs: { state: true },
    usageSessionLogsLoading: { state: true },
    usageSessionLogsExpanded: { state: true },
    usageQuery: { state: true },
    usageQueryDraft: { state: true },
    usageSessionSort: { state: true },
    usageSessionSortDir: { state: true },
    usageRecentSessions: { state: true },
    usageTimeZone: { state: true },
    usageContextExpanded: { state: true },
    usageHeaderPinned: { state: true },
    usageSessionsTab: { state: true },
    usageVisibleColumns: { state: true },
    usageLogFilterRoles: { state: true },
    usageLogFilterTools: { state: true },
    usageLogFilterHasTools: { state: true },
    usageLogFilterQuery: { state: true },
    cronLoading: { state: true },
    cronJobs: { state: true },
    cronStatus: { state: true },
    cronError: { state: true },
    cronForm: { state: true },
    cronRunsJobId: { state: true },
    cronRuns: { state: true },
    cronBusy: { state: true },
    skillsLoading: { state: true },
    skillsReport: { state: true },
    skillsError: { state: true },
    skillsFilter: { state: true },
    skillEdits: { state: true },
    skillsBusyKey: { state: true },
    skillMessages: { state: true },
    debugLoading: { state: true },
    debugStatus: { state: true },
    debugHealth: { state: true },
    debugModels: { state: true },
    debugHeartbeat: { state: true },
    debugCallMethod: { state: true },
    debugCallParams: { state: true },
    debugCallResult: { state: true },
    debugCallError: { state: true },
    logsLoading: { state: true },
    logsError: { state: true },
    logsFile: { state: true },
    logsEntries: { state: true },
    logsFilterText: { state: true },
    logsLevelFilters: { state: true },
    logsAutoFollow: { state: true },
    logsTruncated: { state: true },
    logsCursor: { state: true },
    logsLastFetchAt: { state: true },
    logsLimit: { state: true },
    logsMaxBytes: { state: true },
    logsAtBottom: { state: true },
    chatNewMessagesBelow: { state: true },
  };

  settings: UiSettings = loadSettings();
  password = "";
  tab: Tab = "chat";
  onboarding = resolveOnboardingMode();
  connected = false;
  theme: ThemeMode = this.settings.theme ?? "system";
  themeResolved: ResolvedTheme = "dark";
  hello: GatewayHelloOk | null = null;
  lastError: string | null = null;
  eventLog: EventLogEntry[] = [];
  private eventLogBuffer: EventLogEntry[] = [];
  private toolStreamSyncTimer: number | null = null;
  private sidebarCloseTimer: number | null = null;

  assistantName = injectedAssistantIdentity.name;
  assistantAvatar = injectedAssistantIdentity.avatar;
  assistantAgentId = injectedAssistantIdentity.agentId ?? null;

  sessionKey = this.settings.sessionKey;
  chatLoading = false;
  chatSending = false;
  chatMessage = "";
  chatMessages: unknown[] = [];
  chatToolMessages: unknown[] = [];
  chatStream: string | null = null;
  chatStreamStartedAt: number | null = null;
  chatRunId: string | null = null;
  compactionStatus: CompactionStatus | null = null;
  chatAvatarUrl: string | null = null;
  chatThinkingLevel: string | null = null;
  chatQueue: ChatQueueItem[] = [];
  chatAttachments: ChatAttachment[] = [];
  chatManualRefreshInFlight = false;
  // Sidebar state for tool output viewing
  sidebarOpen = false;
  sidebarContent: string | null = null;
  sidebarError: string | null = null;
  splitRatio = this.settings.splitRatio;

  nodesLoading = false;
  nodes: Array<Record<string, unknown>> = [];
  devicesLoading = false;
  devicesError: string | null = null;
  devicesList: DevicePairingList | null = null;
  execApprovalsLoading = false;
  execApprovalsSaving = false;
  execApprovalsDirty = false;
  execApprovalsSnapshot: ExecApprovalsSnapshot | null = null;
  execApprovalsForm: ExecApprovalsFile | null = null;
  execApprovalsSelectedAgent: string | null = null;
  execApprovalsTarget: "gateway" | "node" = "gateway";
  execApprovalsTargetNodeId: string | null = null;
  execApprovalQueue: ExecApprovalRequest[] = [];
  execApprovalBusy = false;
  execApprovalError: string | null = null;
  pendingGatewayUrl: string | null = null;

  configLoading = false;
  configRaw = "{\n}\n";
  configRawOriginal = "";
  configValid: boolean | null = null;
  configIssues: unknown[] = [];
  configSaving = false;
  configApplying = false;
  updateRunning = false;
  applySessionKey = this.settings.lastActiveSessionKey;
  configSnapshot: ConfigSnapshot | null = null;
  configSchema: unknown = null;
  configSchemaVersion: string | null = null;
  configSchemaLoading = false;
  configUiHints: ConfigUiHints = {};
  configForm: Record<string, unknown> | null = null;
  configFormOriginal: Record<string, unknown> | null = null;
  configFormDirty = false;
  configFormMode: "form" | "raw" = "form";
  configSearchQuery = "";
  configActiveSection: string | null = null;
  configActiveSubsection: string | null = null;

  channelsLoading = false;
  channelsSnapshot: ChannelsStatusSnapshot | null = null;
  channelsError: string | null = null;
  channelsLastSuccess: number | null = null;
  whatsappLoginMessage: string | null = null;
  whatsappLoginQrDataUrl: string | null = null;
  whatsappLoginConnected: boolean | null = null;
  whatsappBusy = false;
  nostrProfileFormState: NostrProfileFormState | null = null;
  nostrProfileAccountId: string | null = null;

  presenceLoading = false;
  presenceEntries: PresenceEntry[] = [];
  presenceError: string | null = null;
  presenceStatus: string | null = null;

  agentsLoading = false;
  agentsList: AgentsListResult | null = null;
  agentsError: string | null = null;
  agentsSelectedId: string | null = null;
  agentsPanel: "overview" | "files" | "tools" | "skills" | "channels" | "cron" =
    "overview";
  agentFilesLoading = false;
  agentFilesError: string | null = null;
  agentFilesList: AgentsFilesListResult | null = null;
  agentFileContents: Record<string, string> = {};
  agentFileDrafts: Record<string, string> = {};
  agentFileActive: string | null = null;
  agentFileSaving = false;
  agentIdentityLoading = false;
  agentIdentityError: string | null = null;
  agentIdentityById: Record<string, AgentIdentityResult> = {};
  agentSkillsLoading = false;
  agentSkillsError: string | null = null;
  agentSkillsReport: SkillStatusReport | null = null;
  agentSkillsAgentId: string | null = null;

  sessionsLoading = false;
  sessionsResult: SessionsListResult | null = null;
  sessionsError: string | null = null;
  sessionsFilterActive = "";
  sessionsFilterLimit = "120";
  sessionsIncludeGlobal = true;
  sessionsIncludeUnknown = false;

  usageLoading = false;
  usageResult: import("./types.js").SessionsUsageResult | null = null;
  usageCostSummary: import("./types.js").CostUsageSummary | null = null;
  usageError: string | null = null;
  usageStartDate = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  usageEndDate = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  usageSelectedSessions: string[] = [];
  usageSelectedDays: string[] = [];
  usageSelectedHours: number[] = [];
  usageChartMode: "tokens" | "cost" = "tokens";
  usageDailyChartMode: "total" | "by-type" = "by-type";
  usageTimeSeriesMode: "cumulative" | "per-turn" = "per-turn";
  usageTimeSeriesBreakdownMode: "total" | "by-type" = "by-type";
  usageTimeSeries: import("./types.js").SessionUsageTimeSeries | null = null;
  usageTimeSeriesLoading = false;
  usageSessionLogs: import("./views/usage.js").SessionLogEntry[] | null = null;
  usageSessionLogsLoading = false;
  usageSessionLogsExpanded = false;
  // Applied query (used to filter the already-loaded sessions list client-side).
  usageQuery = "";
  // Draft query text (updates immediately as the user types; applied via debounce or "Search").
  usageQueryDraft = "";
  usageSessionSort: "tokens" | "cost" | "recent" | "messages" | "errors" = "recent";
  usageSessionSortDir: "desc" | "asc" = "desc";
  usageRecentSessions: string[] = [];
  usageTimeZone: "local" | "utc" = "local";
  usageContextExpanded = false;
  usageHeaderPinned = false;
  usageSessionsTab: "all" | "recent" = "all";
  usageVisibleColumns: string[] = [
    "channel",
    "agent",
    "provider",
    "model",
    "messages",
    "tools",
    "errors",
    "duration",
  ];
  usageLogFilterRoles: import("./views/usage.js").SessionLogRole[] = [];
  usageLogFilterTools: string[] = [];
  usageLogFilterHasTools = false;
  usageLogFilterQuery = "";

  // Non-reactive (don’t trigger renders just for timer bookkeeping).
  usageQueryDebounceTimer: number | null = null;

  cronLoading = false;
  cronJobs: CronJob[] = [];
  cronStatus: CronStatus | null = null;
  cronError: string | null = null;
  cronForm: CronFormState = { ...DEFAULT_CRON_FORM };
  cronRunsJobId: string | null = null;
  cronRuns: CronRunLogEntry[] = [];
  cronBusy = false;

  skillsLoading = false;
  skillsReport: SkillStatusReport | null = null;
  skillsError: string | null = null;
  skillsFilter = "";
  skillEdits: Record<string, string> = {};
  skillsBusyKey: string | null = null;
  skillMessages: Record<string, SkillMessage> = {};

  debugLoading = false;
  debugStatus: StatusSummary | null = null;
  debugHealth: HealthSnapshot | null = null;
  debugModels: unknown[] = [];
  debugHeartbeat: unknown = null;
  debugCallMethod = "";
  debugCallParams = "{}";
  debugCallResult: string | null = null;
  debugCallError: string | null = null;

  logsLoading = false;
  logsError: string | null = null;
  logsFile: string | null = null;
  logsEntries: LogEntry[] = [];
  logsFilterText = "";
  logsLevelFilters: Record<LogLevel, boolean> = {
    ...DEFAULT_LOG_LEVEL_FILTERS,
  };
  logsAutoFollow = true;
  logsTruncated = false;
  logsCursor: number | null = null;
  logsLastFetchAt: number | null = null;
  logsLimit = 500;
  logsMaxBytes = 250_000;
  logsAtBottom = true;

  client: GatewayBrowserClient | null = null;
  private chatScrollFrame: number | null = null;
  private chatScrollTimeout: number | null = null;
  private chatHasAutoScrolled = false;
  private chatUserNearBottom = true;
  chatNewMessagesBelow = false;
  private nodesPollInterval: number | null = null;
  private logsPollInterval: number | null = null;
  private debugPollInterval: number | null = null;
  private logsScrollFrame: number | null = null;
  private toolStreamById = new Map<string, ToolStreamEntry>();
  private toolStreamOrder: string[] = [];
  refreshSessionsAfterChat = new Set<string>();
  basePath = "";
  private popStateHandler = () =>
    onPopStateInternal(this as unknown as Parameters<typeof onPopStateInternal>[0]);
  private themeMedia: MediaQueryList | null = null;
  private themeMediaHandler: ((event: MediaQueryListEvent) => void) | null = null;
  private topbarObserver: ResizeObserver | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    handleConnected(this as unknown as Parameters<typeof handleConnected>[0]);
  }

  protected firstUpdated() {
    handleFirstUpdated(this as unknown as Parameters<typeof handleFirstUpdated>[0]);
  }

  disconnectedCallback() {
    handleDisconnected(this as unknown as Parameters<typeof handleDisconnected>[0]);
    super.disconnectedCallback();
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    handleUpdated(this as unknown as Parameters<typeof handleUpdated>[0], changed);
  }

  connect() {
    connectGatewayInternal(this as unknown as Parameters<typeof connectGatewayInternal>[0]);
  }

  handleChatScroll(event: Event) {
    handleChatScrollInternal(
      this as unknown as Parameters<typeof handleChatScrollInternal>[0],
      event,
    );
  }

  handleLogsScroll(event: Event) {
    handleLogsScrollInternal(
      this as unknown as Parameters<typeof handleLogsScrollInternal>[0],
      event,
    );
  }

  exportLogs(lines: string[], label: string) {
    exportLogsInternal(lines, label);
  }

  resetToolStream() {
    resetToolStreamInternal(this as unknown as Parameters<typeof resetToolStreamInternal>[0]);
  }

  resetChatScroll() {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
  }

  scrollToBottom(opts?: { smooth?: boolean }) {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
    scheduleChatScrollInternal(
      this as unknown as Parameters<typeof scheduleChatScrollInternal>[0],
      true,
      Boolean(opts?.smooth),
    );
  }

  async loadAssistantIdentity() {
    await loadAssistantIdentityInternal(this);
  }

  applySettings(next: UiSettings) {
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], next);
  }

  setTab(next: Tab) {
    setTabInternal(this as unknown as Parameters<typeof setTabInternal>[0], next);
  }

  setTheme(next: ThemeMode, context?: Parameters<typeof setThemeInternal>[2]) {
    setThemeInternal(this as unknown as Parameters<typeof setThemeInternal>[0], next, context);
  }

  async loadOverview() {
    await loadOverviewInternal(this as unknown as Parameters<typeof loadOverviewInternal>[0]);
  }

  async loadCron() {
    await loadCronInternal(this as unknown as Parameters<typeof loadCronInternal>[0]);
  }

  async handleAbortChat() {
    await handleAbortChatInternal(this as unknown as Parameters<typeof handleAbortChatInternal>[0]);
  }

  removeQueuedMessage(id: string) {
    removeQueuedMessageInternal(
      this as unknown as Parameters<typeof removeQueuedMessageInternal>[0],
      id,
    );
  }

  async handleSendChat(
    messageOverride?: string,
    opts?: Parameters<typeof handleSendChatInternal>[2],
  ) {
    await handleSendChatInternal(
      this as unknown as Parameters<typeof handleSendChatInternal>[0],
      messageOverride,
      opts,
    );
  }

  async handleWhatsAppStart(force: boolean) {
    await handleWhatsAppStartInternal(this, force);
  }

  async handleWhatsAppWait() {
    await handleWhatsAppWaitInternal(this);
  }

  async handleWhatsAppLogout() {
    await handleWhatsAppLogoutInternal(this);
  }

  async handleChannelConfigSave() {
    await handleChannelConfigSaveInternal(this);
  }

  async handleChannelConfigReload() {
    await handleChannelConfigReloadInternal(this);
  }

  handleNostrProfileEdit(accountId: string, profile: NostrProfile | null) {
    handleNostrProfileEditInternal(this, accountId, profile);
  }

  handleNostrProfileCancel() {
    handleNostrProfileCancelInternal(this);
  }

  handleNostrProfileFieldChange(field: keyof NostrProfile, value: string) {
    handleNostrProfileFieldChangeInternal(this, field, value);
  }

  async handleNostrProfileSave() {
    await handleNostrProfileSaveInternal(this);
  }

  async handleNostrProfileImport() {
    await handleNostrProfileImportInternal(this);
  }

  handleNostrProfileToggleAdvanced() {
    handleNostrProfileToggleAdvancedInternal(this);
  }

  async handleExecApprovalDecision(decision: "allow-once" | "allow-always" | "deny") {
    const active = this.execApprovalQueue[0];
    if (!active || !this.client || this.execApprovalBusy) {
      return;
    }
    this.execApprovalBusy = true;
    this.execApprovalError = null;
    try {
      await this.client.request("exec.approval.resolve", {
        id: active.id,
        decision,
      });
      this.execApprovalQueue = this.execApprovalQueue.filter((entry) => entry.id !== active.id);
    } catch (err) {
      this.execApprovalError = `Exec approval failed: ${String(err)}`;
    } finally {
      this.execApprovalBusy = false;
    }
  }

  handleGatewayUrlConfirm() {
    const nextGatewayUrl = this.pendingGatewayUrl;
    if (!nextGatewayUrl) {
      return;
    }
    this.pendingGatewayUrl = null;
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], {
      ...this.settings,
      gatewayUrl: nextGatewayUrl,
    });
    this.connect();
  }

  handleGatewayUrlCancel() {
    this.pendingGatewayUrl = null;
  }

  // Sidebar handlers for tool output viewing
  handleOpenSidebar(content: string) {
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
      this.sidebarCloseTimer = null;
    }
    this.sidebarContent = content;
    this.sidebarError = null;
    this.sidebarOpen = true;
  }

  handleCloseSidebar() {
    this.sidebarOpen = false;
    // Clear content after transition
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
    }
    this.sidebarCloseTimer = window.setTimeout(() => {
      if (this.sidebarOpen) {
        return;
      }
      this.sidebarContent = null;
      this.sidebarError = null;
      this.sidebarCloseTimer = null;
    }, 200);
  }

  handleSplitRatioChange(ratio: number) {
    const newRatio = Math.max(0.4, Math.min(0.7, ratio));
    this.splitRatio = newRatio;
    this.applySettings({ ...this.settings, splitRatio: newRatio });
  }

  render() {
    return renderApp(this as unknown as AppViewState);
  }
}
