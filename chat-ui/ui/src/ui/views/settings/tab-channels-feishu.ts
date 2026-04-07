/**
 * Settings: Channels — Feishu sub-panel.
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

// Feishu 面板状态必须可整体回滚，避免未保存表单和配对缓存跨会话残留。
function createFeishuState() {
  return {
    enabled: false,
    appId: "",
    appSecret: "",
    dmPolicy: "pairing",
    dmScope: "main",
    groupPolicy: "disabled",
    groupAllowFrom: [] as string[],
    topicSessionMode: "",
    saving: false,
    error: null as string | null,
    successMsg: null as string | null,
    pairingPanel: { pairingRequests: [], approvedEntries: [], loading: false } as PairingPanelState,
    initialized: false,
    addGroupDialogOpen: false,
    addGroupInput: "",
    addGroupError: null as string | null,
  };
}

const s = createFeishuState();

// 退出 Settings 时直接丢掉 Feishu 面板缓存，下次重新从 IPC 拉真配置。
export function resetFeishuTab() {
  Object.assign(s, createFeishuState());
}

async function init(state: AppViewState) {
  if (s.initialized) return;
  s.initialized = true;
  try {
    const config = await ipc.settingsGetChannelConfig();
    s.enabled = config.enabled ?? false;
    s.appId = config.appId ?? "";
    s.appSecret = config.appSecret ?? "";
    s.dmPolicy = config.dmPolicy ?? "pairing";
    s.dmScope = config.dmScope ?? "main";
    s.groupPolicy = config.groupPolicy ?? "disabled";
    s.groupAllowFrom = config.groupAllowFrom ?? [];
    s.topicSessionMode = config.topicSessionMode ?? "";
    state.requestUpdate();
    refreshFeishuPairing(state);
  } catch {}
}

export async function refreshFeishuPairing(state: AppViewState) {
  s.pairingPanel = await loadPairingData("feishu");
  state.requestUpdate();
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
      await ipc.settingsSaveChannel({ enabled: false });
      updateChannelEnabled("feishu", false);
      s.saving = false; state.requestUpdate();
    } catch (e: any) { s.saving = false; s.enabled = prevEnabled; s.error = tWithDetail("settings.error.saveFailed", e?.message); state.requestUpdate(); }
  } else {
    // Enable -> validate credentials first, then save
    if (!s.appId || !s.appSecret) {
      // No credentials yet, just show form
      state.requestUpdate();
      return;
    }
    s.saving = true; state.requestUpdate();
    try {
      const verifyResult = await ipc.settingsVerifyKey({ provider: "feishu", appId: s.appId, appSecret: s.appSecret });
      if (!verifyResult.success) {
        s.saving = false;
        s.error = tWithDetail("settings.error.verifyFailed", verifyResult.message ?? verifyResult.error);
        s.enabled = prevEnabled;
        state.requestUpdate();
        return;
      }
      await ipc.settingsSaveChannel({
        enabled: true, appId: s.appId, appSecret: s.appSecret,
        dmPolicy: s.dmPolicy, dmScope: s.dmScope,
        groupPolicy: s.groupPolicy, groupAllowFrom: s.groupAllowFrom,
        topicSessionMode: s.topicSessionMode,
      });
      updateChannelEnabled("feishu", true);
      s.saving = false; s.successMsg = t("settings.saved"); state.requestUpdate();
      refreshFeishuPairing(state);
    } catch (e: any) { s.saving = false; s.enabled = prevEnabled; s.error = tWithDetail("settings.error.saveFailed", e?.message); state.requestUpdate(); }
  }
}

async function handleSave(state: AppViewState) {
  s.saving = true; s.error = null; s.successMsg = null; state.requestUpdate();
  try {
    const verifyResult = await ipc.settingsVerifyKey({ provider: "feishu", appId: s.appId, appSecret: s.appSecret });
    if (!verifyResult.success) { s.saving = false; s.error = tWithDetail("settings.error.verifyFailed", verifyResult.message ?? verifyResult.error); state.requestUpdate(); return; }
    await ipc.settingsSaveChannel({
      enabled: s.enabled, appId: s.appId, appSecret: s.appSecret,
      dmPolicy: s.dmPolicy, dmScope: s.dmScope,
      groupPolicy: s.groupPolicy, groupAllowFrom: s.groupAllowFrom,
      topicSessionMode: s.topicSessionMode,
    });
    s.saving = false; s.successMsg = t("settings.saved"); state.requestUpdate();
    refreshFeishuPairing(state);
  } catch (e: any) { s.saving = false; s.error = tWithDetail("settings.error.saveFailed", e?.message); state.requestUpdate(); }
}

function openAddGroupDialog(state: AppViewState) {
  s.addGroupDialogOpen = true;
  s.addGroupInput = "";
  s.addGroupError = null;
  state.requestUpdate();
}

async function confirmAddGroup(state: AppViewState) {
  const id = s.addGroupInput.trim();
  if (!id) return;
  if (!id.startsWith("oc_")) {
    s.addGroupError = t("settings.channels.feishu.addGroupInvalidPrefix");
    state.requestUpdate();
    return;
  }
  try {
    await ipc.settingsAddFeishuGroupAllowFrom({ id });
    s.groupAllowFrom = [...s.groupAllowFrom, id];
    s.addGroupDialogOpen = false;
    s.addGroupError = null;
    state.requestUpdate();
  } catch (e: any) {
    s.addGroupError = tWithDetail("settings.error.addGroupFailed", e?.message);
    state.requestUpdate();
  }
}

function cancelAddGroup(state: AppViewState) {
  s.addGroupDialogOpen = false;
  s.addGroupError = null;
  state.requestUpdate();
}

export function renderChannelFeishu(state: AppViewState) {
  if (!s.initialized) init(state);

  return html`
    <div class="oc-settings__section">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:4px">
        <div>
          <h3 class="oc-settings__panel-title" style="margin-bottom:4px">${t("settings.channels.feishu")}</h3>
          <p class="oc-settings__hint" style="margin:0 0 12px">${t("settings.channels.feishu.desc")}</p>
        </div>
        <div style="display:flex;gap:12px;flex-shrink:0;padding-top:2px">
          <a class="oc-settings__link" href="#" @click=${(e: Event) => { e.preventDefault(); ipc.openExternal("https://github.com/nicepkg/openclaw/blob/main/docs/feishu.md"); }}>${t("settings.channels.feishu.setupGuide")} &rarr;</a>
          <a class="oc-settings__link" href="#" @click=${(e: Event) => { e.preventDefault(); ipc.openExternal("https://open.feishu.cn/app"); }}>${t("settings.channels.feishu.openConsole")} &rarr;</a>
        </div>
      </div>

      <div class="oc-settings__form-group">
        <oc-toggle-switch .label=${t("settings.channels.enable")} .checked=${s.enabled}
          @change=${(e: CustomEvent) => handleToggle(state, e.detail.checked)}
        ></oc-toggle-switch>
      </div>

      ${s.enabled ? html`
        <div class="oc-settings__form-group">
          <label class="oc-settings__label">${t("settings.channels.feishu.appId")}</label>
          <input class="oc-settings__input" .value=${s.appId} @input=${(e: Event) => { s.appId = (e.target as HTMLInputElement).value; }} />
        </div>

        <div class="oc-settings__form-group">
          <label class="oc-settings__label">${t("settings.channels.feishu.appSecret")}</label>
          <oc-password-input .value=${s.appSecret}
            @input=${(e: CustomEvent) => { s.appSecret = e.detail.value; }}
          ></oc-password-input>
        </div>

        <div class="oc-settings__form-group">
          <label class="oc-settings__label">${t("settings.channels.feishu.dmPolicy")}</label>
          <select class="oc-settings__select" .value=${s.dmPolicy} @change=${(e: Event) => { s.dmPolicy = (e.target as HTMLSelectElement).value; state.requestUpdate(); }}>
            <option value="pairing">${t("settings.channels.feishu.dmPairing")}</option>
            <option value="open">${t("settings.channels.feishu.dmOpen")}</option>
          </select>
        </div>

        <div class="oc-settings__form-group">
          <label class="oc-settings__label">${t("settings.channels.feishu.dmScope")}</label>
          <select class="oc-settings__select" .value=${s.dmScope} @change=${(e: Event) => { s.dmScope = (e.target as HTMLSelectElement).value; state.requestUpdate(); }}>
            <option value="main">${t("settings.channels.feishu.dmScopeMain")}</option>
            <option value="per-peer">${t("settings.channels.feishu.dmScopePerPeer")}</option>
            <option value="per-channel-peer">${t("settings.channels.feishu.dmScopePerChannelPeer")}</option>
            <option value="per-account-channel-peer">${t("settings.channels.feishu.dmScopePerAccountChannelPeer")}</option>
          </select>
        </div>

        <div class="oc-settings__form-group">
          <label class="oc-settings__label">${t("settings.channels.feishu.groupPolicy")}</label>
          <select class="oc-settings__select" .value=${s.groupPolicy} @change=${(e: Event) => { s.groupPolicy = (e.target as HTMLSelectElement).value; state.requestUpdate(); }}>
            <option value="disabled">${t("settings.channels.feishu.groupDisabled")}</option>
            <option value="allowlist">${t("settings.channels.feishu.groupAllowlist")}</option>
            <option value="open">${t("settings.channels.feishu.groupOpen")}</option>
          </select>
        </div>

        ${s.groupPolicy === "allowlist" ? html`
          <div class="oc-settings__form-group">
            <button class="oc-settings__btn" @click=${() => openAddGroupDialog(state)}>${t("settings.channels.feishu.addGroup")}</button>
            ${s.groupAllowFrom.length ? html`
              <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${s.groupAllowFrom.join(", ")}</div>
            ` : nothing}
          </div>
          ${s.addGroupDialogOpen ? html`
            <div class="oc-settings__form-group" style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:8px">
              <label class="oc-settings__label">${t("settings.channels.feishu.addGroupPrompt")}</label>
              <input class="oc-settings__input" .value=${s.addGroupInput} placeholder="oc_..."
                @input=${(e: Event) => { s.addGroupInput = (e.target as HTMLInputElement).value; }}
                @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") confirmAddGroup(state); if (e.key === "Escape") cancelAddGroup(state); }} />
              ${s.addGroupError ? html`<div style="color:var(--accent, #c0392b);font-size:12px;margin-top:4px">${s.addGroupError}</div>` : nothing}
              <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
                <button class="oc-settings__btn" @click=${() => cancelAddGroup(state)}>${t("settings.cancel")}</button>
                <button class="oc-settings__btn oc-settings__btn--primary" @click=${() => confirmAddGroup(state)}>${t("settings.confirm")}</button>
              </div>
            </div>
          ` : nothing}
        ` : nothing}

        ${s.dmPolicy === "pairing" || s.groupPolicy === "allowlist" ? renderPairingPanel(state, "feishu", s.pairingPanel, () => refreshFeishuPairing(state)) : nothing}

        <oc-message-box .message=${s.error ?? ""} .type=${"error"} .visible=${!!s.error}></oc-message-box>
        <oc-message-box .message=${s.successMsg ?? ""} .type=${"success"} .visible=${!!s.successMsg}></oc-message-box>

        <div class="oc-settings__btn-row">
          <button class="oc-settings__btn oc-settings__btn--primary" ?disabled=${s.saving} @click=${() => handleSave(state)}>${t("settings.save")}</button>
        </div>
      ` : nothing}
    </div>
  `;
}
