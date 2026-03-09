"use strict";

const fs = require("fs");
const path = require("path");
const {
  Cpu,
  Search,
  MessageCircle,
  Eye,
  SlidersVertical,
  History,
  Info,
} = require("lucide");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "settings", "lucide-sprite.generated.js");
const ICONS = {
  "icon-cpu": Cpu,
  "icon-search": Search,
  "icon-message-circle": MessageCircle,
  "icon-eye": Eye,
  "icon-sliders-vertical": SlidersVertical,
  "icon-history": History,
  "icon-info": Info,
};

function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

function renderIconNode(iconNode) {
  // 中文注释：Lucide 导出的 IconNode 需要转换为可内联的 SVG 子节点字符串。
  return iconNode
    .map(([tagName, attrs]) => {
      const attrText = Object.entries(attrs)
        .map(([key, value]) => `${key}="${escapeHtmlAttribute(value)}"`)
        .join(" ");
      return `<${tagName} ${attrText}></${tagName}>`;
    })
    .join("");
}

function buildSpriteMarkup() {
  // 中文注释：这里统一给 symbol 设置 Lucide 的默认描边属性，避免在 HTML 里手写 path。
  const symbols = Object.entries(ICONS)
    .map(([symbolId, iconNode]) => {
      const children = renderIconNode(iconNode);
      return `<symbol id="${symbolId}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</symbol>`;
    })
    .join("");

  return `<svg id="oneclaw-settings-icon-sprite" aria-hidden="true" width="0" height="0" style="position:absolute; width:0; height:0; overflow:hidden"><defs>${symbols}</defs></svg>`;
}

function buildGeneratedScript(spriteMarkup) {
  // 中文注释：设置页通过本地脚本注入 sprite，兼容 file:// 场景且不依赖运行时图标包。
  return `// 此文件由 scripts/generate-settings-icons.js 自动生成，请勿手动编辑。
(function injectOneClawSettingsIconSprite() {
  if (typeof document === "undefined" || !document.body) return;
  if (document.getElementById("oneclaw-settings-icon-sprite")) return;

  document.body.insertAdjacentHTML("afterbegin", ${JSON.stringify(spriteMarkup)});
})();
`;
}

function main() {
  // 中文注释：每次生成都覆盖产物，确保 settings 页图标与依赖中的 Lucide 版本保持一致。
  const spriteMarkup = buildSpriteMarkup();
  const output = buildGeneratedScript(spriteMarkup);
  fs.writeFileSync(OUTPUT_PATH, output, "utf8");
  console.log(`[settings-icons] wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main();
