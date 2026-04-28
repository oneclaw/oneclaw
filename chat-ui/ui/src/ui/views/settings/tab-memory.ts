/**
 * Settings: Memory Tab.
 */
import { html } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t, tWithDetail } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import "../../components/toggle-switch.ts";
import "../../components/message-box.ts";

// Memory 页状态必须可重建，避免用户丢弃的开关草稿污染下次打开。
function createMemoryState() {
  return {
    sessionMemoryEnabled: false,
    embeddingEnabled: false,
    isKimiCodeConfigured: false,
    saving: false,
    error: null as string | null,
    successMsg: null as string | null,
    initialized: false,
  };
}

const s = createMemoryState();

// 退出 Settings 时直接丢掉 Memory 页缓存，下次重新从 IPC 拉真配置。
function resetMemoryState() {
  Object.assign(s, createMemoryState());
}

async function init(state: AppViewState) {
  if (s.initialized) return;
  s.initialized = true;
  try {
    const config = await ipc.settingsGetMemoryConfig();
    s.sessionMemoryEnabled = config.sessionMemoryEnabled ?? false;
    s.embeddingEnabled = config.embeddingEnabled ?? false;
    s.isKimiCodeConfigured = config.isKimiCodeConfigured ?? false;
    state.requestUpdate();
  } catch {}
}

async function handleSave(state: AppViewState) {
  s.saving = true; s.error = null; s.successMsg = null; state.requestUpdate();
  try {
    await ipc.settingsSaveMemoryConfig({ sessionMemoryEnabled: s.sessionMemoryEnabled, embeddingEnabled: s.embeddingEnabled });
    s.saving = false; s.successMsg = t("settings.saved"); state.requestUpdate();
  } catch (e: any) { s.saving = false; s.error = tWithDetail("settings.error.saveFailed", e?.message); state.requestUpdate(); }
}

export function resetMemoryTab() { resetMemoryState(); }

export function renderTabMemory(state: AppViewState) {
  if (!s.initialized) init(state);

  const embeddingStatus = s.isKimiCodeConfigured && s.embeddingEnabled
    ? t("settings.memory.embeddingEnabled")
    : !s.isKimiCodeConfigured
      ? t("settings.memory.embeddingRequiresKimi")
      : "";

  return html`
    <div class="oc-settings__section">
      <h2 class="oc-settings__section-title">${t("settings.memory.title")}</h2>
      <p class="oc-settings__hint">${t("settings.memory.desc")}</p>

      <div class="oc-settings__form-group">
        <oc-toggle-switch .label=${t("settings.memory.autoSave")} .checked=${s.sessionMemoryEnabled}
          @change=${(e: CustomEvent) => { s.sessionMemoryEnabled = e.detail.checked; state.requestUpdate(); }}
        ></oc-toggle-switch>
      </div>

      <div class="oc-settings__form-group">
        <oc-toggle-switch .label=${t("settings.memory.embedding")} .checked=${s.embeddingEnabled}
          .disabled=${!s.isKimiCodeConfigured}
          @change=${(e: CustomEvent) => { s.embeddingEnabled = e.detail.checked; state.requestUpdate(); }}
        ></oc-toggle-switch>
        ${embeddingStatus ? html`<div class="oc-settings__field-hint">${embeddingStatus}</div>` : ""}
      </div>

      <oc-message-box .message=${s.error ?? ""} .type=${"error"} .visible=${!!s.error}></oc-message-box>
      <oc-message-box .message=${s.successMsg ?? ""} .type=${"success"} .visible=${!!s.successMsg}></oc-message-box>

      <div class="oc-settings__btn-row">
        <button class="oc-settings__btn oc-settings__btn--primary" ?disabled=${s.saving} @click=${() => handleSave(state)}>${t("settings.save")}</button>
      </div>
    </div>
  `;
}
