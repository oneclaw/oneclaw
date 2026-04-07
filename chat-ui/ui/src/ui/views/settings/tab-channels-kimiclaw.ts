/**
 * Settings: Channels — KimiClaw sub-panel.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t, tWithDetail } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import "../../components/toggle-switch.ts";
import "../../components/password-input.ts";
import "../../components/message-box.ts";
import { updateChannelEnabled } from "./tab-channels.ts";

// KimiClaw 面板状态必须可整体回滚，避免 bot token 草稿残留到下次打开。
function createKimiclawState() {
  return {
    enabled: false,
    botToken: "",
    saving: false,
    error: null as string | null,
    successMsg: null as string | null,
    initialized: false,
  };
}

const s = createKimiclawState();

// 退出 Settings 时直接丢掉 KimiClaw 面板缓存，下次重新从 IPC 拉真配置。
export function resetKimiclawTab() {
  Object.assign(s, createKimiclawState());
}

async function init(state: AppViewState) {
  if (s.initialized) return;
  s.initialized = true;
  try {
    const config = await ipc.settingsGetKimiConfig();
    s.enabled = config.enabled ?? false;
    s.botToken = config.botToken ?? "";
    state.requestUpdate();
  } catch {}
}

function parseBotToken(input: string): string {
  const match = input.match(/--bot-token\s+(\S+)/);
  return match ? match[1] : input;
}

function maskToken(token: string): string {
  if (token.length <= 8) return token;
  return token.slice(0, 4) + "***" + token.slice(-4);
}

async function handleToggle(state: AppViewState, checked: boolean) {
  const prevEnabled = s.enabled;
  s.enabled = checked;
  s.error = null;
  s.successMsg = null;
  if (!checked) {
    // Auto-save on disable so the action persists even though the Save button disappears
    s.saving = true; state.requestUpdate();
    try {
      await ipc.settingsSaveKimiConfig({ botToken: s.botToken, enabled: false });
      updateChannelEnabled("kimiclaw", false);
    } catch (e: any) {
      s.enabled = prevEnabled;
      s.error = tWithDetail("settings.error.saveFailed", e?.message);
    }
    s.saving = false; state.requestUpdate();
  } else {
    state.requestUpdate();
  }
}

async function handleSave(state: AppViewState) {
  s.saving = true; s.error = null; s.successMsg = null; state.requestUpdate();
  try {
    await ipc.settingsSaveKimiConfig({ botToken: s.botToken, enabled: s.enabled });
    updateChannelEnabled("kimiclaw", s.enabled);
    s.saving = false; s.successMsg = t("settings.saved"); state.requestUpdate();
  } catch (e: any) { s.saving = false; s.error = tWithDetail("settings.error.saveFailed", e?.message); state.requestUpdate(); }
}

export function renderChannelKimiclaw(state: AppViewState) {
  if (!s.initialized) init(state);

  return html`
    <div class="oc-settings__section">
      <h3 class="oc-settings__section-title">${t("settings.channels.kimiclaw")}</h3>

      <div class="oc-settings__form-group">
        <oc-toggle-switch .label=${t("settings.channels.enable")} .checked=${s.enabled}
          @change=${(e: CustomEvent) => handleToggle(state, e.detail.checked)}
        ></oc-toggle-switch>
      </div>

      ${s.enabled ? html`
        <div class="oc-settings__form-group">
          <label class="oc-settings__label">${t("settings.channels.kimiclaw.botToken")}</label>
          <oc-password-input .value=${s.botToken} .placeholder=${t("settings.channels.kimiclaw.botToken.placeholder")}
            @input=${(e: CustomEvent) => { s.botToken = parseBotToken(e.detail.value); state.requestUpdate(); }}
          ></oc-password-input>
          ${s.botToken ? html`<div class="oc-settings__hint" style="margin-top:4px">${maskToken(s.botToken)}</div>` : nothing}
        </div>

        <div class="oc-settings__form-group">
          <a class="oc-settings__link" href="#" @click=${(e: Event) => { e.preventDefault(); ipc.openExternal("https://kimi.com/bot"); }}>${t("settings.channels.kimiclaw.openBot")}</a>
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
