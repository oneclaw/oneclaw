/**
 * Settings: Channels — DingTalk sub-panel.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t, tWithDetail } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import "../../components/toggle-switch.ts";
import "../../components/password-input.ts";
import "../../components/message-box.ts";
import { updateChannelEnabled } from "./tab-channels.ts";

// DingTalk 面板状态必须可整体回滚，避免未保存凭据残留到下次打开。
function createDingtalkState() {
  return {
    enabled: false,
    clientId: "",
    clientSecret: "",
    sessionTimeout: 1800000,
    bundled: true,
    bundleMessage: "",
    saving: false,
    error: null as string | null,
    successMsg: null as string | null,
    initialized: false,
  };
}

const s = createDingtalkState();

// 退出 Settings 时直接丢掉 DingTalk 面板缓存，下次重新从 IPC 拉真配置。
export function resetDingtalkTab() {
  Object.assign(s, createDingtalkState());
}

async function init(state: AppViewState) {
  if (s.initialized) return;
  s.initialized = true;
  try {
    const config = await ipc.settingsGetDingtalkConfig();
    s.enabled = config.enabled ?? false;
    s.clientId = config.clientId ?? "";
    s.clientSecret = config.clientSecret ?? "";
    s.sessionTimeout = config.sessionTimeout ?? 1800000;
    s.bundled = config.bundled ?? true;
    s.bundleMessage = config.bundleMessage ?? "";
    state.requestUpdate();
  } catch {}
}

async function handleToggle(state: AppViewState, checked: boolean) {
  const prevEnabled = s.enabled;
  s.enabled = checked;
  s.error = null;
  s.successMsg = null;
  if (!checked) {
    s.saving = true; state.requestUpdate();
    try {
      await ipc.settingsSaveDingtalkConfig({ enabled: false, clientId: s.clientId, clientSecret: s.clientSecret, sessionTimeout: s.sessionTimeout });
      updateChannelEnabled("dingtalk", false);
      s.saving = false; s.successMsg = t("settings.saved"); state.requestUpdate();
    } catch (e: any) { s.saving = false; s.enabled = prevEnabled; s.error = tWithDetail("settings.error.saveFailed", e?.message); state.requestUpdate(); }
  } else {
    state.requestUpdate();
  }
}

async function handleSave(state: AppViewState) {
  s.saving = true; s.error = null; s.successMsg = null; state.requestUpdate();
  try {
    if (s.enabled) {
      const verifyResult = await ipc.settingsVerifyKey({ provider: "dingtalk", clientId: s.clientId, clientSecret: s.clientSecret });
      if (!verifyResult.success) { s.saving = false; s.error = tWithDetail("settings.error.verifyFailed", verifyResult.message ?? verifyResult.error); state.requestUpdate(); return; }
    }
    await ipc.settingsSaveDingtalkConfig({
      enabled: s.enabled, clientId: s.clientId, clientSecret: s.clientSecret, sessionTimeout: s.sessionTimeout,
    });
    updateChannelEnabled("dingtalk", s.enabled);
    s.saving = false; s.successMsg = t("settings.saved"); state.requestUpdate();
  } catch (e: any) { s.saving = false; s.error = tWithDetail("settings.error.saveFailed", e?.message); state.requestUpdate(); }
}

export function renderChannelDingtalk(state: AppViewState) {
  if (!s.initialized) init(state);

  return html`
    <div class="oc-settings__section">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:4px">
        <div>
          <h3 class="oc-settings__panel-title" style="margin-bottom:4px">${t("settings.channels.dingtalk")}</h3>
          <p class="oc-settings__hint" style="margin:0 0 12px">${t("settings.channels.dingtalk.desc")}</p>
        </div>
        <div style="display:flex;gap:12px;flex-shrink:0;padding-top:2px">
          <a class="oc-settings__link" href="#" @click=${(e: Event) => { e.preventDefault(); ipc.openExternal("https://github.com/nicepkg/openclaw/blob/main/docs/dingtalk.md"); }}>${t("settings.channels.dingtalk.setupGuide")} &rarr;</a>
          <a class="oc-settings__link" href="#" @click=${(e: Event) => { e.preventDefault(); ipc.openExternal("https://open-dev.dingtalk.com/fe/app"); }}>${t("settings.channels.dingtalk.openConsole")} &rarr;</a>
        </div>
      </div>

      ${!s.bundled ? html`<oc-message-box .message=${s.bundleMessage || t("settings.channels.dingtalk.notBundled")} .type=${"info"} .visible=${true}></oc-message-box>` : nothing}

      <div class="oc-settings__form-group">
        <oc-toggle-switch .label=${t("settings.channels.enable")} .checked=${s.enabled}
          @change=${(e: CustomEvent) => handleToggle(state, e.detail.checked)}
        ></oc-toggle-switch>
      </div>

      ${s.enabled ? html`
        <div class="oc-settings__form-group">
          <label class="oc-settings__label">${t("settings.channels.dingtalk.clientId")}</label>
          <input class="oc-settings__input" .value=${s.clientId} @input=${(e: Event) => { s.clientId = (e.target as HTMLInputElement).value; }} />
        </div>

        <div class="oc-settings__form-group">
          <label class="oc-settings__label">${t("settings.channels.dingtalk.clientSecret")}</label>
          <oc-password-input .value=${s.clientSecret} @input=${(e: CustomEvent) => { s.clientSecret = e.detail.value; }}></oc-password-input>
        </div>

        <div class="oc-settings__form-group">
          <label class="oc-settings__label">${t("settings.channels.dingtalk.sessionTimeout")}</label>
          <input class="oc-settings__input" type="number" .value=${String(s.sessionTimeout)}
            @input=${(e: Event) => { s.sessionTimeout = Number((e.target as HTMLInputElement).value) || 1800000; }} />
          <div class="oc-settings__hint">${t("settings.channels.dingtalk.sessionTimeoutHint")}</div>
        </div>

        <div class="oc-settings__hint" style="margin-bottom:8px;color:#27ae60">${t("settings.channels.dingtalk.gatewayTokenHint")}</div>

        <oc-message-box .message=${s.error ?? ""} .type=${"error"} .visible=${!!s.error}></oc-message-box>
        <oc-message-box .message=${s.successMsg ?? ""} .type=${"success"} .visible=${!!s.successMsg}></oc-message-box>

        <div class="oc-settings__btn-row">
          <button class="oc-settings__btn oc-settings__btn--primary" ?disabled=${s.saving} @click=${() => handleSave(state)}>${t("settings.save")}</button>
        </div>
      ` : nothing}
    </div>
  `;
}
