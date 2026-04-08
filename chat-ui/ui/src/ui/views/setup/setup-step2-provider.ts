/**
 * Setup Step 2: Provider configuration — API key, model, OAuth.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import "../../components/password-input.ts";
import "../../components/message-box.ts";
import "../../components/provider-segment.ts";
import {
  PROVIDERS, CUSTOM_PRESETS, KIMI_CODE_MODELS, SUB_PLATFORM_URLS,
  CUSTOM_MODEL_SENTINEL, PROVIDER_DISPLAY_ORDER, getProviderLabels,
} from "./setup-constants.ts";

const s = {
  currentProvider: "moonshot",
  subPlatform: "kimi-code" as string,
  customPreset: "" as string,
  apiKey: "",
  modelId: "",
  customModelId: "",
  baseUrl: "",
  apiType: "openai-completions",
  imageSupport: true,
  showCustomModelInput: false,
  verifying: false,
  oauthLoading: false,
  oauthSuccess: false,
  oauthNoMembership: false,
  error: null as string | null,
};

function getSubPlatform(): string {
  return s.subPlatform;
}

function getModels(): string[] {
  if (s.currentProvider === "moonshot" && s.subPlatform === "kimi-code") {
    return KIMI_CODE_MODELS;
  }
  if (s.currentProvider === "custom" && s.customPreset) {
    return CUSTOM_PRESETS[s.customPreset]?.models ?? [];
  }
  return PROVIDERS[s.currentProvider]?.models ?? [];
}

function getPlatformUrl(): string {
  if (s.currentProvider === "moonshot") {
    return SUB_PLATFORM_URLS[s.subPlatform] ?? "";
  }
  return PROVIDERS[s.currentProvider]?.platformUrl ?? "";
}

function getPlatformLinkText(): string {
  if (s.currentProvider === "moonshot") {
    const key = `setup.provider.getKey.${s.subPlatform}`;
    const val = t(key);
    return val !== key ? val : t("setup.provider.getKey");
  }
  return t("setup.provider.getKey");
}

function getPlaceholder(): string {
  if (s.currentProvider === "custom" && s.customPreset) {
    return CUSTOM_PRESETS[s.customPreset]?.placeholder ?? "";
  }
  return PROVIDERS[s.currentProvider]?.placeholder ?? "";
}

function buildParams(apiKey: string): Record<string, unknown> | null {
  const params: Record<string, unknown> = { provider: s.currentProvider, apiKey };

  if (s.currentProvider === "custom") {
    if (s.customPreset === "__placeholder__" || (!s.customPreset && s.customPreset !== "")) {
      // placeholder selected, ignore
    }
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

  if (s.currentProvider === "moonshot") {
    params.subPlatform = getSubPlatform();
  }
  return params;
}

function buildSavePayload(params: Record<string, unknown>) {
  return {
    provider: params.provider,
    apiKey: params.apiKey,
    modelID: params.modelID,
    baseURL: params.baseURL ?? "",
    api: params.apiType ?? "",
    subPlatform: params.subPlatform ?? "",
    supportImage: params.supportImage ?? true,
    customPreset: params.customPreset ?? "",
  };
}

async function handleVerify(state: AppViewState, goToStep: (step: number) => void) {
  if (s.verifying) return;
  const apiKey = s.apiKey.trim();
  if (!apiKey) { s.error = t("setup.error.noKey"); state.requestUpdate(); return; }

  const params = buildParams(apiKey);
  if (!params) { state.requestUpdate(); return; }

  s.verifying = true;
  s.error = null;
  state.requestUpdate();

  try {
    const result = await ipc.verifyKey(params);
    if (!result.success) {
      s.error = result.error ?? t("setup.error.verifyFailed");
      s.verifying = false;
      state.requestUpdate();
      return;
    }
    await ipc.saveConfig(buildSavePayload(params));
    s.verifying = false;
    goToStep(3);
  } catch (e: any) {
    s.error = t("setup.error.connection") + (e?.message ?? "");
    s.verifying = false;
    state.requestUpdate();
  }
}

async function handleOAuthLogin(state: AppViewState, goToStep: (step: number) => void) {
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

    const modelID = s.showCustomModelInput
      ? (s.customModelId.trim() || "k2p5")
      : (s.modelId || "k2p5");

    const verifyResult = await ipc.verifyKey({
      provider: "moonshot",
      apiKey: result.accessToken,
      modelID,
      subPlatform: "kimi-code",
    });

    if (!verifyResult.success) {
      try { await ipc.kimiOAuthLogout(); } catch {}
      s.oauthNoMembership = true;
      s.oauthLoading = false;
      state.requestUpdate();
      return;
    }

    await ipc.saveConfig({
      provider: "moonshot",
      apiKey: result.accessToken,
      modelID,
      baseURL: "",
      api: "",
      subPlatform: "kimi-code",
      supportImage: true,
      customPreset: "",
    });

    s.oauthLoading = false;
    s.oauthSuccess = true;
    state.requestUpdate();
    setTimeout(() => goToStep(3), 600);
  } catch (e: any) {
    s.error = t("setup.error.connection") + (e?.message ?? "");
    s.oauthLoading = false;
    state.requestUpdate();
  }
}

async function handleOAuthCancel(state: AppViewState) {
  try { await ipc.kimiOAuthCancel(); } catch {}
  s.oauthLoading = false;
  state.requestUpdate();
}

function onProviderChange(provider: string, state: AppViewState) {
  s.currentProvider = provider;
  s.customPreset = "";
  s.apiKey = "";
  s.modelId = "";
  s.customModelId = "";
  s.showCustomModelInput = false;
  s.error = null;
  s.oauthSuccess = false;
  s.oauthNoMembership = false;
  if (provider === "moonshot") {
    s.subPlatform = "kimi-code";
  }
  // Auto-select first model
  const models = getModels();
  if (models.length) s.modelId = models[0];
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

function onSubPlatformChange(sp: string, state: AppViewState) {
  s.subPlatform = sp;
  s.apiKey = "";
  s.error = null;
  s.oauthSuccess = false;
  s.oauthNoMembership = false;
  const models = getModels();
  s.modelId = models[0] ?? "";
  s.showCustomModelInput = false;
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
  state.requestUpdate();
}

export function renderStep2(state: AppViewState, goToStep: (step: number) => void) {
  const models = getModels();
  const platformUrl = getPlatformUrl();
  const isOAuth = s.currentProvider === "moonshot" && s.subPlatform === "kimi-code";
  const isCustom = s.currentProvider === "custom";
  const isManualCustom = isCustom && !s.customPreset;

  // Ensure modelId has a value
  if (!s.modelId && models.length) s.modelId = models[0];

  return html`
    <div class="oc-setup-step">
      <h2 class="oc-setup-title">${t("setup.provider.title")}</h2>

      <div class="oc-setup-info-card">
        <span>${t("setup.provider.keyNotice")}</span>
        ${platformUrl ? html`
          <a class="oc-setup-link" @click=${(e: Event) => { e.preventDefault(); ipc.openExternal(platformUrl); }}>${getPlatformLinkText()}</a>
        ` : nothing}
        <a class="oc-setup-link" @click=${(e: Event) => { e.preventDefault(); ipc.openExternal("https://oneclaw.cn/docs?utm_source=oneclaw"); }}>${t("setup.provider.docsLink")}</a>
      </div>

      <oc-provider-segment
        .providers=${PROVIDER_DISPLAY_ORDER.map(p => p)}
        .selected=${s.currentProvider}
        .labels=${getProviderLabels()}
        @select=${(e: CustomEvent) => onProviderChange(e.detail.provider, state)}
      ></oc-provider-segment>

      ${s.currentProvider === "moonshot" ? html`
        <div class="oc-setup-form-group">
          <label class="oc-setup-label">${t("setup.provider.platform")}</label>
          <div class="oc-setup-radio-group">
            <label class="oc-setup-radio">
              <input type="radio" name="subPlatform" value="kimi-code" .checked=${s.subPlatform === "kimi-code"}
                @change=${() => onSubPlatformChange("kimi-code", state)} />
              ${t("setup.provider.subPlatform.kimiCode")}<span class="oc-settings__badge">${t("setup.provider.subPlatform.searchBadge")}</span>
            </label>
            <label class="oc-setup-radio">
              <input type="radio" name="subPlatform" value="moonshot-cn" .checked=${s.subPlatform === "moonshot-cn"}
                @change=${() => onSubPlatformChange("moonshot-cn", state)} />
              ${t("setup.provider.subPlatform.moonshotCn")}
            </label>
          </div>
        </div>
      ` : nothing}

      ${isOAuth ? renderOAuthSection(state, goToStep) : nothing}

      ${isCustom ? html`
        <div class="oc-setup-form-group">
          <label class="oc-setup-label">${t("setup.provider.preset")}</label>
          <select class="oc-setup-select" .value=${s.customPreset}
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
        <div class="oc-setup-form-group">
          <label class="oc-setup-label">${t("setup.provider.baseUrl")}</label>
          <input class="oc-setup-input" .value=${s.baseUrl}
            @input=${(e: Event) => { s.baseUrl = (e.target as HTMLInputElement).value; }} />
        </div>
        <div class="oc-setup-form-group">
          <label class="oc-setup-label">${t("setup.provider.apiType")}</label>
          <div class="oc-setup-radio-group">
            <label class="oc-setup-radio">
              <input type="radio" name="apiType" value="openai-completions" .checked=${s.apiType === "openai-completions"}
                @change=${() => { s.apiType = "openai-completions"; state.requestUpdate(); }} /> ${t("setup.provider.apiType.openaiCompletions")}
            </label>
            <label class="oc-setup-radio">
              <input type="radio" name="apiType" value="anthropic-messages" .checked=${s.apiType === "anthropic-messages"}
                @change=${() => { s.apiType = "anthropic-messages"; state.requestUpdate(); }} /> ${t("setup.provider.apiType.anthropicMessages")}
            </label>
            <label class="oc-setup-radio">
              <input type="radio" name="apiType" value="openai-responses" .checked=${s.apiType === "openai-responses"}
                @change=${() => { s.apiType = "openai-responses"; state.requestUpdate(); }} /> ${t("setup.provider.apiType.openaiResponses")}
            </label>
          </div>
        </div>
      ` : nothing}

      ${(!isOAuth || (isOAuth && !s.oauthSuccess)) ? html`
        <div class="oc-setup-form-group" style="${isOAuth ? 'display:none' : ''}">
          <label class="oc-setup-label">${t("setup.provider.apiKey")}</label>
          <oc-password-input .value=${s.apiKey} .placeholder=${getPlaceholder()}
            @input=${(e: CustomEvent) => { s.apiKey = e.detail.value; state.requestUpdate(); }}
          ></oc-password-input>
        </div>
      ` : nothing}

      ${models.length > 0 ? html`
        <div class="oc-setup-form-group">
          <label class="oc-setup-label">${t("setup.provider.model")}</label>
          <select class="oc-setup-select" .value=${s.modelId}
            @change=${(e: Event) => onModelSelectChange((e.target as HTMLSelectElement).value, state)}>
            ${models.map(m => html`<option value=${m} ?selected=${s.modelId === m}>${m}</option>`)}
            <option value=${CUSTOM_MODEL_SENTINEL}>${t("setup.provider.customModelOption")}</option>
          </select>
        </div>
      ` : nothing}

      ${(s.showCustomModelInput || (isManualCustom && !s.customPreset)) ? html`
        <div class="oc-setup-form-group">
          <label class="oc-setup-label">${t("setup.provider.customModelId")}</label>
          <input class="oc-setup-input" .value=${s.customModelId}
            @input=${(e: Event) => { s.customModelId = (e.target as HTMLInputElement).value; }} />
        </div>
      ` : nothing}

      ${isManualCustom ? html`
        <div class="oc-setup-form-group">
          <label class="oc-setup-checkbox">
            <input type="checkbox" .checked=${s.imageSupport}
              @change=${(e: Event) => { s.imageSupport = (e.target as HTMLInputElement).checked; state.requestUpdate(); }} />
            ${t("setup.provider.imageSupport")}
          </label>
        </div>
      ` : nothing}

      <oc-message-box .message=${s.error ?? ""} .type=${"error"} .visible=${!!s.error}></oc-message-box>

      ${s.oauthNoMembership ? html`
        <div class="oc-setup-oauth-no-membership">
          <span>${t("setup.provider.oauth.noMembership")}</span>
          <a class="oc-setup-link" @click=${(e: Event) => { e.preventDefault(); ipc.openExternal("https://kimi.com/pricing?utm_source=oneclaw"); }}>
            ${t("setup.provider.oauth.subscribeLink")}
          </a>
        </div>
      ` : nothing}

      <div class="oc-setup-btn-row">
        <button class="oc-setup-btn oc-setup-btn--secondary" @click=${() => goToStep(1)}>
          ${t("setup.provider.back")}
        </button>
        ${!isOAuth ? html`
          <button class="oc-setup-btn oc-setup-btn--primary" ?disabled=${s.verifying}
            @click=${() => handleVerify(state, goToStep)}>
            ${s.verifying ? "..." : t("setup.provider.verify")}
          </button>
        ` : nothing}
      </div>
    </div>
  `;
}

function renderOAuthSection(state: AppViewState, goToStep: (step: number) => void) {
  return html`
    <div class="oc-setup-oauth-section">
      ${s.oauthLoading ? html`
        <div class="oc-setup-oauth-status">
          <span class="oc-setup-spinner"></span>
          <span>${t("setup.provider.oauth.waiting")}</span>
          <button class="oc-setup-btn oc-setup-btn--text" @click=${() => handleOAuthCancel(state)}>
            ${t("setup.provider.oauth.cancel")}
          </button>
        </div>
      ` : s.oauthSuccess ? html`
        <div class="oc-setup-oauth-status oc-setup-oauth-status--success">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#27ae60" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          <span>${t("setup.provider.oauth.success")}</span>
        </div>
      ` : html`
        <button class="oc-setup-btn oc-setup-btn--primary" @click=${() => handleOAuthLogin(state, goToStep)}>
          ${t("setup.provider.oauth.login")}
        </button>
      `}

      <details class="oc-setup-details-advanced">
        <summary>${t("setup.provider.oauth.advanced")}</summary>
        <div class="oc-setup-form-group">
          <label class="oc-setup-label">${t("setup.provider.apiKey")}</label>
          <oc-password-input .value=${s.apiKey} .placeholder=${getPlaceholder()}
            @input=${(e: CustomEvent) => { s.apiKey = e.detail.value; state.requestUpdate(); }}
          ></oc-password-input>
          <div class="oc-setup-btn-row" style="margin-top:12px">
            <button class="oc-setup-btn oc-setup-btn--primary" ?disabled=${s.verifying}
              @click=${() => handleVerify(state, goToStep)}>
              ${s.verifying ? "..." : t("setup.provider.verify")}
            </button>
          </div>
        </div>
      </details>
    </div>
  `;
}
