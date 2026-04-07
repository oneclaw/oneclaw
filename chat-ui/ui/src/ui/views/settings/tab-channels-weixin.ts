/**
 * Settings: Channels — Weixin sub-panel.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t, tWithDetail } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import type { WeixinQrResult, WeixinLoginWaitResult } from "../../data/ipc-bridge.ts";
import "../../components/toggle-switch.ts";
import "../../components/message-box.ts";
import { updateChannelEnabled } from "./tab-channels.ts";

// Weixin 面板状态必须可整体回滚，避免二维码和账号缓存残留到下次打开。
function createWeixinState() {
  return {
    enabled: false,
    accounts: [] as Array<{ id: string; name?: string }>,
    qrDataUrl: "",
    qrcode: "",
    loginStatus: "" as "" | "waiting" | "scaned" | "confirmed" | "expired",
    pollTimer: null as ReturnType<typeof setTimeout> | null,
    saving: false,
    error: null as string | null,
    initialized: false,
  };
}

const s = createWeixinState();

async function init(state: AppViewState) {
  if (s.initialized) return;
  s.initialized = true;
  try {
    const config = await ipc.settingsGetWeixinConfig();
    s.enabled = config.enabled ?? false;
    s.accounts = config.accounts ?? [];
    state.requestUpdate();
  } catch {}
}

async function startLogin(state: AppViewState) {
  s.error = null;
  try {
    const result = await ipc.settingsWeixinLoginStart();
    s.qrDataUrl = result.qrDataUrl ?? "";
    s.qrcode = result.qrcode ?? "";
    s.loginStatus = "waiting";
    state.requestUpdate();
    pollLogin(state);
  } catch (e: any) {
    s.error = tWithDetail("settings.error.loginFailed", e?.message);
    state.requestUpdate();
  }
}

function pollLogin(state: AppViewState) {
  if (s.pollTimer) clearTimeout(s.pollTimer);
  s.pollTimer = setTimeout(async () => {
    try {
      const result = await ipc.settingsWeixinLoginWait({ qrcode: s.qrcode });
      s.loginStatus = result.status ?? "";
      if (result.connected) {
        s.pollTimer = null;
        const config = await ipc.settingsGetWeixinConfig();
        s.accounts = config.accounts ?? [];
        state.requestUpdate();
        return;
      }
      if (result.status === "expired") {
        startLogin(state);
        return;
      }
      state.requestUpdate();
      pollLogin(state);
    } catch {
      s.loginStatus = "";
      state.requestUpdate();
    }
  }, 1000);
}

async function handleToggle(state: AppViewState, checked: boolean) {
  s.enabled = checked;
  s.saving = true;
  state.requestUpdate();
  try {
    await ipc.settingsSaveWeixinConfig({ enabled: checked });
    updateChannelEnabled("weixin", checked);
    if (checked && s.accounts.length === 0) startLogin(state);
    s.saving = false;
    state.requestUpdate();
  } catch (e: any) {
    s.saving = false;
    s.error = tWithDetail("settings.error.saveFailed", e?.message);
    state.requestUpdate();
  }
}

async function handleDisconnect(state: AppViewState) {
  try {
    await ipc.settingsWeixinClearAccounts();
    s.accounts = [];
    state.requestUpdate();
    startLogin(state);
  } catch {}
}

export function cleanupWeixinTab() {
  if (s.pollTimer) {
    clearTimeout(s.pollTimer);
  }
  Object.assign(s, createWeixinState());
}

export function renderChannelWeixin(state: AppViewState) {
  if (!s.initialized) init(state);

  const connected = s.accounts.length > 0;

  return html`
    <div class="oc-settings__section">
      <h3 class="oc-settings__panel-title" style="margin-bottom:4px">${t("settings.channels.weixin")}</h3>
      <p class="oc-settings__hint" style="margin:0 0 12px">${t("settings.channels.weixin.desc")}</p>

      <div class="oc-settings__form-group">
        <oc-toggle-switch .label=${t("settings.channels.enable")} .checked=${s.enabled}
          @change=${(e: CustomEvent) => handleToggle(state, e.detail.checked)}
        ></oc-toggle-switch>
      </div>

      ${s.enabled ? html`
        ${connected ? html`
          <div style="font-size:13px;margin-bottom:8px">
            ${t("settings.channels.weixin.connected")}: ${s.accounts[0]?.id ?? ""}
          </div>
          <button class="oc-settings__btn" @click=${() => handleDisconnect(state)}>${t("settings.channels.weixin.disconnect")}</button>
        ` : html`
          ${s.qrDataUrl ? html`
            <div style="text-align:center;margin:12px 0">
              <img src=${s.qrDataUrl} style="width:200px;height:200px" />
              <div style="font-size:12px;color:var(--text-secondary);margin-top:8px">
                ${s.loginStatus === "scaned" ? t("settings.channels.weixin.scanned") : t("settings.channels.weixin.scanQr")}
              </div>
            </div>
          ` : html`
            <button class="oc-settings__btn oc-settings__btn--primary" @click=${() => startLogin(state)}>
              ${t("settings.channels.weixin.startLogin")}
            </button>
          `}
        `}
      ` : nothing}

      <oc-message-box .message=${s.error ?? ""} .type=${"error"} .visible=${!!s.error}></oc-message-box>
    </div>
  `;
}
