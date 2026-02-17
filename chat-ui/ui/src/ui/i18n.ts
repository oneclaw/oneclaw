/**
 * Minimal i18n module for OneClaw Chat UI.
 * ~25 string keys, Chinese / English.
 * Language detection: navigator.language or ?lang= URL param.
 */

export type Locale = "zh" | "en";

const dict: Record<Locale, Record<string, string>> = {
  zh: {
    // Sidebar
    "sidebar.brand": "OneClaw",
    "sidebar.chat": "当前对话",
    "sidebar.newChat": "新建对话",
    "sidebar.settings": "设置",
    "sidebar.openWebUI": "打开 Web UI",
    "sidebar.agent": "Agent",
    "sidebar.preferences": "偏好设置",
    "sidebar.appearance": "外观",
    "sidebar.theme": "主题",
    "sidebar.showThinking": "显示思考过程",
    "sidebar.on": "开启",
    "sidebar.off": "关闭",
    "sidebar.refresh": "刷新",
    "sidebar.collapse": "折叠菜单",
    "sidebar.expand": "展开菜单",
    "sidebar.connected": "已连接",
    "sidebar.disconnected": "未连接",
    "sidebar.connecting": "连接中…",

    // OneClaw settings page
    "settings.title": "设置",
    "settings.subtitle": "管理外观与聊天展示偏好",
    "settings.backToChat": "返回对话",

    // Chat
    "chat.placeholder": "输入消息（↩ 发送，Shift+↩ 换行，粘贴图片）",
    "chat.placeholder.image": "添加消息或粘贴更多图片…",
    "chat.placeholder.disconnected": "连接 Gateway 后即可聊天…",
    "chat.send": "发送",
    "chat.queue": "排队",
    "chat.stop": "停止",
    "chat.newSession": "新对话",
    "chat.confirmNewSession": "当前对话中未记忆的内容将被清除，是否继续新建对话？",
    "chat.loading": "加载中…",
    "chat.newMessages": "新消息",
    "chat.queued": "排队中",
    "chat.compacting": "正在压缩上下文…",
    "chat.compacted": "上下文已压缩",
    "chat.exitFocus": "退出专注模式",
    "chat.messageLabel": "消息",
    "chat.image": "图片",
    "chat.removeAttachment": "移除图片",
    "chat.removeQueuedMessage": "移除排队消息",
    "chat.attachmentPreview": "图片预览",

    // Senders
    "sender.you": "你",
    "sender.assistant": "助手",
    "sender.system": "系统",

    // Status
    "status.health": "健康状态",
    "status.ok": "正常",
    "status.offline": "离线",

    // Theme
    "theme.system": "跟随系统",
    "theme.light": "浅色",
    "theme.dark": "深色",

    // Errors
    "error.disconnected": "已断开与 Gateway 的连接。",
  },
  en: {
    // Sidebar
    "sidebar.brand": "OneClaw",
    "sidebar.chat": "Current Chat",
    "sidebar.newChat": "New Chat",
    "sidebar.settings": "Settings",
    "sidebar.openWebUI": "Open Web UI",
    "sidebar.agent": "Agent",
    "sidebar.preferences": "Preferences",
    "sidebar.appearance": "Appearance",
    "sidebar.theme": "Theme",
    "sidebar.showThinking": "Show thinking output",
    "sidebar.on": "On",
    "sidebar.off": "Off",
    "sidebar.refresh": "Refresh",
    "sidebar.collapse": "Collapse sidebar",
    "sidebar.expand": "Expand sidebar",
    "sidebar.connected": "Connected",
    "sidebar.disconnected": "Disconnected",
    "sidebar.connecting": "Connecting…",

    // OneClaw settings page
    "settings.title": "Settings",
    "settings.subtitle": "Manage appearance and chat display preferences",
    "settings.backToChat": "Back to chat",

    // Chat
    "chat.placeholder": "Message (↩ to send, Shift+↩ for line breaks, paste images)",
    "chat.placeholder.image": "Add a message or paste more images...",
    "chat.placeholder.disconnected": "Connect to the gateway to start chatting…",
    "chat.send": "Send",
    "chat.queue": "Queue",
    "chat.stop": "Stop",
    "chat.newSession": "New session",
    "chat.confirmNewSession":
      "Unmemorized content in the current conversation will be cleared. Continue?",
    "chat.loading": "Loading chat…",
    "chat.newMessages": "New messages",
    "chat.queued": "Queued",
    "chat.compacting": "Compacting context...",
    "chat.compacted": "Context compacted",
    "chat.exitFocus": "Exit focus mode",
    "chat.messageLabel": "Message",
    "chat.image": "Image",
    "chat.removeAttachment": "Remove attachment",
    "chat.removeQueuedMessage": "Remove queued message",
    "chat.attachmentPreview": "Attachment preview",

    // Senders
    "sender.you": "You",
    "sender.assistant": "Assistant",
    "sender.system": "System",

    // Status
    "status.health": "Health",
    "status.ok": "OK",
    "status.offline": "Offline",

    // Theme
    "theme.system": "System",
    "theme.light": "Light",
    "theme.dark": "Dark",

    // Errors
    "error.disconnected": "Disconnected from gateway.",
  },
};

let currentLocale: Locale = detectLocale();

function detectLocale(): Locale {
  // URL param takes priority
  if (typeof window !== "undefined" && window.location?.search) {
    const params = new URLSearchParams(window.location.search);
    const lang = params.get("lang");
    if (lang?.startsWith("zh")) return "zh";
    if (lang?.startsWith("en")) return "en";
  }
  // Browser language
  if (typeof navigator !== "undefined") {
    const lang = navigator.language || "";
    if (lang.startsWith("zh")) return "zh";
  }
  return "en";
}

/**
 * Translate a key to the current locale.
 * Falls back to English, then to the key itself.
 */
export function t(key: string): string {
  return dict[currentLocale]?.[key] ?? dict.en[key] ?? key;
}

/** Get the current locale. */
export function getLocale(): Locale {
  return currentLocale;
}

/** Set the locale explicitly. */
export function setLocale(locale: Locale): void {
  currentLocale = locale;
}
