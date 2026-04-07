/**
 * Settings: Channels — QQ Bot sub-panel.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t, tWithDetail } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import "../../components/toggle-switch.ts";
import "../../components/password-input.ts";
import "../../components/message-box.ts";
import { updateChannelEnabled } from "./tab-channels.ts";

// QQ Bot 面板状态必须可整体回滚，避免未保存凭据残留到下次打开。
function createQqbotState() {
  return {
    enabled: false,
    appId: "",
    clientSecret: "",
    markdownSupport: false,
    bundled: true,
    bundleMessage: "",
    saving: false,
    error: null as string | null,
    successMsg: null as string | null,
    initialized: false,
  };
}

const s = createQqbotState();

// 退出 Settings 时直接丢掉 QQ Bot 面板缓存，下次重新从 IPC 拉真配置。
export function resetQqbotTab() {
  Object.assign(s, createQqbotState());
}

async function init(state: AppViewState) {
  if (s.initialized) return;
  s.initialized = true;
  try {
    const config = await ipc.settingsGetQqbotConfig();
    s.enabled = config.enabled ?? false;
    s.appId = config.appId ?? "";
    s.clientSecret = config.clientSecret ?? "";
    s.markdownSupport = config.markdownSupport ?? false;
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
      await ipc.settingsSaveQqbotConfig({ enabled: false, appId: s.appId, clientSecret: s.clientSecret, markdownSupport: s.markdownSupport });
      updateChannelEnabled("qqbot", false);
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
      const verifyResult = await ipc.settingsVerifyKey({ provider: "qqbot", appId: s.appId, clientSecret: s.clientSecret });
      if (!verifyResult.success) { s.saving = false; s.error = tWithDetail("settings.error.verifyFailed", verifyResult.message ?? verifyResult.error); state.requestUpdate(); return; }
    }
    await ipc.settingsSaveQqbotConfig({
      enabled: s.enabled, appId: s.appId, clientSecret: s.clientSecret, markdownSupport: s.markdownSupport,
    });
    updateChannelEnabled("qqbot", s.enabled);
    s.saving = false; s.successMsg = t("settings.saved"); state.requestUpdate();
  } catch (e: any) { s.saving = false; s.error = tWithDetail("settings.error.saveFailed", e?.message); state.requestUpdate(); }
}

export function renderChannelQqbot(state: AppViewState) {
  if (!s.initialized) init(state);

  return html`
    <div class="oc-settings__section">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:4px">
        <div>
          <h3 class="oc-settings__panel-title" style="margin-bottom:4px">${t("settings.channels.qqbot")}</h3>
          <p class="oc-settings__hint" style="margin:0 0 12px">${t("settings.channels.qqbot.desc")}</p>
        </div>
        <div style="display:flex;gap:12px;flex-shrink:0;padding-top:2px">
          <a class="oc-settings__link" href="#" @click=${(e: Event) => { e.preventDefault(); ipc.openExternal("https://q.qq.com"); }}>${t("settings.channels.qqbot.openPlatform")} &rarr;</a>
        </div>
      </div>

      ${!s.bundled ? html`<oc-message-box .message=${s.bundleMessage || t("settings.channels.qqbot.notBundled")} .type=${"info"} .visible=${true}></oc-message-box>` : nothing}

      <div class="oc-settings__form-group">
        <oc-toggle-switch .label=${t("settings.channels.enable")} .checked=${s.enabled}
          @change=${(e: CustomEvent) => handleToggle(state, e.detail.checked)}
        ></oc-toggle-switch>
      </div>

      ${s.enabled ? html`
        <div class="oc-settings__form-group">
          <label class="oc-settings__label">${t("settings.channels.qqbot.appId")}</label>
          <input class="oc-settings__input" .value=${s.appId} @input=${(e: Event) => { s.appId = (e.target as HTMLInputElement).value; }} />
        </div>

        <div class="oc-settings__form-group">
          <label class="oc-settings__label">${t("settings.channels.qqbot.clientSecret")}</label>
          <oc-password-input .value=${s.clientSecret} @input=${(e: CustomEvent) => { s.clientSecret = e.detail.value; }}></oc-password-input>
        </div>

        <div class="oc-settings__form-group">
          <oc-toggle-switch .label=${t("settings.channels.qqbot.markdown")} .checked=${s.markdownSupport}
            @change=${(e: CustomEvent) => { s.markdownSupport = e.detail.checked; state.requestUpdate(); }}
          ></oc-toggle-switch>
        </div>

        <oc-message-box .message=${s.error ?? ""} .type=${"error"} .visible=${!!s.error}></oc-message-box>
        <oc-message-box .message=${s.successMsg ?? ""} .type=${"success"} .visible=${!!s.successMsg}></oc-message-box>

        <div class="oc-settings__btn-row">
          <button class="oc-settings__btn oc-settings__btn--primary" ?disabled=${s.saving} @click=${() => handleSave(state)}>${t("settings.save")}</button>
        </div>
      ` : nothing}
    </div>
  `;
}
