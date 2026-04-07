/**
 * Settings constants — tab definitions, channel platform config.
 */

export interface ChannelPlatform {
  id: string;
  labelKey: string;
}

export const CHANNEL_PLATFORMS: ChannelPlatform[] = [
  { id: "weixin", labelKey: "settings.channels.weixin" },
  { id: "feishu", labelKey: "settings.channels.feishu" },
  { id: "wecom", labelKey: "settings.channels.wecom" },
  { id: "dingtalk", labelKey: "settings.channels.dingtalk" },
  { id: "kimiclaw", labelKey: "settings.channels.kimiclaw" },
  { id: "qqbot", labelKey: "settings.channels.qqbot" },
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
