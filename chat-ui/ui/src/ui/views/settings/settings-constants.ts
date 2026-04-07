/**
 * Settings constants — tab definitions, channel platform config.
 */
import { html, svg, type TemplateResult } from "lit";

export interface ChannelPlatform {
  id: string;
  labelKey: string;
  descKey: string;
}

export const CHANNEL_PLATFORMS: ChannelPlatform[] = [
  { id: "weixin", labelKey: "settings.channels.weixin", descKey: "settings.channels.weixin.desc" },
  { id: "feishu", labelKey: "settings.channels.feishu", descKey: "settings.channels.feishu.desc" },
  { id: "wecom", labelKey: "settings.channels.wecom", descKey: "settings.channels.wecom.desc" },
  { id: "dingtalk", labelKey: "settings.channels.dingtalk", descKey: "settings.channels.dingtalk.desc" },
  { id: "kimiclaw", labelKey: "settings.channels.kimiclaw", descKey: "settings.channels.kimiclaw.desc" },
  { id: "qqbot", labelKey: "settings.channels.qqbot", descKey: "settings.channels.qqbot.desc" },
];

export interface SettingsTab {
  id: string;
  labelKey: string;
}

export const SETTINGS_TABS: SettingsTab[] = [
  { id: "channels", labelKey: "settings.nav.channels" },
  { id: "provider", labelKey: "settings.nav.provider" },
  { id: "search", labelKey: "settings.nav.search" },
  { id: "memory", labelKey: "settings.nav.memory" },
  { id: "appearance", labelKey: "settings.nav.appearance" },
  { id: "advanced", labelKey: "settings.nav.advanced" },
  { id: "backup", labelKey: "settings.nav.backup" },
  { id: "about", labelKey: "settings.nav.about" },
];

/* ── Lucide-style SVG icons for sidebar nav ── */

function icon(inner: TemplateResult) {
  return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

const TAB_ICONS: Record<string, TemplateResult> = {
  channels: icon(svg`<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>`),
  provider: icon(svg`<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>`),
  search: icon(svg`<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>`),
  memory: icon(svg`<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/>`),
  appearance: icon(svg`<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>`),
  advanced: icon(svg`<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>`),
  backup: icon(svg`<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>`),
  about: icon(svg`<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>`),
};

export function getTabIcon(id: string): TemplateResult | typeof import("lit").nothing {
  return TAB_ICONS[id] ?? html``;
}
