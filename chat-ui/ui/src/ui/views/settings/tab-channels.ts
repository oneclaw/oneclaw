/**
 * Settings: Channels Tab — platform sub-navigation container.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import { CHANNEL_PLATFORMS } from "./settings-constants.ts";
import { renderChannelWeixin, cleanupWeixinTab } from "./tab-channels-weixin.ts";
import { renderChannelFeishu, refreshFeishuPairing, resetFeishuTab } from "./tab-channels-feishu.ts";
import { renderChannelWecom, refreshWecomPairing, resetWecomTab } from "./tab-channels-wecom.ts";
import { renderChannelDingtalk, resetDingtalkTab } from "./tab-channels-dingtalk.ts";
import { renderChannelKimiclaw, resetKimiclawTab } from "./tab-channels-kimiclaw.ts";
import { renderChannelQqbot, resetQqbotTab } from "./tab-channels-qqbot.ts";

// Channels 容器状态也必须可重建，避免子面板脏状态和导航状态互相打架。
function createChannelsState() {
  return {
    activePlatform: "weixin",
    enabledMap: {} as Record<string, boolean>,
    pairingCleanup: null as (() => void) | null,
    initialized: false,
  };
}

const s = createChannelsState();

async function init(state: AppViewState) {
  if (s.initialized) return;
  s.initialized = true;
  s.pairingCleanup = ipc.onPairingState(() => {
    // Refresh pairing data for the active platform when push arrives
    if (s.activePlatform === "feishu") refreshFeishuPairing(state);
    else if (s.activePlatform === "wecom") refreshWecomPairing(state);
    state.requestUpdate();
  });
  // Load enabled states for all channels
  try {
    const [weixin, feishu, wecom, dingtalk, qqbot, kimi] = await Promise.all([
      ipc.settingsGetWeixinConfig().catch(() => null),
      ipc.settingsGetChannelConfig().catch(() => null),
      ipc.settingsGetWecomConfig().catch(() => null),
      ipc.settingsGetDingtalkConfig().catch(() => null),
      ipc.settingsGetQqbotConfig().catch(() => null),
      ipc.settingsGetKimiConfig().catch(() => null),
    ]);
    s.enabledMap = {
      weixin: weixin?.enabled ?? false,
      feishu: feishu?.enabled ?? false,
      wecom: wecom?.enabled ?? false,
      dingtalk: dingtalk?.enabled ?? false,
      qqbot: qqbot?.enabled ?? false,
      kimiclaw: kimi?.enabled ?? false,
    };
    state.requestUpdate();
  } catch {}
}

/** Called by sub-panels after a successful enable/disable save to sync the nav status dot. */
export function updateChannelEnabled(platform: string, enabled: boolean) {
  s.enabledMap[platform] = enabled;
}

function switchPlatform(newPlatform: string) {
  const prev = s.activePlatform;
  if (prev === newPlatform) return;
  if (prev === "weixin") cleanupWeixinTab();
  s.activePlatform = newPlatform;
}

export function cleanupChannelsTab() {
  if (s.pairingCleanup) {
    s.pairingCleanup();
  }
  cleanupWeixinTab();
  resetFeishuTab();
  resetWecomTab();
  resetDingtalkTab();
  resetKimiclawTab();
  resetQqbotTab();
  Object.assign(s, createChannelsState());
}

export function renderTabChannels(state: AppViewState) {
  init(state);
  const active = s.activePlatform;

  return html`
    <h2 class="oc-settings__section-title" style="font-size:18px;font-weight:600;margin:0 0 8px">${t("settings.nav.channels")}</h2>
    <p class="oc-settings__hint" style="margin:0 0 20px">${t("settings.channels.desc")}</p>
    <div class="oc-settings-channels">
      <nav class="oc-settings-channels__nav">
        ${CHANNEL_PLATFORMS.map(p => html`
          <button class="oc-settings-channels__nav-item ${p.id === active ? "oc-settings-channels__nav-item--active" : ""}"
            @click=${() => { switchPlatform(p.id); state.requestUpdate(); }}>
            ${s.enabledMap[p.id] ? html`<span class="oc-settings-channels__status-dot"></span>` : nothing}
            ${t(p.labelKey)}
          </button>
        `)}
      </nav>
      <div class="oc-settings-channels__panel">
        ${renderChannelPanel(state, active)}
      </div>
    </div>
  `;
}

function renderChannelPanel(state: AppViewState, platform: string) {
  switch (platform) {
    case "weixin": return renderChannelWeixin(state);
    case "feishu": return renderChannelFeishu(state);
    case "wecom": return renderChannelWecom(state);
    case "dingtalk": return renderChannelDingtalk(state);
    case "kimiclaw": return renderChannelKimiclaw(state);
    case "qqbot": return renderChannelQqbot(state);
    default: return renderChannelWeixin(state);
  }
}

const styleSheet = new CSSStyleSheet();
styleSheet.replaceSync(/* css */`
  .oc-settings-channels { display: flex; gap: 18px; flex: 1; min-height: 0; }
  .oc-settings-channels__nav {
    width: 172px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0;
    align-self: flex-start;
  }
  .oc-settings-channels__nav-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 6px 12px;
    border: none;
    background: transparent;
    color: var(--text-secondary, #888);
    font-size: 13px;
    font-weight: 600;
    text-align: left;
    border-radius: var(--radius-md, 12px);
    cursor: pointer;
    transition: background var(--transition, 0.18s ease), color var(--transition, 0.18s ease);
    width: 100%;
  }
  .oc-settings-channels__status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ok, #22c55e);
    flex-shrink: 0;
    margin-left: auto;
  }
  .oc-settings-channels__nav-item:hover { background: var(--bg-hover, #ebebeb); color: var(--text, #3f3f46); }
  .oc-settings-channels__nav-item--active { background: var(--bg-hover, #ebebeb); color: var(--text, #3f3f46); }
  .oc-settings-channels__panel { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];
