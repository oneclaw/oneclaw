/**
 * Settings: Channels — DingTalk sub-panel.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t, tWithDetail } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import "../../components/password-input.ts";
import "../../components/message-box.ts";
import { getChannelEnabled } from "./tab-channels.ts";

// DingTalk 面板状态必须可整体回滚，避免未保存凭据残留到下次打开。
function createDingtalkState() {
  return {
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
    s.clientId = config.clientId ?? "";
    s.clientSecret = config.clientSecret ?? "";
    s.sessionTimeout = config.sessionTimeout ?? 1800000;
    s.bundled = config.bundled ?? true;
    s.bundleMessage = config.bundleMessage ?? "";
    state.requestUpdate();
  } catch {}
}

async function handleSave(state: AppViewState) {
  s.saving = true; s.error = null; s.successMsg = null; state.requestUpdate();
  try {
    const enabled = getChannelEnabled("dingtalk");
    if (enabled) {
      const verifyResult = await ipc.settingsVerifyKey({ provider: "dingtalk", clientId: s.clientId, clientSecret: s.clientSecret });
      if (!verifyResult.success) { s.saving = false; s.error = tWithDetail("settings.error.verifyFailed", verifyResult.message ?? verifyResult.error); state.requestUpdate(); return; }
    }
    await ipc.settingsSaveDingtalkConfig({
      enabled, clientId: s.clientId, clientSecret: s.clientSecret, sessionTimeout: s.sessionTimeout,
    });
    s.saving = false; s.successMsg = t("settings.saved"); state.requestUpdate();
  } catch (e: any) { s.saving = false; s.error = tWithDetail("settings.error.saveFailed", e?.message); state.requestUpdate(); }
}

export function renderChannelDingtalk(state: AppViewState) {
  if (!s.initialized) init(state);

  return html`
    <div class="oc-settings__section">
      <div style="display:flex;align-items:flex-start;justify-content:flex-end;margin-bottom:8px">
        <div style="display:flex;gap:12px;flex-shrink:0">
          <a class="oc-settings__link" href="#" @click=${(e: Event) => { e.preventDefault(); ipc.openExternal("https://github.com/nicepkg/openclaw/blob/main/docs/dingtalk.md"); }}>${t("settings.channels.dingtalk.setupGuide")} &rarr;</a>
          <a class="oc-settings__link" href="#" @click=${(e: Event) => { e.preventDefault(); ipc.openExternal("https://open-dev.dingtalk.com/fe/app"); }}>${t("settings.channels.dingtalk.openConsole")} &rarr;</a>
        </div>
      </div>

      ${!s.bundled ? html`<oc-message-box .message=${s.bundleMessage || t("settings.channels.dingtalk.notBundled")} .type=${"info"} .visible=${true}></oc-message-box>` : nothing}

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

        <div class="oc-settings__field-hint" style="margin-bottom:8px">${t("settings.channels.dingtalk.gatewayTokenHint")}</div>

        <oc-message-box .message=${s.error ?? ""} .type=${"error"} .visible=${!!s.error}></oc-message-box>
        <oc-message-box .message=${s.successMsg ?? ""} .type=${"success"} .visible=${!!s.successMsg}></oc-message-box>

        <div class="oc-settings__btn-row">
          <button class="oc-settings__btn oc-settings__btn--primary" ?disabled=${s.saving} @click=${() => handleSave(state)}>${t("settings.save")}</button>
        </div>
    </div>
  `;
}
