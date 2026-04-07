/**
 * Settings: Appearance Tab — theme and show thinking toggle.
 * Directly writes to Chat UI state (no IPC for appearance).
 */
import { html } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t } from "../../i18n.ts";
import "../../components/toggle-switch.ts";
import "../../components/message-box.ts";

// Appearance 页状态必须跟当前 app settings 同步，不能复用上次未保存的本地草稿。
function createAppearanceState() {
  return {
    theme: "system" as "system" | "light" | "dark",
    showThinking: false,
    successMsg: null as string | null,
    initialized: false,
  };
}

const s = createAppearanceState();

// 离开 Settings 时把 Appearance 页恢复到未初始化状态。
function resetAppearanceState() {
  Object.assign(s, createAppearanceState());
}

function init(state: AppViewState) {
  if (s.initialized) return;
  s.initialized = true;
  s.theme = (state.settings?.theme as any) ?? "system";
  s.showThinking = state.settings?.chatShowThinking ?? false;
}

function handleSave(state: AppViewState) {
  state.applySettings({
    ...state.settings,
    theme: s.theme,
    chatShowThinking: s.showThinking,
  });
  s.successMsg = t("settings.saved");
  state.requestUpdate();
}

export function resetAppearanceTab() { resetAppearanceState(); }

export function renderTabAppearance(state: AppViewState) {
  init(state);

  return html`
    <div class="oc-settings__section">
      <h2 class="oc-settings__section-title" style="font-size:18px;font-weight:600;margin:0 0 8px">${t("settings.appearance.title")}</h2>
      <p class="oc-settings__hint" style="margin:0 0 20px">${t("settings.appearance.desc")}</p>

      <div class="oc-settings__form-group">
        <label class="oc-settings__label">${t("settings.appearance.theme")}</label>
        <div class="oc-settings__radio-group">
          ${(["system", "light", "dark"] as const).map(v => html`
            <label class="oc-settings__radio">
              <input type="radio" name="ap-theme" value=${v} .checked=${s.theme === v}
                @change=${() => { s.theme = v; state.requestUpdate(); }} />
              ${t(`theme.${v}`)}
            </label>
          `)}
        </div>
      </div>

      <div class="oc-settings__form-group">
        <oc-toggle-switch .label=${t("settings.appearance.showThinking")} .checked=${s.showThinking}
          @change=${(e: CustomEvent) => { s.showThinking = e.detail.checked; state.requestUpdate(); }}
        ></oc-toggle-switch>
      </div>

      <oc-message-box .message=${s.successMsg ?? ""} .type=${"success"} .visible=${!!s.successMsg}></oc-message-box>

      <div class="oc-settings__btn-row">
        <button class="oc-settings__btn oc-settings__btn--primary" @click=${() => handleSave(state)}>${t("settings.save")}</button>
      </div>
    </div>
  `;
}
