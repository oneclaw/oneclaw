// ============================================
// OneClaw Settings — 双栏设置交互逻辑
// ============================================

(function () {
  "use strict";

  // iframe 嵌入主窗口时，优先复用父窗口暴露的 oneclaw bridge
  try {
    if (!window.oneclaw && window.parent && window.parent !== window && window.parent.oneclaw) {
      window.oneclaw = window.parent.oneclaw;
    }
  } catch {
    // 跨域场景忽略，继续走本窗口 oneclaw
  }

  // ── Provider 预设（与 setup.js 对齐） ──

  const PROVIDERS = {
    anthropic: {
      placeholder: "sk-ant-...",
      platformUrl: "https://console.anthropic.com?utm_source=oneclaw",
      models: [
        "claude-sonnet-4-6",
        "claude-opus-4-6",
        "claude-sonnet-4-5-20250929",
        "claude-opus-4-5-20251101",
        "claude-haiku-4-5-20251001",
      ],
    },
    moonshot: {
      placeholder: "sk-...",
      models: ["kimi-k2.5", "kimi-k2-0905-preview"],
      hasSubPlatform: true,
    },
    openai: {
      placeholder: "sk-...",
      platformUrl: "https://platform.openai.com?utm_source=oneclaw",
      models: ["gpt-5.4", "gpt-5.2", "gpt-5.2-codex"],
    },
    google: {
      placeholder: "AI...",
      platformUrl: "https://aistudio.google.com?utm_source=oneclaw",
      models: ["gemini-3.1-pro-preview", "gemini-3.1-flash-lite-preview", "gemini-3-flash-preview"],
    },
    custom: {
      placeholder: "",
      models: [],
    },
  };

  const SUB_PLATFORM_URLS = {
    "moonshot-cn": "https://platform.moonshot.cn?utm_source=oneclaw",
    "moonshot-ai": "https://platform.moonshot.ai?utm_source=oneclaw",
    "kimi-code": "https://kimi.com/code?utm_source=oneclaw",
  };

  const KIMI_CODE_MODELS = ["k2p5"];

  // Custom tab 内置预设
  const CUSTOM_PRESETS = {
    "minimax": {
      providerKey: "minimax",
      placeholder: "eyJ...",
      models: ["MiniMax-M2.5", "MiniMax-M2.5-highspeed"],
    },
    "minimax-cn": {
      providerKey: "minimax-cn",
      placeholder: "eyJ...",
      models: ["MiniMax-M2.5", "MiniMax-M2.5-highspeed"],
    },
    "zai-global": {
      providerKey: "zai-global",
      placeholder: "...",
      models: ["glm-5", "glm-4.7", "glm-4.7-flash", "glm-4.7-flashx"],
    },
    "zai-cn": {
      providerKey: "zai-cn",
      placeholder: "...",
      models: ["glm-5", "glm-4.7", "glm-4.7-flash", "glm-4.7-flashx"],
    },
    "zai-cn-coding": {
      providerKey: "zai-cn-coding",
      placeholder: "...",
      models: ["glm-5", "glm-4.7", "glm-4.7-flash", "glm-4.7-flashx"],
    },
    "volcengine": {
      providerKey: "volcengine",
      placeholder: "...",
      models: ["doubao-seed-2.0-pro", "doubao-seed-2.0-lite", "doubao-seed-2.0-code", "doubao-seed-code"],
    },
    "volcengine-coding": {
      providerKey: "volcengine-coding",
      placeholder: "...",
      models: ["doubao-seed-2.0-code", "doubao-seed-2.0-pro", "doubao-seed-2.0-lite", "doubao-seed-code", "minimax-m2.5", "glm-4.7", "deepseek-v3.2", "kimi-k2.5", "ark-code-latest"],
    },
    "qwen": {
      providerKey: "qwen",
      placeholder: "sk-...",
      models: ["qwen-coder-plus-latest", "qwen-plus-latest", "qwen-max-latest", "qwen-turbo-latest"],
    },
    "qwen-coding": {
      providerKey: "qwen-coding",
      placeholder: "sk-sp-...",
      models: ["qwen3.5-plus", "kimi-k2.5", "glm-5", "MiniMax-M2.5",],
    },
    "deepseek": {
      providerKey: "deepseek",
      placeholder: "sk-...",
      models: ["deepseek-chat", "deepseek-reasoner"],
    },
  };

  // 已保存的各 provider 配置缓存（供切换时自动回填）
  var savedProviders = {};

  // ── 国际化 ──

  const I18N = {
    en: {
      "settings.backToChat": "Back",
      "title": "Settings",
      "nav.provider": "Model",
      "nav.chat": "Remote Control",
      "nav.feishu": "Feishu Integration",
      "chat.title": "Remote Control",
      "chat.desc": "Connect WeChat, Feishu, WeCom, DingTalk, Kimi, or QQ to control OneClaw remotely from your messaging app",
      "chat.platformFeishu": "Feishu",
      "chat.platformFeishuMeta": "Lark / Feishu bot",
      "chat.platformWecom": "WeCom",
      "chat.platformWecomMeta": "WeCom AI bot",
      "chat.platformDingtalk": "DingTalk",
      "chat.platformDingtalkMeta": "DingTalk stream connector",
      "chat.platformKimi": "KimiClaw",
      "chat.platformKimiMeta": "Kimi bot bridge",
      "chat.platformQq": "QQ",
      "chat.platformQqMeta": "QQ Open Platform Bot",
      "provider.title": "Model Configuration",
      "provider.desc": "Change your LLM provider, API key, or model",
      "provider.custom": "Other",
      "provider.presetPlaceholder": "Please select",
      "provider.platform": "Platform",
      "provider.baseUrl": "Base URL",
      "provider.apiKey": "API Key",
      "provider.getKey": "Get API Key →",
      "provider.getKey.kimi-code": "Get Key (Kimi for Code) →",
      "provider.getKey.moonshot-cn": "Get Key (Kimi Open Platform) →",
      "provider.model": "Model",
      "provider.modelId": "Model ID",
      "provider.apiType": "API Type",
      "provider.supportImage": "Supports image input",
      "provider.oauthLogin": "Log in with Kimi",
      "provider.oauthCancel": "Cancel",
      "provider.oauthLogout": "Log out",
      "provider.oauthWaiting": "Waiting for authorization in browser…",
      "provider.oauthSuccess": "Login successful!",
      "provider.oauthNoMembership": "Login succeeded, but your account has no active Kimi membership. Please subscribe and try again.",
      "provider.oauthSubscribeLink": "Subscribe now →",
      "provider.oauthAdvanced": "Advanced options",
      "provider.oauthOr": "or enter API Key manually",
      "provider.usageWeekly": "Weekly Usage",
      "provider.usageLimit": "Rate Limit",
      "provider.usageRefreshed": "Refreshed at ",
      "provider.preset": "Preset",
      "provider.presetManual": "Manual",
      "provider.customModelId": "Custom Model ID",
      "provider.customModelOption": "Custom Model…",
      "common.cancel": "Cancel",
      "common.confirm": "Confirm",
      "common.enable": "Enable",
      "common.saved": "Saved, restarting Gateway",
      "provider.save": "Save",
      "provider.saving": "Saving…",
      "provider.currentUsing": "Current: ",
      "feishu.title": "Feishu Integration",
      "feishu.desc": "Connect Feishu to chat with AI directly in your group",
      "feishu.enabled": "Enable",
      "feishu.appId": "Feishu App ID",
      "feishu.appSecret": "App Secret",
      "feishu.docs": "Setup Guide →",
      "feishu.getKey": "Open Feishu Console →",
      "feishu.save": "Save",
      "feishu.saving": "Saving…",
      "feishu.dmPolicy": "DM Access Mode",
      "feishu.dmPolicyPairing": "Access after pairing",
      "feishu.dmPolicyOpen": "Everyone can access",
      "feishu.dmScope": "DM Session Scope",
      "feishu.dmScopeMain": "All DMs share one session",
      "feishu.dmScopePerPeer": "Per user session (Recommended)",
      "feishu.dmScopePerChannelPeer": "Per channel + user session",
      "feishu.dmScopePerAccountChannelPeer": "Per account + channel + user session",
      "feishu.groupPolicy": "Group Access Mode",
      "feishu.groupPolicyOpen": "All groups can access",
      "feishu.groupPolicyAllowlist": "Only allowlisted groups can access",
      "feishu.groupPolicyDisabled": "Ignore all group messages",
      "feishu.accessTitle": "Pending & Authorized",
      "feishu.pairingTitle": "Pending Pairing Requests",
      "feishu.refreshPairing": "Refresh",
      "feishu.refreshingPairing": "Refreshing…",
      "feishu.noPairingPending": "No pending pairing requests",
      "feishu.approvePairing": "Approve",
      "feishu.approvingPairing": "Approving…",
      "feishu.pairingApproved": "Pairing request approved",
      "feishu.rejectPairing": "Reject",
      "feishu.rejectingPairing": "Rejecting…",
      "feishu.pairingRejected": "Pairing request rejected",
      "feishu.approvedTitle": "Authorized Users & Groups",
      "feishu.refreshApproved": "Refresh",
      "feishu.refreshingApproved": "Refreshing…",
      "feishu.noApproved": "No authorized users or groups yet",
      "feishu.noAccessEntries": "No pending or authorized entries",
      "feishu.statusPending": "Pending",
      "feishu.statusApprovedUser": "Authorized User",
      "feishu.statusApprovedGroup": "Authorized Group",
      "feishu.addGroup": "Add Group ID",
      "feishu.addingGroup": "Adding…",
      "feishu.groupAdded": "Group ID added",
      "feishu.groupIdPrompt": "Enter group ID (must start with oc_):",
      "feishu.groupIdGuideStep1": "Open the target group chat in Feishu, then click the group avatar to open the Group Info page",
      "feishu.groupIdGuideStep2": "Scroll down to the bottom of the Group Info page",
      "feishu.groupIdGuideStep3": "At the bottom of Group Info, find the Conversation ID (starting with oc_) right above the \"Leave Group Chat\" button, then copy it and paste it here",
      "feishu.removeApproved": "Remove",
      "feishu.removingApproved": "Removing…",
      "feishu.approvedRemoved": "Authorization removed",
      "feishu.kindUser": "User",
      "feishu.kindGroup": "Group",
      "wecom.desc": "Connect WeCom so users can talk to OneClaw directly in WeCom",
      "wecom.enabled": "Enable",
      "wecom.botId": "Bot ID",
      "wecom.secret": "Secret",
      "wecom.dmPolicy": "DM Access Mode",
      "wecom.dmPolicyPairing": "Access after pairing",
      "wecom.dmPolicyOpen": "Everyone can access directly",
      "wecom.groupPolicy": "Group Access Mode",
      "wecom.groupPolicyOpen": "All groups can access",
      "wecom.groupPolicyAllowlist": "Only allowlisted groups can access",
      "wecom.groupPolicyDisabled": "Ignore all group messages",
      "wecom.groupAllowFrom": "Group Allowlist",
      "wecom.groupAllowFromHint": "One group ID per line. This only applies when group access mode is allowlist",
      "wecom.dmHint": "Pairing is recommended for direct messages. When set to open, OneClaw will automatically write allowFrom=[\"*\"]",
      "wecom.docs": "Plugin README →",
      "wecom.getKey": "Open WeCom Admin →",
      "wecom.save": "Save",
      "wecom.saving": "Saving…",
      "dingtalk.desc": "Connect DingTalk so users can talk to OneClaw directly in DingTalk",
      "dingtalk.enabled": "Enable",
      "dingtalk.clientId": "Client ID / AppKey",
      "dingtalk.clientSecret": "Client Secret / AppSecret",
      "dingtalk.sessionTimeout": "Session Timeout (ms)",
      "dingtalk.sessionTimeoutHint": "Default is 1800000 ms (30 minutes)",
      "dingtalk.gatewayHint": "OneClaw will auto-use the current gateway token and enable the required chatCompletions HTTP endpoint",
      "dingtalk.docs": "Setup Guide →",
      "dingtalk.getKey": "Open DingTalk Open Platform →",
      "dingtalk.save": "Save",
      "dingtalk.saving": "Saving…",
      "qq.desc": "Connect QQ Bot so users can talk to OneClaw directly in QQ",
      "qq.enabled": "Enable",
      "qq.appId": "QQ Bot App ID",
      "qq.clientSecret": "Client Secret",
      "qq.getKey": "Open QQ Open Platform →",
      "qq.markdownSupport": "Markdown Message",
      "qq.markdownSupportHint": "Turn this off if the current bot account does not have markdown message permission",
      "qq.save": "Save",
      "qq.saving": "Saving…",
      "chat.platformWeixin": "WeChat",
      "chat.platformWeixinMeta": "WeChat QR login",
      "weixin.desc": "Scan a QR code with WeChat to connect OneClaw and chat directly in WeChat",
      "weixin.login": "Connect WeChat",
      "weixin.cancel": "Cancel",
      "weixin.waitingScan": "Scan with the latest WeChat to log in",
      "weixin.scanned": "Scanned! Please confirm in WeChat…",
      "weixin.connected": "Connected",
      "weixin.loginFailed": "Login failed",
      "weixin.disconnect": "Disconnect",
      "weixin.disconnected": "Disconnected",
      "weixin.notBundled": "WeChat plugin not found. Please reinstall OneClaw.",
      "weixin.gatewayNotRunning": "Gateway is not running. Please start it first.",
      "error.weixinNotBundled": "WeChat plugin not found. Please reinstall OneClaw.",
      "error.noPairingCode": "Invalid pairing code",
      "error.loadPairingFailed": "Failed to load pairing requests",
      "error.loadApprovedFailed": "Failed to load approved accounts",
      "error.removeApprovedFailed": "Failed to remove authorization",
      "error.invalidGroupId": "Only group IDs starting with oc_ are allowed",
      "error.noAppId": "Please enter the Feishu App ID",
      "error.noAppSecret": "Please enter the App Secret",
      "error.noWecomBotId": "Please enter the WeCom Bot ID",
      "error.noWecomSecret": "Please enter the WeCom Secret",
      "error.wecomNotBundled": "WeCom plugin is missing. Please reinstall OneClaw",
      "error.noDingtalkClientId": "Please enter the DingTalk Client ID / AppKey",
      "error.noDingtalkClientSecret": "Please enter the DingTalk Client Secret / AppSecret",
      "error.invalidDingtalkSessionTimeout": "Please enter a valid session timeout in milliseconds",
      "error.dingtalkNotBundled": "DingTalk connector is missing. Please reinstall OneClaw",
      "error.noQqAppId": "Please enter the QQ Bot App ID",
      "error.noQqClientSecret": "Please enter the QQ Bot Client Secret",
      "error.qqNotBundled": "QQ Bot component is missing. Please reinstall OneClaw",
      "error.noKey": "Please enter your API key",
      "error.noBaseUrl": "Please enter the Base URL",
      "error.noModelId": "Please enter the Model ID",
      "error.verifyFailed": "Verification failed. Please check your API key",
      "error.connection": "Connection error: ",
      "nav.kimi": "KimiClaw",
      "nav.search": "Search",
      "nav.memory": "Memory",
      "nav.appearance": "Appearance",
      "nav.backup": "Backup & Restore",
      "kimi.title": "KimiClaw",
      "kimi.desc": "Control OneClaw remotely via Kimi",
      "kimi.enabled": "Enable",
      "kimi.getGuide": "Go to kimi.com/bot →",
      "kimi.guideText": "Click 'Associate existing OpenClaw' → copy command → paste below",
      "kimi.inputLabel": "Paste BotToken or command (auto parse token)",
      "kimi.tokenParsed": "Token parsed: ",
      "kimi.save": "Save",
      "kimi.saving": "Saving…",
      "error.noKimiBotToken": "Please paste the command or enter your Bot Token",
      "search.title": "Search Configuration",
      "search.desc": "Configure web search and content fetch tools",
      "search.enabled": "Enable",
      "search.apiKeyLabel": "API Key",
      "search.guideText": "Kimi for Coding API Key enables search",
      "search.getKey": "Get API Key →",
      "search.autoKeyHint": "Auto-reusing Kimi Code API Key",
      "search.save": "Save",
      "search.saving": "Saving…",
      "search.advancedToggle": "Advanced",
      "search.serviceBaseUrlLabel": "Service Base URL",
      "search.serviceBaseUrlHint": "Leave empty to use the default endpoint. /search and /fetch will be appended automatically",
      "memory.title": "Memory",
      "memory.desc": "Memory allows the assistant to remember context across sessions",
      "memory.sessionMemory": "Auto-save session memory on /new",
      "memory.embeddingSearch": "Memory search (semantic recall)",
      "memory.embeddingActive": "Active — using Kimi bge_m3_embed via auth proxy",
      "memory.embeddingInactive": "Not configured — add a Kimi subscription to enable",
      "memory.save": "Save",
      "memory.saving": "Saving…",
      "nav.advanced": "Advanced",
      "advanced.title": "Advanced",
      "advanced.desc": "Browser tool and messaging channel settings",
      "advanced.browserProfile": "Browser Profile",
      "advanced.browserOpenclaw": "Standalone browser instance",
      "advanced.browserChrome": "Chrome extension",
      "advanced.imessage": "iMessage channel",
      "advanced.launchAtLogin": "Launch at login",
      "advanced.cliCommand": "Terminal command",
      "advanced.cliStatusInstalled": "Installed",
      "advanced.cliStatusNotInstalled": "Not installed",
      "advanced.cliStatusUnknown": "Status unknown",
      "advanced.cliInstall": "Install command",
      "advanced.cliUninstall": "Uninstall command",
      "advanced.cliInstalling": "Installing…",
      "advanced.cliUninstalling": "Uninstalling…",
      "advanced.cliInstallDone": "CLI command installed",
      "advanced.cliUninstallDone": "CLI command uninstalled",
      "advanced.cliUnavailable": "CLI action is not available in this app version",
      "advanced.cliOpFailed": "CLI operation failed",
      "advanced.cliUninstallConfirm": "Uninstall the OneClaw terminal command now?",
      "advanced.clawHubRegistry": "ClawHub Registry",
      "advanced.clawHubRegistryPlaceholder": "https://clawhub.ai",
      "advanced.save": "Save",
      "advanced.saving": "Saving…",
      "appearance.title": "Appearance",
      "appearance.desc": "Control theme and chat display preferences",
      "appearance.theme": "Theme",
      "appearance.theme.system": "System",
      "appearance.theme.light": "Light",
      "appearance.theme.dark": "Dark",
      "appearance.showThinking": "Show thinking output",
      "appearance.save": "Save",
      "appearance.saving": "Saving…",
      "backup.title": "Backup & Restore",
      "backup.desc": "Restore openclaw.json when config changes break startup",
      "backup.restoreLastKnownGood": "Restore Last Known Good",
      "backup.historyTitle": "Backup history",
      "backup.empty": "No backup found yet. Save settings once to create one",
      "backup.restore": "Restore",
      "backup.restoring": "Restoring…",
      "backup.gatewayTitle": "Gateway Control",
      "backup.gatewayRestart": "Restart Gateway",
      "backup.gatewayStart": "Start Gateway",
      "backup.gatewayStop": "Stop Gateway",
      "backup.gatewayState": "Gateway status: ",
      "backup.gatewayStateRunning": "Running",
      "backup.gatewayStateStarting": "Starting…",
      "backup.gatewayStateStopping": "Stopping…",
      "backup.gatewayStateStopped": "Stopped",
      "backup.gatewayStateUnknown": "Unknown",
      "backup.resetTitle": "Reset Configuration",
      "backup.resetDesc": "Delete openclaw.json and relaunch app to run setup again. Chat history is kept",
      "backup.resetButton": "Reset Config And Relaunch",
      "backup.resetting": "Resetting…",
      "backup.confirmReset": "Delete openclaw.json, keep history data, and relaunch app to run setup again?",
      "backup.resetDone": "Configuration removed. App is relaunching",
      "backup.lastKnownGoodAt": "Last successful startup snapshot: ",
      "backup.noLastKnownGood": "No last known good snapshot found yet",
      "backup.confirmRestore": "Restore this backup and overwrite current openclaw.json?",
      "backup.confirmRestoreLastKnownGood": "Restore last known good config and overwrite current openclaw.json?",
      "backup.restored": "Configuration restored. Gateway restart triggered",
      "backup.noticeInvalidJson": "Detected invalid openclaw.json. Restore a previous backup",
      "backup.noticeGatewayFailed": "Gateway startup failed. Restore a previous backup and retry",
      "backup.noticeGatewayRecoverFailed": "Auto recovery failed. Please select a backup manually",
      "nav.about": "Software Update",
      "about.title": "Software Update",
      "about.versionInfo": "Version Information",
      "about.oneClawVersion": "OneClaw Version",
      "about.openClawVersion": "OpenClaw Version",
      "about.updateTitle": "Software Update",
      "about.checkUpdate": "Check for Updates",
      "about.checking": "Checking...",
      "about.upToDate": "Up to date",
      "about.updateAvailable": "New version available",
      "about.downloading": "Downloading",
      "about.installRestart": "Install & Restart",
      "about.updateFailed": "Check failed, try again later",
      "about.pushTitle": "Update Notifications",
      "about.pushEnabled": "Push update notifications via remote channels",
      "about.pushSaved": "Notification settings saved",
      "about.pushChannelFeishu": "Feishu",
      "about.pushChannelQqbot": "QQ",
      "about.pushChannelDingtalk": "DingTalk",
      "about.pushChannelWecom": "WeCom",
      "about.pushChannelWeixin": "WeChat",
      "about.pushChannelKimiClaw": "KimiClaw",
      "about.pushNoChannels": "No remote channels enabled. Enable a channel in Remote Control first.",
      "about.pushTest": "Send Test Notification",
      "about.pushTesting": "Sending...",
      "about.pushNoTargets": "No push targets added yet.",
      "about.pushTargetHint": "Tip: ask your bot \"what is my user ID?\" on Feishu/QQ/WeChat to get the target ID. For Feishu groups use chat:oc_xxx.",
      "about.pushAdd": "Add",
      "settings.modelList": "Models",
      "settings.addModel": "+ Add Model",
      "settings.modelAlias": "Alias",
      "settings.modelAliasPlaceholder": "Optional, for easy identification",
      "settings.deleteModel": "Delete",
      "settings.setDefault": "Default",
      "settings.addModelSave": "Add",
      "settings.newModelPlaceholder": "New Model",
      "settings.confirmDelete": "Delete this model?",
      "settings.cannotDeleteDefault": "Cannot delete the default model",
      "settings.modelDeleted": "Model deleted",
      "settings.defaultModelSet": "Default model updated",
    },
    zh: {
      "settings.backToChat": "返回",
      "title": "设置",
      "nav.provider": "模型",
      "nav.chat": "远程控制",
      "nav.feishu": "飞书集成",
      "chat.title": "远程控制",
      "chat.desc": "连接微信、飞书、企业微信、钉钉、Kimi 或 QQ，从聊天软件远程控制 OneClaw",
      "chat.platformFeishu": "飞书",
      "chat.platformFeishuMeta": "Lark / 飞书机器人",
      "chat.platformWecom": "企业微信",
      "chat.platformWecomMeta": "企业微信智能机器人",
      "chat.platformDingtalk": "钉钉",
      "chat.platformDingtalkMeta": "钉钉 Stream 连接器",
      "chat.platformKimi": "KimiClaw",
      "chat.platformKimiMeta": "Kimi 远程机器人",
      "chat.platformQq": "QQ",
      "chat.platformQqMeta": "QQ 开放平台机器人",
      "provider.title": "模型配置",
      "provider.desc": "修改 LLM 云厂商、API 密钥或模型",
      "provider.custom": "其他",
      "provider.presetPlaceholder": "请选择",
      "provider.platform": "平台",
      "provider.baseUrl": "接口地址",
      "provider.apiKey": "API 密钥",
      "provider.getKey": "获取密钥 →",
      "provider.getKey.kimi-code": "购买会员获取密钥 (Kimi for Code) →",
      "provider.getKey.moonshot-cn": "获取密钥 (Kimi 开放平台（企业用户）) →",
      "provider.model": "模型",
      "provider.modelId": "模型 ID",
      "provider.apiType": "接口类型",
      "provider.supportImage": "支持图像输入",
      "provider.oauthLogin": "Kimi 会员登录",
      "provider.oauthCancel": "取消",
      "provider.oauthLogout": "退出登录",
      "provider.oauthWaiting": "请在浏览器中完成授权…",
      "provider.oauthSuccess": "登录成功！",
      "provider.oauthNoMembership": "登录成功，但当前账号未开通 Kimi 会员，请订阅后重试。",
      "provider.oauthSubscribeLink": "前往订阅 →",
      "provider.oauthAdvanced": "高级选项",
      "provider.oauthOr": "或手动输入 API Key",
      "provider.usageWeekly": "本周用量",
      "provider.usageLimit": "频限明细",
      "provider.usageRefreshed": "刷新于 ",
      "provider.preset": "预设",
      "provider.presetManual": "手动配置",
      "provider.customModelId": "自定义模型 ID",
      "provider.customModelOption": "自定义模型…",
      "common.cancel": "取消",
      "common.confirm": "确认",
      "common.enable": "启用",
      "common.saved": "已保存 正在重启核心服务",
      "provider.save": "保存",
      "provider.saving": "保存中…",
      "provider.currentUsing": "当前使用: ",
      "feishu.title": "飞书集成",
      "feishu.desc": "连接飞书 在群聊中直接与 AI 对话",
      "feishu.enabled": "启用状态",
      "feishu.appId": "飞书应用 ID",
      "feishu.appSecret": "应用密钥",
      "feishu.docs": "配置指南 →",
      "feishu.getKey": "打开飞书开放平台 →",
      "feishu.save": "保存",
      "feishu.saving": "保存中…",
      "feishu.dmPolicy": "私聊访问模式",
      "feishu.dmPolicyPairing": "配对后可访问",
      "feishu.dmPolicyOpen": "所有人可访问",
      "feishu.dmScope": "私聊会话模式",
      "feishu.dmScopeMain": "所有私聊共享会话",
      "feishu.dmScopePerPeer": "每个用户独立会话（推荐）",
      "feishu.dmScopePerChannelPeer": "按渠道和用户独立会话",
      "feishu.dmScopePerAccountChannelPeer": "按账号、渠道和用户独立会话",
      "feishu.groupPolicy": "群聊访问模式",
      "feishu.groupPolicyOpen": "所有群可访问",
      "feishu.groupPolicyAllowlist": "仅白名单可访问",
      "feishu.groupPolicyDisabled": "不接收群消息",
      "feishu.accessTitle": "待审批与已授权",
      "feishu.pairingTitle": "待审批配对请求",
      "feishu.refreshPairing": "刷新",
      "feishu.refreshingPairing": "刷新中…",
      "feishu.noPairingPending": "当前没有待审批请求",
      "feishu.approvePairing": "批准",
      "feishu.approvingPairing": "批准中…",
      "feishu.pairingApproved": "配对请求已批准",
      "feishu.rejectPairing": "拒绝",
      "feishu.rejectingPairing": "拒绝中…",
      "feishu.pairingRejected": "配对请求已拒绝",
      "feishu.approvedTitle": "已授权用户与群聊",
      "feishu.refreshApproved": "刷新",
      "feishu.refreshingApproved": "刷新中…",
      "feishu.noApproved": "当前没有已授权的用户或群聊",
      "feishu.noAccessEntries": "当前没有待审批或已授权条目",
      "feishu.statusPending": "待审批",
      "feishu.statusApprovedUser": "已授权用户",
      "feishu.statusApprovedGroup": "已授权群聊",
      "feishu.addGroup": "添加群 ID",
      "feishu.addingGroup": "添加中…",
      "feishu.groupAdded": "群 ID 已添加",
      "feishu.groupIdPrompt": "请输入群 ID（必须以 oc_ 开头）：",
      "feishu.groupIdGuideStep1": "在飞书中打开目标群聊 点击群头像进入群信息页面",
      "feishu.groupIdGuideStep2": "在群信息页面向下滚动至底部",
      "feishu.groupIdGuideStep3": "在群信息底部的“退出群聊”按钮上方找到会话 ID（以 oc_ 开头） 然后点击复制并粘贴到此处",
      "feishu.removeApproved": "删除",
      "feishu.removingApproved": "删除中…",
      "feishu.approvedRemoved": "已移除授权",
      "feishu.kindUser": "用户",
      "feishu.kindGroup": "群聊",
      "wecom.desc": "连接企业微信机器人 让用户直接在企业微信里和 OneClaw 对话",
      "wecom.enabled": "启用状态",
      "wecom.botId": "Bot ID",
      "wecom.secret": "Secret",
      "wecom.dmPolicy": "私聊访问模式",
      "wecom.dmPolicyPairing": "先配对再访问",
      "wecom.dmPolicyOpen": "所有人可直接访问",
      "wecom.groupPolicy": "群聊访问模式",
      "wecom.groupPolicyOpen": "所有群可访问",
      "wecom.groupPolicyAllowlist": "仅白名单群可访问",
      "wecom.groupPolicyDisabled": "不接收群消息",
      "wecom.groupAllowFrom": "群聊白名单",
      "wecom.groupAllowFromHint": "每行一个群 ID。仅在“仅白名单群可访问”模式下生效",
      "wecom.dmHint": "私聊建议优先使用“先配对再访问”；切到“所有人可直接访问”时 OneClaw 会自动写入 allowFrom=[\"*\"]",
      "wecom.docs": "插件说明 →",
      "wecom.getKey": "打开企业微信后台 →",
      "wecom.save": "保存",
      "wecom.saving": "保存中…",
      "dingtalk.desc": "连接钉钉 让用户直接在钉钉里和 OneClaw 对话",
      "dingtalk.enabled": "启用状态",
      "dingtalk.clientId": "Client ID / AppKey",
      "dingtalk.clientSecret": "Client Secret / AppSecret",
      "dingtalk.sessionTimeout": "会话超时（毫秒）",
      "dingtalk.sessionTimeoutHint": "默认 1800000 毫秒（30 分钟）",
      "dingtalk.gatewayHint": "OneClaw会自动复用当前核心服务token并补齐所需的chatCompletions HTTP端点",
      "dingtalk.docs": "配置指南 →",
      "dingtalk.getKey": "打开钉钉开放平台 →",
      "dingtalk.save": "保存",
      "dingtalk.saving": "保存中…",
      "qq.desc": "连接 QQ Bot 让用户直接在 QQ 中和 OneClaw 对话",
      "qq.enabled": "启用状态",
      "qq.appId": "QQ Bot App ID",
      "qq.clientSecret": "Client Secret",
      "qq.getKey": "打开 QQ 开放平台 →",
      "qq.markdownSupport": "Markdown 消息",
      "qq.markdownSupportHint": "如果当前机器人还没有开通 Markdown 消息权限 请先关闭这个开关",
      "qq.save": "保存",
      "qq.saving": "保存中…",
      "chat.platformWeixin": "微信",
      "chat.platformWeixinMeta": "微信扫码连接",
      "weixin.desc": "使用微信扫码连接 OneClaw，在微信中直接对话",
      "weixin.login": "连接微信",
      "weixin.cancel": "取消",
      "weixin.waitingScan": "使用最新版微信扫码登录",
      "weixin.scanned": "已扫码，请在微信中确认…",
      "weixin.connected": "已连接",
      "weixin.loginFailed": "登录失败",
      "weixin.disconnect": "断开连接",
      "weixin.disconnected": "已断开",
      "weixin.notBundled": "微信插件组件缺失，请重新安装 OneClaw",
      "weixin.gatewayNotRunning": "Gateway 未运行，请先启动",
      "error.weixinNotBundled": "微信插件组件缺失，请重新安装 OneClaw",
      "error.noPairingCode": "配对码无效",
      "error.loadPairingFailed": "读取待审批请求失败",
      "error.loadApprovedFailed": "读取已授权列表失败",
      "error.removeApprovedFailed": "移除授权失败",
      "error.invalidGroupId": "仅允许填写以 oc_ 开头的群 ID",
      "error.noAppId": "请输入飞书应用 ID",
      "error.noAppSecret": "请输入应用密钥",
      "error.noWecomBotId": "请输入企业微信 Bot ID",
      "error.noWecomSecret": "请输入企业微信 Secret",
      "error.wecomNotBundled": "企业微信插件组件缺失 请重新安装 OneClaw",
      "error.noDingtalkClientId": "请输入钉钉 Client ID / AppKey",
      "error.noDingtalkClientSecret": "请输入钉钉 Client Secret / AppSecret",
      "error.invalidDingtalkSessionTimeout": "请输入有效的会话超时毫秒值",
      "error.dingtalkNotBundled": "钉钉连接器组件缺失 请重新安装 OneClaw",
      "error.noQqAppId": "请输入 QQ Bot App ID",
      "error.noQqClientSecret": "请输入 QQ Bot Client Secret",
      "error.qqNotBundled": "QQ Bot 组件缺失 请重新安装 OneClaw",
      "error.noKey": "请输入 API 密钥",
      "error.noBaseUrl": "请输入接口地址",
      "error.noModelId": "请输入模型 ID",
      "error.verifyFailed": "验证失败 请检查 API 密钥",
      "error.connection": "连接错误：",
      "nav.kimi": "KimiClaw",
      "nav.search": "搜索",
      "nav.memory": "记忆",
      "nav.appearance": "外观",
      "nav.backup": "备份恢复",
      "kimi.title": "KimiClaw",
      "kimi.desc": "通过 Kimi 远程遥控 OneClaw",
      "kimi.enabled": "启用状态",
      "kimi.getGuide": "前往 kimi.com/bot →",
      "kimi.guideText": '点击"关联已有 OpenClaw" → 复制命令 → 粘贴到下方输入框',
      "kimi.inputLabel": "粘贴 BotToken 或命令(自动解析Token)",
      "kimi.tokenParsed": "解析到 Token：",
      "kimi.save": "保存",
      "kimi.saving": "保存中…",
      "error.noKimiBotToken": "请粘贴命令或输入 Bot Token",
      "search.title": "搜索配置",
      "search.desc": "配置网页搜索和内容抓取工具",
      "search.enabled": "启用状态",
      "search.apiKeyLabel": "API 密钥",
      "search.guideText": "Kimi for Coding 的 API Key 可启用搜索功能",
      "search.getKey": "去控制台获取密钥 →",
      "search.autoKeyHint": "已自动复用 Kimi Code API Key",
      "search.save": "保存",
      "search.saving": "保存中…",
      "search.advancedToggle": "高级配置",
      "search.serviceBaseUrlLabel": "服务地址",
      "search.serviceBaseUrlHint": "留空使用默认地址。系统会自动追加 /search 和 /fetch 路径",
      "memory.title": "记忆",
      "memory.desc": "记忆功能让助手在跨会话时保留上下文",
      "memory.sessionMemory": "开新对话时自动保存会话记忆",
      "memory.embeddingSearch": "记忆搜索（语义召回）",
      "memory.embeddingActive": "已启用 — 通过认证代理使用 Kimi bge_m3_embed",
      "memory.embeddingInactive": "未配置 — 添加 Kimi 订阅即可启用",
      "memory.save": "保存",
      "memory.saving": "保存中…",
      "nav.advanced": "高级",
      "advanced.title": "高级选项",
      "advanced.desc": "浏览器工具与消息频道设置",
      "advanced.browserProfile": "浏览器配置",
      "advanced.browserOpenclaw": "独立浏览器(建议)",
      "advanced.browserChrome": "Chrome 扩展",
      "advanced.imessage": "iMessage 频道",
      "advanced.launchAtLogin": "开机启动",
      "advanced.cliCommand": "终端命令",
      "advanced.cliStatusInstalled": "已安装",
      "advanced.cliStatusNotInstalled": "未安装",
      "advanced.cliStatusUnknown": "状态未知",
      "advanced.cliInstall": "安装命令",
      "advanced.cliUninstall": "卸载命令",
      "advanced.cliInstalling": "安装中…",
      "advanced.cliUninstalling": "卸载中…",
      "advanced.cliInstallDone": "CLI 命令已安装",
      "advanced.cliUninstallDone": "CLI 命令已卸载",
      "advanced.cliUnavailable": "当前应用版本不支持该 CLI 操作",
      "advanced.cliOpFailed": "CLI 操作失败",
      "advanced.cliUninstallConfirm": "确认要卸载 OneClaw 终端命令吗？",
      "advanced.clawHubRegistry": "ClawHub Registry",
      "advanced.clawHubRegistryPlaceholder": "https://clawhub.ai",
      "advanced.save": "保存",
      "advanced.saving": "保存中…",
      "appearance.title": "外观显示",
      "appearance.desc": "调整主题和聊天展示相关设置",
      "appearance.theme": "主题",
      "appearance.theme.system": "跟随系统",
      "appearance.theme.light": "浅色",
      "appearance.theme.dark": "深色",
      "appearance.showThinking": "显示思考过程",
      "appearance.save": "保存",
      "appearance.saving": "保存中…",
      "backup.title": "备份与恢复",
      "backup.desc": "当配置改坏导致无法启动时 可在这里回退 openclaw.json",
      "backup.restoreLastKnownGood": "恢复最近可用配置",
      "backup.historyTitle": "备份历史",
      "backup.empty": "暂无备份。先保存一次设置即可生成",
      "backup.restore": "恢复",
      "backup.restoring": "恢复中…",
      "backup.gatewayTitle": "核心服务控制",
      "backup.gatewayRestart": "重启核心服务",
      "backup.gatewayStart": "启动核心服务",
      "backup.gatewayStop": "停止核心服务",
      "backup.gatewayState": "核心服务状态：",
      "backup.gatewayStateRunning": "运行中",
      "backup.gatewayStateStarting": "启动中…",
      "backup.gatewayStateStopping": "停止中…",
      "backup.gatewayStateStopped": "已停止",
      "backup.gatewayStateUnknown": "未知",
      "backup.resetTitle": "重置配置",
      "backup.resetDesc": "删除 openclaw.json 并重启应用，重新进入引导流程。历史数据会保留。",
      "backup.resetButton": "重置配置并重启",
      "backup.resetting": "重置中…",
      "backup.confirmReset": "将删除 openclaw.json，保留历史数据，并重启应用重新进入引导流程。确认继续吗？",
      "backup.resetDone": "配置已重置，应用正在重启…",
      "backup.lastKnownGoodAt": "最近成功启动快照时间：",
      "backup.noLastKnownGood": "暂无“最近可用配置”快照",
      "backup.confirmRestore": "确认恢复该备份并覆盖当前 openclaw.json 吗？",
      "backup.confirmRestoreLastKnownGood": "确认恢复“最近可用配置”并覆盖当前 openclaw.json 吗？",
      "backup.restored": "配置已恢复，已触发核心服务重启",
      "backup.noticeInvalidJson": "检测到 openclaw.json 无法解析 请恢复历史备份",
      "backup.noticeGatewayFailed": "核心服务启动失败，建议恢复历史备份后重试",
      "backup.noticeGatewayRecoverFailed": "自动回退失败，请手动选择备份恢复",
      "nav.about": "软件更新",
      "about.title": "软件更新",
      "about.versionInfo": "版本信息",
      "about.oneClawVersion": "OneClaw 版本",
      "about.openClawVersion": "OpenClaw 版本",
      "about.updateTitle": "软件更新",
      "about.checkUpdate": "检查更新",
      "about.checking": "检查中...",
      "about.upToDate": "已是最新版本",
      "about.updateAvailable": "发现新版本",
      "about.downloading": "下载中",
      "about.installRestart": "安装并重启",
      "about.updateFailed": "检查失败 请稍后重试",
      "about.pushTitle": "更新通知",
      "about.pushEnabled": "通过远程通道推送更新通知",
      "about.pushSaved": "通知设置已保存",
      "about.pushChannelFeishu": "飞书",
      "about.pushChannelQqbot": "QQ",
      "about.pushChannelDingtalk": "钉钉",
      "about.pushChannelWecom": "企业微信",
      "about.pushChannelWeixin": "微信",
      "about.pushChannelKimiClaw": "KimiClaw",
      "about.pushNoChannels": "暂无已启用的远程通道，请先在「远程控制」中开启。",
      "about.pushTest": "发送测试通知",
      "about.pushTesting": "发送中...",
      "about.pushNoTargets": "暂无推送目标。",
      "about.pushTargetHint": "提示：在飞书/QQ/微信上问机器人「我的 user ID 是什么」即可获取目标 ID。飞书群聊用 chat:oc_xxx 格式。",
      "about.pushAdd": "添加",
      "settings.modelList": "模型列表",
      "settings.addModel": "+ 新增模型",
      "settings.modelAlias": "别名",
      "settings.modelAliasPlaceholder": "可选，方便识别",
      "settings.deleteModel": "删除",
      "settings.setDefault": "默认",
      "settings.addModelSave": "新增",
      "settings.newModelPlaceholder": "新模型",
      "settings.confirmDelete": "确认删除此模型？",
      "settings.cannotDeleteDefault": "不能删除当前默认模型",
      "settings.modelDeleted": "模型已删除",
      "settings.defaultModelSet": "默认模型已更新",
    },
  };

  // ── DOM 引用 ──

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    // 导航
    navItems: $$(".nav-item"),
    tabPanels: $$(".tab-panel"),
    chatPlatformItems: $$(".chat-platform-item"),
    chatPlatformButtons: $$(".chat-platform-btn"),
    chatPlatformPanels: $$(".chat-platform-panel"),
    // Provider tab
    providerTabs: $("#providerTabs"),
    platformLink: $("#platformLink"),
    subPlatformGroup: $("#subPlatformGroup"),
    baseURLGroup: $("#baseURLGroup"),
    apiKeyGroup: $("#apiKeyGroup"),
    apiKeyInput: $("#apiKey"),
    baseURLInput: $("#baseURL"),
    btnToggleKey: $("#btnToggleKey"),
    modelSelectGroup: $("#modelSelectGroup"),
    modelSelect: $("#modelSelect"),
    modelInputGroup: $("#modelInputGroup"),
    modelInput: $("#modelInput"),
    apiTypeGroup: $("#apiTypeGroup"),
    imageSupportGroup: $("#imageSupportGroup"),
    supportImageCheckbox: $("#supportImage"),
    customPresetGroup: $("#customPresetGroup"),
    customPreset: $("#customPreset"),
    customModelInputGroup: $("#customModelInputGroup"),
    customModelInput: $("#customModelInput"),
    oauthGroup: $("#oauthGroup"),
    btnOAuth: $("#btnOAuth"),
    btnOAuthText: document.querySelector("#btnOAuth .btn-oauth-text"),
    btnOAuthSpinner: document.querySelector("#btnOAuth .btn-oauth-spinner"),
    btnOAuthCancel: $("#btnOAuthCancel"),
    btnOAuthLogout: $("#btnOAuthLogout"),
    oauthStatus: $("#oauthStatus"),
    oauthAdvanced: $("#oauthAdvanced"),
    usagePanel: $("#usagePanel"),
    usageWeeklyPercent: $("#usageWeeklyPercent"),
    usageWeeklyReset: $("#usageWeeklyReset"),
    usageWeeklyBar: $("#usageWeeklyBar"),
    usageLimitTitle: $("#usageLimitTitle"),
    usageLimitPercent: $("#usageLimitPercent"),
    usageLimitReset: $("#usageLimitReset"),
    usageLimitBar: $("#usageLimitBar"),
    usageRefreshTime: $("#usageRefreshTime"),
    btnUsageRefresh: $("#btnUsageRefresh"),
    modelAliasGroup: $("#modelAliasGroup"),
    modelAlias: $("#modelAlias"),
    modelList: $("#modelList"),
    addModelBtn: $("#addModelBtn"),
    deleteModelBtn: $("#deleteModelBtn"),
    setDefaultBtn: $("#setDefaultBtn"),
    msgBox: $("#msgBox"),
    btnSave: $("#btnSave"),
    btnSaveText: $("#btnSave .btn-text"),
    btnSaveSpinner: $("#btnSave .btn-spinner"),
    // 通道状态指示灯
    feishuStatusDot: $("#feishuStatusDot"),
    wecomStatusDot: $("#wecomStatusDot"),
    dingtalkStatusDot: $("#dingtalkStatusDot"),
    kimiStatusDot: $("#kimiStatusDot"),
    qqStatusDot: $("#qqStatusDot"),
    // Channels tab
    chEnabled: $("#chEnabled"),
    chFields: $("#chFields"),
    chAppId: $("#chAppId"),
    chAppSecret: $("#chAppSecret"),
    chDmPolicy: $("#chDmPolicy"),
    chDmScope: $("#chDmScope"),
    chGroupPolicy: $("#chGroupPolicy"),
    chPairingSection: $("#chPairingSection"),
    btnToggleChSecret: $("#btnToggleChSecret"),
    chDocsLink: $("#chDocsLink"),
    chConsoleLink: $("#chConsoleLink"),
    chMsgBox: $("#chMsgBox"),
    btnChSave: $("#btnChSave"),
    btnChSaveText: $("#btnChSave .btn-text"),
    btnChSaveSpinner: $("#btnChSave .btn-spinner"),
    btnChAccessAddGroup: $("#btnChAccessAddGroup"),
    btnChAccessRefresh: $("#btnChAccessRefresh"),
    chAccessEmpty: $("#chAccessEmpty"),
    chAccessList: $("#chAccessList"),
    chGroupDialog: $("#chGroupDialog"),
    chGroupDialogInput: $("#chGroupDialogInput"),
    btnChGroupDialogCancel: $("#btnChGroupDialogCancel"),
    btnChGroupDialogConfirm: $("#btnChGroupDialogConfirm"),
    wecomEnabled: $("#wecomEnabled"),
    wecomFields: $("#wecomFields"),
    wecomBotId: $("#wecomBotId"),
    wecomSecret: $("#wecomSecret"),
    wecomDmPolicy: $("#wecomDmPolicy"),
    wecomGroupPolicy: $("#wecomGroupPolicy"),
    wecomGroupAllowFromGroup: $("#wecomGroupAllowFromGroup"),
    wecomGroupAllowFrom: $("#wecomGroupAllowFrom"),
    btnToggleWecomSecret: $("#btnToggleWecomSecret"),
    wecomDocsLink: $("#wecomDocsLink"),
    wecomConsoleLink: $("#wecomConsoleLink"),
    wecomMsgBox: $("#wecomMsgBox"),
    btnWecomSave: $("#btnWecomSave"),
    btnWecomSaveText: $("#btnWecomSave .btn-text"),
    btnWecomSaveSpinner: $("#btnWecomSave .btn-spinner"),
    wecomPairingSection: $("#wecomPairingSection"),
    btnWecomAccessRefresh: $("#btnWecomAccessRefresh"),
    wecomAccessEmpty: $("#wecomAccessEmpty"),
    wecomAccessList: $("#wecomAccessList"),
    dingtalkEnabled: $("#dingtalkEnabled"),
    dingtalkFields: $("#dingtalkFields"),
    dingtalkClientId: $("#dingtalkClientId"),
    dingtalkClientSecret: $("#dingtalkClientSecret"),
    dingtalkSessionTimeout: $("#dingtalkSessionTimeout"),
    btnToggleDingtalkSecret: $("#btnToggleDingtalkSecret"),
    dingtalkDocsLink: $("#dingtalkDocsLink"),
    dingtalkConsoleLink: $("#dingtalkConsoleLink"),
    dingtalkMsgBox: $("#dingtalkMsgBox"),
    btnDingtalkSave: $("#btnDingtalkSave"),
    btnDingtalkSaveText: $("#btnDingtalkSave .btn-text"),
    btnDingtalkSaveSpinner: $("#btnDingtalkSave .btn-spinner"),
    qqEnabled: $("#qqEnabled"),
    qqFields: $("#qqFields"),
    qqAppId: $("#qqAppId"),
    qqClientSecret: $("#qqClientSecret"),
    btnToggleQqSecret: $("#btnToggleQqSecret"),
    qqMarkdownSupport: $("#qqMarkdownSupport"),
    qqConsoleLink: $("#qqConsoleLink"),
    qqMsgBox: $("#qqMsgBox"),
    btnQqSave: $("#btnQqSave"),
    btnQqSaveText: $("#btnQqSave .btn-text"),
    btnQqSaveSpinner: $("#btnQqSave .btn-spinner"),
    // Weixin tab
    weixinEnabled: $("#weixinEnabled"),
    weixinFields: $("#weixinFields"),
    weixinNotBundledHint: $("#weixinNotBundledHint"),
    weixinQrContainer: $("#weixinQrContainer"),
    weixinQrImage: $("#weixinQrImage"),
    weixinQrStatus: $("#weixinQrStatus"),
    weixinConnectedInfo: $("#weixinConnectedInfo"),
    weixinAccountId: $("#weixinAccountId"),
    btnWeixinRemove: $("#btnWeixinRemove"),
    weixinMsgBox: $("#weixinMsgBox"),
    weixinStatusDot: $("#weixinStatusDot"),
    // Kimi tab
    kimiEnabled: $("#kimiEnabled"),
    kimiFields: $("#kimiFields"),
    kimiSettingsInput: $("#kimiSettingsInput"),
    btnToggleKimiToken: $("#btnToggleKimiToken"),
    kimiMsgBox: $("#kimiMsgBox"),
    kimiBotPageLink: $("#kimiBotPageLink"),
    btnKimiSave: $("#btnKimiSave"),
    btnKimiSaveText: $("#btnKimiSave .btn-text"),
    btnKimiSaveSpinner: $("#btnKimiSave .btn-spinner"),
    // Search tab
    searchEnabled: $("#searchEnabled"),
    searchFields: $("#searchFields"),
    searchProviderTabs: $("#searchProviderTabs"),
    searchPlatformLink: $("#searchPlatformLink"),
    searchGuideText: $("#searchGuideText"),
    searchApiKey: $("#searchApiKey"),
    searchApiKeyGroup: $("#searchApiKeyGroup"),
    searchAutoKeyHint: $("#searchAutoKeyHint"),
    btnToggleSearchKey: $("#btnToggleSearchKey"),
    searchServiceBaseUrl: $("#searchServiceBaseUrl"),
    searchMsgBox: $("#searchMsgBox"),
    btnSearchSave: $("#btnSearchSave"),
    btnSearchSaveText: $("#btnSearchSave .btn-text"),
    btnSearchSaveSpinner: $("#btnSearchSave .btn-spinner"),
    // Memory tab
    memorySessionEnabled: $("#memorySessionEnabled"),
    memoryEmbeddingEnabled: $("#memoryEmbeddingEnabled"),
    memoryEmbeddingInfo: $("#memoryEmbeddingInfo"),
    memoryEmbeddingStatus: $("#memoryEmbeddingStatus"),
    memoryMsgBox: $("#memoryMsgBox"),
    btnMemorySave: $("#btnMemorySave"),
    btnMemorySaveText: $("#btnMemorySave .btn-text"),
    btnMemorySaveSpinner: $("#btnMemorySave .btn-spinner"),
    // Advanced tab
    clawHubRegistry: $("#clawHubRegistry"),
    imessageEnabled: $("#imessageEnabled"),
    launchAtLoginRow: $("#launchAtLoginRow"),
    launchAtLoginEnabled: $("#launchAtLoginEnabled"),
    cliEnabled: $("#cliEnabled"),
    advMsgBox: $("#advMsgBox"),
    btnAdvSave: $("#btnAdvSave"),
    btnAdvSaveText: $("#btnAdvSave .btn-text"),
    btnAdvSaveSpinner: $("#btnAdvSave .btn-spinner"),
    // Appearance tab
    appearanceShowThinking: $("#appearanceShowThinking"),
    appearanceMsgBox: $("#appearanceMsgBox"),
    btnAppearanceSave: $("#btnAppearanceSave"),
    btnAppearanceSaveText: $("#btnAppearanceSave .btn-text"),
    btnAppearanceSaveSpinner: $("#btnAppearanceSave .btn-spinner"),
    // Backup tab
    backupLastKnownGood: $("#backupLastKnownGood"),
    backupEmpty: $("#backupEmpty"),
    backupList: $("#backupList"),
    backupMsgBox: $("#backupMsgBox"),
    btnRestoreLastKnownGood: $("#btnRestoreLastKnownGood"),
    btnRestoreLastKnownGoodText: $("#btnRestoreLastKnownGood .btn-text"),
    btnRestoreLastKnownGoodSpinner: $("#btnRestoreLastKnownGood .btn-spinner"),
    gatewayStateText: $("#gatewayStateText"),
    btnGatewayRestart: $("#btnGatewayRestart"),
    btnGatewayStart: $("#btnGatewayStart"),
    btnGatewayStop: $("#btnGatewayStop"),
    btnResetConfig: $("#btnResetConfig"),
    btnResetConfigText: $("#btnResetConfig .btn-text"),
    btnResetConfigSpinner: $("#btnResetConfig .btn-spinner"),
  };

  // ── 状态 ──

  let currentProvider = "moonshot";
  // 编辑器状态机（discriminated union）:
  // { mode: "idle" } | { mode: "add" } | { mode: "edit", modelKey: string, providerKey: string }
  var editorState = { mode: "idle" };
  let modelListData = []; // settingsGetConfiguredModels 返回的模型列表缓存
  let saving = false;
  // OAuth 登录后暂存真实 access_token，点击"新增/保存"时才使用
  var pendingOAuthToken = null;
  let currentChatPlatform = "feishu";
  let chSaving = false;
  let chPairingLoading = false;
  let chApprovedLoading = false;
  let chGroupAdding = false;
  let chPairingApprovingCode = "";
  let chPairingRejectingCode = "";
  let chApprovedRemovingKey = "";
  let chPairingRequests = [];
  let chApprovedEntries = [];
  let wecomSaving = false;
  let dingtalkSaving = false;
  let qqSaving = false;
  let kimiSaving = false;
  let searchSaving = false;
  let advSaving = false;
  let cliOperating = false;
  let cliEnabled = false;
  let appearanceSaving = false;
  let backupRestoring = false;
  let backupResetting = false;
  let backupHasLastKnownGood = false;
  let gatewayState = "stopped";
  let gatewayOperating = false;
  let gatewayStateTimer = null;
  let currentLang = "en";
  let initialTab = "channels";
  let initialChatPlatform = "weixin";
  let startupNotice = "";
  const CHAT_PLATFORM_PANEL_IDS = {
    feishu: "chatPlatformFeishu",
    weixin: "chatPlatformWeixin",
    wecom: "chatPlatformWecom",
    dingtalk: "chatPlatformDingtalk",
    kimi: "chatPlatformKimi",
    qqbot: "chatPlatformQqbot",
  };
  const TAB_ALIAS_MAP = {
    channel: "channels",
    chat: "channels",
    feishu: "channels",
    wecom: "channels",
    dingtalk: "channels",
    "dingtalk-connector": "channels",
    kimi: "channels",
    qq: "channels",
    qqbot: "channels",
  };

  // ── 语言 ──

  function detectLang() {
    const params = new URLSearchParams(window.location.search);
    const lang = params.get("lang");
    const rawTab = String(params.get("tab") || "").trim();
    if (lang && I18N[lang]) {
      currentLang = lang;
    } else {
      const browserLang = String(navigator.language || "").toLowerCase();
      currentLang = browserLang.startsWith("zh") ? "zh" : "en";
    }
    const notice = params.get("notice");
    initialTab = normalizeTabName(rawTab || "channels");
    initialChatPlatform = inferChatPlatformFromTab(rawTab) || "weixin";
    startupNotice = notice || "";
  }

  function t(key) {
    return (I18N[currentLang] && I18N[currentLang][key]) || I18N.en[key] || key;
  }

  function applyI18n() {
    document.title = t("title");
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    // placeholder 国际化
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
    });
    if (els.btnChAccessRefresh) {
      els.btnChAccessRefresh.setAttribute("title", t("feishu.refreshPairing"));
      els.btnChAccessRefresh.setAttribute("aria-label", t("feishu.refreshPairing"));
    }
    if (els.btnWecomAccessRefresh) {
      els.btnWecomAccessRefresh.setAttribute("title", t("feishu.refreshPairing"));
      els.btnWecomAccessRefresh.setAttribute("aria-label", t("feishu.refreshPairing"));
    }
    if (els.btnChAccessAddGroup) {
      els.btnChAccessAddGroup.setAttribute("title", t("feishu.addGroup"));
      els.btnChAccessAddGroup.setAttribute("aria-label", t("feishu.addGroup"));
    }
  }

  // ── Tab 切换 ──

  // 兼容历史 tab 参数别名，确保外部深链都能落到正确面板。
  function normalizeTabName(tabName) {
    var raw = String(tabName || "").trim();
    if (!raw) return "provider";
    return TAB_ALIAS_MAP[raw] || raw;
  }

  // 兼容 feishu / dingtalk / qq / qqbot 这类历史入口，把它们映射到远程控制子平台。
  function normalizeChatPlatformName(platformName) {
    var raw = String(platformName || "").trim().toLowerCase();
    if (raw === "weixin" || raw === "wechat" || raw === "openclaw-weixin") return "weixin";
    if (raw === "wecom" || raw === "wechat-work" || raw === "wecom-openclaw-plugin") return "wecom";
    if (raw === "dingtalk" || raw === "dingtalk-connector") return "dingtalk";
    if (raw === "qq" || raw === "qqbot") return "qqbot";
    if (raw === "kimi") return "kimi";
    return "feishu";
  }

  // 当外部直接传 feishu / dingtalk / qqbot 这类 tab 时，自动选中对应子平台。
  function inferChatPlatformFromTab(tabName) {
    var raw = String(tabName || "").trim().toLowerCase();
    if (
      raw === "feishu" ||
      raw === "weixin" ||
      raw === "wechat" ||
      raw === "openclaw-weixin" ||
      raw === "wecom" ||
      raw === "wecom-openclaw-plugin" ||
      raw === "dingtalk" ||
      raw === "dingtalk-connector" ||
      raw === "kimi" ||
      raw === "qq" ||
      raw === "qqbot"
    ) {
      return normalizeChatPlatformName(raw);
    }
    return "";
  }

  // 远程控制页内部的二级平台切换。
  function switchChatPlatform(platformName) {
    var target = normalizeChatPlatformName(platformName);
    currentChatPlatform = target;

    els.chatPlatformItems.forEach(function (item) {
      var active = item.dataset.chatPlatform === target;
      item.classList.toggle("active", active);
    });

    els.chatPlatformButtons.forEach(function (button) {
      var active = button.dataset.chatPlatform === target;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    els.chatPlatformPanels.forEach(function (panel) {
      panel.classList.toggle("active", panel.id === CHAT_PLATFORM_PANEL_IDS[target]);
    });

    if (target === "feishu" || target === "wecom") {
      updateChPairingSectionVisibility();
      updateChGroupAllowFromState();
      refreshChPairingPanels({ silent: true });
    }
  }

  function switchTab(tabName) {
    var rawTarget = String(tabName || "").trim();
    var target = normalizeTabName(tabName);
    var found = false;
    els.navItems.forEach((item) => {
      if (item.dataset.tab === target) found = true;
    });
    if (!found) target = "provider";

    els.navItems.forEach((item) => {
      item.classList.toggle("active", item.dataset.tab === target);
    });
    els.tabPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.id === "tab" + capitalize(target));
    });

    if (target === "channels") {
      switchChatPlatform(inferChatPlatformFromTab(rawTarget) || currentChatPlatform);
    }

    if (target === "backup") {
      loadBackupData();
      refreshGatewayState();
    }

    if (target === "about") {
      loadAboutInfo();
    }
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ── Provider 切换 ──

  function getSubPlatform() {
    const checked = document.querySelector('input[name="subPlatform"]:checked');
    return checked ? checked.value : "kimi-code";
  }

  // 根据 provider + subPlatform 查找已保存的配置
  // overrideKey: 编辑已有模型时传入真实 providerKey，跳过推断
  function lookupSavedProvider(provider, subPlatform, overrideKey) {
    if (overrideKey && savedProviders[overrideKey]) {
      return savedProviders[overrideKey];
    }
    if (provider === "moonshot") {
      var sub = subPlatform || getSubPlatform();
      var provKey = sub === "kimi-code" ? "kimi-coding" : "moonshot";
      return savedProviders[provKey] || null;
    }
    // Custom 预设：用预设的 providerKey 查找已保存配置
    if (provider === "custom") {
      var presetKey = els.customPreset.value;
      var preset = presetKey ? CUSTOM_PRESETS[presetKey] : null;
      if (preset) {
        return savedProviders[preset.providerKey] || null;
      }
      return savedProviders["custom"] || null;
    }
    return savedProviders[provider] || null;
  }

  // 用已保存的配置回填 UI（apiKey、model、custom 字段）
  // overrideKey: 编辑模式下传入真实 providerKey
  function fillSavedProviderFields(provider, subPlatform, overrideKey) {
    var saved = lookupSavedProvider(provider, subPlatform, overrideKey);
    if (!saved) {
      els.apiKeyInput.value = "";
      return;
    }
    els.apiKeyInput.value = saved.apiKey || "";

    // 回填模型列表和选中项
    if (provider !== "custom" && saved.configuredModels && saved.configuredModels.length) {
      var merged = buildMergedModelList(saved.configuredModels, provider, subPlatform);
      if (merged.length) populateModels(merged);
    }

    // Custom 专属字段
    if (provider === "custom") {
      if (saved.baseURL) els.baseURLInput.value = saved.baseURL;
      if (saved.api) {
        var apiRadio = document.querySelector('input[name="apiType"][value="' + saved.api + '"]');
        if (apiRadio) apiRadio.checked = true;
      }
    }
  }

  function switchProvider(provider) {
    currentProvider = provider;
    const config = PROVIDERS[provider];

    $$(".provider-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.provider === provider);
    });

    els.apiKeyInput.placeholder = config.placeholder;
    hideMsg();

    updatePlatformLink();
    toggleEl(els.subPlatformGroup, config.hasSubPlatform === true);

    const isCustom = provider === "custom";
    // 预设下拉仅 Custom tab 显示
    toggleEl(els.customPresetGroup, isCustom);

    if (isCustom) {
      els.customPreset.value = "__placeholder__";
      els.supportImageCheckbox.checked = true;
      applyCustomPreset("__placeholder__");
    } else {
      toggleEl(els.baseURLGroup, false);
      toggleEl(els.modelInputGroup, false);
      toggleEl(els.apiTypeGroup, false);
      toggleEl(els.imageSupportGroup, false);
      toggleEl(els.customModelInputGroup, false);
      toggleEl(els.modelSelectGroup, true);
      els.btnSave.disabled = false;
      updateModels();
    }

    updateOAuthVisibility();

    // 新增/编辑模式下始终显示别名
    toggleEl(els.modelAliasGroup, true);

    // 从缓存回填已保存的 provider 配置
    fillSavedProviderFields(provider);
  }

  // 自定义 Model ID 哨兵值（下拉最后一项）
  var CUSTOM_MODEL_SENTINEL = "__custom__";

  // 根据预设切换 Custom tab 的字段显隐
  function applyCustomPreset(presetKey) {
    var preset = CUSTOM_PRESETS[presetKey];

    if (presetKey === "__placeholder__") {
      // 占位状态：隐藏所有字段，禁用保存按钮
      toggleEl(els.baseURLGroup, false);
      toggleEl(els.apiTypeGroup, false);
      toggleEl(els.imageSupportGroup, false);
      toggleEl(els.modelInputGroup, false);
      toggleEl(els.modelSelectGroup, false);
      toggleEl(els.customModelInputGroup, false);
      toggleEl(els.apiKeyGroup, true);
      els.btnSave.disabled = true;
      updatePlatformLink();
    } else if (preset) {
      // 预设模式：隐藏手动字段
      toggleEl(els.apiTypeGroup, false);
      toggleEl(els.imageSupportGroup, false);
      toggleEl(els.modelInputGroup, false);
      toggleEl(els.baseURLGroup, false);
      toggleEl(els.apiKeyGroup, true);

      // 无预设模型列表时直接显示自定义输入框，跳过空下拉
      var hasModels = preset.models && preset.models.length > 0;
      toggleEl(els.modelSelectGroup, hasModels);
      toggleEl(els.customModelInputGroup, !hasModels);

      els.apiKeyInput.placeholder = preset.placeholder;
      els.customModelInput.value = "";
      if (hasModels) populatePresetModels(preset.models);
      els.btnSave.disabled = false;
      updatePlatformLink();
    } else {
      // 手动模式：恢复原始 Custom 行为
      toggleEl(els.baseURLGroup, true);
      toggleEl(els.apiTypeGroup, true);
      toggleEl(els.imageSupportGroup, true);
      toggleEl(els.modelInputGroup, true);
      toggleEl(els.modelSelectGroup, false);
      toggleEl(els.customModelInputGroup, false);
      toggleEl(els.apiKeyGroup, true);

      els.apiKeyInput.placeholder = "";
      els.btnSave.disabled = false;
      updatePlatformLink();
    }
  }

  // 填充预设模型列表，末尾追加"自定义模型"选项
  function populatePresetModels(models) {
    populateModels(models);
    var opt = document.createElement("option");
    opt.value = CUSTOM_MODEL_SENTINEL;
    opt.textContent = t("provider.customModelOption");
    els.modelSelect.appendChild(opt);
  }

  // 模型下拉切换时，判断是否显示自定义输入框
  function handleModelSelectChange() {
    // custom provider 手动模式（无预设）不走这里
    if (currentProvider === "custom" && !els.customPreset.value) return;
    var isCustomModel = els.modelSelect.value === CUSTOM_MODEL_SENTINEL;
    toggleEl(els.customModelInputGroup, isCustomModel);
    if (isCustomModel) {
      els.customModelInput.focus();
    }
  }

  function updatePlatformLink() {
    var url = PROVIDERS[currentProvider].platformUrl || "";
    if (currentProvider === "moonshot") {
      url = SUB_PLATFORM_URLS[getSubPlatform()] || "";
    }
    // Custom 预设的平台链接
    if (currentProvider === "custom") {
      var preset = CUSTOM_PRESETS[els.customPreset.value];
      url = preset ? preset.platformUrl : "";
    }
    if (url) {
      // Moonshot 子平台显示带平台名的链接文本
      var linkKey = currentProvider === "moonshot"
        ? "provider.getKey." + getSubPlatform()
        : "provider.getKey";
      els.platformLink.textContent = t(linkKey);
      els.platformLink.dataset.url = url;
      els.platformLink.classList.remove("hidden");
    } else {
      els.platformLink.classList.add("hidden");
    }
  }

  function updateModels() {
    const config = PROVIDERS[currentProvider];
    if (currentProvider === "moonshot" && getSubPlatform() === "kimi-code") {
      populatePresetModels(KIMI_CODE_MODELS);
    } else {
      populatePresetModels(config.models);
    }
  }

  // 控制 OAuth 登录区域显隐（仅 kimi-code 子平台）
  function updateOAuthVisibility() {
    var isOAuth = currentProvider === "moonshot" && getSubPlatform() === "kimi-code";
    toggleEl(els.oauthGroup, isOAuth);
    if (isOAuth) {
      // OAuth 模式：API Key / Model 收入折叠高级选项
      els.oauthAdvanced.classList.remove("hidden", "details-advanced--plain");
      els.oauthAdvanced.removeAttribute("open");
      els.platformLink.classList.add("hidden");
      // 新增模式下只检查登录状态，不加载用量
      if (editorState.mode === "add") {
        toggleEl(els.usagePanel, false);
        checkOAuthStatusOnly();
      } else {
        checkOAuthStatus();
      }
    } else {
      // 非 OAuth 模式：展开且隐藏折叠外观，字段正常显示
      els.oauthAdvanced.classList.remove("hidden");
      els.oauthAdvanced.classList.add("details-advanced--plain");
      els.oauthAdvanced.setAttribute("open", "");
      toggleEl(els.usagePanel, false);
    }
  }

  // 仅检查登录状态，切换按钮显隐（不加载用量，用于新增模式）
  async function checkOAuthStatusOnly() {
    if (!window.oneclaw?.kimiOAuthStatus) return;
    try {
      var status = await window.oneclaw.kimiOAuthStatus();
      if (status && status.loggedIn) {
        toggleEl(els.btnOAuth, false);
        toggleEl(els.btnOAuthLogout, true);
      } else {
        toggleEl(els.btnOAuth, true);
        toggleEl(els.btnOAuthLogout, false);
      }
    } catch { }
  }

  // 检查当前 OAuth 登录状态，切换登录/退出按钮
  async function checkOAuthStatus() {
    if (!window.oneclaw?.kimiOAuthStatus) return;
    try {
      var status = await window.oneclaw.kimiOAuthStatus();
      if (status && status.loggedIn) {
        toggleEl(els.btnOAuth, false);
        toggleEl(els.btnOAuthLogout, true);
        loadUsage();
      } else {
        toggleEl(els.btnOAuth, true);
        toggleEl(els.btnOAuthLogout, false);
        // 即使没有 OAuth 登录，也尝试加载用量（后端会用 config 中的 API key）
        loadUsage();
      }
    } catch {
      // 获取状态失败时默认显示登录按钮
    }
  }

  function populateModels(models) {
    els.modelSelect.innerHTML = "";
    models.forEach((m) => {
      var opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      els.modelSelect.appendChild(opt);
    });
  }

  // 在模型下拉中选中指定 model，不存在则追加
  function selectOrAppendModel(modelID) {
    for (var i = 0; i < els.modelSelect.options.length; i++) {
      if (els.modelSelect.options[i].value === modelID) {
        els.modelSelect.selectedIndex = i;
        return;
      }
    }
    var opt = document.createElement("option");
    opt.value = modelID;
    opt.textContent = modelID;
    els.modelSelect.appendChild(opt);
    els.modelSelect.value = modelID;
  }

  // 合并预设模型列表和已配置模型列表（去重）
  function mergePresetAndConfigModels(presetModels, configModels) {
    var seen = {};
    var result = [];
    presetModels.forEach(function (m) { seen[m] = true; result.push(m); });
    configModels.forEach(function (m) { if (!seen[m]) { result.push(m); } });
    return result;
  }

  // ── 密码可见性切换（通用） ──

  function togglePasswordVisibility(e) {
    var btn = e.currentTarget;
    var wrap = btn.closest(".input-password-wrap");
    var input = wrap.querySelector("input");
    var isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    btn.querySelector(".icon-eye").classList.toggle("hidden", !isPassword);
    btn.querySelector(".icon-eye-off").classList.toggle("hidden", isPassword);
  }

  // ── Kimi OAuth 一键登录 ──

  async function handleOAuthLogin() {
    if (saving) return;
    setOAuthLoading(true);
    hideMsg();

    try {
      var result = await window.oneclaw.kimiOAuthLogin();
      if (!result.success) {
        showMsg(result.message || t("error.verifyFailed"), "error");
        setOAuthLoading(false);
        return;
      }

      // 暂存真实 token，点击"新增/保存"时才验证和保存
      pendingOAuthToken = result.accessToken;
      setOAuthLoading(false);
      showOAuthSuccess();
    } catch (err) {
      showMsg(t("error.connection") + (err.message || "Unknown error"), "error");
      setOAuthLoading(false);
    }
  }

  // 取消 OAuth 轮询
  function handleOAuthCancel() {
    if (window.oneclaw?.kimiOAuthCancel) {
      window.oneclaw.kimiOAuthCancel();
    }
    setOAuthLoading(false);
    els.oauthStatus.classList.add("hidden");
  }

  // 退出 OAuth 登录
  async function handleOAuthLogout() {
    if (window.oneclaw?.kimiOAuthLogout) {
      await window.oneclaw.kimiOAuthLogout();
    }
    pendingOAuthToken = null;
    // 隐藏退出按钮，恢复登录按钮
    toggleEl(els.btnOAuthLogout, false);
    toggleEl(els.btnOAuth, true);
    toggleEl(els.usagePanel, false);
    els.oauthStatus.classList.add("hidden");
    els.oauthStatus.classList.remove("success");
    showToast(t("provider.oauthLogout"));
  }

  function setOAuthLoading(loading) {
    els.btnOAuth.disabled = loading;
    els.btnOAuthText.classList.toggle("hidden", loading);
    els.btnOAuthSpinner.classList.toggle("hidden", !loading);
    toggleEl(els.btnOAuthCancel, loading);
    if (loading) {
      els.oauthStatus.textContent = t("provider.oauthWaiting");
      els.oauthStatus.classList.remove("hidden", "success");
    }
  }

  function showOAuthSuccess() {
    els.oauthStatus.textContent = t("provider.oauthSuccess");
    els.oauthStatus.classList.remove("hidden");
    els.oauthStatus.classList.add("success");
    // OAuth 成功后显示退出按钮
    toggleEl(els.btnOAuth, false);
    toggleEl(els.btnOAuthLogout, true);
  }

  // ── Kimi 用量查询 ──

  // 格式化剩余时间（秒 → "Xh后重置" / "Xm后重置"）
  function formatResetDuration(seconds) {
    if (!seconds || seconds <= 0) return "";
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return h + (currentLang === "zh" ? "小时后重置" : "h reset");
    if (m > 0) return m + (currentLang === "zh" ? "分钟后重置" : "m reset");
    return (currentLang === "zh" ? "即将重置" : "resetting soon");
  }

  // 从 ISO 时间戳计算剩余秒数
  function parseResetAt(val) {
    if (!val) return 0;
    try {
      // 截断纳秒/微秒 → 毫秒（JS Date 仅支持 3 位小数）
      var str = String(val);
      if (str.indexOf(".") !== -1 && str.endsWith("Z")) {
        var parts = str.slice(0, -1).split(".");
        str = parts[0] + "." + parts[1].slice(0, 3) + "Z";
      }
      var dt = new Date(str);
      var diff = (dt.getTime() - Date.now()) / 1000;
      return diff > 0 ? Math.round(diff) : 0;
    } catch { return 0; }
  }

  // 从 usage payload 中提取 reset 提示秒数
  function extractResetSeconds(data) {
    // 优先 reset_at / resetAt
    var keys = ["reset_at", "resetAt", "reset_time", "resetTime"];
    for (var i = 0; i < keys.length; i++) {
      if (data[keys[i]]) return parseResetAt(data[keys[i]]);
    }
    // 回退 reset_in / resetIn / ttl / window
    var durKeys = ["reset_in", "resetIn", "ttl", "window"];
    for (var j = 0; j < durKeys.length; j++) {
      var v = parseInt(data[durKeys[j]], 10);
      if (v > 0) return v;
    }
    return 0;
  }

  // 设置用量卡片数据
  function setUsageCard(percentEl, resetEl, barEl, used, limit, resetSeconds) {
    if (!limit || limit <= 0) {
      percentEl.textContent = "—";
      resetEl.textContent = "";
      barEl.style.width = "0";
      return;
    }
    var pct = Math.round((used / limit) * 100);
    percentEl.textContent = pct + "%";
    resetEl.textContent = formatResetDuration(resetSeconds);
    barEl.style.width = Math.min(pct, 100) + "%";
    barEl.classList.remove("warn", "danger");
    if (pct >= 90) barEl.classList.add("danger");
    else if (pct >= 70) barEl.classList.add("warn");
  }

  // 加载用量数据（仅编辑模式 + kimi-code 子平台展示）
  async function loadUsage() {
    if (!window.oneclaw?.kimiGetUsage) return;
    if (editorState.mode === "add") return;
    if (!(currentProvider === "moonshot" && getSubPlatform() === "kimi-code")) return;
    els.btnUsageRefresh.classList.add("spinning");
    try {
      var result = await window.oneclaw.kimiGetUsage();
      // 异步返回后再次校验：用户可能已切走或进入新增模式
      if (editorState.mode === "add") return;
      if (!(currentProvider === "moonshot" && getSubPlatform() === "kimi-code")) return;
      if (!result.success || !result.data) {
        setUsageCard(els.usageWeeklyPercent, els.usageWeeklyReset, els.usageWeeklyBar, 0, 0, 0);
        setUsageCard(els.usageLimitPercent, els.usageLimitReset, els.usageLimitBar, 0, 0, 0);
        els.usageLimitTitle.textContent = t("provider.usageLimit");
        els.usageRefreshTime.textContent = "";
        toggleEl(els.usagePanel, true);
        return;
      }
      var payload = result.data;

      // 总用量（usage 字段 = 周用量）
      var usage = payload.usage || {};
      var usedW = parseInt(usage.used, 10) || 0;
      var limitW = parseInt(usage.limit, 10) || 0;
      if (usage.remaining !== undefined && !usage.used) {
        usedW = limitW - (parseInt(usage.remaining, 10) || 0);
      }
      var resetW = extractResetSeconds(usage);
      setUsageCard(els.usageWeeklyPercent, els.usageWeeklyReset, els.usageWeeklyBar, usedW, limitW, resetW);

      // 频限明细（limits 数组第一项）
      var limits = Array.isArray(payload.limits) ? payload.limits : [];
      if (limits.length > 0) {
        var item = limits[0];
        var detail = (item.detail && typeof item.detail === "object") ? item.detail : item;
        var usedL = parseInt(detail.used, 10) || 0;
        var limitL = parseInt(detail.limit, 10) || 0;
        if (detail.remaining !== undefined && !detail.used) {
          usedL = limitL - (parseInt(detail.remaining, 10) || 0);
        }
        var resetL = extractResetSeconds(detail);
        // 动态标题：从 window.duration + timeUnit 推导
        var window_ = (item.window && typeof item.window === "object") ? item.window : {};
        var dur = parseInt(window_.duration || item.duration || detail.duration, 10) || 0;
        var unit = window_.timeUnit || item.timeUnit || detail.timeUnit || "";
        if (dur > 0) {
          var label;
          if (unit.indexOf("MINUTE") !== -1) {
            label = (dur >= 60 && dur % 60 === 0)
              ? (currentLang === "zh" ? (dur / 60) + "小时用量" : (dur / 60) + "h usage")
              : (currentLang === "zh" ? dur + "分钟用量" : dur + "m usage");
          } else if (unit.indexOf("HOUR") !== -1) {
            label = currentLang === "zh" ? dur + "小时用量" : dur + "h usage";
          } else if (unit.indexOf("DAY") !== -1) {
            label = currentLang === "zh" ? dur + "天用量" : dur + "d usage";
          } else {
            label = dur + "s";
          }
          els.usageLimitTitle.textContent = label;
        } else {
          els.usageLimitTitle.textContent = t("provider.usageLimit");
        }
        setUsageCard(els.usageLimitPercent, els.usageLimitReset, els.usageLimitBar, usedL, limitL, resetL);
      }

      // 刷新时间
      var now = new Date();
      var timeStr = now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");
      els.usageRefreshTime.textContent = t("provider.usageRefreshed") + timeStr;

      toggleEl(els.usagePanel, true);
    } catch {
      setUsageCard(els.usageWeeklyPercent, els.usageWeeklyReset, els.usageWeeklyBar, 0, 0, 0);
      setUsageCard(els.usageLimitPercent, els.usageLimitReset, els.usageLimitBar, 0, 0, 0);
      els.usageRefreshTime.textContent = "";
      toggleEl(els.usagePanel, true);
    } finally {
      els.btnUsageRefresh.classList.remove("spinning");
    }
  }

  // ── 保存 Provider 配置 ──

  // kimi-code OAuth 已登录：退出按钮可见 + kimi-code 子平台
  function isKimiCodeOAuthActive() {
    return currentProvider === "moonshot"
      && getSubPlatform() === "kimi-code"
      && els.btnOAuthLogout
      && !els.btnOAuthLogout.classList.contains("hidden");
  }

  async function handleSave() {
    if (saving) return;

    var kimiOAuth = isKimiCodeOAuthActive();
    var apiKey = els.apiKeyInput.value.trim();
    // kimi-code OAuth：优先使用暂存的真实 token（登录后首次保存）
    if (kimiOAuth && pendingOAuthToken) {
      apiKey = pendingOAuthToken;
    }
    // kimi-code OAuth 模式下 apiKey 可能是 "proxy-managed"（已保存过），不需要用户手动输入
    if (!apiKey && !kimiOAuth) {
      showMsg(t("error.noKey"), "error");
      return;
    }

    var params = buildParams(apiKey);
    if (!params) return;

    setSaving(true);
    hideMsg();

    try {
      // kimi-code OAuth 时通过代理验证，其他走直连验证
      var verifyParams = kimiOAuth
        ? Object.assign({}, params, { verifyViaProxy: true })
        : params;
      var verifyResult = await window.oneclaw.settingsVerifyKey(verifyParams);
      if (!verifyResult.success) {
        // kimi-code OAuth 首次保存：区分 401（无会员）和其他错误
        if (kimiOAuth && pendingOAuthToken) {
          var is401 = verifyResult.message && /\b401\b/.test(verifyResult.message);
          if (is401) {
            pendingOAuthToken = null;
            if (window.oneclaw.kimiOAuthLogout) window.oneclaw.kimiOAuthLogout();
            showOAuthNoMembership();
            setSaving(false);
            return;
          }
        }
        showMsg(verifyResult.message || t("error.verifyFailed"), "error");
        setSaving(false);
        return;
      }

      // 构造保存 payload，注入 action / modelKey / 别名
      var payload = buildSavePayload(params);
      var alias = (els.modelAlias.value || "").trim();
      if (alias) payload.modelAlias = alias;
      payload.action = editorState.mode === "edit" ? "update" : "add";
      if (editorState.mode === "edit") {
        payload.modelKey = editorState.modelKey;
      }
      payload.setAsDefault = editorState.mode === "edit";
      // kimi-code OAuth：有真实 token 时后端正常处理，无真实 token 时保留已有代理配置
      if (kimiOAuth && !pendingOAuthToken) payload.keepProxyAuth = true;

      // 再保存
      var saveResult = await window.oneclaw.settingsSaveProvider(payload);
      if (!saveResult.success) {
        showMsg(saveResult.message || "Save failed", "error");
        setSaving(false);
        return;
      }

      setSaving(false);
      pendingOAuthToken = null;
      showToast(t("common.saved"));

      // 保存成功后刷新 savedProviders 缓存
      try {
        var refreshResult = await window.oneclaw.settingsGetConfig();
        if (refreshResult.success && refreshResult.data && refreshResult.data.savedProviders) {
          savedProviders = refreshResult.data.savedProviders;
        }
      } catch { }

      // 刷新模型列表
      await renderModelList();
    } catch (err) {
      showMsg(t("error.connection") + (err.message || "Unknown error"), "error");
      setSaving(false);
    }
  }

  function buildParams(apiKey) {
    var params = { provider: currentProvider, apiKey: apiKey };

    if (currentProvider === "custom") {
      var presetKey = els.customPreset.value;
      if (presetKey === "__placeholder__") return null;
      if (presetKey) {
        // 自定义输入框可见（含空 models 预设）或选了"自定义模型"时用输入框
        if (!els.customModelInputGroup.classList.contains("hidden") || els.modelSelect.value === CUSTOM_MODEL_SENTINEL) {
          var customModel = (els.customModelInput.value || "").trim();
          if (!customModel) { showMsg(t("error.noModelId"), "error"); return null; }
          params.modelID = customModel;
        } else {
          params.modelID = els.modelSelect.value;
        }
        params.customPreset = presetKey;
      } else {
        // 手动模式
        var baseURL = (els.baseURLInput.value || "").trim();
        var modelID = (els.modelInput.value || "").trim();
        if (!baseURL) { showMsg(t("error.noBaseUrl"), "error"); return null; }
        if (!modelID) { showMsg(t("error.noModelId"), "error"); return null; }
        params.baseURL = baseURL;
        params.modelID = modelID;
        params.apiType = document.querySelector('input[name="apiType"]:checked').value;
        params.supportImage = els.supportImageCheckbox.checked;
      }
    } else {
      // 非 custom provider：支持自定义模型输入
      if (els.modelSelect.value === CUSTOM_MODEL_SENTINEL) {
        var customModel = (els.customModelInput.value || "").trim();
        if (!customModel) { showMsg(t("error.noModelId"), "error"); return null; }
        params.modelID = customModel;
      } else {
        params.modelID = els.modelSelect.value;
      }
    }

    if (currentProvider === "moonshot") {
      params.subPlatform = getSubPlatform();
    }

    return params;
  }

  function buildSavePayload(params) {
    var payload = {
      provider: params.provider,
      apiKey: params.apiKey,
      modelID: params.modelID,
      baseURL: params.baseURL || "",
      api: params.apiType || "",
      subPlatform: params.subPlatform || "",
      customPreset: params.customPreset || "",
    };
    // Custom 专属：图像支持
    if (params.supportImage !== undefined) {
      payload.supportImage = params.supportImage;
    }
    return payload;
  }

  // ── Channels ──

  // 频道消息框
  function showChMsg(msg, type) {
    els.chMsgBox.textContent = msg;
    els.chMsgBox.className = "msg-box " + type;
  }

  function hideChMsg() {
    els.chMsgBox.classList.add("hidden");
    els.chMsgBox.textContent = "";
    els.chMsgBox.className = "msg-box hidden";
  }

  function setChSaving(loading) {
    chSaving = loading;
  }

  // 转义文本，避免将外部内容直接插入 HTML。
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // 当前访问面板只在飞书和企业微信之间切换；其它平台不复用这套配对 UI。
  function getCurrentAccessPlatform() {
    return currentChatPlatform === "wecom" ? "wecom" : "feishu";
  }

  // 根据当前平台返回访问面板所需的 DOM 引用。
  function getCurrentAccessEls() {
    if (getCurrentAccessPlatform() === "wecom") {
      return {
        enabled: els.wecomEnabled,
        dmPolicy: els.wecomDmPolicy,
        groupPolicy: els.wecomGroupPolicy,
        pairingSection: els.wecomPairingSection,
        accessEmpty: els.wecomAccessEmpty,
        accessList: els.wecomAccessList,
        accessRefresh: els.btnWecomAccessRefresh,
        accessAddGroup: null,
      };
    }
    return {
      enabled: els.chEnabled,
      dmPolicy: els.chDmPolicy,
      groupPolicy: els.chGroupPolicy,
      pairingSection: els.chPairingSection,
      accessEmpty: els.chAccessEmpty,
      accessList: els.chAccessList,
      accessRefresh: els.btnChAccessRefresh,
      accessAddGroup: els.btnChAccessAddGroup,
    };
  }

  // 当前访问面板的状态提示要回写到各自平台的消息框，避免串台。
  function showCurrentAccessMsg(msg, type) {
    if (getCurrentAccessPlatform() === "wecom") {
      showWecomMsg(msg, type);
      return;
    }
    showChMsg(msg, type);
  }

  // 清空当前访问面板消息。
  function hideCurrentAccessMsg() {
    if (getCurrentAccessPlatform() === "wecom") {
      hideWecomMsg();
      return;
    }
    hideChMsg();
  }

  // 当前平台是否已启用。
  function isCurrentAccessEnabled() {
    var accessEls = getCurrentAccessEls();
    return !!(accessEls.enabled && accessEls.enabled.checked);
  }

  // 读取当前访问面板对应平台的私聊策略。
  function getCurrentAccessDmPolicy() {
    var accessEls = getCurrentAccessEls();
    var value = accessEls.dmPolicy ? String(accessEls.dmPolicy.value || "").trim() : "";
    return value === "open" ? "open" : "pairing";
  }

  // 读取当前访问面板对应平台的群聊策略。
  function getCurrentAccessGroupPolicy() {
    var accessEls = getCurrentAccessEls();
    var value = accessEls.groupPolicy ? String(accessEls.groupPolicy.value || "").trim() : "";
    if (value === "open" || value === "disabled" || value === "allowlist") return value;
    return getCurrentAccessPlatform() === "wecom" ? "open" : "allowlist";
  }

  // 当前访问面板是否处于 pairing 模式。
  function isCurrentAccessPairingMode() {
    return getCurrentAccessDmPolicy() === "pairing";
  }

  // 当前访问面板是否处于群聊白名单模式。
  function isCurrentAccessGroupAllowlistMode() {
    return getCurrentAccessGroupPolicy() === "allowlist";
  }

  // 访问面板展示条件：私聊配对或群聊白名单任一开启。
  function isCurrentAccessPanelMode() {
    return isCurrentAccessPairingMode() || isCurrentAccessGroupAllowlistMode();
  }

  // 同步待审批/已授权刷新按钮状态。
  function updateChAccessRefreshState() {
    var accessEls = getCurrentAccessEls();
    var loading = chPairingLoading || chApprovedLoading;
    var busy = loading || chGroupAdding || !!chPairingApprovingCode || !!chPairingRejectingCode || !!chApprovedRemovingKey;
    if (accessEls.accessRefresh) {
      accessEls.accessRefresh.disabled = busy;
    }
    if (accessEls.accessAddGroup) {
      var allowAdd = isCurrentAccessEnabled() && isCurrentAccessGroupAllowlistMode() && !busy;
      accessEls.accessAddGroup.disabled = !allowAdd;
    }
  }

  // 切换待审批列表加载状态。
  function setChPairingLoading(loading) {
    chPairingLoading = loading;
    updateChAccessRefreshState();
  }

  // 切换已授权列表加载状态。
  function setChApprovedLoading(loading) {
    chApprovedLoading = loading;
    updateChAccessRefreshState();
  }

  // 单行展示名称：有名字就只显示名字，否则显示 ID。
  function formatChEntryDisplay(name, id) {
    var trimmedName = String(name || "").trim();
    var trimmedId = String(id || "").trim();
    return trimmedName || trimmedId;
  }

  // 渲染合并后的待审批+已授权列表（待审批固定在顶部）。
  function renderChAccessEntries() {
    var accessEls = getCurrentAccessEls();
    var listEl = accessEls.accessList;
    var emptyEl = accessEls.accessEmpty;
    if (!listEl || !emptyEl) return;

    // 批准图标（勾号）
    var approveIcon = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5L6.5 12L13 4"/></svg>';
    // 拒绝图标（叉号）
    var rejectIcon = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 4L12 12"/><path d="M12 4L4 12"/></svg>';
    // 删除图标（垃圾桶）
    var removeIcon = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M4.5 4.5L5 13.5a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-9"/></svg>';

    var pendingRows = (Array.isArray(chPairingRequests) ? chPairingRequests : []).map(function (item) {
      var code = String(item.code || "");
      var isApproving = chPairingApprovingCode === code;
      var isRejecting = chPairingRejectingCode === code;
      return {
        display: formatChEntryDisplay(item.name, item.id),
        meta: t("feishu.statusPending"),
        actions: [
          {
            icon: approveIcon,
            klass: "btn-icon success",
            title: isApproving ? t("feishu.approvingPairing") : t("feishu.approvePairing"),
            attr:
              'data-pairing-approve="' + escapeHtml(code) + '"' +
              ' data-pairing-id="' + escapeHtml(String(item.id || "")) + '"' +
              ' data-pairing-name="' + escapeHtml(String(item.name || "")) + '"',
            disabled: isApproving || isRejecting,
          },
          {
            icon: rejectIcon,
            klass: "btn-icon danger",
            title: isRejecting ? t("feishu.rejectingPairing") : t("feishu.rejectPairing"),
            attr:
              'data-pairing-reject="' + escapeHtml(code) + '"' +
              ' data-pairing-id="' + escapeHtml(String(item.id || "")) + '"' +
              ' data-pairing-name="' + escapeHtml(String(item.name || "")) + '"',
            disabled: isApproving || isRejecting,
          },
        ],
      };
    });
    var approvedRows = (Array.isArray(chApprovedEntries) ? chApprovedEntries : []).map(function (entry) {
      var kind = String(entry.kind || "user");
      var id = String(entry.id || "");
      var key = kind + ":" + id;
      var isRemoving = chApprovedRemovingKey === key;
      var statusText = kind === "group" ? t("feishu.statusApprovedGroup") : t("feishu.statusApprovedUser");
      return {
        display: formatChEntryDisplay(entry.name, entry.id),
        meta: statusText,
        actions: [
          {
            icon: removeIcon,
            klass: "btn-icon danger",
            title: t("feishu.removeApproved"),
            attr:
              'data-approved-remove-kind="' + escapeHtml(kind) + '"' +
              ' data-approved-remove-id="' + escapeHtml(id) + '"',
            disabled: isRemoving,
          },
        ],
      };
    });
    var rows = pendingRows.concat(approvedRows);

    if (rows.length === 0) {
      listEl.innerHTML = "";
      toggleEl(listEl, false);
      toggleEl(emptyEl, true);
      return;
    }

    toggleEl(emptyEl, false);
    toggleEl(listEl, true);

    listEl.innerHTML = rows.map(function (row) {
      var actionsHtml = (Array.isArray(row.actions) ? row.actions : []).map(function (action) {
        return [
          '<button type="button" class="' + action.klass + '" title="' + escapeHtml(action.title) + '" ' + action.attr + (action.disabled ? " disabled" : "") + ">",
          "  " + action.icon,
          "</button>",
        ].join("");
      }).join("");
      return [
        '<div class="pairing-item">',
        '  <div class="pairing-item-main">',
        '    <div class="pairing-id">' +
        escapeHtml(row.display) +
        '<span class="pairing-meta-inline">' + escapeHtml(row.meta) + "</span></div>",
        "  </div>",
        '  <div class="pairing-item-actions">' + actionsHtml + "</div>",
        "</div>",
      ].join("");
    }).join("");
  }

  // 读取飞书待审批列表（仅在飞书开关启用后展示）。
  async function loadChPairingRequests(options) {
    var silent = !!(options && options.silent);
    if (!isCurrentAccessEnabled() || !isCurrentAccessPairingMode()) {
      chPairingRequests = [];
      chPairingApprovingCode = "";
      chPairingRejectingCode = "";
      renderChAccessEntries();
      return;
    }

    setChPairingLoading(true);
    if (!silent) hideCurrentAccessMsg();
    try {
      var result = getCurrentAccessPlatform() === "wecom"
        ? await window.oneclaw.settingsListWecomPairing()
        : await window.oneclaw.settingsListFeishuPairing();
      if (!result.success) {
        if (!silent) showCurrentAccessMsg(result.message || t("error.loadPairingFailed"), "error");
        chPairingRequests = [];
      } else {
        chPairingRequests = (result.data && result.data.requests) || [];
      }
      renderChAccessEntries();
    } catch (err) {
      chPairingRequests = [];
      renderChAccessEntries();
      if (!silent) showCurrentAccessMsg(t("error.connection") + (err.message || "Unknown error"), "error");
    } finally {
      setChPairingLoading(false);
    }
  }

  // 读取飞书已配对账号列表（仅在飞书开关启用后展示）。
  async function loadChApprovedEntries(options) {
    var silent = !!(options && options.silent);
    if (!isCurrentAccessEnabled() || !isCurrentAccessPanelMode()) {
      chApprovedEntries = [];
      renderChAccessEntries();
      return;
    }

    setChApprovedLoading(true);
    if (!silent) hideCurrentAccessMsg();
    try {
      var result = getCurrentAccessPlatform() === "wecom"
        ? await window.oneclaw.settingsListWecomApproved()
        : await window.oneclaw.settingsListFeishuApproved();
      if (!result.success) {
        if (!silent) showCurrentAccessMsg(result.message || t("error.loadApprovedFailed"), "error");
        chApprovedEntries = [];
      } else {
        chApprovedEntries = (result.data && result.data.entries) || [];
      }
      renderChAccessEntries();
    } catch (err) {
      chApprovedEntries = [];
      renderChAccessEntries();
      if (!silent) showCurrentAccessMsg(t("error.connection") + (err.message || "Unknown error"), "error");
    } finally {
      setChApprovedLoading(false);
    }
  }

  // 同步刷新飞书待审批与已配对两个列表。
  function refreshChPairingPanels(options) {
    updateChPairingSectionVisibility();
    updateChGroupAllowFromState();
    return Promise.all([
      loadChPairingRequests(options),
      loadChApprovedEntries(options),
    ]);
  }

  // 接收主进程推送的飞书待审批快照，减少“手动刷新”依赖。
  function applyChPairingStateFromPush(payload) {
    var platform = getCurrentAccessPlatform();
    var channelPayload = payload && payload.channels ? payload.channels[platform] : null;
    if (!channelPayload || !Array.isArray(channelPayload.requests)) {
      return;
    }
    var requests = channelPayload.requests
      .map(function (item) {
        return {
          code: String((item && item.code) || "").trim(),
          id: String((item && item.id) || "").trim(),
          name: String((item && item.name) || "").trim(),
          createdAt: String((item && item.createdAt) || ""),
          lastSeenAt: String((item && item.lastSeenAt) || ""),
        };
      })
      .filter(function (item) { return item.code; });
    chPairingRequests = requests;
    renderChAccessEntries();
    updateChAccessRefreshState();
  }

  // 批准指定飞书配对码，并自动刷新列表。
  async function handleChPairingApprove(code, id, name) {
    var trimmed = String(code || "").trim();
    if (!trimmed) {
      showCurrentAccessMsg(t("error.noPairingCode"), "error");
      return;
    }
    if (chPairingApprovingCode || chPairingRejectingCode) return;

    chPairingApprovingCode = trimmed;
    renderChAccessEntries();
    updateChAccessRefreshState();
    hideCurrentAccessMsg();

    try {
      var result = getCurrentAccessPlatform() === "wecom"
        ? await window.oneclaw.settingsApproveWecomPairing({
            code: trimmed,
            id: String(id || "").trim(),
            name: String(name || "").trim(),
          })
        : await window.oneclaw.settingsApproveFeishuPairing({
        code: trimmed,
        id: String(id || "").trim(),
        name: String(name || "").trim(),
      });
      if (!result.success) {
        showCurrentAccessMsg(result.message || t("error.verifyFailed"), "error");
      } else {
        showToast(t("feishu.pairingApproved"));
        await refreshChPairingPanels({ silent: true });
      }
    } catch (err) {
      showCurrentAccessMsg(t("error.connection") + (err.message || "Unknown error"), "error");
    } finally {
      chPairingApprovingCode = "";
      renderChAccessEntries();
      updateChAccessRefreshState();
    }
  }

  // 拒绝指定飞书配对码，并自动刷新列表。
  async function handleChPairingReject(code, id, name) {
    var trimmed = String(code || "").trim();
    if (!trimmed) {
      showCurrentAccessMsg(t("error.noPairingCode"), "error");
      return;
    }
    if (chPairingApprovingCode || chPairingRejectingCode) return;

    chPairingRejectingCode = trimmed;
    renderChAccessEntries();
    updateChAccessRefreshState();
    hideCurrentAccessMsg();

    try {
      var result = getCurrentAccessPlatform() === "wecom"
        ? await window.oneclaw.settingsRejectWecomPairing({
            code: trimmed,
            id: String(id || "").trim(),
            name: String(name || "").trim(),
          })
        : await window.oneclaw.settingsRejectFeishuPairing({
        code: trimmed,
        id: String(id || "").trim(),
        name: String(name || "").trim(),
      });
      if (!result.success) {
        showCurrentAccessMsg(result.message || t("error.verifyFailed"), "error");
      } else {
        showToast(t("feishu.pairingRejected"));
        await refreshChPairingPanels({ silent: true });
      }
    } catch (err) {
      showCurrentAccessMsg(t("error.connection") + (err.message || "Unknown error"), "error");
    } finally {
      chPairingRejectingCode = "";
      renderChAccessEntries();
      updateChAccessRefreshState();
    }
  }

  // 删除已授权用户/群聊，并刷新列表。
  async function handleChApprovedRemove(kind, id) {
    var entryKind = String(kind || "").trim() === "group" ? "group" : "user";
    var entryId = String(id || "").trim();
    if (!entryId) {
      showCurrentAccessMsg(t("error.removeApprovedFailed"), "error");
      return;
    }
    if (chApprovedRemovingKey) return;

    chApprovedRemovingKey = entryKind + ":" + entryId;
    renderChAccessEntries();
    updateChAccessRefreshState();
    hideCurrentAccessMsg();

    try {
      var result = getCurrentAccessPlatform() === "wecom"
        ? await window.oneclaw.settingsRemoveWecomApproved({
            kind: entryKind,
            id: entryId,
          })
        : await window.oneclaw.settingsRemoveFeishuApproved({
        kind: entryKind,
        id: entryId,
      });
      if (!result.success) {
        showCurrentAccessMsg(result.message || t("error.removeApprovedFailed"), "error");
      } else {
        showToast(t("feishu.approvedRemoved"));
        await refreshChPairingPanels({ silent: true });
      }
    } catch (err) {
      showCurrentAccessMsg(t("error.connection") + (err.message || "Unknown error"), "error");
    } finally {
      chApprovedRemovingKey = "";
      renderChAccessEntries();
      updateChAccessRefreshState();
    }
  }

  // 获取飞书启用/禁用状态
  function isChEnabled() {
    return els.chEnabled.checked;
  }

  // 读取当前私聊模式（open/pairing）。
  function getChDmPolicy() {
    var value = els.chDmPolicy ? String(els.chDmPolicy.value || "").trim() : "";
    return value === "open" ? "open" : "pairing";
  }

  // 读取当前私聊会话模式（main/per-peer/per-channel-peer/per-account-channel-peer）。
  function getChDmScope() {
    var value = els.chDmScope ? String(els.chDmScope.value || "").trim() : "";
    if (
      value === "per-peer" ||
      value === "per-channel-peer" ||
      value === "per-account-channel-peer"
    ) {
      return value;
    }
    return "main";
  }

  // 当前是否为配对模式（仅该模式下展示配对相关面板）。
  function isChPairingMode() {
    return getChDmPolicy() === "pairing";
  }

  // 当前是否为群聊白名单模式。
  function isChGroupAllowlistMode() {
    return getChGroupPolicy() === "allowlist";
  }

  // 访问列表面板展示条件：私聊配对或群聊白名单任一开启。
  function isChAccessPanelMode() {
    return isChPairingMode() || isChGroupAllowlistMode();
  }

  // 读取群聊策略（open/allowlist/disabled）。
  function getChGroupPolicy() {
    var value = els.chGroupPolicy ? String(els.chGroupPolicy.value || "").trim() : "";
    if (value === "open" || value === "disabled" || value === "allowlist") return value;
    return "allowlist";
  }

  // 校验是否为飞书群 ID（chat_id）。
  function isFeishuGroupId(value) {
    return /^oc_[A-Za-z0-9]+$/.test(String(value || "").trim());
  }

  // 从当前合并列表提取群聊白名单 ID（仅保留合法 oc_ 群 ID）。
  function getChGroupAllowFromEntries() {
    return Array.from(
      new Set(
        (Array.isArray(chApprovedEntries) ? chApprovedEntries : [])
          .filter(function (entry) { return String(entry.kind || "") === "group"; })
          .map(function (entry) { return String(entry.id || "").trim(); })
          .filter(function (entry) { return isFeishuGroupId(entry); })
      )
    );
  }

  // 根据模式切换配对面板可见性。
  function updateChPairingSectionVisibility() {
    var accessEls = getCurrentAccessEls();
    if (!accessEls.pairingSection) return;
    toggleEl(accessEls.pairingSection, isCurrentAccessEnabled() && isCurrentAccessPanelMode());
    updateChAccessRefreshState();
  }

  // 仅在群聊白名单模式下显示“添加群 ID”按钮。
  function updateChGroupAllowFromState() {
    var accessEls = getCurrentAccessEls();
    if (!accessEls.accessAddGroup) return;
    toggleEl(accessEls.accessAddGroup, getCurrentAccessPlatform() === "feishu" && isCurrentAccessGroupAllowlistMode());
    updateChAccessRefreshState();
  }

  // 打开添加群 ID 弹窗。
  function openChGroupDialog() {
    if (!els.chGroupDialog || !els.chGroupDialogInput) return;
    els.chGroupDialogInput.value = "oc_";
    toggleEl(els.chGroupDialog, true);
    setTimeout(function () {
      els.chGroupDialogInput.focus();
      els.chGroupDialogInput.select();
    }, 0);
  }

  // 关闭添加群 ID 弹窗。
  function closeChGroupDialog() {
    if (!els.chGroupDialog) return;
    toggleEl(els.chGroupDialog, false);
  }

  // 触发添加入口（仅打开弹窗，不直接请求）。
  function handleChAccessAddGroup() {
    if (!isChEnabled() || !isChGroupAllowlistMode() || chGroupAdding) return;
    hideChMsg();
    openChGroupDialog();
  }

  // 提交添加群 ID 到白名单（立即持久化并刷新列表）。
  async function handleChGroupDialogConfirm() {
    if (chGroupAdding || !els.chGroupDialogInput) return;
    var groupId = String(els.chGroupDialogInput.value || "").trim();
    if (!isFeishuGroupId(groupId)) {
      showChMsg(t("error.invalidGroupId"), "error");
      els.chGroupDialogInput.focus();
      return;
    }

    chGroupAdding = true;
    updateChAccessRefreshState();
    if (els.btnChGroupDialogConfirm) els.btnChGroupDialogConfirm.disabled = true;
    if (els.btnChGroupDialogCancel) els.btnChGroupDialogCancel.disabled = true;
    els.chGroupDialogInput.disabled = true;
    hideChMsg();
    try {
      var result = await window.oneclaw.settingsAddFeishuGroupAllowFrom({ id: groupId });
      if (!result.success) {
        showChMsg(result.message || t("error.invalidGroupId"), "error");
      } else {
        showToast(t("feishu.groupAdded"));
        closeChGroupDialog();
        await refreshChPairingPanels({ silent: true });
      }
    } catch (err) {
      showChMsg(t("error.connection") + (err.message || "Unknown error"), "error");
    } finally {
      chGroupAdding = false;
      if (els.btnChGroupDialogConfirm) els.btnChGroupDialogConfirm.disabled = false;
      if (els.btnChGroupDialogCancel) els.btnChGroupDialogCancel.disabled = false;
      if (els.chGroupDialogInput) els.chGroupDialogInput.disabled = false;
      updateChAccessRefreshState();
    }
  }

  // 保存频道配置
  async function handleChSave() {
    if (chSaving) return;

    var enabled = isChEnabled();

    // 禁用 → 直接保存开关状态
    if (!enabled) {
      setChSaving(true);
      hideChMsg();
      try {
        var result = await window.oneclaw.settingsSaveChannel({ enabled: false });
        setChSaving(false);
        if (result.success) {
          showToast(t("common.saved"));
          refreshChPairingPanels({ silent: true });
        } else {
          showChMsg(result.message || "Save failed", "error");
        }
      } catch (err) {
        setChSaving(false);
        showChMsg(t("error.connection") + (err.message || "Unknown error"), "error");
      }
      return;
    }

    // 启用 → 校验凭据
    var appId = els.chAppId.value.trim();
    var appSecret = els.chAppSecret.value.trim();

    if (!appId) { showChMsg(t("error.noAppId"), "error"); els.chEnabled.checked = false; return; }
    if (!appSecret) { showChMsg(t("error.noAppSecret"), "error"); els.chEnabled.checked = false; return; }
    var groupAllowFromEntries = getChGroupAllowFromEntries();

    setChSaving(true);
    hideChMsg();

    try {
      var verifyResult = await window.oneclaw.settingsVerifyKey({
        provider: "feishu",
        appId: appId,
        appSecret: appSecret,
      });
      if (!verifyResult.success) {
        showChMsg(verifyResult.message || t("error.verifyFailed"), "error");
        els.chEnabled.checked = false;
        setChSaving(false);
        return;
      }

      var saveResult = await window.oneclaw.settingsSaveChannel({
        appId: appId,
        appSecret: appSecret,
        enabled: true,
        dmPolicy: getChDmPolicy(),
        dmScope: getChDmScope(),
        groupPolicy: getChGroupPolicy(),
        groupAllowFrom: groupAllowFromEntries,
      });
      if (!saveResult.success) {
        showChMsg(saveResult.message || "Save failed", "error");
        els.chEnabled.checked = false;
        setChSaving(false);
        return;
      }

      setChSaving(false);
      showToast(t("common.saved"));
      refreshChPairingPanels({ silent: true });
    } catch (err) {
      showChMsg(t("error.connection") + (err.message || "Unknown error"), "error");
      els.chEnabled.checked = false;
      setChSaving(false);
    }
  }

  // 加载已有频道配置
  async function loadChannelConfig() {
    try {
      var result = await window.oneclaw.settingsGetChannelConfig();
      if (!result.success || !result.data) return;

      var data = result.data;
      if (data.appId) els.chAppId.value = data.appId;
      if (data.appSecret) els.chAppSecret.value = data.appSecret;

      // 回填启用状态
      var enabled = data.enabled && data.appId;
      els.chEnabled.checked = !!enabled;

      var dmPolicy = data.dmPolicy === "open" ? "open" : "pairing";
      if (els.chDmPolicy) {
        els.chDmPolicy.value = dmPolicy;
      }
      if (els.chDmScope) {
        els.chDmScope.value = data.dmScope || "main";
      }
      if (els.chGroupPolicy && data.groupPolicy) {
        els.chGroupPolicy.value = data.groupPolicy;
      }
      updateChPairingSectionVisibility();
      updateChGroupAllowFromState();
      refreshChPairingPanels({ silent: true });
    } catch (err) {
      console.error("[Settings] loadChannelConfig failed:", err);
    }
  }

  // ── WeCom ──

  // 企业微信消息框与其它平台分离，避免状态提示互相覆盖。
  function showWecomMsg(msg, type) {
    els.wecomMsgBox.textContent = msg;
    els.wecomMsgBox.className = "msg-box " + type;
  }

  // 清空企业微信平台上的错误 / 成功提示。
  function hideWecomMsg() {
    els.wecomMsgBox.classList.add("hidden");
    els.wecomMsgBox.textContent = "";
    els.wecomMsgBox.className = "msg-box hidden";
  }

  // 同步企业微信保存按钮的 loading 状态。
  function setWecomSaving(loading) {
    wecomSaving = loading;
  }

  // 读取当前企业微信平台是否启用。
  function isWecomEnabled() {
    return !!(els.wecomEnabled && els.wecomEnabled.checked);
  }

  // 读取企业微信群策略。
  function getWecomGroupPolicy() {
    var value = String(els.wecomGroupPolicy.value || "").trim();
    if (value === "allowlist" || value === "disabled") return value;
    return "open";
  }

  // 按当前群策略切换白名单输入区显隐。
  function updateWecomGroupAllowFromState() {
    toggleEl(els.wecomGroupAllowFromGroup, getWecomGroupPolicy() === "allowlist");
  }

  // 统一解析企业微信群白名单，支持换行 / 逗号 / 分号分隔。
  function parseWecomGroupAllowFrom() {
    return Array.from(new Set(
      String(els.wecomGroupAllowFrom.value || "")
        .split(/[\n,;]+/g)
        .map(function (entry) { return String(entry || "").trim(); })
        .filter(Boolean)
    ));
  }

  // 保存企业微信配置，直接落盘并触发 Gateway 重启。
  async function handleWecomSave() {
    if (wecomSaving) return;

    var enabled = isWecomEnabled();
    if (!enabled) {
      setWecomSaving(true);
      hideWecomMsg();
      try {
        var disableResult = await window.oneclaw.settingsSaveWecomConfig({ enabled: false });
        setWecomSaving(false);
        if (disableResult.success) {
          showToast(t("common.saved"));
          refreshChPairingPanels({ silent: true });
        } else {
          showWecomMsg(disableResult.message || "Save failed", "error");
        }
      } catch (err) {
        setWecomSaving(false);
        showWecomMsg(t("error.connection") + (err.message || "Unknown error"), "error");
      }
      return;
    }

    var botId = String(els.wecomBotId.value || "").trim();
    var secret = String(els.wecomSecret.value || "").trim();
    if (!botId) { showWecomMsg(t("error.noWecomBotId"), "error"); els.wecomEnabled.checked = false; return; }
    if (!secret) { showWecomMsg(t("error.noWecomSecret"), "error"); els.wecomEnabled.checked = false; return; }

    setWecomSaving(true);
    hideWecomMsg();

    try {
      var saveResult = await window.oneclaw.settingsSaveWecomConfig({
        enabled: true,
        botId: botId,
        secret: secret,
        dmPolicy: String(els.wecomDmPolicy.value || "pairing"),
        groupPolicy: getWecomGroupPolicy(),
        groupAllowFrom: parseWecomGroupAllowFrom(),
      });
      if (!saveResult.success) {
        showWecomMsg(saveResult.message || "Save failed", "error");
        els.wecomEnabled.checked = false;
        setWecomSaving(false);
        return;
      }

      setWecomSaving(false);
      showToast(t("common.saved"));
      refreshChPairingPanels({ silent: true });
    } catch (err) {
      showWecomMsg(t("error.connection") + (err.message || "Unknown error"), "error");
      els.wecomEnabled.checked = false;
      setWecomSaving(false);
    }
  }

  // 回填企业微信配置，并在未打包插件时给出前置提示。
  async function loadWecomConfig() {
    try {
      var result = await window.oneclaw.settingsGetWecomConfig();
      if (!result.success || !result.data) return;

      var data = result.data;
      if (data.botId) els.wecomBotId.value = data.botId;
      if (data.secret) els.wecomSecret.value = data.secret;
      if (els.wecomDmPolicy) els.wecomDmPolicy.value = data.dmPolicy || "pairing";
      if (els.wecomGroupPolicy) els.wecomGroupPolicy.value = data.groupPolicy || "open";
      els.wecomGroupAllowFrom.value = Array.isArray(data.groupAllowFrom) ? data.groupAllowFrom.join("\n") : "";

      var enabled = !!data.enabled && !!data.botId;
      els.wecomEnabled.checked = enabled;

      updateWecomGroupAllowFromState();
      if (currentChatPlatform === "wecom") {
        updateChPairingSectionVisibility();
        refreshChPairingPanels({ silent: true });
      }

      if (data.bundled === false) {
        showWecomMsg(data.bundleMessage || t("error.wecomNotBundled"), "error");
      } else {
        hideWecomMsg();
      }
    } catch (err) {
      console.error("[Settings] loadWecomConfig failed:", err);
    }
  }

  // ── DingTalk ──

  // 钉钉消息框与其它平台分离，避免不同平台的状态提示互相覆盖。
  function showDingtalkMsg(msg, type) {
    els.dingtalkMsgBox.textContent = msg;
    els.dingtalkMsgBox.className = "msg-box " + type;
  }

  // 清空钉钉平台上的错误 / 成功提示。
  function hideDingtalkMsg() {
    els.dingtalkMsgBox.classList.add("hidden");
    els.dingtalkMsgBox.textContent = "";
    els.dingtalkMsgBox.className = "msg-box hidden";
  }

  // 同步钉钉保存按钮的 loading 状态。
  function setDingtalkSaving(loading) {
    dingtalkSaving = loading;
  }

  // 读取当前钉钉平台是否启用。
  function isDingtalkEnabled() {
    return !!(els.dingtalkEnabled && els.dingtalkEnabled.checked);
  }

  // 统一解析会话超时输入；留空时回退到 30 分钟默认值。
  function parseDingtalkSessionTimeout() {
    var raw = String(els.dingtalkSessionTimeout.value || "").trim();
    if (!raw) return 1800000;
    var parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NaN;
    }
    return Math.floor(parsed);
  }

  // 保存钉钉配置，自动复用当前 Gateway token，只让设置页管理核心字段。
  async function handleDingtalkSave() {
    if (dingtalkSaving) return;

    var enabled = isDingtalkEnabled();
    if (!enabled) {
      setDingtalkSaving(true);
      hideDingtalkMsg();
      try {
        var disableResult = await window.oneclaw.settingsSaveDingtalkConfig({ enabled: false });
        setDingtalkSaving(false);
        if (disableResult.success) {
          showToast(t("common.saved"));
        } else {
          showDingtalkMsg(disableResult.message || "Save failed", "error");
        }
      } catch (err) {
        setDingtalkSaving(false);
        showDingtalkMsg(t("error.connection") + (err.message || "Unknown error"), "error");
      }
      return;
    }

    var clientId = String(els.dingtalkClientId.value || "").trim();
    var clientSecret = String(els.dingtalkClientSecret.value || "").trim();
    var sessionTimeout = parseDingtalkSessionTimeout();
    if (!clientId) { showDingtalkMsg(t("error.noDingtalkClientId"), "error"); els.dingtalkEnabled.checked = false; return; }
    if (!clientSecret) { showDingtalkMsg(t("error.noDingtalkClientSecret"), "error"); els.dingtalkEnabled.checked = false; return; }
    if (!Number.isFinite(sessionTimeout) || sessionTimeout <= 0) {
      showDingtalkMsg(t("error.invalidDingtalkSessionTimeout"), "error");
      els.dingtalkEnabled.checked = false;
      return;
    }

    setDingtalkSaving(true);
    hideDingtalkMsg();

    try {
      var verifyResult = await window.oneclaw.settingsVerifyKey({
        provider: "dingtalk",
        clientId: clientId,
        clientSecret: clientSecret,
      });
      if (!verifyResult.success) {
        showDingtalkMsg(verifyResult.message || t("error.verifyFailed"), "error");
        els.dingtalkEnabled.checked = false;
        setDingtalkSaving(false);
        return;
      }

      var saveResult = await window.oneclaw.settingsSaveDingtalkConfig({
        enabled: true,
        clientId: clientId,
        clientSecret: clientSecret,
        sessionTimeout: sessionTimeout,
      });
      if (!saveResult.success) {
        showDingtalkMsg(saveResult.message || "Save failed", "error");
        els.dingtalkEnabled.checked = false;
        setDingtalkSaving(false);
        return;
      }

      setDingtalkSaving(false);
      showToast(t("common.saved"));
    } catch (err) {
      showDingtalkMsg(t("error.connection") + (err.message || "Unknown error"), "error");
      els.dingtalkEnabled.checked = false;
      setDingtalkSaving(false);
    }
  }

  // 回填钉钉配置，并在未打包插件时给出前置提示。
  async function loadDingtalkConfig() {
    try {
      var result = await window.oneclaw.settingsGetDingtalkConfig();
      if (!result.success || !result.data) return;

      var data = result.data;
      if (data.clientId) els.dingtalkClientId.value = data.clientId;
      if (data.clientSecret) els.dingtalkClientSecret.value = data.clientSecret;
      els.dingtalkSessionTimeout.value = String(data.sessionTimeout || 1800000);

      var enabled = !!data.enabled && !!data.clientId;
      els.dingtalkEnabled.checked = enabled;


      if (data.bundled === false) {
        showDingtalkMsg(data.bundleMessage || t("error.dingtalkNotBundled"), "error");
      } else {
        hideDingtalkMsg();
      }
    } catch (err) {
      console.error("[Settings] loadDingtalkConfig failed:", err);
    }
  }

  // ── QQ Bot ──

  // QQ 消息框与飞书分离，避免两个平台互相覆盖状态提示。
  function showQqMsg(msg, type) {
    els.qqMsgBox.textContent = msg;
    els.qqMsgBox.className = "msg-box " + type;
  }

  // 清空 QQ 平台上的错误 / 成功提示。
  function hideQqMsg() {
    els.qqMsgBox.classList.add("hidden");
    els.qqMsgBox.textContent = "";
    els.qqMsgBox.className = "msg-box hidden";
  }

  // 同步 QQ 保存按钮的 loading 状态。
  function setQqSaving(loading) {
    qqSaving = loading;
  }

  // 读取当前 QQ 平台是否启用。
  function isQqEnabled() {
    return !!(els.qqEnabled && els.qqEnabled.checked);
  }

  // 保存 QQ Bot 配置，流程与飞书保持一致：先校验，再落配置，再重启网关。
  async function handleQqSave() {
    if (qqSaving) return;

    var enabled = isQqEnabled();
    if (!enabled) {
      setQqSaving(true);
      hideQqMsg();
      try {
        var disableResult = await window.oneclaw.settingsSaveQqbotConfig({ enabled: false });
        setQqSaving(false);
        if (disableResult.success) {
          showToast(t("common.saved"));
        } else {
          showQqMsg(disableResult.message || "Save failed", "error");
        }
      } catch (err) {
        setQqSaving(false);
        showQqMsg(t("error.connection") + (err.message || "Unknown error"), "error");
      }
      return;
    }

    var appId = String(els.qqAppId.value || "").trim();
    var clientSecret = String(els.qqClientSecret.value || "").trim();
    if (!appId) { showQqMsg(t("error.noQqAppId"), "error"); els.qqEnabled.checked = false; return; }
    if (!clientSecret) { showQqMsg(t("error.noQqClientSecret"), "error"); els.qqEnabled.checked = false; return; }

    setQqSaving(true);
    hideQqMsg();

    try {
      var verifyResult = await window.oneclaw.settingsVerifyKey({
        provider: "qqbot",
        appId: appId,
        clientSecret: clientSecret,
      });
      if (!verifyResult.success) {
        showQqMsg(verifyResult.message || t("error.verifyFailed"), "error");
        els.qqEnabled.checked = false;
        setQqSaving(false);
        return;
      }

      var saveResult = await window.oneclaw.settingsSaveQqbotConfig({
        enabled: true,
        appId: appId,
        clientSecret: clientSecret,
        markdownSupport: !!els.qqMarkdownSupport.checked,
      });
      if (!saveResult.success) {
        showQqMsg(saveResult.message || "Save failed", "error");
        els.qqEnabled.checked = false;
        setQqSaving(false);
        return;
      }

      setQqSaving(false);
      showToast(t("common.saved"));
    } catch (err) {
      showQqMsg(t("error.connection") + (err.message || "Unknown error"), "error");
      els.qqEnabled.checked = false;
      setQqSaving(false);
    }
  }

  // 回填 QQ Bot 配置，并在未打包插件时给出前置提示。
  async function loadQqbotConfig() {
    try {
      var result = await window.oneclaw.settingsGetQqbotConfig();
      if (!result.success || !result.data) return;

      var data = result.data;
      if (data.appId) els.qqAppId.value = data.appId;
      if (data.clientSecret) els.qqClientSecret.value = data.clientSecret;
      els.qqMarkdownSupport.checked = !!data.markdownSupport;

      var enabled = !!data.enabled && !!data.appId;
      els.qqEnabled.checked = enabled;


      if (data.bundled === false) {
        showQqMsg(data.bundleMessage || t("error.qqNotBundled"), "error");
      } else {
        hideQqMsg();
      }
    } catch (err) {
      console.error("[Settings] loadQqbotConfig failed:", err);
    }
  }

  // ── 微信状态变量 ──
  var weixinSaving = false;
  var weixinLoginPolling = false;
  var weixinQrcode = null;

  function isWeixinEnabled() {
    return els.weixinEnabled && els.weixinEnabled.checked;
  }

  function showWeixinMsg(msg, type) {
    if (!els.weixinMsgBox) return;
    els.weixinMsgBox.textContent = msg;
    els.weixinMsgBox.className = "msg-box msg-" + (type || "info");
    els.weixinMsgBox.classList.remove("hidden");
  }

  function hideWeixinMsg() {
    if (els.weixinMsgBox) els.weixinMsgBox.classList.add("hidden");
  }

  // 保存微信配置（启用/禁用切换）
  async function handleWeixinSave() {
    if (weixinSaving) return;
    weixinSaving = true;
    hideWeixinMsg();
    var enabled = isWeixinEnabled();
    try {
      var result = await window.oneclaw.settingsSaveWeixinConfig({
        enabled: enabled,
      });
      if (result.success) {
        showToast(t("common.saved"));
        toggleEl(els.weixinFields, enabled);
        if (enabled) {
          // 启用时：已连接则显示状态，否则自动发起扫码
          var cfg = await window.oneclaw.settingsGetWeixinConfig();
          var accounts = (cfg.success && cfg.data && cfg.data.accounts) || [];
          if (accounts.length > 0) {
            showWeixinConnected(accounts[0]);
          } else {
            startWeixinLogin();
          }
        } else {
          // 禁用时：取消轮询，重置 UI
          resetWeixinLoginUI();
          if (els.weixinConnectedInfo) els.weixinConnectedInfo.classList.add("hidden");
          if (els.weixinStatusDot) els.weixinStatusDot.classList.remove("active");
        }
      } else {
        showWeixinMsg(result.message || "Save failed", "error");
      }
    } catch (err) {
      showWeixinMsg(t("error.connection") + (err.message || ""), "error");
    }
    weixinSaving = false;
  }

  // 发起微信扫码登录
  async function startWeixinLogin() {
    if (weixinLoginPolling) return;
    hideWeixinMsg();
    if (els.weixinConnectedInfo) els.weixinConnectedInfo.classList.add("hidden");
    if (els.weixinQrStatus) els.weixinQrStatus.textContent = t("weixin.waitingScan");

    try {
      var startResult = await window.oneclaw.settingsWeixinLoginStart();
      if (!startResult.success || !startResult.data || !startResult.data.qrDataUrl) {
        showWeixinMsg((startResult.data && startResult.data.message) || startResult.message || t("weixin.loginFailed"), "error");
        resetWeixinLoginUI();
        return;
      }
      // qrDataUrl 是 main process 生成的 BMP data URL
      if (els.weixinQrImage && startResult.data.qrDataUrl) {
        els.weixinQrImage.src = startResult.data.qrDataUrl;
        if (els.weixinQrContainer) els.weixinQrContainer.classList.remove("hidden");
      }
      weixinQrcode = startResult.data.qrcode;
      weixinLoginPolling = true;
      pollWeixinLogin();
    } catch (err) {
      showWeixinMsg(t("weixin.gatewayNotRunning"), "error");
      resetWeixinLoginUI();
    }
  }

  // 轮询微信登录状态
  async function pollWeixinLogin() {
    if (!weixinLoginPolling || !weixinQrcode) return;
    try {
      var waitResult = await window.oneclaw.settingsWeixinLoginWait({
        qrcode: weixinQrcode,
      });
      if (!weixinLoginPolling) return;
      if (waitResult.success && waitResult.data) {
        if (waitResult.data.connected) {
          weixinLoginPolling = false;
          showWeixinConnected(waitResult.data.accountId || "");
          showToast(t("weixin.connected"));
          return;
        }
        // 根据 status 字段判断状态
        var status = waitResult.data.status || "";
        if (status === "expired") {
          weixinLoginPolling = false;
          weixinQrcode = null;
          startWeixinLogin();
          return;
        }
        if (status === "scaned") {
          if (els.weixinQrStatus) els.weixinQrStatus.textContent = t("weixin.scanned");
        }
        // 继续轮询（最少间隔 1 秒，避免紧密循环）
        setTimeout(pollWeixinLogin, 1000);
      } else {
        var errMsg = (waitResult.data && waitResult.data.message) || waitResult.message || t("weixin.loginFailed");
        showWeixinMsg(errMsg, "error");
        resetWeixinLoginUI();
      }
    } catch (err) {
      if (weixinLoginPolling) {
        showWeixinMsg(t("weixin.loginFailed"), "error");
        resetWeixinLoginUI();
      }
    }
  }

  // 重置微信登录 UI 到初始状态
  function resetWeixinLoginUI() {
    weixinLoginPolling = false;
    weixinQrcode = null;
    if (els.weixinQrContainer) els.weixinQrContainer.classList.add("hidden");
    if (els.weixinQrImage) els.weixinQrImage.src = "";
  }

  // 显示微信已连接状态
  function showWeixinConnected(accountId) {
    if (els.weixinQrContainer) els.weixinQrContainer.classList.add("hidden");
    if (els.weixinConnectedInfo) {
      els.weixinConnectedInfo.classList.remove("hidden");
      if (els.weixinAccountId) els.weixinAccountId.textContent = accountId;
    }
    if (els.weixinStatusDot) els.weixinStatusDot.classList.add("active");
  }

  // 清除微信连接（删除账号凭据后重新扫码）
  async function removeWeixinAccount() {
    hideWeixinMsg();
    try {
      var result = await window.oneclaw.settingsWeixinClearAccounts();
      if (result.success) {
        if (els.weixinConnectedInfo) els.weixinConnectedInfo.classList.add("hidden");
        if (els.weixinStatusDot) els.weixinStatusDot.classList.remove("active");
        showToast(t("weixin.disconnected"));
        // 自动重新扫码
        startWeixinLogin();
      }
    } catch (err) {
      showWeixinMsg(t("error.connection") + (err.message || ""), "error");
    }
  }

  // 回填微信配置，恢复已连接状态
  async function loadWeixinConfig() {
    try {
      var result = await window.oneclaw.settingsGetWeixinConfig();
      if (result.success && result.data) {
        if (els.weixinEnabled) els.weixinEnabled.checked = result.data.enabled;
        toggleEl(els.weixinFields, result.data.enabled);
        if (!result.data.bundled && result.data.enabled) {
          if (els.weixinNotBundledHint) els.weixinNotBundledHint.classList.remove("hidden");
        }
        if (result.data.enabled) {
          var accounts = result.data.accounts || [];
          if (accounts.length > 0) {
            showWeixinConnected(accounts[0]);
          } else {
            startWeixinLogin();
          }
        }
      }
    } catch (err) {
      // 静默失败
    }
  }


  // ── Advanced ──

  // 加载高级配置
  async function loadAdvancedConfig() {
    try {
      var result = await window.oneclaw.settingsGetAdvanced();
      if (!result.success || !result.data) {
        return;
      }

      var data = result.data;
      // 回填 ClawHub Registry
      if (els.clawHubRegistry) {
        els.clawHubRegistry.value = data.clawHubRegistry || "";
      }
      // 回填 browser profile radio
      var radio = document.querySelector('input[name="browserProfile"][value="' + data.browserProfile + '"]');
      if (radio) radio.checked = true;
      // 回填 iMessage toggle
      els.imessageEnabled.checked = !!data.imessageEnabled;
      // 按平台能力展示并回填开机启动开关
      toggleEl(els.launchAtLoginRow, data.launchAtLoginSupported === true);
      if (data.launchAtLoginSupported === true) {
        els.launchAtLoginEnabled.checked = data.launchAtLogin === true;
      }
    } catch (err) {
      console.error("[Settings] loadAdvancedConfig failed:", err);
    } finally {
      await loadCliStatus();
    }
  }

  // 同步开关状态到 CLI 偏好，操作中禁用开关。
  function renderCliControls() {
    if (!els.cliEnabled) return;
    els.cliEnabled.checked = cliEnabled;
    els.cliEnabled.disabled = cliOperating;
  }

  // 读取主进程 CLI 状态；新版本优先使用 enabled，旧版本回退 installed。
  async function loadCliStatus() {
    if (
      !window.oneclaw ||
      typeof window.oneclaw.settingsGetCliStatus !== "function" ||
      typeof window.oneclaw.settingsInstallCli !== "function" ||
      typeof window.oneclaw.settingsUninstallCli !== "function"
    ) {
      if (els.cliEnabled) els.cliEnabled.disabled = true;
      return;
    }

    try {
      var result = await window.oneclaw.settingsGetCliStatus();
      if (!result || !result.success || !result.data) return;
      cliEnabled = result.data.enabled === true;
      if (result.data.enabled !== true && result.data.enabled !== false) {
        cliEnabled = result.data.installed === true;
      }
      renderCliControls();
    } catch (err) {
      console.error("[Settings] loadCliStatus failed:", err);
    }
  }

  // 开关切换：ON → 安装，OFF → 卸载。
  async function handleCliToggle() {
    if (cliOperating) return;
    hideAdvMsg();

    if (
      !window.oneclaw ||
      typeof window.oneclaw.settingsInstallCli !== "function" ||
      typeof window.oneclaw.settingsUninstallCli !== "function"
    ) {
      showAdvMsg(t("advanced.cliUnavailable"), "error");
      renderCliControls();
      return;
    }

    var wantInstall = els.cliEnabled.checked;

    cliOperating = true;
    renderCliControls();
    try {
      var result = wantInstall
        ? await window.oneclaw.settingsInstallCli()
        : await window.oneclaw.settingsUninstallCli();

      if (!result || !result.success) {
        showAdvMsg(result?.message || t("advanced.cliOpFailed"), "error");
        await loadCliStatus();
        cliOperating = false;
        renderCliControls();
        return;
      }

      await loadCliStatus();
      cliOperating = false;
      renderCliControls();
      showToast(wantInstall ? t("advanced.cliInstallDone") : t("advanced.cliUninstallDone"));
      if (result.message) {
        showAdvMsg(result.message, "success");
      }
    } catch (err) {
      await loadCliStatus();
      cliOperating = false;
      renderCliControls();
      showAdvMsg(t("error.connection") + (err?.message || "Unknown error"), "error");
    }
  }

  // 保存高级配置
  async function handleAdvSave() {
    if (advSaving) return;
    setAdvSaving(true);
    hideAdvMsg();

    var browserProfile = document.querySelector('input[name="browserProfile"]:checked').value;
    var imessageEnabled = els.imessageEnabled.checked;
    var launchAtLogin = els.launchAtLoginEnabled ? !!els.launchAtLoginEnabled.checked : false;
    var clawHubRegistry = els.clawHubRegistry ? els.clawHubRegistry.value.trim() : "";

    try {
      var result = await window.oneclaw.settingsSaveAdvanced({
        browserProfile: browserProfile,
        imessageEnabled: imessageEnabled,
        launchAtLogin: launchAtLogin,
        clawHubRegistry: clawHubRegistry,
      });
      setAdvSaving(false);
      if (result.success) {
        showToast(t("common.saved"));
      } else {
        showAdvMsg(result.message || "Save failed", "error");
      }
    } catch (err) {
      setAdvSaving(false);
      showAdvMsg(t("error.connection") + (err.message || "Unknown error"), "error");
    }
  }

  function showAdvMsg(msg, type) {
    els.advMsgBox.textContent = msg;
    els.advMsgBox.className = "msg-box " + type;
  }

  function hideAdvMsg() {
    els.advMsgBox.classList.add("hidden");
    els.advMsgBox.textContent = "";
    els.advMsgBox.className = "msg-box hidden";
  }

  function setAdvSaving(loading) {
    advSaving = loading;
    els.btnAdvSave.disabled = loading;
    els.btnAdvSaveText.textContent = loading ? t("advanced.saving") : t("advanced.save");
    els.btnAdvSaveSpinner.classList.toggle("hidden", !loading);
  }

  // ── Appearance ──

  function isEmbeddedSettings() {
    return new URLSearchParams(window.location.search).get("embedded") === "1";
  }

  function getAppearanceThemeValue() {
    var checked = document.querySelector('input[name="appearanceTheme"]:checked');
    return checked ? checked.value : "system";
  }

  function applyAppearanceState(theme, showThinking) {
    var themeRadio = document.querySelector('input[name="appearanceTheme"][value="' + theme + '"]');
    if (themeRadio) themeRadio.checked = true;
    if (typeof showThinking === "boolean") {
      els.appearanceShowThinking.checked = showThinking;
    }
  }

  function loadAppearanceFromQuery() {
    var params = new URLSearchParams(window.location.search);
    var theme = params.get("theme");
    var showThinking = params.get("showThinking");
    applyAppearanceState(
      theme === "light" || theme === "dark" || theme === "system" ? theme : "system",
      showThinking === "1",
    );
  }

  function loadAppearanceFromLocalStorage() {
    try {
      var raw = localStorage.getItem("openclaw.control.settings.v1");
      if (!raw) return;
      var parsed = JSON.parse(raw);
      var theme = parsed && parsed.theme;
      var showThinking = parsed && parsed.chatShowThinking;
      applyAppearanceState(
        theme === "light" || theme === "dark" || theme === "system" ? theme : "system",
        typeof showThinking === "boolean" ? showThinking : true,
      );
    } catch {
      // ignore malformed local cache
    }
  }

  function requestEmbeddedAppearanceInit() {
    if (!isEmbeddedSettings() || !window.parent || window.parent === window) {
      return;
    }
    window.parent.postMessage(
      {
        source: "oneclaw-settings-embed",
        type: "appearance-request-init",
      },
      "*",
    );
  }

  function handleAppearanceInitMessage(event) {
    var data = event && event.data;
    if (!data || data.source !== "oneclaw-chat-ui" || data.type !== "appearance-init") {
      return;
    }
    var payload = data.payload || {};
    applyAppearanceState(payload.theme || "system", Boolean(payload.showThinking));
  }

  function showAppearanceMsg(msg, type) {
    els.appearanceMsgBox.textContent = msg;
    els.appearanceMsgBox.className = "msg-box " + type;
  }

  function hideAppearanceMsg() {
    els.appearanceMsgBox.classList.add("hidden");
    els.appearanceMsgBox.textContent = "";
    els.appearanceMsgBox.className = "msg-box hidden";
  }

  function setAppearanceSaving(loading) {
    appearanceSaving = loading;
    els.btnAppearanceSave.disabled = loading;
    els.btnAppearanceSaveText.textContent = loading ? t("appearance.saving") : t("appearance.save");
    els.btnAppearanceSaveSpinner.classList.toggle("hidden", !loading);
  }

  function saveAppearanceToLocalStorage(theme, showThinking) {
    try {
      var key = "openclaw.control.settings.v1";
      var raw = localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : {};
      parsed.theme = theme;
      parsed.chatShowThinking = showThinking;
      localStorage.setItem(key, JSON.stringify(parsed));
      return true;
    } catch {
      return false;
    }
  }

  async function handleAppearanceSave() {
    if (appearanceSaving) return;
    setAppearanceSaving(true);
    hideAppearanceMsg();

    var theme = getAppearanceThemeValue();
    var showThinking = !!els.appearanceShowThinking.checked;

    try {
      if (isEmbeddedSettings() && window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            source: "oneclaw-settings-embed",
            type: "appearance-save",
            payload: { theme: theme, showThinking: showThinking },
          },
          "*",
        );
      } else {
        var ok = saveAppearanceToLocalStorage(theme, showThinking);
        if (!ok) {
          throw new Error("save appearance failed");
        }
      }
      setAppearanceSaving(false);
      showToast(t("common.saved"));
    } catch (err) {
      setAppearanceSaving(false);
      showAppearanceMsg(t("error.connection") + ((err && err.message) || "Unknown error"), "error");
    }
  }

  function loadAppearanceSettings() {
    loadAppearanceFromQuery();
    if (!isEmbeddedSettings()) {
      loadAppearanceFromLocalStorage();
      return;
    }
    window.addEventListener("message", handleAppearanceInitMessage);
    requestEmbeddedAppearanceInit();
  }

  // ── Kimi Tab ──

  // 从 install.sh 命令或直接输入解析 bot token
  function parseBotToken(input) {
    var match = input.match(/--bot-token\s+(\S+)/);
    if (match) return match[1];
    var trimmed = input.trim();
    if (trimmed && !/\s/.test(trimmed)) return trimmed;
    return "";
  }

  // 掩码 token（保留首尾各 4 字符）
  function maskToken(token) {
    if (!token || token.length <= 8) return token || "";
    return token.slice(0, 4) + "..." + token.slice(-4);
  }

  // Kimi 消息框
  function showKimiMsg(msg, type) {
    els.kimiMsgBox.textContent = msg;
    els.kimiMsgBox.className = "msg-box " + type;
  }

  function hideKimiMsg() {
    els.kimiMsgBox.classList.add("hidden");
    els.kimiMsgBox.textContent = "";
    els.kimiMsgBox.className = "msg-box hidden";
  }

  function setKimiSaving(loading) {
    kimiSaving = loading;
  }

  // 获取 Kimi 启用/禁用状态
  function isKimiEnabled() {
    return els.kimiEnabled.checked;
  }

  // 加载已有 Kimi 配置
  async function loadKimiConfig() {
    try {
      var result = await window.oneclaw.settingsGetKimiConfig();
      if (!result.success || !result.data) return;

      var data = result.data;
      // 回填 token 到输入框
      // 回填 token
      if (data.botToken) {
        els.kimiSettingsInput.value = data.botToken;
      }

      // 回填启用状态
      var enabled = data.enabled && data.botToken;
      els.kimiEnabled.checked = !!enabled;

    } catch (err) {
      console.error("[Settings] loadKimiConfig failed:", err);
    }
  }

  // 保存 Kimi 配置（Gateway 通过 chokidar 监听配置文件变更，自动热重载）
  async function handleKimiSave() {
    if (kimiSaving) return;

    var enabled = isKimiEnabled();

    // 禁用 → 直接保存开关状态
    if (!enabled) {
      setKimiSaving(true);
      hideKimiMsg();
      try {
        var result = await window.oneclaw.settingsSaveKimiConfig({ enabled: false });
        setKimiSaving(false);
        if (result.success) {
          showToast(t("common.saved"));
        } else {
          showKimiMsg(result.message || "Save failed", "error");
        }
      } catch (err) {
        setKimiSaving(false);
        showKimiMsg(t("error.connection") + (err.message || "Unknown error"), "error");
      }
      return;
    }

    // 启用 → 校验 token
    var botToken = parseBotToken(els.kimiSettingsInput.value);
    if (!botToken) {
      showKimiMsg(t("error.noKimiBotToken"), "error");
      els.kimiEnabled.checked = false;
      return;
    }

    setKimiSaving(true);
    hideKimiMsg();

    try {
      var result = await window.oneclaw.settingsSaveKimiConfig({ botToken: botToken, enabled: true });
      if (!result.success) {
        showKimiMsg(result.message || "Save failed", "error");
        els.kimiEnabled.checked = false;
        setKimiSaving(false);
        return;
      }

      setKimiSaving(false);
      showToast(t("common.saved"));
    } catch (err) {
      setKimiSaving(false);
      els.kimiEnabled.checked = false;
      showKimiMsg(t("error.connection") + (err.message || "Unknown error"), "error");
    }
  }

  // ── Search Tab ──

  // Search 消息框
  function showSearchMsg(msg, type) {
    els.searchMsgBox.textContent = msg;
    els.searchMsgBox.className = "msg-box " + type;
  }

  function hideSearchMsg() {
    els.searchMsgBox.classList.add("hidden");
    els.searchMsgBox.textContent = "";
    els.searchMsgBox.className = "msg-box hidden";
  }

  function setSearchSaving(loading) {
    searchSaving = loading;
    els.btnSearchSave.disabled = loading;
    els.btnSearchSaveText.textContent = loading ? t("search.saving") : t("search.save");
    els.btnSearchSaveSpinner.classList.toggle("hidden", !loading);
  }

  function isSearchEnabled() {
    return els.searchEnabled.checked;
  }

  // 加载 Search 配置
  async function loadSearchConfig() {
    try {
      var result = await window.oneclaw.settingsGetKimiSearchConfig();
      if (!result.success || !result.data) return;

      var data = result.data;
      els.searchEnabled.checked = !!data.enabled;
      toggleEl(els.searchFields, !!data.enabled);

      // 回填专属 key
      if (data.apiKey) {
        els.searchApiKey.value = data.apiKey;
      }

      // 回填自定义服务地址
      els.searchServiceBaseUrl.value = data.serviceBaseUrl || "";

      // 自动复用提示
      updateSearchAutoKeyHint(data);
    } catch (err) {
      console.error("[Settings] loadSearchConfig failed:", err);
    }
  }

  // 更新自动复用 key 提示：无专属 key + 有 kimi-code key → 显示提示 + 隐藏输入框
  function updateSearchAutoKeyHint(data) {
    var hasOwnKey = data.apiKey && data.apiKey.trim();
    var hasKimiCodeKey = data.isKimiCodeConfigured;
    var autoReusing = !hasOwnKey && hasKimiCodeKey;
    if (autoReusing) {
      els.searchAutoKeyHint.textContent = t("search.autoKeyHint");
      els.searchAutoKeyHint.classList.remove("hidden");
    } else {
      els.searchAutoKeyHint.classList.add("hidden");
    }
    toggleEl(els.searchApiKeyGroup, !autoReusing);
  }

  // 保存 Search 配置
  async function handleSearchSave() {
    if (searchSaving) return;

    var enabled = isSearchEnabled();

    setSearchSaving(true);
    hideSearchMsg();

    try {
      var params = { enabled: enabled };
      // 输入框可见时传递 key（空字符串表示清除专属 key，走自动复用）
      if (enabled && !els.searchApiKeyGroup.classList.contains("hidden")) {
        params.apiKey = els.searchApiKey.value.trim();
      }
      // 自定义服务地址（空字符串表示恢复默认）
      params.serviceBaseUrl = els.searchServiceBaseUrl.value.trim();
      var result = await window.oneclaw.settingsSaveKimiSearchConfig(params);
      setSearchSaving(false);
      if (result.success) {
        showToast(t("common.saved"));
        // 刷新提示状态
        loadSearchConfig();
      } else {
        showSearchMsg(result.message || "Save failed", "error");
      }
    } catch (err) {
      setSearchSaving(false);
      showSearchMsg(t("error.connection") + (err.message || "Unknown error"), "error");
    }
  }

  // ── Memory 配置 ──

  var memorySaving = false;

  function showMemoryMsg(msg, type) { showMsg(els.memoryMsgBox, msg, type); }
  function hideMemoryMsg() { hideMsg(els.memoryMsgBox); }
  function setMemorySaving(loading) {
    memorySaving = loading;
    els.btnMemorySave.disabled = loading;
    els.btnMemorySaveText.textContent = loading ? t("memory.saving") : t("memory.save");
    els.btnMemorySaveSpinner.classList.toggle("hidden", !loading);
  }

  // 加载记忆配置
  async function loadMemoryConfig() {
    try {
      var result = await window.oneclaw.settingsGetMemoryConfig();
      if (!result.success || !result.data) return;
      var data = result.data;
      els.memorySessionEnabled.checked = data.sessionMemoryEnabled !== false;
      els.memoryEmbeddingEnabled.checked = !!data.embeddingEnabled;

      // embedding 状态信息：开关开且已配置 kimi-code 才显示"已启用"
      els.memoryEmbeddingStatus.textContent = (data.embeddingEnabled && data.isKimiCodeConfigured)
        ? t("memory.embeddingActive")
        : t("memory.embeddingInactive");
      els.memoryEmbeddingInfo.classList.remove("hidden");
    } catch (err) {
      console.error("[Settings] loadMemoryConfig failed:", err);
    }
  }

  // 保存记忆配置
  async function handleMemorySave() {
    if (memorySaving) return;
    setMemorySaving(true);
    hideMemoryMsg();
    try {
      var result = await window.oneclaw.settingsSaveMemoryConfig({
        sessionMemoryEnabled: !!els.memorySessionEnabled.checked,
        embeddingEnabled: !!els.memoryEmbeddingEnabled.checked,
      });
      setMemorySaving(false);
      if (result.success) {
        showToast(t("common.saved"));
        loadMemoryConfig();
      } else {
        showMemoryMsg(result.message || "Save failed", "error");
      }
    } catch (err) {
      setMemorySaving(false);
      showMemoryMsg(t("error.connection") + (err.message || "Unknown error"), "error");
    }
  }

  // ── 从配置 + 预设合并出模型列表（配置优先，预设补充） ──

  // ── 模型列表面板 ──

  // 从后端拉取已配置模型列表并渲染左侧面板
  async function renderModelList() {
    if (!window.oneclaw || !window.oneclaw.settingsGetConfiguredModels) return;
    try {
      var result = await window.oneclaw.settingsGetConfiguredModels();
      if (!result.success || !result.data) return;
      modelListData = result.data;
    } catch { return; }

    var container = els.modelList;
    if (!container) return;
    container.innerHTML = "";

    modelListData.forEach(function (item) {
      var div = document.createElement("div");
      div.className = "model-list-item";
      if (item.key === editorState.modelKey) {
        div.classList.add("active");
      }
      div.dataset.modelKey = item.key;

      // 左侧信息区
      var infoDiv = document.createElement("div");
      infoDiv.className = "model-list-item__info";

      var nameDiv = document.createElement("div");
      nameDiv.className = "model-list-item__name";
      nameDiv.textContent = item.name || item.key;
      infoDiv.appendChild(nameDiv);

      var metaDiv = document.createElement("div");
      metaDiv.className = "model-list-item__meta";
      metaDiv.textContent = item.provider;
      infoDiv.appendChild(metaDiv);
      div.appendChild(infoDiv);

      // 右侧操作按钮（hover 显示，默认星常亮）
      var actions = document.createElement("div");
      actions.className = "model-list-item__actions";

      // 删除
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "model-list-item__action-btn";
      delBtn.dataset.tooltip = t("settings.deleteModel");
      delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><use href="#icon-trash-2"></use></svg>';
      if (item.isDefault) delBtn.disabled = true;
      delBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var sk = item.key.indexOf("/");
        editorState = { mode: "edit", modelKey: item.key, providerKey: sk > 0 ? item.key.slice(0, sk) : item.key };
        handleDeleteModel();
      });
      actions.appendChild(delBtn);

      // 设为默认（默认模型时星星常亮）
      var starBtn = document.createElement("button");
      starBtn.type = "button";
      starBtn.className = "model-list-item__action-btn" + (item.isDefault ? " is-default" : "");
      starBtn.dataset.tooltip = t("settings.setDefault");
      starBtn.innerHTML = item.isDefault
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor"><use href="#icon-star"></use></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><use href="#icon-star"></use></svg>';
      if (item.isDefault) starBtn.disabled = true;
      starBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var sk = item.key.indexOf("/");
        editorState = { mode: "edit", modelKey: item.key, providerKey: sk > 0 ? item.key.slice(0, sk) : item.key };
        handleSetDefault();
      });
      actions.appendChild(starBtn);

      div.appendChild(actions);

      div.addEventListener("click", function () {
        selectModelInList(item.key);
      });
      container.appendChild(div);
    });
  }

  // 选中列表中的某个模型，进入编辑模式
  function selectModelInList(modelKey) {
    var slashIdx0 = modelKey.indexOf("/");
    editorState = {
      mode: "edit",
      modelKey: modelKey,
      providerKey: slashIdx0 > 0 ? modelKey.slice(0, slashIdx0) : modelKey,
    };
    hideMsg();

    // 高亮列表项（placeholder 保留但取消高亮）
    $$(".model-list-item").forEach(function (el) {
      el.classList.toggle("active", el.dataset.modelKey === modelKey);
    });

    // 解析 modelKey → providerKey / modelId
    var slashIdx = modelKey.indexOf("/");
    if (slashIdx <= 0) return;
    var providerKey = modelKey.slice(0, slashIdx);
    var modelId = modelKey.slice(slashIdx + 1);

    // 从 modelListData 获取元数据
    var modelEntry = modelListData.find(function (m) { return m.key === modelKey; });

    // providerKey → UI provider tab 映射
    var uiProvider = resolveUiProvider(providerKey);
    var subPlatform = resolveSubPlatform(providerKey);

    // 切换到对应 provider（先设子平台，再 switch）
    if (uiProvider === "moonshot" && subPlatform) {
      var radio = document.querySelector('input[name="subPlatform"][value="' + subPlatform + '"]');
      if (radio) radio.checked = true;
    }
    if (uiProvider === "custom") {
      // 检查 customPreset
      var presetKey = resolveCustomPresetKey(providerKey);
      if (presetKey) {
        switchProvider("custom");
        els.customPreset.value = presetKey;
        applyCustomPreset(presetKey);
      } else {
        switchProvider("custom");
        els.customPreset.value = "";
        applyCustomPreset("");
      }
    } else {
      switchProvider(uiProvider);
    }

    // 锁定 provider tabs
    lockProviderTabs(uiProvider);

    // 从 savedProviders 回填 apiKey（传入真实 providerKey 避免 lookup 推断失败）
    fillSavedProviderFields(uiProvider, subPlatform, providerKey);

    // 选中模型
    selectOrAppendModel(modelId);

    // 显示别名
    var alias = modelEntry && modelEntry.name !== modelId ? modelEntry.name : "";
    els.modelAlias.value = alias;
    toggleEl(els.modelAliasGroup, true);

    els.btnSaveText.textContent = t("provider.save");
  }

  // 进入新增模式
  function enterAddMode() {
    editorState = { mode: "add" };
    hideMsg();

    // 取消列表高亮
    $$(".model-list-item").forEach(function (el) {
      el.classList.remove("active");
    });

    // 移除旧 placeholder（如有）
    var oldPlaceholder = document.querySelector(".model-list-item--placeholder");
    if (oldPlaceholder) oldPlaceholder.remove();

    // 在列表末尾插入未保存模型占位项
    var container = els.modelList;
    if (container) {
      var ph = document.createElement("div");
      ph.className = "model-list-item model-list-item--placeholder active";
      var phInfo = document.createElement("div");
      phInfo.className = "model-list-item__info";
      var phName = document.createElement("div");
      phName.className = "model-list-item__name";
      phName.textContent = t("settings.newModelPlaceholder");
      phInfo.appendChild(phName);
      var phMeta = document.createElement("div");
      phMeta.className = "model-list-item__meta";
      phMeta.textContent = "—";
      phInfo.appendChild(phMeta);
      ph.appendChild(phInfo);
      // 点击 placeholder 重新激活新增模式
      ph.addEventListener("click", function () { enterAddMode(); });
      container.appendChild(ph);
    }

    // 解锁 provider tabs
    unlockProviderTabs();

    // 清空表单
    els.apiKeyInput.value = "";
    els.modelAlias.value = "";
    toggleEl(els.modelAliasGroup, true);

    // 重置 OAuth / 用量面板（add 模式时用量不显示，OAuth 登录仍可用）
    updateOAuthVisibility();

    // 隐藏编辑按钮
    els.btnSaveText.textContent = t("settings.addModelSave");

    // 回填当前 provider 的已保存配置（保留 apiKey）
    fillSavedProviderFields(currentProvider);
  }

  // providerKey → UI tab provider 名
  function resolveUiProvider(providerKey) {
    if (providerKey === "kimi-coding" || providerKey === "moonshot") return "moonshot";
    if (providerKey === "anthropic") return "anthropic";
    if (providerKey === "openai") return "openai";
    if (providerKey === "google") return "google";
    // 所有其他 → custom
    if (PROVIDERS[providerKey]) return providerKey;
    return "custom";
  }

  // providerKey → Moonshot 子平台
  function resolveSubPlatform(providerKey) {
    if (providerKey === "kimi-coding") return "kimi-code";
    if (providerKey === "moonshot") return "moonshot-cn";
    return null;
  }

  // providerKey → custom preset key（反查）
  function resolveCustomPresetKey(providerKey) {
    for (var key in CUSTOM_PRESETS) {
      if (CUSTOM_PRESETS[key].providerKey === providerKey) return key;
    }
    return null;
  }

  // 锁定 provider tabs（编辑模式下禁止切换）
  function lockProviderTabs(activeProvider) {
    $$(".provider-tab").forEach(function (tab) {
      if (tab.dataset.provider !== activeProvider) {
        tab.classList.add("locked");
        tab.disabled = true;
      } else {
        tab.classList.remove("locked");
        tab.disabled = false;
      }
    });
  }

  // 解锁 provider tabs
  function unlockProviderTabs() {
    $$(".provider-tab").forEach(function (tab) {
      tab.classList.remove("locked");
      tab.disabled = false;
    });
  }

  // 删除模型
  async function handleDeleteModel() {
    if (!editorState.modelKey) return;
    var entry = modelListData.find(function (m) { return m.key === editorState.modelKey; });
    if (entry && entry.isDefault) {
      showMsg(t("settings.cannotDeleteDefault"), "error");
      return;
    }
    if (!confirm(t("settings.confirmDelete"))) return;
    try {
      var result = await window.oneclaw.settingsDeleteModel({ modelKey: editorState.modelKey });
      if (!result.success) {
        showMsg(result.message || "Delete failed", "error");
        return;
      }
      showToast(t("settings.modelDeleted"));
      enterAddMode();
      await renderModelList();
    } catch (err) {
      showMsg(t("error.connection") + (err.message || ""), "error");
    }
  }

  // 设为默认模型
  async function handleSetDefault() {
    if (!editorState.modelKey) return;
    try {
      var result = await window.oneclaw.settingsSetDefaultModel({ modelKey: editorState.modelKey });
      if (!result.success) {
        showMsg(result.message || "Set default failed", "error");
        return;
      }
      showToast(t("settings.defaultModelSet"));
      await renderModelList();
      // 刷新编辑态按钮
      selectModelInList(editorState.modelKey);
    } catch (err) {
      showMsg(t("error.connection") + (err.message || ""), "error");
    }
  }

  function buildMergedModelList(configuredModels, provider, subPlatform) {
    // 以配置中的模型为基础
    var models = configuredModels ? configuredModels.slice() : [];
    // 补充预设中未出现的模型
    var presets = getPresetModels(provider, subPlatform);
    presets.forEach(function (m) {
      if (models.indexOf(m) === -1) models.push(m);
    });
    return models;
  }

  // 取对应 provider/subPlatform 的预设模型列表
  function getPresetModels(provider, subPlatform) {
    if (provider === "moonshot" && subPlatform === "kimi-code") return KIMI_CODE_MODELS;
    var cfg = PROVIDERS[provider];
    return cfg ? cfg.models : [];
  }

  // provider + subPlatform → 人类可读名称
  function getProviderDisplayName(provider, subPlatform) {
    if (provider === "moonshot") {
      var names = { "moonshot-cn": "Kimi 开放平台（企业用户）", "moonshot-ai": "Moonshot AI", "kimi-code": "Kimi 会员订阅" };
      return names[subPlatform] || "Kimi";
    }
    var map = { anthropic: "Anthropic", openai: "OpenAI", google: "Google", custom: "Custom" };
    return map[provider] || provider;
  }

  // ── 加载已有配置 ──

  async function loadCurrentConfig() {
    try {
      var result = await window.oneclaw.settingsGetConfig();
      if (!result.success || !result.data) return;

      var data = result.data;

      // 缓存所有已保存 provider 的配置（供切换时回填）
      if (data.savedProviders) {
        savedProviders = data.savedProviders;
      }

      var provider = data.provider;
      if (!provider || !PROVIDERS[provider]) return;

      // Moonshot 先选子平台（影响后续模型列表）
      if (provider === "moonshot" && data.subPlatform) {
        var radio = document.querySelector('input[name="subPlatform"][value="' + data.subPlatform + '"]');
        if (radio) radio.checked = true;
      }

      switchProvider(provider);

      // apiKey 填入 value（完整值，type=password 自动掩码显示）
      if (data.apiKey) {
        els.apiKeyInput.value = data.apiKey;
      }

      // Custom 预设恢复：后端返回 customPreset 时选中对应下拉项
      if (provider === "custom" && data.customPreset && CUSTOM_PRESETS[data.customPreset]) {
        els.customPreset.value = data.customPreset;
        applyCustomPreset(data.customPreset);

        // 恢复模型选择：检查 modelID 是否在预设列表中
        if (data.modelID) {
          var presetModels = CUSTOM_PRESETS[data.customPreset].models;
          var inPreset = presetModels.indexOf(data.modelID) >= 0;
          if (inPreset) {
            els.modelSelect.value = data.modelID;
          } else {
            // 模型不在预设列表中 → 选中"自定义模型"并填入输入框
            els.modelSelect.value = CUSTOM_MODEL_SENTINEL;
            els.customModelInput.value = data.modelID;
            toggleEl(els.customModelInputGroup, true);
          }
        }
      } else if (provider !== "custom") {
        // 用配置中的模型列表 + 预设合并后重新填充下拉
        var merged = buildMergedModelList(
          data.configuredModels,
          provider,
          data.subPlatform
        );
        if (merged.length > 0) {
          populatePresetModels(merged);
        }

        // 选中 primary model，不在列表中则切到自定义输入
        if (data.modelID) {
          var inList = false;
          for (var i = 0; i < els.modelSelect.options.length; i++) {
            if (els.modelSelect.options[i].value === data.modelID) {
              inList = true;
              els.modelSelect.selectedIndex = i;
              break;
            }
          }
          if (!inList) {
            els.modelSelect.value = CUSTOM_MODEL_SENTINEL;
            els.customModelInput.value = data.modelID;
            toggleEl(els.customModelInputGroup, true);
          }
        }
      } else {
        // 纯手动 Custom 字段回填
        if (data.modelID) els.modelInput.value = data.modelID;
        if (data.baseURL) els.baseURLInput.value = data.baseURL;
        if (data.api) {
          var apiRadio = document.querySelector('input[name="apiType"][value="' + data.api + '"]');
          if (apiRadio) apiRadio.checked = true;
        }
        els.supportImageCheckbox.checked = data.supportsImage !== false;
      }

      // 更新当前 provider 状态指示
      var displayName = getProviderDisplayName(provider, data.subPlatform);
      var statusEl = document.getElementById("currentProviderStatus");
      if (statusEl) {
        statusEl.textContent = t("provider.currentUsing") + displayName + " · " + data.modelID;
        statusEl.classList.remove("hidden");
      }
    } catch (err) {
      console.error("[Settings] loadCurrentConfig failed:", err);
    }
  }

  // ── Backup Tab ──

  // 加载备份与恢复数据并渲染列表。
  async function loadBackupData() {
    if (!window.oneclaw || !window.oneclaw.settingsListConfigBackups) return;

    try {
      var result = await window.oneclaw.settingsListConfigBackups();
      if (!result.success || !result.data) {
        showBackupMsg(result.message || "Load backup data failed", "error");
        return;
      }
      renderBackupData(result.data);
    } catch (err) {
      showBackupMsg(t("error.connection") + (err.message || "Unknown error"), "error");
    }
  }

  // 渲染备份页：最近可用快照信息与历史备份条目。
  function renderBackupData(data) {
    if (!els.backupList) return;

    backupHasLastKnownGood = !!data.hasLastKnownGood;
    if (backupHasLastKnownGood && data.lastKnownGoodUpdatedAt) {
      els.backupLastKnownGood.textContent = t("backup.lastKnownGoodAt") + formatDateTime(data.lastKnownGoodUpdatedAt);
    } else {
      els.backupLastKnownGood.textContent = t("backup.noLastKnownGood");
    }

    if (els.btnRestoreLastKnownGood) {
      els.btnRestoreLastKnownGood.disabled =
        !backupHasLastKnownGood || backupRestoring || backupResetting;
    }

    var backups = Array.isArray(data.backups) ? data.backups : [];
    els.backupList.innerHTML = "";
    toggleEl(els.backupEmpty, backups.length === 0);

    backups.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "backup-item";

      var main = document.createElement("div");
      main.className = "backup-item-main";

      var time = document.createElement("div");
      time.className = "backup-item-time";
      time.textContent = formatDateTime(item.createdAt) + " · " + formatBytes(item.size || 0);

      var name = document.createElement("div");
      name.className = "backup-item-name";
      name.textContent = item.fileName || "";

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-primary btn-compact";
      btn.dataset.fileName = item.fileName || "";
      btn.textContent = t("backup.restore");

      main.appendChild(time);
      main.appendChild(name);
      row.appendChild(main);
      row.appendChild(btn);
      els.backupList.appendChild(row);
    });
  }

  // 恢复配置后，重载所有设置面板数据，防止旧 UI 状态覆盖新配置。
  async function refreshAllSettingsViewsAfterRestore() {
    await Promise.allSettled([
      loadCurrentConfig(),
      loadChannelConfig(),
      loadWecomConfig(),
      loadDingtalkConfig(),
      loadQqbotConfig(),
      loadWeixinConfig(),
      loadKimiConfig(),
      loadSearchConfig(),
      loadAdvancedConfig(),
      loadBackupData(),
      refreshGatewayState(),
    ]);
  }

  // 恢复指定历史备份并触发 Gateway 重启。
  async function handleRestoreBackup(fileName) {
    if (backupRestoring || backupResetting) return;
    if (!fileName) return;
    if (!window.confirm(t("backup.confirmRestore"))) return;

    setBackupRestoring(true);
    hideBackupMsg();

    try {
      var result = await window.oneclaw.settingsRestoreConfigBackup({ fileName: fileName });
      if (!result.success) {
        showBackupMsg(result.message || "Restore failed", "error");
        setBackupRestoring(false);
        return;
      }

      if (window.oneclaw && window.oneclaw.restartGateway) {
        window.oneclaw.restartGateway();
        scheduleGatewayStateRefresh();
      }
      showToast(t("backup.restored"));
      await refreshAllSettingsViewsAfterRestore();
    } catch (err) {
      showBackupMsg(t("error.connection") + (err.message || "Unknown error"), "error");
    }

    setBackupRestoring(false);
  }

  // 一键恢复最近可用配置并触发 Gateway 重启。
  async function handleRestoreLastKnownGood() {
    if (backupRestoring || backupResetting) return;
    if (!window.confirm(t("backup.confirmRestoreLastKnownGood"))) return;

    setBackupRestoring(true);
    hideBackupMsg();

    try {
      var result = await window.oneclaw.settingsRestoreLastKnownGood();
      if (!result.success) {
        showBackupMsg(result.message || "Restore failed", "error");
        setBackupRestoring(false);
        return;
      }

      if (window.oneclaw && window.oneclaw.restartGateway) {
        window.oneclaw.restartGateway();
        scheduleGatewayStateRefresh();
      }
      showToast(t("backup.restored"));
      await refreshAllSettingsViewsAfterRestore();
    } catch (err) {
      showBackupMsg(t("error.connection") + (err.message || "Unknown error"), "error");
    }

    setBackupRestoring(false);
  }

  function normalizeGatewayState(state) {
    if (state === "running" || state === "starting" || state === "stopping" || state === "stopped") {
      return state;
    }
    return "unknown";
  }

  function formatGatewayStateText(state) {
    if (state === "running") return t("backup.gatewayStateRunning");
    if (state === "starting") return t("backup.gatewayStateStarting");
    if (state === "stopping") return t("backup.gatewayStateStopping");
    if (state === "stopped") return t("backup.gatewayStateStopped");
    return t("backup.gatewayStateUnknown");
  }

  function setGatewayStateUI(state) {
    gatewayState = normalizeGatewayState(state);

    if (els.gatewayStateText) {
      els.gatewayStateText.textContent = t("backup.gatewayState") + formatGatewayStateText(gatewayState);
    }

    var inTransition = gatewayState === "starting" || gatewayState === "stopping";
    var showStart = gatewayState === "stopped" || gatewayState === "stopping" || gatewayState === "unknown";
    var showStop = gatewayState === "running" || gatewayState === "starting";
    if (els.btnGatewayRestart) {
      els.btnGatewayRestart.disabled = gatewayOperating || backupRestoring || backupResetting || inTransition;
    }
    if (els.btnGatewayStart) {
      els.btnGatewayStart.classList.toggle("hidden", !showStart);
      els.btnGatewayStart.disabled = gatewayOperating || backupRestoring || backupResetting || gatewayState !== "stopped";
    }
    if (els.btnGatewayStop) {
      els.btnGatewayStop.classList.toggle("hidden", !showStop);
      els.btnGatewayStop.disabled = gatewayOperating || backupRestoring || backupResetting || gatewayState !== "running";
    }
  }

  // 查询 Gateway 当前状态并刷新按钮可用性。
  async function refreshGatewayState() {
    if (!window.oneclaw || !window.oneclaw.getGatewayState) {
      setGatewayStateUI("unknown");
      return;
    }
    try {
      var state = await window.oneclaw.getGatewayState();
      setGatewayStateUI(state);
    } catch {
      setGatewayStateUI("unknown");
    }
  }

  function scheduleGatewayStateRefresh() {
    setTimeout(refreshGatewayState, 200);
    setTimeout(refreshGatewayState, 1200);
    setTimeout(refreshGatewayState, 3000);
  }

  // 按钮操作统一入口：重启/启动/停止 Gateway。
  async function handleGatewayAction(kind) {
    if (gatewayOperating || backupRestoring || backupResetting) return;
    if (!window.oneclaw) return;

    gatewayOperating = true;
    setGatewayStateUI(gatewayState);
    hideBackupMsg();

    try {
      if (kind === "restart" && window.oneclaw.restartGateway) {
        window.oneclaw.restartGateway();
      } else if (kind === "start" && window.oneclaw.startGateway) {
        window.oneclaw.startGateway();
      } else if (kind === "stop" && window.oneclaw.stopGateway) {
        window.oneclaw.stopGateway();
      } else {
        throw new Error("Gateway control API unavailable");
      }
      scheduleGatewayStateRefresh();
    } catch (err) {
      showBackupMsg(t("error.connection") + (err.message || "Unknown error"), "error");
    } finally {
      gatewayOperating = false;
      setGatewayStateUI(gatewayState);
    }
  }

  // 根据主进程传入的 notice code，在恢复页顶部展示上下文提示。
  function applyRecoveryNotice(notice) {
    if (!notice) return;
    if (notice === "config-invalid-json") {
      showBackupMsg(t("backup.noticeInvalidJson"), "error");
      return;
    }
    if (notice === "gateway-start-failed") {
      showBackupMsg(t("backup.noticeGatewayFailed"), "error");
      return;
    }
    if (notice === "gateway-recovery-failed" || notice === "gateway-recovery-exception") {
      showBackupMsg(t("backup.noticeGatewayRecoverFailed"), "error");
    }
  }

  function showBackupMsg(msg, type) {
    if (!els.backupMsgBox) return;
    els.backupMsgBox.textContent = msg;
    els.backupMsgBox.className = "msg-box " + type;
  }

  function hideBackupMsg() {
    if (!els.backupMsgBox) return;
    els.backupMsgBox.classList.add("hidden");
    els.backupMsgBox.textContent = "";
    els.backupMsgBox.className = "msg-box hidden";
  }

  function setBackupRestoring(loading) {
    backupRestoring = loading;
    if (!els.btnRestoreLastKnownGoodText || !els.btnRestoreLastKnownGoodSpinner) return;
    els.btnRestoreLastKnownGood.disabled = loading || backupResetting || !backupHasLastKnownGood;
    els.btnRestoreLastKnownGoodText.textContent = loading ? t("backup.restoring") : t("backup.restoreLastKnownGood");
    els.btnRestoreLastKnownGoodSpinner.classList.toggle("hidden", !loading);
    if (els.btnResetConfig) {
      els.btnResetConfig.disabled = loading || backupResetting;
    }
    setGatewayStateUI(gatewayState);
  }

  // 删除配置并重启应用，让用户重新进入引导流程。
  async function handleResetConfig() {
    if (backupRestoring || backupResetting) return;
    if (!window.confirm(t("backup.confirmReset"))) return;
    if (!window.oneclaw || !window.oneclaw.settingsResetConfigAndRelaunch) return;

    setBackupResetting(true);
    hideBackupMsg();

    try {
      var result = await window.oneclaw.settingsResetConfigAndRelaunch();
      if (!result.success) {
        showBackupMsg(result.message || "Reset failed", "error");
        setBackupResetting(false);
        return;
      }
      showToast(t("backup.resetDone"));
    } catch (err) {
      showBackupMsg(t("error.connection") + (err.message || "Unknown error"), "error");
      setBackupResetting(false);
    }
  }

  function setBackupResetting(loading) {
    backupResetting = loading;
    if (els.btnResetConfig) {
      els.btnResetConfig.disabled = loading || backupRestoring;
    }
    if (els.btnResetConfigText) {
      els.btnResetConfigText.textContent = loading ? t("backup.resetting") : t("backup.resetButton");
    }
    if (els.btnResetConfigSpinner) {
      els.btnResetConfigSpinner.classList.toggle("hidden", !loading);
    }
    if (els.btnRestoreLastKnownGood) {
      els.btnRestoreLastKnownGood.disabled = loading || backupRestoring || !backupHasLastKnownGood;
    }
    setGatewayStateUI(gatewayState);
  }

  function formatDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || "");
    return d.toLocaleString(currentLang === "zh" ? "zh-CN" : "en-US", { hour12: false });
  }

  function formatBytes(size) {
    if (!size || size < 1024) return size + " B";
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
    return (size / (1024 * 1024)).toFixed(2) + " MB";
  }

  // ── UI 辅助 ──

  function toggleEl(el, show) {
    el.classList.toggle("hidden", !show);
  }

  // 同步左侧通道列表的状态指示灯
  function syncStatusDot(dot, enabled) {
    if (dot) dot.classList.toggle("connected", !!enabled);
  }

  // 劫持 checkbox.checked setter + 监听用户点击，自动同步指示灯
  function bindStatusDot(checkbox, dot) {
    if (!checkbox || !dot) return;
    var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked");
    Object.defineProperty(checkbox, "checked", {
      get: function () { return desc.get.call(this); },
      set: function (v) { desc.set.call(this, v); syncStatusDot(dot, v); },
      configurable: true,
    });
    checkbox.addEventListener("change", function () { syncStatusDot(dot, checkbox.checked); });
  }

  // 短暂浮层提示（3s 自动消失）
  function showToast(msg) {
    var container = document.getElementById("toastContainer");
    var el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(function () { el.remove(); }, 3000);
  }

  function showMsg(msg, type) {
    els.msgBox.textContent = msg;
    els.msgBox.className = "msg-box " + type;
  }

  // 非会员提示（带订阅超链接）
  function showOAuthNoMembership() {
    var url = "https://kimi.com/membership/pricing?utm_source=oneclaw";
    els.msgBox.textContent = "";
    els.msgBox.className = "msg-box error";
    els.msgBox.appendChild(document.createTextNode(t("provider.oauthNoMembership") + " "));
    var link = document.createElement("a");
    link.href = "#";
    link.textContent = t("provider.oauthSubscribeLink");
    link.className = "oauth-membership-link";
    link.addEventListener("click", function (e) {
      e.preventDefault();
      if (window.oneclaw?.openExternal) window.oneclaw.openExternal(url);
    });
    els.msgBox.appendChild(link);
  }

  function hideMsg() {
    els.msgBox.classList.add("hidden");
    els.msgBox.textContent = "";
    els.msgBox.className = "msg-box hidden";
  }

  function setSaving(loading) {
    saving = loading;
    els.btnSave.disabled = loading;
    els.btnSaveText.textContent = loading ? t("provider.saving") : t("provider.save");
    els.btnSaveSpinner.classList.toggle("hidden", !loading);
  }

  // ── 事件绑定 ──

  function bindEvents() {
    // 左侧导航 tab 切换
    els.navItems.forEach(function (item) {
      item.addEventListener("click", function () {
        switchTab(item.dataset.tab);
      });
    });

    // Provider tab 切换
    els.providerTabs.addEventListener("click", function (e) {
      var tab = e.target.closest(".provider-tab");
      if (tab) switchProvider(tab.dataset.provider);
    });

    // Moonshot 子平台切换
    if (els.subPlatformGroup) {
      els.subPlatformGroup.addEventListener("change", function () {
        if (currentProvider === "moonshot") {
          updateModels();
          updatePlatformLink();
          updateOAuthVisibility();
          // 切换子平台时回填对应配置
          fillSavedProviderFields("moonshot", getSubPlatform());
        }
      });
    }

    // Custom 预设切换
    els.customPreset.addEventListener("change", function () {
      applyCustomPreset(els.customPreset.value);
    });

    // 模型下拉切换 → 控制自定义模型输入框显隐
    els.modelSelect.addEventListener("change", handleModelSelectChange);

    // 平台链接
    els.platformLink.addEventListener("click", function (e) {
      e.preventDefault();
      var url = els.platformLink.dataset.url;
      if (url && window.oneclaw && window.oneclaw.openExternal) {
        window.oneclaw.openExternal(url);
      }
    });

    // 密码可见性
    els.btnOAuth.addEventListener("click", handleOAuthLogin);
    if (els.btnOAuthCancel) {
      els.btnOAuthCancel.addEventListener("click", handleOAuthCancel);
    }
    if (els.btnOAuthLogout) {
      els.btnOAuthLogout.addEventListener("click", handleOAuthLogout);
    }
    if (els.btnUsageRefresh) {
      els.btnUsageRefresh.addEventListener("click", loadUsage);
    }
    els.btnToggleKey.addEventListener("click", togglePasswordVisibility);

    // 模型列表：新增按钮
    if (els.addModelBtn) {
      els.addModelBtn.addEventListener("click", function () { enterAddMode(); });
    }
    // 模型列表：删除按钮
    // 保存
    els.btnSave.addEventListener("click", handleSave);

    // Enter 键保存
    els.apiKeyInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") handleSave();
    });

    // 通道启用指示灯绑定
    bindStatusDot(els.chEnabled, els.feishuStatusDot);
    bindStatusDot(els.wecomEnabled, els.wecomStatusDot);
    bindStatusDot(els.dingtalkEnabled, els.dingtalkStatusDot);
    bindStatusDot(els.kimiEnabled, els.kimiStatusDot);
    bindStatusDot(els.qqEnabled, els.qqStatusDot);
    bindStatusDot(els.weixinEnabled, els.weixinStatusDot);

    // 远程控制页二级平台切换
    els.chatPlatformButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        switchChatPlatform(button.dataset.chatPlatform || "feishu");
      });
    });

    // Channels tab — 启用/禁用切换：开关变化即刻保存
    els.chEnabled.addEventListener("change", function () {
      updateChPairingSectionVisibility();
      updateChGroupAllowFromState();
      refreshChPairingPanels({ silent: true });
      handleChSave();
    });
    if (els.chDmPolicy) {
      els.chDmPolicy.addEventListener("change", function () {
        updateChPairingSectionVisibility();
        refreshChPairingPanels({ silent: true });
      });
    }
    if (els.chGroupPolicy) {
      els.chGroupPolicy.addEventListener("change", function () {
        updateChPairingSectionVisibility();
        updateChGroupAllowFromState();
        refreshChPairingPanels({ silent: true });
      });
    }
    els.btnToggleChSecret.addEventListener("click", togglePasswordVisibility);
    els.chDocsLink.addEventListener("click", function (e) {
      e.preventDefault();
      if (window.oneclaw && window.oneclaw.openExternal) {
        window.oneclaw.openExternal("https://oneclaw.cn/docs/tutorials/feishu-bot.html");
      }
    });
    els.chConsoleLink.addEventListener("click", function (e) {
      e.preventDefault();
      if (window.oneclaw && window.oneclaw.openExternal) {
        window.oneclaw.openExternal("https://open.feishu.cn/app");
      }
    });
    if (els.btnChAccessAddGroup) {
      els.btnChAccessAddGroup.addEventListener("click", function () {
        handleChAccessAddGroup();
      });
    }
    if (els.btnChGroupDialogCancel) {
      els.btnChGroupDialogCancel.addEventListener("click", function () {
        if (chGroupAdding) return;
        closeChGroupDialog();
      });
    }
    if (els.btnChGroupDialogConfirm) {
      els.btnChGroupDialogConfirm.addEventListener("click", function () {
        handleChGroupDialogConfirm();
      });
    }
    if (els.chGroupDialog) {
      els.chGroupDialog.addEventListener("click", function (e) {
        if (chGroupAdding) return;
        if (e.target === els.chGroupDialog) {
          closeChGroupDialog();
        }
      });
    }
    if (els.chGroupDialogInput) {
      els.chGroupDialogInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleChGroupDialogConfirm();
        } else if (e.key === "Escape" && !chGroupAdding) {
          e.preventDefault();
          closeChGroupDialog();
        }
      });
    }
    if (els.btnChAccessRefresh) {
      els.btnChAccessRefresh.addEventListener("click", function () {
        refreshChPairingPanels();
      });
    }
    if (els.chAccessList) {
      els.chAccessList.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-pairing-approve]");
        if (btn) {
          handleChPairingApprove(
            btn.getAttribute("data-pairing-approve"),
            btn.getAttribute("data-pairing-id"),
            btn.getAttribute("data-pairing-name")
          );
          return;
        }
        var rejectBtn = e.target.closest("[data-pairing-reject]");
        if (rejectBtn) {
          handleChPairingReject(
            rejectBtn.getAttribute("data-pairing-reject"),
            rejectBtn.getAttribute("data-pairing-id"),
            rejectBtn.getAttribute("data-pairing-name")
          );
          return;
        }
        var removeBtn = e.target.closest("[data-approved-remove-kind][data-approved-remove-id]");
        if (!removeBtn) return;
        handleChApprovedRemove(
          removeBtn.getAttribute("data-approved-remove-kind"),
          removeBtn.getAttribute("data-approved-remove-id")
        );
      });
    }
    els.chAppSecret.addEventListener("keydown", function (e) {
      if (e.key === "Enter") e.target.blur();
    });

    // WeCom tab — 启用/禁用切换 + Secret 可见性
    if (els.wecomEnabled) {
      els.wecomEnabled.addEventListener("change", function () {
        updateWecomGroupAllowFromState();
        updateChPairingSectionVisibility();
        refreshChPairingPanels({ silent: true });
        handleWecomSave();
      });
    }
    if (els.wecomDmPolicy) {
      els.wecomDmPolicy.addEventListener("change", function () {
        updateChPairingSectionVisibility();
        refreshChPairingPanels({ silent: true });
      });
    }
    if (els.wecomGroupPolicy) {
      els.wecomGroupPolicy.addEventListener("change", function () {
        updateWecomGroupAllowFromState();
        updateChPairingSectionVisibility();
        refreshChPairingPanels({ silent: true });
      });
    }
    if (els.btnToggleWecomSecret) {
      els.btnToggleWecomSecret.addEventListener("click", togglePasswordVisibility);
    }
    if (els.wecomDocsLink) {
      els.wecomDocsLink.addEventListener("click", function (e) {
        e.preventDefault();
        if (window.oneclaw && window.oneclaw.openExternal) {
          window.oneclaw.openExternal("https://github.com/WecomTeam/wecom-openclaw-plugin");
        }
      });
    }
    if (els.wecomConsoleLink) {
      els.wecomConsoleLink.addEventListener("click", function (e) {
        e.preventDefault();
        if (window.oneclaw && window.oneclaw.openExternal) {
          window.oneclaw.openExternal("https://work.weixin.qq.com/");
        }
      });
    }
    if (els.btnWecomAccessRefresh) {
      els.btnWecomAccessRefresh.addEventListener("click", function () {
        refreshChPairingPanels();
      });
    }
    if (els.wecomAccessList) {
      els.wecomAccessList.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-pairing-approve]");
        if (btn) {
          handleChPairingApprove(
            btn.getAttribute("data-pairing-approve"),
            btn.getAttribute("data-pairing-id"),
            btn.getAttribute("data-pairing-name")
          );
          return;
        }
        var rejectBtn = e.target.closest("[data-pairing-reject]");
        if (rejectBtn) {
          handleChPairingReject(
            rejectBtn.getAttribute("data-pairing-reject"),
            rejectBtn.getAttribute("data-pairing-id"),
            rejectBtn.getAttribute("data-pairing-name")
          );
          return;
        }
        var removeBtn = e.target.closest("[data-approved-remove-kind][data-approved-remove-id]");
        if (!removeBtn) return;
        handleChApprovedRemove(
          removeBtn.getAttribute("data-approved-remove-kind"),
          removeBtn.getAttribute("data-approved-remove-id")
        );
      });
    }
    if (els.wecomSecret) {
      els.wecomSecret.addEventListener("keydown", function (e) {
        if (e.key === "Enter") e.target.blur();
      });
    }

    // DingTalk tab — 启用/禁用切换 + Secret 可见性
    if (els.dingtalkEnabled) {
      els.dingtalkEnabled.addEventListener("change", function () {
        handleDingtalkSave();
      });
    }
    if (els.btnToggleDingtalkSecret) {
      els.btnToggleDingtalkSecret.addEventListener("click", togglePasswordVisibility);
    }
    if (els.dingtalkDocsLink) {
      els.dingtalkDocsLink.addEventListener("click", function (e) {
        e.preventDefault();
        if (window.oneclaw && window.oneclaw.openExternal) {
          window.oneclaw.openExternal("https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector");
        }
      });
    }
    if (els.dingtalkConsoleLink) {
      els.dingtalkConsoleLink.addEventListener("click", function (e) {
        e.preventDefault();
        if (window.oneclaw && window.oneclaw.openExternal) {
          window.oneclaw.openExternal("https://open.dingtalk.com/");
        }
      });
    }
    if (els.dingtalkClientSecret) {
      els.dingtalkClientSecret.addEventListener("keydown", function (e) {
        if (e.key === "Enter") e.target.blur();
      });
    }
    if (els.dingtalkSessionTimeout) {
      els.dingtalkSessionTimeout.addEventListener("keydown", function (e) {
        if (e.key === "Enter") e.target.blur();
      });
    }

    // QQ Bot tab — 启用/禁用切换 + Secret 可见性
    if (els.qqEnabled) {
      els.qqEnabled.addEventListener("change", function () {
        handleQqSave();
      });
    }
    if (els.btnToggleQqSecret) {
      els.btnToggleQqSecret.addEventListener("click", togglePasswordVisibility);
    }
    if (els.qqConsoleLink) {
      els.qqConsoleLink.addEventListener("click", function (e) {
        e.preventDefault();
        if (window.oneclaw && window.oneclaw.openExternal) {
          window.oneclaw.openExternal("https://q.qq.com/qqbot/openclaw/");
        }
      });
    }
    if (els.qqClientSecret) {
      els.qqClientSecret.addEventListener("keydown", function (e) {
        if (e.key === "Enter") e.target.blur();
      });
    }

    // Weixin tab
    if (els.weixinEnabled) {
      els.weixinEnabled.addEventListener("change", function () {
        handleWeixinSave();
      });
    }
    if (els.btnWeixinRemove) {
      els.btnWeixinRemove.addEventListener("click", function () {
        removeWeixinAccount();
      });
    }
    // Kimi tab — 启用/禁用切换 + Token 可见性
    els.kimiEnabled.addEventListener("change", function () { handleKimiSave(); });
    els.btnToggleKimiToken.addEventListener("click", togglePasswordVisibility);
    els.kimiSettingsInput.addEventListener("input", function () {
      var raw = els.kimiSettingsInput.value;
      var token = parseBotToken(raw);
      // 从命令格式中提取到 token → 替换输入框 + toast 提示
      if (token && raw.indexOf("--bot-token") !== -1 && raw !== token) {
        els.kimiSettingsInput.value = token;
        showToast(t("kimi.tokenParsed") + maskToken(token));
      }
    });
    els.kimiBotPageLink.addEventListener("click", function (e) {
      e.preventDefault();
      if (window.oneclaw && window.oneclaw.openExternal) {
        window.oneclaw.openExternal("https://www.kimi.com/bot?utm_source=oneclaw");
      }
    });

    // Search tab — 启用/禁用切换 + Key 可见性 + 平台链接
    els.searchEnabled.addEventListener("change", function () { toggleEl(els.searchFields, isSearchEnabled()); });
    els.btnToggleSearchKey.addEventListener("click", togglePasswordVisibility);
    els.btnSearchSave.addEventListener("click", handleSearchSave);

    // Memory tab
    els.btnMemorySave.addEventListener("click", handleMemorySave);

    if (els.searchPlatformLink) {
      els.searchPlatformLink.addEventListener("click", function (e) {
        e.preventDefault();
        if (window.oneclaw && window.oneclaw.openExternal) {
          window.oneclaw.openExternal("https://kimi.com/code?utm_source=oneclaw");
        }
      });
    }

    // Advanced
    els.btnAdvSave.addEventListener("click", handleAdvSave);
    if (els.cliEnabled) {
      els.cliEnabled.addEventListener("change", handleCliToggle);
    }

    // Appearance
    els.btnAppearanceSave.addEventListener("click", handleAppearanceSave);

    // Backup
    if (els.btnRestoreLastKnownGood) {
      els.btnRestoreLastKnownGood.addEventListener("click", handleRestoreLastKnownGood);
    }
    if (els.backupList) {
      els.backupList.addEventListener("click", function (e) {
        var btn = e.target.closest("button[data-file-name]");
        if (!btn) return;
        handleRestoreBackup(btn.dataset.fileName || "");
      });
    }
    if (els.btnGatewayRestart) {
      els.btnGatewayRestart.addEventListener("click", function () {
        handleGatewayAction("restart");
      });
    }
    if (els.btnGatewayStart) {
      els.btnGatewayStart.addEventListener("click", function () {
        handleGatewayAction("start");
      });
    }
    if (els.btnGatewayStop) {
      els.btnGatewayStop.addEventListener("click", function () {
        handleGatewayAction("stop");
      });
    }
    if (els.btnResetConfig) {
      els.btnResetConfig.addEventListener("click", handleResetConfig);
    }

    if (window.oneclaw && window.oneclaw.onSettingsNavigate) {
      window.oneclaw.onSettingsNavigate(function (payload) {
        if (!payload || !payload.tab) return;
        switchTab(payload.tab);
        applyRecoveryNotice(payload.notice || "");
      });
    }
    if (window.oneclaw && window.oneclaw.onPairingState) {
      window.oneclaw.onPairingState(function (payload) {
        if (!isCurrentAccessEnabled() || !isCurrentAccessPairingMode()) {
          return;
        }
        applyChPairingStateFromPush(payload);
      });
    }

    // About — 检查更新按钮（用 _updateMode 区分当前按钮行为）
    var aboutCheckBtn = document.getElementById("aboutCheckUpdate");
    if (aboutCheckBtn) {
      aboutCheckBtn.addEventListener("click", function () {
        if (_updateMode === "download") {
          window.oneclaw.downloadAndInstallUpdate();
          startUpdatePoll();
        } else {
          window.oneclaw.checkForUpdates();
          aboutCheckBtn.textContent = t("about.checking");
          aboutCheckBtn.disabled = true;
          startUpdatePoll();
        }
      });
    }

    // 订阅更新状态推送
    if (window.oneclaw && window.oneclaw.onUpdateState) {
      window.oneclaw.onUpdateState(function (state) {
        renderUpdateStatus(state);
      });
    }
  }

  // ── About Tab ──

  // 更新按钮当前行为模式: "check" = 检查更新, "download" = 安装并重启
  var _updateMode = "check";
  var _updatePollTimer = null;

  // 轮询更新状态（iframe 中 onUpdateState 推送可能不可靠，用主动轮询兜底）
  function startUpdatePoll() {
    stopUpdatePoll();
    _updatePollTimer = setInterval(function () {
      if (!window.oneclaw || !window.oneclaw.getUpdateState) return;
      window.oneclaw.getUpdateState().then(function (state) {
        renderUpdateStatus(state);
        // 终态停止轮询（hidden = 无更新/已完成，但 downloading 继续轮询）
        if (state.status === "hidden") {
          stopUpdatePoll();
        }
      }).catch(function () {});
    }, 500);
  }

  function stopUpdatePoll() {
    if (_updatePollTimer) {
      clearInterval(_updatePollTimer);
      _updatePollTimer = null;
    }
  }

  // 通道 ID → i18n key 映射
  var UPDATE_PUSH_CHANNEL_LABELS = {
    feishu: "about.pushChannelFeishu",
    qqbot: "about.pushChannelQqbot",
    dingtalk: "about.pushChannelDingtalk",
    wecom: "about.pushChannelWecom",
    weixin: "about.pushChannelWeixin",
    "kimi-claw": "about.pushChannelKimiClaw",
  };

  var _pushTargets = []; // in-memory state for push targets

  // 加载更新推送通知配置
  async function loadUpdatePushConfig() {
    try {
      var result = await window.oneclaw.settingsGetUpdatePushConfig();
      if (!result || !result.success) return;
      var data = result.data;

      var toggle = document.getElementById("updatePushEnabled");
      var targetListEl = document.getElementById("updatePushTargetList");
      var addRowEl = document.getElementById("updatePushAddRow");
      var hintEl = document.getElementById("updatePushHint");
      var testBtn = document.getElementById("updatePushTestBtn");
      if (!toggle || !targetListEl) return;

      toggle.checked = !!data.pushEnabled;
      _pushTargets = data.targets || [];
      var enabledChannels = data.enabledChannels || [];

      // 渲染已添加的 target 列表
      renderPushTargets(targetListEl);

      // 填充 channel 下拉（只显示已启用的通道）
      var channelSelect = document.getElementById("updatePushChannelSelect");
      if (channelSelect) {
        channelSelect.innerHTML = "";
        enabledChannels.forEach(function (ch) {
          var opt = document.createElement("option");
          opt.value = ch;
          var labelKey = UPDATE_PUSH_CHANNEL_LABELS[ch] || ch;
          opt.textContent = t(labelKey);
          channelSelect.appendChild(opt);
        });
        if (enabledChannels.length === 0) {
          var opt = document.createElement("option");
          opt.value = "";
          opt.textContent = t("about.pushNoChannels");
          opt.disabled = true;
          channelSelect.appendChild(opt);
        }
      }

      // 显示/隐藏
      var show = !!data.pushEnabled;
      targetListEl.classList.toggle("hidden", !show);
      if (addRowEl) {
        addRowEl.classList.toggle("hidden", !show);
        if (show) addRowEl.style.display = "flex";
      }
      if (hintEl) hintEl.classList.toggle("hidden", !show);
      if (testBtn) testBtn.classList.toggle("hidden", !show || _pushTargets.length === 0);

      // 主开关事件
      toggle.onchange = function () {
        var on = toggle.checked;
        targetListEl.classList.toggle("hidden", !on);
        if (addRowEl) {
          addRowEl.classList.toggle("hidden", !on);
          if (on) addRowEl.style.display = "flex";
        }
        if (hintEl) hintEl.classList.toggle("hidden", !on);
        if (testBtn) testBtn.classList.toggle("hidden", !on || _pushTargets.length === 0);
        saveUpdatePushConfig();
      };
    } catch (e) {
      console.error("Failed to load update push config:", e);
    }
  }

  function renderPushTargets(container) {
    container.innerHTML = "";
    if (_pushTargets.length === 0) {
      var hint = document.createElement("p");
      hint.className = "field-hint";
      hint.textContent = t("about.pushNoTargets");
      container.appendChild(hint);
      return;
    }
    _pushTargets.forEach(function (t2, idx) {
      var row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px;padding:4px 0;";
      var labelKey = UPDATE_PUSH_CHANNEL_LABELS[t2.channel] || t2.channel;
      var text = document.createElement("span");
      text.style.flex = "1";
      text.textContent = t(labelKey) + " → " + (t2.label || t2.target);
      var removeBtn = document.createElement("button");
      removeBtn.className = "btn btn-secondary";
      removeBtn.textContent = "✕";
      removeBtn.style.cssText = "padding:2px 8px;min-width:auto;";
      removeBtn.onclick = function () {
        _pushTargets.splice(idx, 1);
        renderPushTargets(container);
        saveUpdatePushConfig();
        var testBtn = document.getElementById("updatePushTestBtn");
        if (testBtn) testBtn.classList.toggle("hidden", _pushTargets.length === 0);
      };
      row.appendChild(text);
      row.appendChild(removeBtn);
      container.appendChild(row);
    });
  }

  // 添加 target
  (function () {
    var addBtn = document.getElementById("updatePushAddBtn");
    if (addBtn) addBtn.addEventListener("click", function () {
      var channelSelect = document.getElementById("updatePushChannelSelect");
      var targetInput = document.getElementById("updatePushTargetInput");
      if (!channelSelect || !targetInput) return;
      var ch = channelSelect.value;
      var tgt = (targetInput.value || "").trim();
      if (!ch || !tgt) return;
      // Prevent duplicates
      if (_pushTargets.some(function (t2) { return t2.channel === ch && t2.target === tgt; })) return;
      _pushTargets.push({ channel: ch, target: tgt });
      targetInput.value = "";
      var targetListEl = document.getElementById("updatePushTargetList");
      if (targetListEl) renderPushTargets(targetListEl);
      saveUpdatePushConfig();
      var testBtn = document.getElementById("updatePushTestBtn");
      if (testBtn) testBtn.classList.remove("hidden");
    });
  })();

  // 保存更新推送通知配置
  async function saveUpdatePushConfig() {
    try {
      var toggle = document.getElementById("updatePushEnabled");
      if (!toggle) return;

      var result = await window.oneclaw.settingsSaveUpdatePushConfig({
        pushEnabled: toggle.checked,
        targets: _pushTargets,
      });

      if (result && result.success) {
        var statusEl = document.getElementById("updatePushStatus");
        if (statusEl) {
          statusEl.textContent = t("about.pushSaved");
          statusEl.classList.remove("hidden");
          setTimeout(function () { statusEl.classList.add("hidden"); }, 2000);
        }
      }
    } catch (e) {
      console.error("Failed to save update push config:", e);
    }
  }

  // 测试更新推送通知
  async function testUpdatePush() {
    var testBtn = document.getElementById("updatePushTestBtn");
    var statusEl = document.getElementById("updatePushStatus");
    if (testBtn) { testBtn.disabled = true; testBtn.textContent = t("about.pushTesting"); }
    try {
      var result = await window.oneclaw.settingsTestUpdatePush();
      if (statusEl) {
        statusEl.textContent = result.success ? ("✓ " + (result.message || "Sent")) : ("✗ " + (result.message || "Failed"));
        statusEl.classList.remove("hidden");
        setTimeout(function () { statusEl.classList.add("hidden"); }, 5000);
      }
    } catch (e) {
      if (statusEl) {
        statusEl.textContent = "✗ " + (e.message || "Error");
        statusEl.classList.remove("hidden");
      }
    } finally {
      if (testBtn) { testBtn.disabled = false; testBtn.textContent = t("about.pushTest"); }
    }
  }

  // 绑定测试按钮
  (function () {
    var testBtn = document.getElementById("updatePushTestBtn");
    if (testBtn) testBtn.addEventListener("click", testUpdatePush);
  })();
  // 加载版本信息和更新状态
  async function loadAboutInfo() {
    try {
      var info = await window.oneclaw.settingsGetAboutInfo();
      document.getElementById("aboutOneClawVersion").textContent = info.oneClawVersion;
      document.getElementById("aboutOpenClawVersion").textContent = info.openClawVersion;
    } catch (e) {
      console.error("Failed to load about info:", e);
    }
    try {
      var state = await window.oneclaw.getUpdateState();
      renderUpdateStatus(state);
    } catch (e) {}
    loadUpdatePushConfig();
  }

  // 根据更新状态渲染按钮和提示
  function renderUpdateStatus(state) {
    var statusEl = document.getElementById("aboutUpdateStatus");
    var btnEl = document.getElementById("aboutCheckUpdate");
    if (!statusEl || !btnEl) return;

    switch (state.status) {
      case "hidden":
        statusEl.classList.add("hidden");
        btnEl.textContent = t("about.checkUpdate");
        btnEl.disabled = false;
        _updateMode = "check";
        break;
      case "available":
        statusEl.classList.remove("hidden");
        statusEl.textContent = t("about.updateAvailable") + " " + (state.version || "");
        btnEl.textContent = t("about.installRestart");
        btnEl.disabled = false;
        _updateMode = "download";
        break;
      case "downloading":
        statusEl.classList.remove("hidden");
        statusEl.textContent = t("about.downloading") + " " + Math.round(state.percent || 0) + "%";
        btnEl.textContent = t("about.downloading") + "...";
        btnEl.disabled = true;
        _updateMode = "download";
        break;
      case "failed":
        statusEl.classList.remove("hidden");
        statusEl.textContent = t("about.updateFailed");
        btnEl.textContent = t("about.checkUpdate");
        btnEl.disabled = false;
        _updateMode = "check";
        stopUpdatePoll();
        break;
      default:
        statusEl.classList.add("hidden");
        btnEl.textContent = t("about.checkUpdate");
        btnEl.disabled = false;
        _updateMode = "check";
        break;
    }
  }

  // ── 初始化 ──

  // 全局 fixed tooltip（不受 overflow 裁切）
  function initFixedTooltip() {
    var tip = document.createElement("div");
    tip.className = "fixed-tooltip";
    document.body.appendChild(tip);

    document.addEventListener("mouseover", function (e) {
      var btn = e.target.closest("[data-tooltip]");
      if (!btn || btn.disabled) { tip.style.opacity = "0"; return; }
      tip.textContent = btn.getAttribute("data-tooltip");
      tip.style.opacity = "1";
      var rect = btn.getBoundingClientRect();
      tip.style.left = rect.left + rect.width / 2 + "px";
      tip.style.top = rect.top - 6 + "px";
    });

    document.addEventListener("mouseout", function (e) {
      var btn = e.target.closest("[data-tooltip]");
      if (btn) tip.style.opacity = "0";
    });
  }

  function init() {
    detectLang();
    applyI18n();
    initFixedTooltip();

    bindEvents();
    switchProvider("moonshot");
    switchTab(initialTab || "provider");
    switchChatPlatform(initialChatPlatform || "feishu");
    applyRecoveryNotice(startupNotice);
    loadCurrentConfig();
    renderModelList();
    loadChannelConfig();
    loadWecomConfig();
    loadDingtalkConfig();
    loadQqbotConfig();
    loadWeixinConfig();
    loadKimiConfig();
    loadSearchConfig();
    loadMemoryConfig();
    loadAdvancedConfig();
    loadAppearanceSettings();
    refreshGatewayState();
    if (gatewayStateTimer) {
      clearInterval(gatewayStateTimer);
    }
    gatewayStateTimer = setInterval(refreshGatewayState, 2000);
  }

  init();
})();
