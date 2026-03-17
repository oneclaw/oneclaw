// ── Live2D 外观设置补丁 ──
// 为外观 tab 补充 Live2D 开关：toggle 变化即时生效，无需点保存按钮。
(function () {
  "use strict";

  var LIVE2D_I18N = {
    en: "Live2D Desktop Pet",
    zh: "Live2D 桌面宠物",
  };

  function getLang() {
    var params = new URLSearchParams(window.location.search);
    var lang = params.get("lang");
    if (lang === "zh") return "zh";
    if (lang === "en") return "en";
    return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
  }

  function applyLive2DLabel() {
    var lang = getLang();
    var el = document.querySelector("[data-i18n='appearance.live2d']");
    if (el) {
      el.textContent = LIVE2D_I18N[lang] || LIVE2D_I18N.en;
    }
  }

  async function loadLive2DToggle() {
    var toggle = document.getElementById("appearanceLive2DEnabled");
    if (!toggle) return;
    try {
      if (window.oneclaw && window.oneclaw.live2dGetEnabled) {
        var enabled = await window.oneclaw.live2dGetEnabled();
        toggle.checked = !!enabled;
      }
    } catch (e) {
      console.warn("[live2d-patch] 读取 Live2D 状态失败:", e);
    }
  }

  function bindLive2DToggle() {
    var toggle = document.getElementById("appearanceLive2DEnabled");
    if (!toggle) return;

    // toggle 变化立即生效，不依赖保存按钮
    toggle.addEventListener("change", function () {
      if (window.oneclaw && window.oneclaw.live2dSetEnabled) {
        window.oneclaw.live2dSetEnabled(toggle.checked).catch(function (e) {
          console.warn("[live2d-patch] 设置 Live2D 状态失败:", e);
        });
      }
    });
  }

  function init() {
    applyLive2DLabel();
    loadLive2DToggle();
    bindLive2DToggle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
