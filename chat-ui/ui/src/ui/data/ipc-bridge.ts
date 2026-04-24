/**
 * Unified typed IPC bridge for Setup and Settings views.
 *
 * Thin wrapper around `window.oneclaw.*` (exposed by Electron preload).
 * No abstraction beyond typing and null-safety.
 */

// ---------------------------------------------------------------------------
// Type declarations
// ---------------------------------------------------------------------------

export interface DetectionResult {
  portInUse: boolean;
  portProcess: string;
  portPid: number;
  globalInstalled: boolean;
  globalPath: string;
}

export interface VerifyResult {
  success: boolean;
  error?: string;
  message?: string;
}

export interface SetupCompleteResult {
  success: boolean;
  error?: string;
}

export interface LaunchAtLoginState {
  supported: boolean;
  enabled: boolean;
}

export interface OAuthResult {
  accessToken?: string;
  success?: boolean;
  message?: string;
}

export interface OAuthStatus {
  loggedIn: boolean;
  accessToken?: string;
}

export interface UsageData {
  data?: {
    weekUsage?: { used: number; limit: number };
    rateLimits?: { used: number; limit: number };
    resetAt?: string | number;
  };
  weekUsage?: { used: number; limit: number };
  rateLimits?: { used: number; limit: number };
  resetAt?: string | number;
}

export interface ProviderConfig {
  provider: string;
  subPlatform: string;
  apiKey: string;
  modelID: string;
  baseURL: string;
  api: string;
  supportImage?: boolean;
  customPreset?: string;
  configuredModels: ConfiguredModel[];
  savedProviders: Record<string, SavedProviderEntry>;
}

export interface SavedProviderEntry {
  provider: string;
  subPlatform?: string;
  apiKey: string;
  baseURL?: string;
  api?: string;
  customPreset?: string;
  supportImage?: boolean;
}

export interface ConfiguredModel {
  key: string;
  name: string;
  provider: string;
  isDefault: boolean;
  alias?: string;
}

export interface FeishuConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  dmPolicy: string;
  dmPolicyOpen?: boolean;
  dmScope?: string;
  groupPolicy: string;
  groupAllowFrom: string[];
  topicSessionMode?: string;
  bundled?: boolean;
  bundleMessage?: string;
}

export interface WecomConfig {
  enabled: boolean;
  botId: string;
  secret: string;
  dmPolicy: string;
  groupPolicy: string;
  groupAllowFrom: string[];
  bundled?: boolean;
  bundleMessage?: string;
}

export interface DingtalkConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  sessionTimeout: number;
  bundled?: boolean;
  bundleMessage?: string;
}

export interface QqbotConfig {
  enabled: boolean;
  appId: string;
  clientSecret: string;
  markdownSupport: boolean;
  bundled?: boolean;
  bundleMessage?: string;
}

export interface WeixinConfig {
  enabled: boolean;
  accounts: string[];
}

export interface KimiConfig {
  botToken: string;
  enabled: boolean;
}

export interface KimiSearchConfig {
  enabled: boolean;
  apiKey: string;
  serviceBaseUrl: string;
  isKimiCodeConfigured: boolean;
}

export interface MemoryConfig {
  sessionMemoryEnabled: boolean;
  embeddingEnabled: boolean;
  isKimiCodeConfigured: boolean;
}

export interface AdvancedConfig {
  browserProfile: string;
  imessageEnabled: boolean;
  launchAtLoginSupported: boolean;
  launchAtLogin: boolean;
  clawHubRegistry: string;
}

export interface CliStatus {
  enabled: boolean;
  installed: boolean;
}

export interface BackupEntry {
  fileName: string;
  createdAt: string;
  size: number;
}

export interface BackupData {
  hasLastKnownGood: boolean;
  lastKnownGoodUpdatedAt: string;
  backups: BackupEntry[];
}

export interface AboutInfo {
  oneClawVersion: string;
  openClawVersion: string;
}

export interface UpdateState {
  status: "hidden" | "available" | "downloading";
  version?: string | null;
  percent?: number | null;
  showBadge?: boolean;
}

export interface NavigatePayload {
  view: "settings" | "setup" | "chat";
  settingsTab?: string | null;
  settingsNotice?: string | null;
  token?: string | null;
}

export type GatewayState = "running" | "starting" | "stopping" | "stopped";

export interface PairingRequest {
  code: string;
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface ApprovedEntry {
  kind: string;
  id: string;
  name: string;
}

export interface SaveResult {
  success: boolean;
  error?: string;
  bundled?: boolean;
  bundleMessage?: string;
}

export interface WeixinQrResult {
  qrDataUrl: string;
  qrcode: string;
  message?: string;
}

export interface WeixinLoginWaitResult {
  connected: boolean;
  status?: "waiting" | "scaned" | "confirmed" | "expired";
  message?: string;
  accountId?: string;
}

// ---------------------------------------------------------------------------
// Window augmentation — extend the global oneclaw type with Setup/Settings methods
// ---------------------------------------------------------------------------

// Extended bridge methods added by Setup/Settings Lit views.
// These augment the base `oneclaw` declaration in app-render.ts via interface merging.
interface OneClawBridgeExtended {
      // Setup
      detectInstallation?: () => Promise<any>;
      resolveConflict?: (params: Record<string, unknown>) => Promise<any>;
      verifyKey?: (params: Record<string, unknown>) => Promise<any>;
      saveConfig?: (params: Record<string, unknown>) => Promise<any>;
      completeSetup?: (params?: Record<string, unknown>) => Promise<any>;
      setupGetLaunchAtLogin?: () => Promise<any>;
      // Kimi OAuth
      kimiOAuthLogin?: () => Promise<any>;
      kimiOAuthCancel?: () => Promise<any>;
      kimiOAuthLogout?: () => Promise<any>;
      kimiOAuthStatus?: () => Promise<any>;
      kimiGetUsage?: () => Promise<any>;
      // Settings: Provider
      settingsGetConfig?: () => Promise<any>;
      settingsVerifyKey?: (params: Record<string, unknown>) => Promise<any>;
      settingsSaveProvider?: (params: Record<string, unknown>) => Promise<any>;
      settingsGetConfiguredModels?: () => Promise<any>;
      settingsDeleteModel?: (params: Record<string, unknown>) => Promise<any>;
      settingsSetDefaultModel?: (params: Record<string, unknown>) => Promise<any>;
      settingsUpdateModelAlias?: (params: Record<string, unknown>) => Promise<any>;
      // Settings: Channels — Feishu
      settingsGetChannelConfig?: () => Promise<any>;
      settingsSaveChannel?: (params: Record<string, unknown>) => Promise<any>;
      settingsListFeishuPairing?: () => Promise<any>;
      settingsListFeishuApproved?: () => Promise<any>;
      settingsApproveFeishuPairing?: (params: Record<string, unknown>) => Promise<any>;
      settingsRejectFeishuPairing?: (params: Record<string, unknown>) => Promise<any>;
      settingsRemoveFeishuApproved?: (params: Record<string, unknown>) => Promise<any>;
      settingsAddFeishuGroupAllowFrom?: (params: Record<string, unknown>) => Promise<any>;
      // Settings: Channels — WeCom
      settingsGetWecomConfig?: () => Promise<any>;
      settingsSaveWecomConfig?: (params: Record<string, unknown>) => Promise<any>;
      settingsListWecomPairing?: () => Promise<any>;
      settingsListWecomApproved?: () => Promise<any>;
      settingsApproveWecomPairing?: (params: Record<string, unknown>) => Promise<any>;
      settingsRejectWecomPairing?: (params: Record<string, unknown>) => Promise<any>;
      settingsRemoveWecomApproved?: (params: Record<string, unknown>) => Promise<any>;
      // Settings: Channels — DingTalk
      settingsGetDingtalkConfig?: () => Promise<any>;
      settingsSaveDingtalkConfig?: (params: Record<string, unknown>) => Promise<any>;
      // Settings: Channels — QQ Bot
      settingsGetQqbotConfig?: () => Promise<any>;
      settingsSaveQqbotConfig?: (params: Record<string, unknown>) => Promise<any>;
      // Settings: Channels — Weixin
      settingsGetWeixinConfig?: () => Promise<any>;
      settingsSaveWeixinConfig?: (params: Record<string, unknown>) => Promise<any>;
      settingsWeixinLoginStart?: () => Promise<any>;
      settingsWeixinLoginWait?: (params: Record<string, unknown>) => Promise<any>;
      settingsWeixinClearAccounts?: () => Promise<any>;
      // Settings: Search / Memory / KimiClaw
      settingsGetKimiSearchConfig?: () => Promise<any>;
      settingsSaveKimiSearchConfig?: (params: Record<string, unknown>) => Promise<any>;
      settingsGetMemoryConfig?: () => Promise<any>;
      settingsSaveMemoryConfig?: (params: Record<string, unknown>) => Promise<any>;
      settingsGetKimiConfig?: () => Promise<any>;
      settingsSaveKimiConfig?: (params: Record<string, unknown>) => Promise<any>;
      // Settings: Advanced / CLI
      settingsGetAdvanced?: () => Promise<any>;
      settingsSaveAdvanced?: (params: Record<string, unknown>) => Promise<any>;
      settingsGetCliStatus?: () => Promise<any>;
      settingsInstallCli?: () => Promise<any>;
      settingsUninstallCli?: () => Promise<any>;
      // Settings: Backup
      settingsListConfigBackups?: () => Promise<any>;
      settingsRestoreConfigBackup?: (params: Record<string, unknown>) => Promise<any>;
      settingsRestoreLastKnownGood?: () => Promise<any>;
      settingsResetConfigAndRelaunch?: () => Promise<any>;
      // Settings: About
      settingsGetAboutInfo?: () => Promise<any>;
      // Gateway
      getGatewayState?: () => Promise<any>;
      restartGateway?: () => void;
      startGateway?: () => void;
      stopGateway?: () => void;
      getGatewayPort?: () => Promise<number>;
      // Update
      getUpdateState?: () => Promise<any>;
      checkForUpdates?: () => void;
      downloadAndInstallUpdate?: () => Promise<any>;
      onUpdateState?: (cb: (state: any) => void) => () => void;
      // Navigation
      onNavigate?: (cb: (payload: any) => void) => () => void;
      onSettingsNavigate?: (cb: (payload: any) => void) => () => void;
      openSettings?: () => void;
      // System
      openExternal?: (url: string) => Promise<any>;
      openPath?: (path: string) => Promise<any>;
      quit?: () => void;
      reportSetupViewState?: (active: boolean) => void;
}

function oc(): Required<OneClawBridgeExtended> {
  return window.oneclaw as unknown as Required<OneClawBridgeExtended>;
}

/**
 * Unwrap IPC responses that follow the `{ success, data }` convention
 * used by settings-ipc.ts handlers.
 * - Getters: `{ success: true, data: T }` → returns `T`
 * - On failure: `{ success: false, message: string }` → throws Error
 */
function unwrapData<T>(result: any): T {
  if (result && typeof result === "object" && "success" in result) {
    if (!result.success) {
      throw new Error(result.message ?? "IPC call failed");
    }
    return result.data as T;
  }
  // Already unwrapped (some handlers return raw values)
  return result as T;
}

/**
 * Unwrap IPC responses for mutators that return `{ success: true }` or
 * `{ success: false, message }` with no data payload.
 */
function unwrapVoid(result: any): void {
  if (result && typeof result === "object" && "success" in result && !result.success) {
    throw new Error(result.message ?? "IPC call failed");
  }
}

/**
 * Unwrap IPC responses for mutators that return `{ success, error?, bundled?, bundleMessage? }`.
 */
function unwrapSaveResult(result: any): SaveResult {
  if (result && typeof result === "object" && "success" in result) {
    if (!result.success) {
      throw new Error(result.error ?? result.message ?? "Save failed");
    }
    return result as SaveResult;
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// Setup IPC (6)
// ---------------------------------------------------------------------------

export async function detectInstallation(): Promise<DetectionResult> {
  return unwrapData<DetectionResult>(await oc().detectInstallation());
}

export async function resolveConflict(params: { action: string; pid?: number }): Promise<void> {
  return unwrapVoid(await oc().resolveConflict(params));
}

export async function verifyKey(params: Record<string, unknown>): Promise<VerifyResult> {
  return oc().verifyKey(params) as Promise<VerifyResult>;
}

export async function saveConfig(params: Record<string, unknown>): Promise<void> {
  return unwrapVoid(await oc().saveConfig(params));
}

export async function completeSetup(params?: Record<string, unknown>): Promise<SetupCompleteResult> {
  const result = await oc().completeSetup(params);
  if (result && typeof result === "object" && "success" in result && !result.success) {
    throw new Error(result.message ?? "Setup completion failed");
  }
  return result as SetupCompleteResult;
}

export async function setupGetLaunchAtLogin(): Promise<LaunchAtLoginState> {
  return unwrapData<LaunchAtLoginState>(await oc().setupGetLaunchAtLogin());
}

// ---------------------------------------------------------------------------
// Kimi OAuth (5)
// ---------------------------------------------------------------------------

export function kimiOAuthLogin(): Promise<OAuthResult> {
  return oc().kimiOAuthLogin() as Promise<OAuthResult>;
}

export function kimiOAuthCancel(): Promise<void> {
  return oc().kimiOAuthCancel() as Promise<void>;
}

export function kimiOAuthLogout(): Promise<void> {
  return oc().kimiOAuthLogout() as Promise<void>;
}

export function kimiOAuthStatus(): Promise<OAuthStatus> {
  return oc().kimiOAuthStatus() as Promise<OAuthStatus>;
}

export function kimiGetUsage(): Promise<UsageData> {
  return oc().kimiGetUsage() as Promise<UsageData>;
}

// ---------------------------------------------------------------------------
// Settings: Provider (7)
// ---------------------------------------------------------------------------

export async function settingsGetConfig(): Promise<ProviderConfig> {
  return unwrapData<ProviderConfig>(await oc().settingsGetConfig());
}

export function settingsVerifyKey(params: Record<string, unknown>): Promise<VerifyResult> {
  return oc().settingsVerifyKey(params) as Promise<VerifyResult>;
}

export async function settingsSaveProvider(params: Record<string, unknown>): Promise<void> {
  unwrapVoid(await oc().settingsSaveProvider(params));
}

export async function settingsGetConfiguredModels(): Promise<ConfiguredModel[]> {
  return unwrapData<ConfiguredModel[]>(await oc().settingsGetConfiguredModels());
}

export async function settingsDeleteModel(params: { modelKey: string }): Promise<void> {
  unwrapVoid(await oc().settingsDeleteModel(params));
}

export async function settingsSetDefaultModel(params: { modelKey: string }): Promise<void> {
  unwrapVoid(await oc().settingsSetDefaultModel(params));
}

export async function settingsUpdateModelAlias(params: Record<string, unknown>): Promise<void> {
  unwrapVoid(await oc().settingsUpdateModelAlias(params));
}

// ---------------------------------------------------------------------------
// Settings: Channels — Feishu (8)
// ---------------------------------------------------------------------------

export async function settingsGetChannelConfig(): Promise<FeishuConfig> {
  return unwrapData<FeishuConfig>(await oc().settingsGetChannelConfig());
}

export async function settingsSaveChannel(params: Record<string, unknown>): Promise<SaveResult> {
  return unwrapSaveResult(await oc().settingsSaveChannel(params));
}

export async function settingsListFeishuPairing(): Promise<PairingRequest[]> {
  const result = unwrapData<{ requests: PairingRequest[] }>(await oc().settingsListFeishuPairing());
  return result.requests ?? [];
}

export async function settingsListFeishuApproved(): Promise<ApprovedEntry[]> {
  const result = unwrapData<{ entries: ApprovedEntry[] }>(await oc().settingsListFeishuApproved());
  return result.entries ?? [];
}

export async function settingsApproveFeishuPairing(params: { code: string; id: string; name: string }): Promise<void> {
  unwrapVoid(await oc().settingsApproveFeishuPairing(params));
}

export async function settingsRejectFeishuPairing(params: { code: string; id: string; name: string }): Promise<void> {
  unwrapVoid(await oc().settingsRejectFeishuPairing(params));
}

export async function settingsRemoveFeishuApproved(params: { kind: string; id: string }): Promise<void> {
  unwrapVoid(await oc().settingsRemoveFeishuApproved(params));
}

export async function settingsAddFeishuGroupAllowFrom(params: { id: string }): Promise<void> {
  unwrapVoid(await oc().settingsAddFeishuGroupAllowFrom(params));
}

// ---------------------------------------------------------------------------
// Settings: Channels — WeCom (7)
// ---------------------------------------------------------------------------

export async function settingsGetWecomConfig(): Promise<WecomConfig> {
  return unwrapData<WecomConfig>(await oc().settingsGetWecomConfig());
}

export async function settingsSaveWecomConfig(params: Record<string, unknown>): Promise<SaveResult> {
  return unwrapSaveResult(await oc().settingsSaveWecomConfig(params));
}

export async function settingsListWecomPairing(): Promise<PairingRequest[]> {
  const result = unwrapData<{ requests: PairingRequest[] }>(await oc().settingsListWecomPairing());
  return result.requests ?? [];
}

export async function settingsListWecomApproved(): Promise<ApprovedEntry[]> {
  const result = unwrapData<{ entries: ApprovedEntry[] }>(await oc().settingsListWecomApproved());
  return result.entries ?? [];
}

export async function settingsApproveWecomPairing(params: { code: string; id: string; name: string }): Promise<void> {
  unwrapVoid(await oc().settingsApproveWecomPairing(params));
}

export async function settingsRejectWecomPairing(params: { code: string; id: string; name: string }): Promise<void> {
  unwrapVoid(await oc().settingsRejectWecomPairing(params));
}

export async function settingsRemoveWecomApproved(params: { kind: string; id: string }): Promise<void> {
  unwrapVoid(await oc().settingsRemoveWecomApproved(params));
}

// ---------------------------------------------------------------------------
// Settings: Channels — DingTalk (2)
// ---------------------------------------------------------------------------

export async function settingsGetDingtalkConfig(): Promise<DingtalkConfig> {
  return unwrapData<DingtalkConfig>(await oc().settingsGetDingtalkConfig());
}

export async function settingsSaveDingtalkConfig(params: Record<string, unknown>): Promise<SaveResult> {
  return unwrapSaveResult(await oc().settingsSaveDingtalkConfig(params));
}

// ---------------------------------------------------------------------------
// Settings: Channels — QQ Bot (2)
// ---------------------------------------------------------------------------

export async function settingsGetQqbotConfig(): Promise<QqbotConfig> {
  return unwrapData<QqbotConfig>(await oc().settingsGetQqbotConfig());
}

export async function settingsSaveQqbotConfig(params: Record<string, unknown>): Promise<SaveResult> {
  return unwrapSaveResult(await oc().settingsSaveQqbotConfig(params));
}

// ---------------------------------------------------------------------------
// Settings: Channels — Weixin (5)
// ---------------------------------------------------------------------------

export async function settingsGetWeixinConfig(): Promise<WeixinConfig> {
  return unwrapData<WeixinConfig>(await oc().settingsGetWeixinConfig());
}

export async function settingsSaveWeixinConfig(params: Record<string, unknown>): Promise<SaveResult> {
  return unwrapSaveResult(await oc().settingsSaveWeixinConfig(params));
}

export async function settingsWeixinLoginStart(): Promise<WeixinQrResult> {
  return unwrapData<WeixinQrResult>(await oc().settingsWeixinLoginStart());
}

export async function settingsWeixinLoginWait(params: { qrcode: string }): Promise<WeixinLoginWaitResult> {
  return unwrapData<WeixinLoginWaitResult>(await oc().settingsWeixinLoginWait(params));
}

export function settingsWeixinClearAccounts(): Promise<void> {
  return oc().settingsWeixinClearAccounts() as Promise<void>;
}

// ---------------------------------------------------------------------------
// Settings: Search / Memory / KimiClaw (6)
// ---------------------------------------------------------------------------

export async function settingsGetKimiSearchConfig(): Promise<KimiSearchConfig> {
  return unwrapData<KimiSearchConfig>(await oc().settingsGetKimiSearchConfig());
}

export async function settingsSaveKimiSearchConfig(params: { enabled: boolean; apiKey: string; serviceBaseUrl: string }): Promise<void> {
  unwrapVoid(await oc().settingsSaveKimiSearchConfig(params));
}

export async function settingsGetMemoryConfig(): Promise<MemoryConfig> {
  return unwrapData<MemoryConfig>(await oc().settingsGetMemoryConfig());
}

export async function settingsSaveMemoryConfig(params: { sessionMemoryEnabled: boolean; embeddingEnabled: boolean }): Promise<void> {
  unwrapVoid(await oc().settingsSaveMemoryConfig(params));
}

export async function settingsGetKimiConfig(): Promise<KimiConfig> {
  return unwrapData<KimiConfig>(await oc().settingsGetKimiConfig());
}

export async function settingsSaveKimiConfig(params: { botToken: string; enabled: boolean }): Promise<void> {
  unwrapVoid(await oc().settingsSaveKimiConfig(params));
}

// ---------------------------------------------------------------------------
// Settings: Advanced / CLI (5)
// ---------------------------------------------------------------------------

export async function settingsGetAdvanced(): Promise<AdvancedConfig> {
  return unwrapData<AdvancedConfig>(await oc().settingsGetAdvanced());
}

export async function settingsSaveAdvanced(params: Record<string, unknown>): Promise<void> {
  unwrapVoid(await oc().settingsSaveAdvanced(params));
}

export async function settingsGetCliStatus(): Promise<CliStatus> {
  return unwrapData<CliStatus>(await oc().settingsGetCliStatus());
}

export async function settingsInstallCli(): Promise<void> {
  unwrapVoid(await oc().settingsInstallCli());
}

export async function settingsUninstallCli(): Promise<void> {
  unwrapVoid(await oc().settingsUninstallCli());
}

// ---------------------------------------------------------------------------
// Settings: Backup (4)
// ---------------------------------------------------------------------------

export async function settingsListConfigBackups(): Promise<BackupData> {
  return unwrapData<BackupData>(await oc().settingsListConfigBackups());
}

export async function settingsRestoreConfigBackup(params: { fileName: string }): Promise<void> {
  unwrapVoid(await oc().settingsRestoreConfigBackup(params));
}

export async function settingsRestoreLastKnownGood(): Promise<void> {
  unwrapVoid(await oc().settingsRestoreLastKnownGood());
}

export async function settingsResetConfigAndRelaunch(): Promise<void> {
  unwrapVoid(await oc().settingsResetConfigAndRelaunch());
}

// ---------------------------------------------------------------------------
// Settings: About (1)
// ---------------------------------------------------------------------------

export async function settingsGetAboutInfo(): Promise<AboutInfo> {
  return unwrapData<AboutInfo>(await oc().settingsGetAboutInfo());
}

// ---------------------------------------------------------------------------
// Gateway control (4)
// ---------------------------------------------------------------------------

export function getGatewayState(): Promise<GatewayState> {
  return oc().getGatewayState() as Promise<GatewayState>;
}

export function restartGateway(): void {
  oc().restartGateway();
}

export function startGateway(): void {
  oc().startGateway();
}

export function stopGateway(): void {
  oc().stopGateway();
}

export function getGatewayPort(): Promise<number> {
  return oc().getGatewayPort() as Promise<number>;
}

// ---------------------------------------------------------------------------
// Update (4)
// ---------------------------------------------------------------------------

export function getUpdateState(): Promise<UpdateState> {
  return oc().getUpdateState() as Promise<UpdateState>;
}

export function checkForUpdates(): void {
  oc().checkForUpdates();
}

export function downloadAndInstallUpdate(): Promise<void> {
  return oc().downloadAndInstallUpdate() as Promise<void>;
}

export function onUpdateState(cb: (state: UpdateState) => void): () => void {
  return oc().onUpdateState(cb);
}

// ---------------------------------------------------------------------------
// Navigation / Events (3)
// ---------------------------------------------------------------------------

export function onNavigate(cb: (payload: NavigatePayload) => void): () => void {
  return oc().onNavigate(cb);
}

export function onSettingsNavigate(cb: (payload: { tab: string; notice: string }) => void): () => void {
  return oc().onSettingsNavigate(cb);
}

export function openSettings(): void {
  oc().openSettings();
}

// ---------------------------------------------------------------------------
// System (3)
// ---------------------------------------------------------------------------

export function openExternal(url: string): Promise<void> {
  return oc().openExternal(url) as Promise<void>;
}

export function openPath(path: string): Promise<void> {
  return oc().openPath(path) as Promise<void>;
}

export function quit(): void {
  oc().quit();
}

// ---------------------------------------------------------------------------
// Setup view state reporting (for window close policy)
// ---------------------------------------------------------------------------

export function reportSetupViewState(active: boolean): void {
  oc().reportSetupViewState(active);
}
