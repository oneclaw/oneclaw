"use strict";

const fs = require("fs");
const path = require("path");
const {
  Cpu,
  Search,
  MessageCircle,
  Eye,
  EyeOff,
  SlidersVertical,
  History,
  Info,
  Sparkles,
  Terminal,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  CircleCheck,
} = require("lucide");

const ROOT = path.resolve(__dirname, "..");

// settings 页面图标集
const SETTINGS_ICONS = {
  "icon-cpu": Cpu,
  "icon-search": Search,
  "icon-message-circle": MessageCircle,
  "icon-eye": Eye,
  "icon-sliders-vertical": SlidersVertical,
  "icon-history": History,
  "icon-info": Info,
};

// setup 页面图标集
const SETUP_ICONS = {
  "icon-sparkles": Sparkles,
  "icon-terminal": Terminal,
  "icon-message-circle": MessageCircle,
  "icon-shield-check": ShieldCheck,
  "icon-alert-triangle": AlertTriangle,
  "icon-alert-circle": AlertCircle,
  "icon-info": Info,
  "icon-eye": Eye,
  "icon-eye-off": EyeOff,
  "icon-circle-check": CircleCheck,
};

// 输出目标
const TARGETS = [
  {
    icons: SETTINGS_ICONS,
    spriteId: "oneclaw-settings-icon-sprite",
    output: path.join(ROOT, "settings", "lucide-sprite.generated.js"),
  },
  {
    icons: SETUP_ICONS,
    spriteId: "oneclaw-setup-icon-sprite",
    output: path.join(ROOT, "setup", "lucide-sprite.generated.js"),
  },
];

function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

// Lucide 导出的 IconNode 转换为可内联的 SVG 子节点字符串
function renderIconNode(iconNode) {
  return iconNode
    .map(([tagName, attrs]) => {
      const attrText = Object.entries(attrs)
        .map(([key, value]) => `${key}="${escapeHtmlAttribute(value)}"`)
        .join(" ");
      return `<${tagName} ${attrText}></${tagName}>`;
    })
    .join("");
}

// 构建 SVG sprite 标记
function buildSpriteMarkup(icons, spriteId) {
  const symbols = Object.entries(icons)
    .map(([symbolId, iconNode]) => {
      const children = renderIconNode(iconNode);
      return `<symbol id="${symbolId}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</symbol>`;
    })
    .join("");

  return `<svg id="${spriteId}" aria-hidden="true" width="0" height="0" style="position:absolute; width:0; height:0; overflow:hidden"><defs>${symbols}</defs></svg>`;
}

// 生成注入脚本
function buildGeneratedScript(spriteMarkup, spriteId) {
  return `// 此文件由 scripts/generate-settings-icons.js 自动生成，请勿手动编辑。
(function inject() {
  if (typeof document === "undefined" || !document.body) return;
  if (document.getElementById("${spriteId}")) return;

  document.body.insertAdjacentHTML("afterbegin", ${JSON.stringify(spriteMarkup)});
})();
`;
}

function main() {
  // 遍历所有目标，分别生成 sprite 注入脚本
  for (const { icons, spriteId, output } of TARGETS) {
    const spriteMarkup = buildSpriteMarkup(icons, spriteId);
    const script = buildGeneratedScript(spriteMarkup, spriteId);
    fs.writeFileSync(output, script, "utf8");
    console.log(`[icons] wrote ${path.relative(ROOT, output)}`);
  }
}

main();
