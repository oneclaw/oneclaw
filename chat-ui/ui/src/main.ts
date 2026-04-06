import "./styles.css";
import { t } from "./ui/i18n";
import "./ui/app.ts";

// 渲染进程启动时同步页面标题，避免文档标题与原生窗口标题不一致。
document.title = t("app.windowTitle");

// 全局 fixed tooltip（不受 overflow 裁切，与 Settings 同一方案）
(function initFixedTooltip() {
  const tip = document.createElement("div");
  tip.className = "fixed-tooltip";
  document.body.appendChild(tip);

  document.addEventListener("mouseover", (e) => {
    const btn = (e.target as HTMLElement).closest("[data-tooltip]") as HTMLElement | null;
    if (!btn || btn.hasAttribute("disabled")) {
      tip.style.opacity = "0";
      return;
    }
    const text = btn.getAttribute("data-tooltip");
    if (!text) { tip.style.opacity = "0"; return; }
    tip.textContent = text;
    tip.style.opacity = "1";
    const rect = btn.getBoundingClientRect();
    // 默认向上弹出
    const pos = btn.getAttribute("data-tooltip-pos");
    if (pos === "bottom") {
      tip.style.left = rect.left + rect.width / 2 + "px";
      tip.style.top = rect.bottom + 6 + "px";
      tip.style.transform = "translateX(-50%)";
    } else {
      tip.style.left = rect.left + rect.width / 2 + "px";
      tip.style.top = rect.top - 6 + "px";
      tip.style.transform = "translate(-50%, -100%)";
    }
  });

  document.addEventListener("mouseout", (e) => {
    const btn = (e.target as HTMLElement).closest("[data-tooltip]");
    if (btn) tip.style.opacity = "0";
  });
})();
