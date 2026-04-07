/**
 * Settings: Channels — WeCom sub-panel.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t, tWithDetail } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import "../../components/toggle-switch.ts";
import "../../components/password-input.ts";
import "../../components/message-box.ts";
import { updateChannelEnabled } from "./tab-channels.ts";
import { renderPairingPanel, loadPairingData, type PairingPanelState } from "./tab-channels-pairing-panel.ts";

// WeCom 面板状态必须可整体回滚，避免未保存表单和配对缓存跨会话残留。
function createWecomState() {
  return {
    enabled: false,
    botId: "",
    secret: "",
    dmPolicy: "pairing",
    groupPolicy: "disabled",
    groupAllowFrom: [] as string[],
    bundled: true,
    bundleMessage: "",
    saving: false,
    error: null as string | null,
    successMsg: null as string | null,
    pairingPanel: { pairingRequests: [], approvedEntries: [], loading: false } as PairingPanelState,
    initialized: false,
  };
}

const s = createWecomState();

// 退出 Settings 时直接丢掉 WeCom 面板缓存，下次重新从 IPC 拉真配置。
export function resetWecomTab() {
  Object.assign(s, createWecomState());
}

async function init(state: AppViewState) {
  if (s.initialized) return;
  s.initialized = true;
  try {
    const config = await ipc.settingsGetWecomConfig();
    s.enabled = config.enabled ?? false;
    s.botId = config.botId ?? "";
    s.secret = config.secret ?? "";
    s.dmPolicy = config.dmPolicy ?? "pairing";
    s.groupPolicy = config.groupPolicy ?? "disabled";
    s.groupAllowFrom = config.groupAllowFrom ?? [];
    s.bundled = config.bundled ?? true;
    s.bundleMessage = config.bundleMessage ?? "";
    state.requestUpdate();
    refreshWecomPairing(state);
  } catch {}
}

export async function refreshWecomPairing(state: AppViewState) {
  s.pairingPanel = await loadPairingData("wecom");
  state.requestUpdate();
}

function parseGroupAllowFrom(text: string): string[] {
  return text.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
}

async function handleToggle(state: AppViewState, checked: boolean) {
  const prevEnabled = s.enabled;
  s.enabled = checked;
  s.error = null;
  s.successMsg = null;
  if (!checked) {
    // Disable -> save immediately
    s.saving = true; state.requestUpdate();
    try {
      await ipc.settingsSaveWecomConfig({
        enabled: false, botId: s.botId, secret: s.secret,
        dmPolicy: s.dmPolicy, groupPolicy: s.groupPolicy, groupAllowFrom: s.groupAllowFrom,
      });
      updateChannelEnabled("wecom", false);
      s.saving = false; state.requestUpdate();
    } catch (e: any) { s.saving = false; s.enabled = prevEnabled; s.error = tWithDetail("settings.error.saveFailed", e?.message); state.requestUpdate(); }
  } else {
    // Enable -> save with current config
    if (!s.botId || !s.secret) {
      state.requestUpdate();
      return;
    }
    s.saving = true; state.requestUpdate();
    try {
      await ipc.settingsSaveWecomConfig({
        enabled: true, botId: s.botId, secret: s.secret,
        dmPolicy: s.dmPolicy, groupPolicy: s.groupPolicy, groupAllowFrom: s.groupAllowFrom,
      });
      updateChannelEnabled("wecom", true);
      s.saving = false; s.successMsg = t("settings.saved"); state.requestUpdate();
      refreshWecomPairing(state);
    } catch (e: any) { s.saving = false; s.enabled = prevEnabled; s.error = tWithDetail("settings.error.saveFailed", e?.message); state.requestUpdate(); }
  }
}

async function handleSave(state: AppViewState) {
  s.saving = true; s.error = null; s.successMsg = null; state.requestUpdate();
  try {
    await ipc.settingsSaveWecomConfig({
      enabled: s.enabled, botId: s.botId, secret: s.secret,
      dmPolicy: s.dmPolicy, groupPolicy: s.groupPolicy, groupAllowFrom: s.groupAllowFrom,
    });
    s.saving = false; s.successMsg = t("settings.saved"); state.requestUpdate();
    refreshWecomPairing(state);
  } catch (e: any) { s.saving = false; s.error = tWithDetail("settings.error.saveFailed", e?.message); state.requestUpdate(); }
}

export function renderChannelWecom(state: AppViewState) {
  if (!s.initialized) init(state);

  return html`
    <div class="oc-settings__section">
      <h3 class="oc-settings__section-title">${t("settings.channels.wecom")}</h3>

      ${!s.bundled ? html`<oc-message-box .message=${s.bundleMessage || t("settings.channels.wecom.notBundled")} .type=${"info"} .visible=${true}></oc-message-box>` : nothing}

      <div class="oc-settings__form-group">
        <oc-toggle-switch .label=${t("settings.channels.enable")} .checked=${s.enabled}
          @change=${(e: CustomEvent) => handleToggle(state, e.detail.checked)}
        ></oc-toggle-switch>
      </div>

      ${s.enabled ? html`
        <div class="oc-settings__form-group">
          <label class="oc-settings__label">${t("settings.channels.wecom.botId")}</label>
          <input class="oc-settings__input" .value=${s.botId} @input=${(e: Event) => { s.botId = (e.target as HTMLInputElement).value; }} />
        </div>

        <div class="oc-settings__form-group">
          <label class="oc-settings__label">${t("settings.channels.wecom.secret")}</label>
          <oc-password-input .value=${s.secret} @input=${(e: CustomEvent) => { s.secret = e.detail.value; }}></oc-password-input>
        </div>

        <div class="oc-settings__form-group">
          <label class="oc-settings__label">${t("settings.channels.wecom.dmPolicy")}</label>
          <select class="oc-settings__select" .value=${s.dmPolicy} @change=${(e: Event) => { s.dmPolicy = (e.target as HTMLSelectElement).value; state.requestUpdate(); }}>
            <option value="pairing">${t("settings.channels.wecom.dmPairing")}</option>
            <option value="open">${t("settings.channels.wecom.dmOpen")}</option>
          </select>
        </div>

        <div class="oc-settings__form-group">
          <label class="oc-settings__label">${t("settings.channels.wecom.groupPolicy")}</label>
          <select class="oc-settings__select" .value=${s.groupPolicy} @change=${(e: Event) => { s.groupPolicy = (e.target as HTMLSelectElement).value; state.requestUpdate(); }}>
            <option value="disabled">${t("settings.channels.wecom.groupDisabled")}</option>
            <option value="open">${t("settings.channels.wecom.groupOpen")}</option>
            <option value="allowlist">${t("settings.channels.wecom.groupAllowlist")}</option>
          </select>
        </div>

        ${s.groupPolicy === "allowlist" ? html`
          <div class="oc-settings__form-group">
            <label class="oc-settings__label">${t("settings.channels.wecom.groupAllowFromLabel")}</label>
            <textarea class="oc-settings__input" rows="3" .value=${s.groupAllowFrom.join("\n")}
              @input=${(e: Event) => { s.groupAllowFrom = parseGroupAllowFrom((e.target as HTMLTextAreaElement).value); }}
            ></textarea>
          </div>
        ` : nothing}

        ${s.dmPolicy === "pairing" ? renderPairingPanel(state, "wecom", s.pairingPanel, () => refreshWecomPairing(state)) : nothing}

        <div class="oc-settings__form-group" style="display:flex;gap:8px">
          <a class="oc-settings__link" href="#" @click=${(e: Event) => { e.preventDefault(); ipc.openExternal("https://github.com/nicepkg/openclaw/blob/main/docs/wecom.md"); }}>${t("settings.channels.wecom.pluginReadme")}</a>
          <a class="oc-settings__link" href="#" @click=${(e: Event) => { e.preventDefault(); ipc.openExternal("https://work.weixin.qq.com/wework_admin/frame"); }}>${t("settings.channels.wecom.openConsole")}</a>
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
