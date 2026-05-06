import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state.ts";
import { t } from "../i18n.ts";

// Pill 修复后的反馈 modal —— 视觉跟 settings 的 wb-modal 一致（同名 class）
// 4 种 kind 决定标题/正文文字；统一一个「知道了」按钮关闭
export function renderWebbridgePillModal(state: AppViewState) {
  const m = state.webbridgePillModal;
  if (!m) return nothing;

  const browserName = m.browserName ?? state.webbridgeRepairBrowserName ?? "Chrome";
  let titleKey = "";
  let descKey = "";
  switch (m.kind) {
    case "ready":
      // 标题按是否涉及扩展区分：
      //   含扩展 → "连接你的常用浏览器"（用户还需去浏览器点启用，pill 文案延续）
      //   仅 binary/skill → "WebBridge 已修复"（不涉及浏览器，纯组件修复成功）
      titleKey = m.includesExtension
        ? "sidebar.webbridgePillModalReadyTitle"
        : "sidebar.webbridgePillModalReadyTitleNoBrowser";
      // 浏览器在跑 → "请重启"（Chrome 跑着不会主动读 External JSON，必须重启才会触发启用提示）
      // 浏览器已关 → "请打开"
      descKey = m.browserRunning
        ? "sidebar.webbridgePillModalReadyDescRestart"
        : "sidebar.webbridgePillModalReadyDesc";
      break;
    case "browser-running":
      titleKey = "sidebar.webbridgePillModalBrowserRunningTitle";
      descKey = "sidebar.webbridgePillModalBrowserRunningDesc";
      break;
    case "unsupported":
      titleKey = "sidebar.webbridgePillModalUnsupportedTitle";
      descKey = "sidebar.webbridgePillModalUnsupportedDesc";
      break;
    case "success":
      titleKey = "sidebar.webbridgePillModalSuccessTitle";
      descKey = "sidebar.webbridgePillModalSuccessDesc";
      break;
    case "failed":
    default:
      titleKey = "sidebar.webbridgePillModalFailedTitle";
      descKey = "sidebar.webbridgePillModalFailedDesc";
      break;
  }
  const title = t(titleKey).replace(/\{browser\}/g, browserName);
  // ready 场景下，仅当本次修复触及扩展才提示用户去浏览器点启用
  // 仅装 binary/skill 时不提示——避免误导用户去找根本不会出现的弹窗
  const skipDesc = m.kind === "ready" && !m.includesExtension;
  const desc = m.kind === "failed" && m.message
    ? `${t(descKey)}\n${m.message}`
    : t(descKey).replace(/\{browser\}/g, browserName);

  const close = () => {
    state.webbridgePillModal = null;
  };

  return html`
    <div class="wb-modal-overlay" role="dialog" aria-modal="true" @click=${close}>
      <div class="wb-modal-card" @click=${(e: Event) => e.stopPropagation()}>
        <h3 class="wb-modal-title">${title}</h3>
        ${skipDesc
          ? nothing
          : html`<p class="wb-modal-desc" style="white-space: pre-wrap;">${desc}</p>`}
        <div class="wb-modal-actions">
          <button class="btn primary" type="button" @click=${close}>
            ${t("sidebar.webbridgePillModalConfirm")}
          </button>
        </div>
      </div>
    </div>
  `;
}
