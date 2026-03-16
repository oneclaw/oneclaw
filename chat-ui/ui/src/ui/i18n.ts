/**
 * Minimal i18n module for OneClaw Chat UI.
 * ~25 string keys, Chinese / English.
 * Language detection: navigator.language or ?lang= URL param.
 */

export type Locale = "zh" | "en";

const dict: Record<Locale, Record<string, string>> = {
  zh: {
    // App
    "app.windowTitle": "OneClaw 一键安装OpenClaw",

    // Sidebar
    "sidebar.brand": "OneClaw",
    "sidebar.newChat": "新建对话",
    "sidebar.settings": "设置",
    "sidebar.docs": "教程文档",
    "sidebar.updateReady": "重新启动即可更新",
    "sidebar.updateDownloading": "正在下载更新 {percent}%",
    "sidebar.agent": "会话列表",
    "sidebar.fullUI": "打开 OpenClaw 网页端",
    "sidebar.deleteSession": "删除此会话？\n\n会话记录将被归档。",
    "sidebar.preferences": "偏好设置",
    "sidebar.appearance": "外观显示",
    "sidebar.theme": "主题",
    "sidebar.showThinking": "显示思考过程",
    "sidebar.on": "开启",
    "sidebar.off": "关闭",
    "sidebar.refresh": "刷新",
    "restartDialog.title": "连接失败",
    "restartDialog.subtitle": "无法连接到 Gateway，是否重新启动？",
    "restartDialog.restart": "重启 Gateway",
    "restartDialog.dismiss": "稍后再试",
    "sidebar.collapse": "折叠菜单",
    "sidebar.expand": "展开菜单",
    "sidebar.rename": "重命名",
    "sidebar.delete": "删除",
    "sidebar.connected": "已连接",
    "sidebar.disconnected": "未连接",
    "sidebar.connecting": "连接中…",
    "pairing.pendingTitle": "检测到 {channel} 待审批请求",
    "pairing.pendingDesc": "待审批人：{name}",
    "pairing.approveNow": "立即批准",
    "pairing.approving": "批准中…",
    "pairing.rejectNow": "拒绝",
    "pairing.rejecting": "拒绝中…",
    "pairing.openSettings": "打开设置",
    "pairing.dismiss": "关闭通知",
    "pairing.pendingUnknown": "未知用户",
    "pairing.approveFailed": "配对批准失败",
    "pairing.rejectFailed": "配对拒绝失败",
    "pairing.channel.feishu": "飞书",
    "pairing.channel.wecom": "企业微信",

    // 技能管理
    "sidebar.skillStore": "技能",
    "skillStore.title": "技能",
    "skills.tabInstalled": "已安装",
    "skills.tabStore": "商店",
    "skills.refresh": "刷新",
    "skills.refreshing": "刷新中…",
    "skills.search": "搜索技能…",
    "skills.shown": "{n} 项",
    "skills.empty": "暂无技能",
    "skills.groupWorkspace": "工作区技能",
    "skills.groupBuiltIn": "内置技能",
    "skills.groupInstalled": "已安装技能",
    "skills.groupExtra": "额外技能",
    "skills.groupOther": "其他技能",
    "skills.eligible": "可用",
    "skills.blocked": "已阻止",
    "skills.disabled": "已禁用",
    "skills.enable": "启用",
    "skills.disable": "禁用",
    "skills.missing": "缺少",
    "skills.saveKey": "保存密钥",
    "skillStore.search": "搜索技能…",
    "skillStore.sortUpdated": "最新",
    "skillStore.sortTrending": "热门",
    "skillStore.sortDownloads": "下载量",
    "skillStore.install": "安装",
    "skillStore.installed": "已安装",
    "skillStore.uninstall": "卸载",
    "skillStore.installing": "安装中…",
    "skillStore.loadMore": "加载更多",
    "skillStore.empty": "暂无技能",
    "skillStore.error": "加载失败，请稍后再试",
    "skillStore.version": "版本",
    "skillStore.downloads": "下载量",
    "skillStore.installFailed": "安装失败，请稍后重试",
    "skillStore.uninstallFailed": "卸载失败，请稍后重试",


    // 工作空间
    "sidebar.workspace": "工作空间",
    "workspace.title": "工作空间",
    "workspace.refresh": "刷新",
    "workspace.openRoot": "打开根目录",
    "workspace.close": "关闭",
    "workspace.open": "打开",
    "workspace.openFolder": "在文件管理器中打开",
    "workspace.copy": "复制",
    "workspace.copied": "已复制",
    "workspace.empty": "工作空间为空",
    "workspace.loading": "加载中…",
    "workspace.error": "加载失败",
    "workspace.fileTooLarge": "文件过大，无法预览",
    "workspace.noPreview": "无法预览此文件类型",
    "workspace.selectFile": "选择一个文件来预览",

    // OneClaw settings page
    "settings.title": "设置",
    "settings.subtitle": "管理外观显示与聊天展示偏好",
    "settings.backToChat": "返回对话",

    // Chat
    "chat.placeholder": "输入消息或粘贴图片…",
    "chat.placeholder.busy": "继续发送消息将排队等待…",
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
    "chat.attachFile": "添加文件",

    // Share prompt
    "sharePrompt.title": "分享 OneClaw 给朋友",
    "sharePrompt.subtitle": "复制下面这段文案分享给你的朋友或群聊，作者会非常感谢你哟😘",
    "sharePrompt.copy": "复制文案",
    "sharePrompt.copied": "已复制",
    "sharePrompt.close": "关闭",
    "sharePrompt.copyFailed": "复制失败，请手动选择文案复制",

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
    // App
    "app.windowTitle": "OneClaw - One-click installer for OpenClaw",

    // Sidebar
    "sidebar.brand": "OneClaw",
    "sidebar.newChat": "New Chat",
    "sidebar.settings": "Settings",
    "sidebar.docs": "Docs",
    "sidebar.updateReady": "Restart to update",
    "sidebar.updateDownloading": "Downloading update {percent}%",
    "sidebar.agent": "Sessions",
    "sidebar.fullUI": "OpenClaw Web UI",
    "sidebar.deleteSession": "Delete this session?\n\nThe transcript will be archived.",
    "sidebar.preferences": "Preferences",
    "sidebar.appearance": "Appearance",
    "sidebar.theme": "Theme",
    "sidebar.showThinking": "Show thinking output",
    "sidebar.on": "On",
    "sidebar.off": "Off",
    "sidebar.refresh": "Refresh",
    "restartDialog.title": "Connection Failed",
    "restartDialog.subtitle": "Unable to connect to Gateway. Would you like to restart it?",
    "restartDialog.restart": "Restart Gateway",
    "restartDialog.dismiss": "Try Later",
    "sidebar.collapse": "Collapse sidebar",
    "sidebar.expand": "Expand sidebar",
    "sidebar.rename": "Rename",
    "sidebar.delete": "Delete",
    "sidebar.connected": "Connected",
    "sidebar.disconnected": "Disconnected",
    "sidebar.connecting": "Connecting…",
    "pairing.pendingTitle": "{channel} pairing request detected",
    "pairing.pendingDesc": "Pending user: {name}",
    "pairing.approveNow": "Approve now",
    "pairing.approving": "Approving…",
    "pairing.rejectNow": "Reject",
    "pairing.rejecting": "Rejecting…",
    "pairing.openSettings": "Open settings",
    "pairing.dismiss": "Dismiss notice",
    "pairing.pendingUnknown": "Unknown user",
    "pairing.approveFailed": "Failed to approve pairing",
    "pairing.rejectFailed": "Failed to reject pairing",
    "pairing.channel.feishu": "Feishu",
    "pairing.channel.wecom": "WeCom",

    // Skill Manager
    "sidebar.skillStore": "Skills",
    "skillStore.title": "Skills",
    "skills.tabInstalled": "Installed",
    "skills.tabStore": "Store",
    "skills.refresh": "Refresh",
    "skills.refreshing": "Refreshing…",
    "skills.search": "Search skills…",
    "skills.shown": "{n} shown",
    "skills.empty": "No skills found",
    "skills.groupWorkspace": "Workspace Skills",
    "skills.groupBuiltIn": "Built-in Skills",
    "skills.groupInstalled": "Installed Skills",
    "skills.groupExtra": "Extra Skills",
    "skills.groupOther": "Other Skills",
    "skills.eligible": "eligible",
    "skills.blocked": "blocked",
    "skills.disabled": "disabled",
    "skills.enable": "Enable",
    "skills.disable": "Disable",
    "skills.missing": "Missing",
    "skills.saveKey": "Save key",
    "skillStore.search": "Search skills…",
    "skillStore.sortUpdated": "Latest",
    "skillStore.sortTrending": "Trending",
    "skillStore.sortDownloads": "Downloads",
    "skillStore.install": "Install",
    "skillStore.installed": "Installed",
    "skillStore.uninstall": "Uninstall",
    "skillStore.installing": "Installing…",
    "skillStore.loadMore": "Load more",
    "skillStore.empty": "No skills found",
    "skillStore.error": "Failed to load. Please try again later.",
    "skillStore.version": "Version",
    "skillStore.downloads": "Downloads",
    "skillStore.installFailed": "Install failed. Please try again later.",
    "skillStore.uninstallFailed": "Uninstall failed. Please try again later.",


    // Workspace
    "sidebar.workspace": "Workspace",
    "workspace.title": "Workspace",
    "workspace.refresh": "Refresh",
    "workspace.openRoot": "Open root folder",
    "workspace.close": "Close",
    "workspace.open": "Open",
    "workspace.openFolder": "Open in file manager",
    "workspace.copy": "Copy",
    "workspace.copied": "Copied",
    "workspace.empty": "Workspace is empty",
    "workspace.loading": "Loading…",
    "workspace.error": "Failed to load",
    "workspace.fileTooLarge": "File too large to preview",
    "workspace.noPreview": "Cannot preview this file type",
    "workspace.selectFile": "Select a file to preview",

    // OneClaw settings page
    "settings.title": "Settings",
    "settings.subtitle": "Manage appearance and chat display preferences",
    "settings.backToChat": "Back to chat",

    // Chat
    "chat.placeholder": "Type a message or paste an image...",
    "chat.placeholder.busy": "Messages sent now will be queued…",
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
    "chat.attachFile": "Attach file",

    // Share prompt
    "sharePrompt.title": "Share OneClaw with friends",
    "sharePrompt.subtitle":
      "Copy this text and share it with your friends or group chats. The creator will really appreciate it 😘",
    "sharePrompt.copy": "Copy text",
    "sharePrompt.copied": "Copied",
    "sharePrompt.close": "Close",
    "sharePrompt.copyFailed": "Copy failed. Please select and copy manually",

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
