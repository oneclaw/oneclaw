/**
 * Settings: Provider Tab — two-column model list + provider form.
 * Migrated from settings/settings.js provider section.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t, getLocale } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import type { ConfiguredModel, UsageData } from "../../data/ipc-bridge.ts";
import "../../components/toggle-switch.ts";
import "../../components/password-input.ts";
import "../../components/message-box.ts";
import "../../components/provider-segment.ts";
import {
  PROVIDERS, CUSTOM_PRESETS, KIMI_CODE_MODELS, SUB_PLATFORM_URLS,
  CUSTOM_MODEL_SENTINEL, PROVIDER_DISPLAY_ORDER, getProviderLabels,
} from "../setup/setup-constants.ts";

/* ── types ── */

interface EditorState {
  mode: "idle" | "add" | "edit";
  modelKey?: string;
  providerKey?: string;
}

/* ── module-level state ── */

// Provider 页状态必须可整体回滚，避免离开 Settings 后脏表单泄漏到下次打开。
function createProviderState() {
  return {
    editMode: "idle" as "idle" | "add" | "edit",
    currentProvider: "moonshot",
    subPlatform: "kimi-code",
    customPreset: "" as string,
    configuredModels: [] as ConfiguredModel[],
    savedProviders: {} as Record<string, any>,
    selectedModelKey: null as string | null,
    editorProviderKey: null as string | null,
    oauthLoggedIn: false,
    pendingOAuthToken: null as string | null,
    oauthLoading: false,
    oauthSuccess: false,
    oauthNoMembership: false,
    verifying: false,
    saving: false,
    error: null as string | null,
    successMsg: null as string | null,
    usageData: null as any,
    apiKey: "",
    modelId: "",
    customModelId: "",
    modelAlias: "",
    baseUrl: "",
    apiType: "openai-completions",
    imageSupport: true,
    showCustomModelInput: false,
    lockedProvider: null as string | null,
    initialized: false,
  };
}

const s = createProviderState();

// 退出 Settings 时必须把 Provider 页恢复到干净初始态。
function resetProviderState() {
  Object.assign(s, createProviderState());
}

/* ── helpers ── */

function resolveUiProvider(providerKey: string): string {
  if (providerKey === "kimi-coding" || providerKey === "moonshot") return "moonshot";
  if (providerKey === "anthropic") return "anthropic";
  if (providerKey === "openai") return "openai";
  if (providerKey === "google") return "google";
  if (PROVIDERS[providerKey]) return providerKey;
  return "custom";
}

function resolveSubPlatform(providerKey: string): string | null {
  if (providerKey === "kimi-coding") return "kimi-code";
  if (providerKey === "moonshot") return "moonshot-cn";
  return null;
}

function resolveCustomPresetKey(providerKey: string): string | null {
  for (const key in CUSTOM_PRESETS) {
    if (CUSTOM_PRESETS[key].providerKey === providerKey) return key;
  }
  return null;
}

function getPresetModels(provider: string, subPlatform: string | null): string[] {
  if (provider === "moonshot" && subPlatform === "kimi-code") return KIMI_CODE_MODELS;
  return PROVIDERS[provider]?.models ?? [];
}

function getProviderDisplayName(provider: string, subPlatform?: string | null): string {
  if (provider === "moonshot") {
    const names: Record<string, string> = {
      "moonshot-cn": t("setup.provider.subPlatform.moonshotCn"),
      "kimi-code": t("setup.provider.subPlatform.kimiCode"),
    };
    return names[subPlatform ?? ""] ?? "Kimi";
  }
  const map: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI", google: "Google" };
  return map[provider] ?? provider;
}

function getEditorModels(): string[] {
  const presets = getModels();
  if (s.editMode !== "edit") return presets;

  // In edit mode, merge configured model IDs for the same provider into the preset list
  const providerKey = s.editorProviderKey;
  if (!providerKey) return presets;
  const configuredIds = s.configuredModels
    .filter(m => m.key.startsWith(providerKey + "/"))
    .map(m => m.key.slice(providerKey.length + 1));
  const merged = [...presets];
  for (const id of configuredIds) {
    if (!merged.includes(id)) merged.push(id);
  }
  return merged;
}

function getPlaceholder(): string {
  if (s.currentProvider === "custom" && s.customPreset) {
    return CUSTOM_PRESETS[s.customPreset]?.placeholder ?? "";
  }
  return PROVIDERS[s.currentProvider]?.placeholder ?? "";
}

function getPlatformUrl(): string {
  if (s.currentProvider === "moonshot") {
    return SUB_PLATFORM_URLS[s.subPlatform] ?? "";
  }
  return PROVIDERS[s.currentProvider]?.platformUrl ?? "";
}

function getModels(): string[] {
  if (s.currentProvider === "moonshot" && s.subPlatform === "kimi-code") return KIMI_CODE_MODELS;
  if (s.currentProvider === "custom" && s.customPreset) return CUSTOM_PRESETS[s.customPreset]?.models ?? [];
  return PROVIDERS[s.currentProvider]?.models ?? [];
}

function isKimiCodeOAuth(): boolean {
  return s.currentProvider === "moonshot" && s.subPlatform === "kimi-code";
}

function lookupSavedProvider(provider: string, subPlatform?: string | null, overrideKey?: string | null): any {
  if (overrideKey && s.savedProviders[overrideKey]) return s.savedProviders[overrideKey];
  if (provider === "moonshot") {
    const sub = subPlatform ?? s.subPlatform;
    const provKey = sub === "kimi-code" ? "kimi-coding" : "moonshot";
    return s.savedProviders[provKey] ?? null;
  }
  if (provider === "custom") {
    const preset = s.customPreset ? CUSTOM_PRESETS[s.customPreset] : null;
    if (preset) return s.savedProviders[preset.providerKey] ?? null;
    return s.savedProviders["custom"] ?? null;
  }
  return s.savedProviders[provider] ?? null;
}

/** Restore form fields from savedProviders for the current provider/subPlatform. */
function fillSavedProviderFields(saved: any) {
  if (!saved) return;
  if (saved.apiKey && saved.apiKey !== "proxy-managed") s.apiKey = saved.apiKey;
  if (saved.baseURL) s.baseUrl = saved.baseURL;
  if (saved.api) s.apiType = saved.api;
  if (saved.supportImage !== undefined) s.imageSupport = !!saved.supportImage;
  if (saved.customPreset) s.customPreset = saved.customPreset;
}

function formatResetDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const isZh = getLocale() === "zh";
  if (h > 0) return h + (isZh ? "小时后重置" : "h reset");
  if (m > 0) return m + (isZh ? "分钟后重置" : "m reset");
  return isZh ? "即将重置" : "resetting soon";
}

function parseResetAt(val: string): number {
  if (!val) return 0;
  try {
    let str = String(val);
    if (str.includes(".") && str.endsWith("Z")) {
      const parts = str.slice(0, -1).split(".");
      str = parts[0] + "." + parts[1].slice(0, 3) + "Z";
    }
    const dt = new Date(str);
    const diff = (dt.getTime() - Date.now()) / 1000;
    return diff > 0 ? Math.round(diff) : 0;
  } catch { return 0; }
}

function extractResetSeconds(data: any): number {
  const keys = ["reset_at", "resetAt", "reset_time", "resetTime"];
  for (const k of keys) { if (data[k]) return parseResetAt(data[k]); }
  const durKeys = ["reset_in", "resetIn", "ttl", "window"];
  for (const k of durKeys) { const v = parseInt(data[k], 10); if (v > 0) return v; }
  return 0;
}

/* ── build params / payload ── */

function buildParams(apiKey: string): Record<string, unknown> | null {
  const params: Record<string, unknown> = { provider: s.currentProvider, apiKey };

  if (s.currentProvider === "custom") {
    if (s.customPreset) {
      const mid = s.showCustomModelInput ? s.customModelId.trim() : s.modelId;
      if (!mid) { s.error = t("setup.error.noModelId"); return null; }
      params.modelID = mid;
      params.customPreset = s.customPreset;
    } else {
      if (!s.baseUrl.trim()) { s.error = t("setup.error.noBaseUrl"); return null; }
      const mid = s.customModelId.trim() || s.modelId;
      if (!mid) { s.error = t("setup.error.noModelId"); return null; }
      params.baseURL = s.baseUrl.trim();
      params.modelID = mid;
      params.apiType = s.apiType;
      params.supportImage = s.imageSupport;
    }
  } else {
    const mid = s.showCustomModelInput ? s.customModelId.trim() : s.modelId;
    if (!mid) { s.error = t("setup.error.noModelId"); return null; }
    params.modelID = mid;
  }

  if (s.currentProvider === "moonshot") params.subPlatform = s.subPlatform;
  return params;
}

function buildSavePayload(params: Record<string, unknown>) {
  const payload: Record<string, unknown> = {
    provider: params.provider,
    apiKey: params.apiKey,
    modelID: params.modelID,
    baseURL: params.baseURL ?? "",
    api: params.apiType ?? "",
    subPlatform: params.subPlatform ?? "",
    customPreset: params.customPreset ?? "",
  };
  if (params.supportImage !== undefined) payload.supportImage = params.supportImage;
  return payload;
}

/* ── actions ── */

async function init(state: AppViewState) {
  if (s.initialized) return;
  s.initialized = true;
  try {
    const [config, models] = await Promise.all([
      ipc.settingsGetConfig(),
      ipc.settingsGetConfiguredModels(),
    ]);
    if (config) {
      if (config.savedProviders) s.savedProviders = config.savedProviders;
      if (config.provider) {
        const uiProv = resolveUiProvider(config.provider);
        s.currentProvider = uiProv;
        if (uiProv === "moonshot" && config.subPlatform) s.subPlatform = config.subPlatform;
        if (uiProv === "custom" && config.customPreset) s.customPreset = config.customPreset;
      }
      if (config.apiKey && config.apiKey !== "proxy-managed") s.apiKey = config.apiKey;
      if (config.modelID) s.modelId = config.modelID;
      if (config.baseURL) s.baseUrl = config.baseURL;
      if (config.api) s.apiType = config.api;
      if (config.supportImage !== undefined) s.imageSupport = !!config.supportImage;
    }
    if (models) s.configuredModels = models;
    if (isKimiCodeOAuth()) await checkOAuthStatus(state);
    state.requestUpdate();
  } catch {}
}

async function refreshModelList(state: AppViewState) {
  try {
    s.configuredModels = await ipc.settingsGetConfiguredModels();
    state.requestUpdate();
  } catch {}
}

function selectModelInList(modelKey: string, state: AppViewState) {
  s.editMode = "edit";
  s.selectedModelKey = modelKey;
  s.error = null;
  s.successMsg = null;

  const slashIdx = modelKey.indexOf("/");
  if (slashIdx <= 0) return;
  const providerKey = modelKey.slice(0, slashIdx);
  const modelId = modelKey.slice(slashIdx + 1);
  s.editorProviderKey = providerKey;

  const uiProvider = resolveUiProvider(providerKey);
  const subPlatform = resolveSubPlatform(providerKey);

  s.currentProvider = uiProvider;
  if (uiProvider === "moonshot" && subPlatform) s.subPlatform = subPlatform;
  if (uiProvider === "custom") {
    const presetKey = resolveCustomPresetKey(providerKey);
    s.customPreset = presetKey ?? "";
  }
  s.lockedProvider = uiProvider;

  // Fill from savedProviders — restore all fields
  const saved = lookupSavedProvider(uiProvider, subPlatform, providerKey);
  s.apiKey = "";
  s.baseUrl = "";
  s.apiType = "openai-completions";
  s.imageSupport = true;
  fillSavedProviderFields(saved);

  // If modelId is not in preset list, show custom model input
  const presets = getModels();
  if (presets.includes(modelId)) {
    s.modelId = modelId;
    s.showCustomModelInput = false;
    s.customModelId = "";
  } else {
    s.modelId = CUSTOM_MODEL_SENTINEL;
    s.showCustomModelInput = true;
    s.customModelId = modelId;
  }

  // Resolve alias
  const entry = s.configuredModels.find(m => m.key === modelKey);
  s.modelAlias = (entry && entry.name !== modelId) ? entry.name : "";

  // Kimi Code OAuth: restore login state
  if (isKimiCodeOAuth()) checkOAuthStatus(state);

  state.requestUpdate();
}

function enterAddMode(state: AppViewState) {
  s.editMode = "add";
  s.selectedModelKey = null;
  s.editorProviderKey = null;
  s.lockedProvider = null;
  s.error = null;
  s.successMsg = null;
  s.apiKey = "";
  s.modelAlias = "";
  s.oauthSuccess = false;
  s.oauthNoMembership = false;
  s.pendingOAuthToken = null;

  // Fill from saved provider
  const saved = lookupSavedProvider(s.currentProvider);
  if (saved?.apiKey && saved.apiKey !== "proxy-managed") s.apiKey = saved.apiKey;

  const models = getModels();
  if (models.length && !s.modelId) s.modelId = models[0];

  state.requestUpdate();
}

async function handleDeleteModel(state: AppViewState) {
  if (!s.selectedModelKey) return;
  const entry = s.configuredModels.find(m => m.key === s.selectedModelKey);
  if (entry?.isDefault) { s.error = t("settings.provider.deleteConfirm"); state.requestUpdate(); return; }
  if (!confirm(t("settings.provider.deleteConfirm"))) return;
  try {
    await ipc.settingsDeleteModel({ modelKey: s.selectedModelKey });
    s.successMsg = t("settings.saved");
    enterAddMode(state);
    await refreshModelList(state);
  } catch (e: any) {
    s.error = e?.message ?? "Delete failed";
    state.requestUpdate();
  }
}

async function handleSetDefault(modelKey: string, state: AppViewState) {
  try {
    await ipc.settingsSetDefaultModel({ modelKey });
    await refreshModelList(state);
  } catch (e: any) {
    s.error = e?.message ?? "Set default failed";
    state.requestUpdate();
  }
}

async function handleSave(state: AppViewState) {
  if (s.saving) return;
  const isOAuth = isKimiCodeOAuth();
  let apiKey = s.apiKey.trim();
  if (isOAuth && s.pendingOAuthToken) apiKey = s.pendingOAuthToken;
  if (!apiKey && !isOAuth) { s.error = t("setup.error.noKey"); state.requestUpdate(); return; }

  const params = buildParams(apiKey);
  if (!params) { state.requestUpdate(); return; }

  s.saving = true;
  s.error = null;
  state.requestUpdate();

  try {
    const verifyParams = isOAuth ? { ...params, verifyViaProxy: true } : params;
    const verifyResult = await ipc.settingsVerifyKey(verifyParams);
    if (!verifyResult.success) {
      const errMsg = verifyResult.message ?? verifyResult.error ?? "";
      if (isOAuth && s.pendingOAuthToken && errMsg.includes("401")) {
        s.pendingOAuthToken = null;
        try { await ipc.kimiOAuthLogout(); } catch {}
        s.oauthNoMembership = true;
        s.saving = false;
        state.requestUpdate();
        return;
      }
      s.error = errMsg || t("setup.error.verifyFailed");
      s.saving = false;
      state.requestUpdate();
      return;
    }

    const payload: Record<string, unknown> = buildSavePayload(params);
    if (s.modelAlias.trim()) payload.modelAlias = s.modelAlias.trim();
    payload.action = s.editMode === "edit" ? "update" : "add";
    if (s.editMode === "edit") payload.modelKey = s.selectedModelKey;
    // edit 模式不默认改变默认模型，只有用户显式操作才发送 setAsDefault
    if (isOAuth && !s.pendingOAuthToken) payload.keepProxyAuth = true;

    await ipc.settingsSaveProvider(payload);
    s.saving = false;
    s.pendingOAuthToken = null;
    s.successMsg = t("settings.saved");

    // Refresh savedProviders cache
    try {
      const refreshResult = await ipc.settingsGetConfig();
      if (refreshResult?.savedProviders) s.savedProviders = refreshResult.savedProviders;
    } catch {}

    await refreshModelList(state);
  } catch (e: any) {
    s.error = t("setup.error.connection") + (e?.message ?? "");
    s.saving = false;
    state.requestUpdate();
  }
}

async function handleOAuthLogin(state: AppViewState) {
  if (s.oauthLoading) return;
  s.oauthLoading = true;
  s.oauthSuccess = false;
  s.oauthNoMembership = false;
  s.error = null;
  state.requestUpdate();

  try {
    const result = await ipc.kimiOAuthLogin();
    if (!result.success) {
      s.error = result.message ?? t("setup.error.verifyFailed");
      s.oauthLoading = false;
      state.requestUpdate();
      return;
    }
    s.pendingOAuthToken = result.accessToken ?? null;
    s.oauthLoading = false;
    s.oauthSuccess = true;
    s.oauthLoggedIn = true;
    state.requestUpdate();

    // Load usage after login
    if (s.editMode !== "add") await loadUsage(state);
  } catch (e: any) {
    s.error = t("setup.error.connection") + (e?.message ?? "");
    s.oauthLoading = false;
    state.requestUpdate();
  }
}

async function handleOAuthLogout(state: AppViewState) {
  try { await ipc.kimiOAuthLogout(); } catch {}
  s.pendingOAuthToken = null;
  s.oauthLoggedIn = false;
  s.oauthSuccess = false;
  s.usageData = null;
  state.requestUpdate();
}

async function handleOAuthCancel(state: AppViewState) {
  try { await ipc.kimiOAuthCancel(); } catch {}
  s.oauthLoading = false;
  state.requestUpdate();
}

async function checkOAuthStatus(state: AppViewState) {
  try {
    const result = await ipc.kimiOAuthStatus();
    s.oauthLoggedIn = result.loggedIn ?? false;
    if (s.oauthLoggedIn && s.editMode !== "add") await loadUsage(state);
    state.requestUpdate();
  } catch {}
}

async function loadUsage(state: AppViewState) {
  if (!isKimiCodeOAuth()) return;
  try {
    const result = await ipc.kimiGetUsage();
    if (result?.data) s.usageData = result.data;
    state.requestUpdate();
  } catch {}
}

function onProviderChange(provider: string, state: AppViewState) {
  if (s.lockedProvider) return;
  s.currentProvider = provider;
  s.customPreset = "";
  s.apiKey = "";
  s.modelId = "";
  s.customModelId = "";
  s.showCustomModelInput = false;
  s.error = null;
  s.oauthSuccess = false;
  s.oauthNoMembership = false;
  if (provider === "moonshot") s.subPlatform = "kimi-code";
  const models = getModels();
  if (models.length) s.modelId = models[0];
  // Fill from saved
  const saved = lookupSavedProvider(provider);
  fillSavedProviderFields(saved);
  if (isKimiCodeOAuth()) checkOAuthStatus(state);
  state.requestUpdate();
}

function onSubPlatformChange(sp: string, state: AppViewState) {
  s.subPlatform = sp;
  s.apiKey = "";
  s.baseUrl = "";
  s.apiType = "openai-completions";
  s.imageSupport = true;
  s.error = null;
  s.oauthSuccess = false;
  s.oauthNoMembership = false;
  s.usageData = null;
  const models = getModels();
  s.modelId = models[0] ?? "";
  s.showCustomModelInput = false;
  const saved = lookupSavedProvider(s.currentProvider, sp);
  fillSavedProviderFields(saved);
  if (isKimiCodeOAuth()) checkOAuthStatus(state);
  state.requestUpdate();
}

function onPresetChange(value: string, state: AppViewState) {
  s.customPreset = value;
  s.apiKey = "";
  s.error = null;
  const models = value ? (CUSTOM_PRESETS[value]?.models ?? []) : [];
  s.modelId = models[0] ?? "";
  s.showCustomModelInput = false;
  s.baseUrl = "";
  const saved = lookupSavedProvider(s.currentProvider, null);
  if (saved?.apiKey && saved.apiKey !== "proxy-managed") s.apiKey = saved.apiKey;
  state.requestUpdate();
}

function onModelSelectChange(value: string, state: AppViewState) {
  if (value === CUSTOM_MODEL_SENTINEL) {
    s.showCustomModelInput = true;
    s.modelId = value;
  } else {
    s.showCustomModelInput = false;
    s.modelId = value;
    s.customModelId = "";
  }
  state.requestUpdate();
}

/* ── CSS ── */

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(/* css */`
    .oc-provider-layout {
      display: flex;
      gap: 24px;
      min-height: 400px;
      flex: 1;
      min-width: 0;
    }
    .oc-provider-list {
      width: 200px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      border-right: 1px solid var(--border, #e4e4e7);
      padding-right: 20px;
    }
    .oc-provider-list-header {
      font-weight: 600;
      font-size: 13px;
      color: var(--text-secondary, #71717a);
      margin-bottom: 12px;
    }
    .oc-provider-list-scroll {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .oc-provider-list-item {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      cursor: pointer;
      border-radius: var(--radius-sm, 8px);
      transition: background var(--transition, 0.18s ease);
    }
    .oc-provider-list-item:hover { background: var(--bg-hover, #ebebeb); }
    .oc-provider-list-item--active { background: var(--bg-hover, #ebebeb); }
    .oc-provider-list-item__info { flex: 1; min-width: 0; }
    .oc-provider-list-item__name {
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--text, #3f3f46);
    }
    .oc-provider-list-item__meta {
      font-size: 11px;
      color: var(--text-secondary, #71717a);
      margin-top: 2px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .oc-provider-list-item__actions {
      display: flex;
      gap: 2px;
      flex-shrink: 0;
    }
    .oc-provider-list-item__action-btn:not(.is-default) {
      opacity: 0;
      transition: opacity var(--transition, 0.18s ease);
    }
    .oc-provider-list-item:hover .oc-provider-list-item__action-btn:not(.is-default):not(:disabled) { opacity: 1; }
    .oc-provider-list-item__action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      padding: 0;
      border: none;
      border-radius: var(--radius-sm, 8px);
      background: transparent;
      color: var(--text-secondary, #71717a);
      cursor: pointer;
      transition: background var(--transition, 0.18s ease), color var(--transition, 0.18s ease);
    }
    .oc-provider-list-item__action-btn:hover:not(:disabled) { background: var(--bg-hover, #ebebeb); color: var(--text-strong, #18181b); }
    .oc-provider-list-item__action-btn.is-default { color: var(--accent, #c0392b); opacity: 1 !important; }
    .oc-provider-list-item__action-btn:disabled { opacity: 0; cursor: default; pointer-events: none; }
    .oc-provider-add-btn {
      margin-top: 12px;
      width: 100%;
      text-align: center;
      font-size: 13px;
      border: none;
      background: none;
      cursor: pointer;
      color: var(--text-secondary, #71717a);
      padding: 8px 12px;
      border-radius: var(--radius-sm, 8px);
      transition: background var(--transition, 0.18s ease), color var(--transition, 0.18s ease);
    }
    .oc-provider-add-btn:hover { background: var(--bg-hover, #ebebeb); color: var(--text, #3f3f46); }
    .oc-provider-form {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow-y: auto;
    }
    .oc-provider-usage {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 8px;
    }
    .oc-provider-usage-card {
      padding: 12px 14px;
      border: 1px solid var(--border, #e0e0e0);
      border-radius: var(--radius-sm, 8px);
      background: var(--bg-secondary, #fbfbfb);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .oc-provider-usage-title { font-size: 12px; font-weight: 500; color: var(--text-muted, #a1a1aa); }
    .oc-provider-usage-value { font-size: 22px; font-weight: 700; color: var(--text-strong, #18181b); letter-spacing: -0.02em; }
    .oc-provider-usage-bar {
      height: 4px;
      background: var(--border, #e0e0e0);
      border-radius: 2px;
      overflow: hidden;
    }
    .oc-provider-usage-bar-fill {
      height: 100%;
      background: var(--text-strong, #18181b);
      border-radius: 2px;
      transition: width 0.3s ease;
    }
    .oc-provider-usage-reset { font-size: 11px; color: var(--text-muted, #a1a1aa); white-space: nowrap; }

    /* Collapse indicator */
    .oc-provider-collapse { margin-bottom: 8px; }
    .oc-provider-collapse__summary {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--text-secondary);
      cursor: pointer;
      list-style: none;
      user-select: none;
    }
    .oc-provider-collapse__summary::-webkit-details-marker { display: none; }
    .oc-provider-collapse__summary::marker { display: none; content: ""; }
    .oc-provider-collapse__icon {
      transition: transform var(--duration-normal, 0.2s) var(--ease-out);
      flex-shrink: 0;
    }
    .oc-provider-collapse[open] .oc-provider-collapse__icon {
      transform: rotate(90deg);
    }

    /* Current provider status bar */
    .oc-provider-status {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      font-size: 12.5px;
      font-weight: 500;
      color: var(--text-secondary, #71717a);
      background: var(--bg-secondary, #fbfbfb);
      border-radius: var(--radius-sm, 8px);
    }

    /* Section spacing — parent gap handles spacing, no extra margin needed */
    .oc-provider-form .oc-settings__form-group { margin-bottom: 0; }
  `);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

/* ── render ── */

export function resetProviderTab() { resetProviderState(); }

export function renderTabProvider(state: AppViewState) {
  injectStyles();
  if (!s.initialized) init(state);

  const models = s.editMode === "edit" ? getEditorModels() : getModels();
  const isOAuth = isKimiCodeOAuth();
  const isCustom = s.currentProvider === "custom";
  const isManualCustom = isCustom && !s.customPreset;
  const platformUrl = getPlatformUrl();

  if (!s.modelId && models.length) s.modelId = models[0];

  return html`
    <div class="oc-settings__section">
      <h2 class="oc-settings__section-title">${t("settings.provider.title")}</h2>
      <p class="oc-settings__hint">${t("settings.provider.desc")}</p>

      ${(() => {
        const defaultModel = s.configuredModels.find(m => m.isDefault);
        if (!defaultModel) return nothing;
        const displayName = getProviderDisplayName(resolveUiProvider(defaultModel.provider), resolveSubPlatform(defaultModel.provider));
        const modelName = defaultModel.name || defaultModel.key.split("/").pop() || "";
        return html`<div class="oc-provider-status">${t("settings.provider.currentUsing")}${displayName} · ${modelName}</div>`;
      })()}

      <div class="oc-provider-layout">
        <!-- Left: Model list -->
        <div class="oc-provider-list">
          <div class="oc-provider-list-header">${t("settings.provider.modelList")}</div>
          <div class="oc-provider-list-scroll">
            ${s.configuredModels.map(item => html`
              <div class="oc-provider-list-item ${s.selectedModelKey === item.key ? 'oc-provider-list-item--active' : ''}"
                @click=${() => selectModelInList(item.key, state)}>
                <div class="oc-provider-list-item__info">
                  <div class="oc-provider-list-item__name">${item.name || item.key}</div>
                  <div class="oc-provider-list-item__meta">${item.provider}</div>
                </div>
                <div class="oc-provider-list-item__actions">
                  <button class="oc-provider-list-item__action-btn ${item.isDefault ? 'is-default' : ''}" ?disabled=${item.isDefault}
                    @click=${(e: Event) => { e.stopPropagation(); handleSetDefault(item.key, state); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="${item.isDefault ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  </button>
                </div>
              </div>
            `)}
          </div>
          <button class="oc-provider-add-btn" @click=${() => enterAddMode(state)}>
            + ${t("settings.provider.addModel")}
          </button>
        </div>

        <!-- Right: Provider form -->
        <div class="oc-provider-form">
          <oc-provider-segment
            .providers=${PROVIDER_DISPLAY_ORDER.map(p => p)}
            .selected=${s.currentProvider}
            .labels=${getProviderLabels()}
            .locked=${s.lockedProvider ? PROVIDER_DISPLAY_ORDER.filter(p => p !== s.lockedProvider) : []}
            @select=${(e: CustomEvent) => onProviderChange(e.detail.provider, state)}
          ></oc-provider-segment>

          ${s.currentProvider === "moonshot" ? html`
            <div class="oc-settings__form-group" style="margin-top:16px">
              <label class="oc-settings__label">${t("setup.provider.platform")}</label>
              <div class="oc-settings__radio-group">
                <label class="oc-settings__radio">
                  <input type="radio" name="settingsSubPlatform" value="kimi-code" .checked=${s.subPlatform === "kimi-code"}
                    @change=${() => onSubPlatformChange("kimi-code", state)} /> ${t("setup.provider.subPlatform.kimiCode")}<span class="oc-settings__badge">${t("setup.provider.subPlatform.searchBadge")}</span>
                </label>
                <label class="oc-settings__radio">
                  <input type="radio" name="settingsSubPlatform" value="moonshot-cn" .checked=${s.subPlatform === "moonshot-cn"}
                    @change=${() => onSubPlatformChange("moonshot-cn", state)} /> ${t("setup.provider.subPlatform.moonshotCn")}
                </label>
              </div>
            </div>
          ` : nothing}

          ${isOAuth ? renderOAuthSection(state) : nothing}
          ${isOAuth && s.oauthLoggedIn && s.editMode !== "add" ? renderUsagePanel(state) : nothing}

          ${isCustom ? html`
            <div class="oc-settings__form-group" style="margin-top:12px">
              <label class="oc-settings__label">${t("setup.provider.preset")}</label>
              <select class="oc-settings__select" .value=${s.customPreset}
                @change=${(e: Event) => onPresetChange((e.target as HTMLSelectElement).value, state)}>
                <option value="__placeholder__" disabled ?selected=${!s.customPreset}>${t("setup.provider.presetPlaceholder")}</option>
                ${Object.entries(CUSTOM_PRESETS).map(([k, v]) => html`
                  <option value=${k} ?selected=${s.customPreset === k}>${v.providerKey}</option>
                `)}
                <option value="">${t("setup.provider.presetManual")}</option>
              </select>
            </div>
          ` : nothing}

          ${isManualCustom ? html`
            <div class="oc-settings__form-group">
              <label class="oc-settings__label">${t("setup.provider.baseUrl")}</label>
              <input class="oc-settings__input" .value=${s.baseUrl}
                @input=${(e: Event) => { s.baseUrl = (e.target as HTMLInputElement).value; }} />
            </div>
            <div class="oc-settings__form-group">
              <label class="oc-settings__label">${t("setup.provider.apiType")}</label>
              <div class="oc-settings__radio-group">
                ${["openai-completions", "anthropic-messages", "openai-responses"].map(v => html`
                  <label class="oc-settings__radio">
                    <input type="radio" name="settingsApiType" value=${v} .checked=${s.apiType === v}
                      @change=${() => { s.apiType = v; state.requestUpdate(); }} /> ${v}
                  </label>
                `)}
              </div>
            </div>
          ` : nothing}

          ${isOAuth ? html`
            <details class="oc-settings__details-advanced" style="margin-top:16px">
              <summary>${t("setup.provider.oauth.advanced")}</summary>
              <div class="oc-settings__form-group">
                ${renderApiKeyInput(state)}
              </div>
            </details>
          ` : renderApiKeyInput(state)}

          <div class="oc-settings__form-group" style="margin-top:12px">
            <label class="oc-settings__label">${t("settings.provider.modelAlias")}</label>
            <input class="oc-settings__input" .value=${s.modelAlias} placeholder=${t("settings.provider.modelAliasPlaceholder")}
              @input=${(e: Event) => { s.modelAlias = (e.target as HTMLInputElement).value; }} />
          </div>

          ${models.length > 0 ? html`
            <div class="oc-settings__form-group">
              <label class="oc-settings__label">${t("setup.provider.model")}</label>
              <select class="oc-settings__select" .value=${s.modelId}
                @change=${(e: Event) => onModelSelectChange((e.target as HTMLSelectElement).value, state)}>
                ${models.map(m => html`<option value=${m} ?selected=${s.modelId === m}>${m}</option>`)}
                <option value=${CUSTOM_MODEL_SENTINEL}>${t("setup.provider.customModelOption")}</option>
              </select>
            </div>
          ` : nothing}

          ${s.showCustomModelInput || isManualCustom ? html`
            <div class="oc-settings__form-group">
              <label class="oc-settings__label">${t("setup.provider.customModelId")}</label>
              <input class="oc-settings__input" .value=${s.customModelId}
                @input=${(e: Event) => { s.customModelId = (e.target as HTMLInputElement).value; }} />
            </div>
          ` : nothing}

          ${isManualCustom ? html`
            <div class="oc-settings__form-group">
              <label class="oc-settings__checkbox">
                <input type="checkbox" .checked=${s.imageSupport}
                  @change=${(e: Event) => { s.imageSupport = (e.target as HTMLInputElement).checked; state.requestUpdate(); }} />
                ${t("setup.provider.imageSupport")}
              </label>
            </div>
          ` : nothing}

          ${s.oauthNoMembership ? html`
            <div style="padding:10px 14px;background:rgba(231,76,60,0.08);border-radius:8px;font-size:13px;margin-bottom:12px">
              <span>${t("setup.provider.oauth.noMembership")}</span>
              <a style="color:var(--accent);cursor:pointer;margin-left:6px" @click=${(e: Event) => { e.preventDefault(); ipc.openExternal("https://kimi.com/pricing?utm_source=oneclaw"); }}>
                ${t("setup.provider.oauth.subscribeLink")}
              </a>
            </div>
          ` : nothing}

          <oc-message-box .message=${s.error ?? ""} .type=${"error"} .visible=${!!s.error}></oc-message-box>
          <oc-message-box .message=${s.successMsg ?? ""} .type=${"success"} .visible=${!!s.successMsg}></oc-message-box>

          <div class="oc-settings__btn-row">
            <button class="oc-settings__btn oc-settings__btn--primary" ?disabled=${s.saving}
              @click=${() => handleSave(state)}>
              ${s.saving ? "..." : t("settings.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderApiKeyInput(state: AppViewState) {
  return html`
    <div class="oc-settings__form-group" style="margin-top:12px">
      <label class="oc-settings__label">${t("setup.provider.apiKey")}</label>
      <oc-password-input .value=${s.apiKey} .placeholder=${getPlaceholder()}
        @input=${(e: CustomEvent) => { s.apiKey = e.detail.value; state.requestUpdate(); }}
      ></oc-password-input>
      ${getPlatformUrl() ? html`
        <a style="font-size:13px;color:var(--accent);cursor:pointer;margin-top:4px;display:inline-block"
          @click=${(e: Event) => { e.preventDefault(); ipc.openExternal(getPlatformUrl()); }}>
          ${t("setup.provider.getKey")}
        </a>
      ` : nothing}
    </div>
  `;
}

function renderOAuthSection(state: AppViewState) {
  return html`
    <div style="margin-top:12px;margin-bottom:12px">
      ${s.oauthLoading ? html`
        <div style="display:flex;align-items:center;gap:8px;font-size:14px">
          <span style="display:inline-block;width:16px;height:16px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:oc-setup-spin 0.6s linear infinite"></span>
          <span>${t("setup.provider.oauth.waiting")}</span>
          <button class="oc-settings__btn oc-settings__btn--secondary" style="padding:4px 12px" @click=${() => handleOAuthCancel(state)}>
            ${t("setup.provider.oauth.cancel")}
          </button>
        </div>
      ` : s.oauthSuccess ? html`
        <div style="display:flex;align-items:center;gap:8px;font-size:14px;color:var(--ok, #22c55e)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          ${t("setup.provider.oauth.success")}
        </div>
      ` : s.oauthLoggedIn ? html`
        <button class="oc-settings__btn-oauth-logout" @click=${() => handleOAuthLogout(state)}>
          ${getLocale() === "zh" ? "退出登录" : "Log out"}
        </button>
        <div style="font-size:13px;color:var(--ok, #22c55e);margin-top:6px;text-align:center">${t("setup.provider.oauth.success")}</div>
      ` : html`
        <button class="oc-settings__btn oc-settings__btn--primary" @click=${() => handleOAuthLogin(state)}>
          ${t("setup.provider.oauth.login")}
        </button>
      `}
    </div>
  `;
}

function renderUsagePanel(state: AppViewState) {
  if (!s.usageData) return nothing;
  const data = s.usageData;

  const usage = data.usage ?? {};
  const usedW = parseInt(usage.used ?? "0", 10) || (usage.remaining !== undefined ? ((parseInt(usage.limit ?? "0", 10) || 0) - (parseInt(usage.remaining ?? "0", 10) || 0)) : 0);
  const limitW = parseInt(usage.limit ?? "0", 10) || 0;
  const resetW = extractResetSeconds(usage);
  const pctW = limitW > 0 ? Math.min(100, (usedW / limitW) * 100) : 0;

  const limits = Array.isArray(data.limits) ? data.limits : [];
  let usedL = 0, limitL = 0, resetL = 0;
  if (limits.length > 0) {
    const item = limits[0];
    const detail = (item.detail && typeof item.detail === "object") ? item.detail : item;
    usedL = parseInt(detail.used ?? "0", 10) || (detail.remaining !== undefined ? ((parseInt(detail.limit ?? "0", 10) || 0) - (parseInt(detail.remaining ?? "0", 10) || 0)) : 0);
    limitL = parseInt(detail.limit ?? "0", 10) || 0;
    resetL = extractResetSeconds(detail);
  }
  const pctL = limitL > 0 ? Math.min(100, (usedL / limitL) * 100) : 0;

  return html`
    <div class="oc-provider-usage">
      <div class="oc-provider-usage-card">
        <div class="oc-provider-usage-title">${t("settings.provider.usage.weekUsage")}</div>
        <div class="oc-provider-usage-value">${usedW} / ${limitW}</div>
        <div class="oc-provider-usage-bar"><div class="oc-provider-usage-bar-fill" style="width:${pctW}%"></div></div>
        ${resetW > 0 ? html`<div class="oc-provider-usage-reset">${t("settings.provider.usage.resetIn")} ${formatResetDuration(resetW)}</div>` : nothing}
      </div>
      <div class="oc-provider-usage-card">
        <div class="oc-provider-usage-title">${t("settings.provider.usage.rateLimit")}</div>
        <div class="oc-provider-usage-value">${usedL} / ${limitL}</div>
        <div class="oc-provider-usage-bar"><div class="oc-provider-usage-bar-fill" style="width:${pctL}%"></div></div>
        ${resetL > 0 ? html`<div class="oc-provider-usage-reset">${t("settings.provider.usage.resetIn")} ${formatResetDuration(resetL)}</div>` : nothing}
      </div>
    </div>
    <div style="text-align:right;margin-bottom:12px">
      <button class="oc-settings__btn oc-settings__btn--secondary" style="padding:4px 12px;font-size:12px"
        @click=${() => loadUsage(state)}>${t("settings.provider.usage.refresh")}</button>
    </div>
  `;
}
