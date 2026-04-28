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
    accounts: [] as string[],
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
      <div class="oc-settings__form-group">
        <oc-toggle-switch .label=${t("settings.channels.enable")} .checked=${s.enabled}
          @change=${(e: CustomEvent) => handleToggle(state, e.detail.checked)}
        ></oc-toggle-switch>
      </div>

      ${s.enabled ? html`
        ${connected ? html`
          <div class="oc-weixin-connected">
            <span class="oc-weixin-badge">✓</span>
            <span class="oc-weixin-account-id">${s.accounts[0] ?? ""}</span>
            <button class="oc-weixin-remove-btn" @click=${() => handleDisconnect(state)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          </div>
        ` : html`
          ${s.qrDataUrl ? html`
            <div class="oc-weixin-qr-section">
              <div class="oc-weixin-qr-container">
                <img class="oc-weixin-qr-image" src=${s.qrDataUrl} />
                <div class="oc-weixin-qr-status">
                  ${s.loginStatus === "scaned" ? t("settings.channels.weixin.scanned") : t("settings.channels.weixin.scanQr")}
                </div>
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

const _weixinSheet = new CSSStyleSheet();
_weixinSheet.replaceSync(/* css */`
  .oc-weixin-connected {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 8px;
    background: var(--bg-elevated, #fff);
    border: 1px solid var(--border, #e4e4e7);
    font-size: 13px;
    color: var(--text, #3f3f46);
  }
  .oc-weixin-badge {
    color: #22c55e;
    font-weight: 600;
  }
  .oc-weixin-account-id {
    flex: 1;
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 12px;
    color: var(--text-secondary, #71717a);
  }
  .oc-weixin-remove-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid var(--border, #e4e4e7);
    border-radius: 8px;
    background: var(--bg-input, #f5f5f5);
    color: var(--text-muted, #a1a1aa);
    cursor: pointer;
    transition: border-color var(--transition, 0.18s ease), color var(--transition, 0.18s ease);
  }
  .oc-weixin-remove-btn:hover {
    border-color: var(--accent, #c0392b);
    color: var(--accent, #c0392b);
  }
  .oc-weixin-qr-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 16px 0;
  }
  .oc-weixin-qr-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 16px;
    border: 1px solid var(--border, #e4e4e7);
    border-radius: 12px;
    background: var(--bg-elevated, #fff);
  }
  .oc-weixin-qr-image {
    width: 200px;
    height: 200px;
    border-radius: 8px;
    image-rendering: pixelated;
  }
  .oc-weixin-qr-status {
    font-size: 13px;
    color: var(--text-secondary, #71717a);
    text-align: center;
  }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, _weixinSheet];
