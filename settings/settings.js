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
      models: ["gpt-5.2", "gpt-5.2-codex"],
    },
    google: {
      placeholder: "AI...",
      platformUrl: "https://aistudio.google.com?utm_source=oneclaw",
      models: ["gemini-3-pro-preview", "gemini-3-flash-preview"],
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

  // ── 国际化 ──

  const I18N = {
    en: {
      "title": "Settings",
      "nav.provider": "Model",
      "nav.feishu": "Feishu Integration",
      "provider.title": "Model Configuration",
      "provider.desc": "Change your LLM provider, API key, or model.",
      "provider.custom": "Custom",
      "provider.platform": "Platform",
      "provider.baseUrl": "Base URL",
      "provider.apiKey": "API Key",
      "provider.getKey": "Get API Key →",
      "provider.model": "Model",
      "provider.modelId": "Model ID",
      "provider.apiType": "API Type",
      "provider.supportImage": "Supports image input",
      "common.cancel": "Cancel",
      "common.confirm": "Confirm",
      "provider.save": "Save",
      "provider.saving": "Saving…",
      "provider.saved": "Configuration saved.",
      "provider.currentUsing": "Current: ",
      "feishu.title": "Feishu Integration",
      "feishu.desc": "Connect Feishu to chat with AI directly in your group.",
      "feishu.enabled": "Enable",
      "feishu.appId": "Feishu App ID",
      "feishu.appSecret": "App Secret",
      "feishu.getKey": "Open Feishu Console →",
      "feishu.save": "Save",
      "feishu.saving": "Saving…",
      "feishu.saved": "Feishu integration saved.",
      "feishu.dmPolicy": "DM Access Mode",
      "feishu.dmPolicyPairing": "Access after pairing.",
      "feishu.dmPolicyOpen": "Everyone can access.",
      "feishu.dmScope": "DM Session Scope",
      "feishu.dmScopeMain": "All DMs share one session.",
      "feishu.dmScopePerPeer": "Per user session (Recommended).",
      "feishu.dmScopePerChannelPeer": "Per channel + user session.",
      "feishu.dmScopePerAccountChannelPeer": "Per account + channel + user session.",
      "feishu.groupPolicy": "Group Access Mode",
      "feishu.groupPolicyOpen": "All groups can access.",
      "feishu.groupPolicyAllowlist": "Only allowlisted groups can access.",
      "feishu.groupPolicyDisabled": "Ignore all group messages.",
      "feishu.accessTitle": "Pending & Authorized",
      "feishu.pairingTitle": "Pending Pairing Requests",
      "feishu.refreshPairing": "Refresh",
      "feishu.refreshingPairing": "Refreshing…",
      "feishu.noPairingPending": "No pending pairing requests.",
      "feishu.approvePairing": "Approve",
      "feishu.approvingPairing": "Approving…",
      "feishu.pairingApproved": "Pairing request approved.",
      "feishu.rejectPairing": "Reject",
      "feishu.rejectingPairing": "Rejecting…",
      "feishu.pairingRejected": "Pairing request rejected.",
      "feishu.approvedTitle": "Authorized Users & Groups",
      "feishu.refreshApproved": "Refresh",
      "feishu.refreshingApproved": "Refreshing…",
      "feishu.noApproved": "No authorized users or groups yet.",
      "feishu.noAccessEntries": "No pending or authorized entries.",
      "feishu.statusPending": "Pending",
      "feishu.statusApprovedUser": "Authorized User",
      "feishu.statusApprovedGroup": "Authorized Group",
      "feishu.addGroup": "Add Group ID",
      "feishu.addingGroup": "Adding…",
      "feishu.groupAdded": "Group ID added.",
      "feishu.groupIdPrompt": "Enter group ID (must start with oc_):",
      "feishu.groupIdGuideStep1": "Open the target group chat in Feishu, then click the group avatar to open the Group Info page.",
      "feishu.groupIdGuideStep2": "Scroll down to the bottom of the Group Info page.",
      "feishu.groupIdGuideStep3": "At the bottom of Group Info, find the Conversation ID (starting with oc_) right above the \"Leave Group Chat\" button, then copy it and paste it here.",
      "feishu.removeApproved": "Remove",
      "feishu.removingApproved": "Removing…",
      "feishu.approvedRemoved": "Authorization removed.",
      "feishu.kindUser": "User",
      "feishu.kindGroup": "Group",
      "error.noPairingCode": "Invalid pairing code.",
      "error.loadPairingFailed": "Failed to load pairing requests.",
      "error.loadApprovedFailed": "Failed to load approved accounts.",
      "error.removeApprovedFailed": "Failed to remove authorization.",
      "error.invalidGroupId": "Only group IDs starting with oc_ are allowed.",
      "error.noAppId": "Please enter the Feishu App ID.",
      "error.noAppSecret": "Please enter the App Secret.",
      "error.noKey": "Please enter your API key.",
      "error.noBaseUrl": "Please enter the Base URL.",
      "error.noModelId": "Please enter the Model ID.",
      "error.verifyFailed": "Verification failed. Please check your API key.",
      "error.connection": "Connection error: ",
      "nav.kimi": "KimiClaw",
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
      "kimi.saved": "KimiClaw config saved.",
      "error.noKimiBotToken": "Please paste the command or enter your Bot Token.",
      "nav.advanced": "Advanced",
      "advanced.title": "Advanced",
      "advanced.desc": "Browser tool and messaging channel settings.",
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
      "advanced.cliInstallDone": "CLI command installed.",
      "advanced.cliUninstallDone": "CLI command uninstalled.",
      "advanced.cliUnavailable": "CLI action is not available in this app version.",
      "advanced.cliOpFailed": "CLI operation failed.",
      "advanced.cliUninstallConfirm": "Uninstall the OneClaw terminal command now?",
      "advanced.save": "Save",
      "advanced.saving": "Saving…",
      "advanced.saved": "Settings saved.",
      "appearance.title": "Appearance",
      "appearance.desc": "Control theme and chat display preferences.",
      "appearance.theme": "Theme",
      "appearance.theme.system": "System",
      "appearance.theme.light": "Light",
      "appearance.theme.dark": "Dark",
      "appearance.showThinking": "Show thinking output",
      "appearance.save": "Save",
      "appearance.saving": "Saving…",
      "appearance.saved": "Appearance settings saved.",
      "backup.title": "Backup & Restore",
      "backup.desc": "Restore openclaw.json when config changes break startup.",
      "backup.restoreLastKnownGood": "Restore Last Known Good",
      "backup.historyTitle": "Backup history",
      "backup.empty": "No backup found yet. Save settings once to create one.",
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
      "backup.resetDesc": "Delete openclaw.json and relaunch app to run setup again. Chat history is kept.",
      "backup.resetButton": "Reset Config And Relaunch",
      "backup.resetting": "Resetting…",
      "backup.confirmReset": "Delete openclaw.json, keep history data, and relaunch app to run setup again?",
      "backup.resetDone": "Configuration removed. App is relaunching.",
      "backup.lastKnownGoodAt": "Last successful startup snapshot: ",
      "backup.noLastKnownGood": "No last known good snapshot found yet.",
      "backup.confirmRestore": "Restore this backup and overwrite current openclaw.json?",
      "backup.confirmRestoreLastKnownGood": "Restore last known good config and overwrite current openclaw.json?",
      "backup.restored": "Configuration restored. Gateway restart triggered.",
      "backup.noticeInvalidJson": "Detected invalid openclaw.json. Restore a previous backup.",
      "backup.noticeGatewayFailed": "Gateway startup failed. Restore a previous backup and retry.",
      "backup.noticeGatewayRecoverFailed": "Auto recovery failed. Please select a backup manually.",
    },
    zh: {
      "title": "设置",
      "nav.provider": "模型配置",
      "nav.feishu": "飞书集成",
      "provider.title": "模型配置",
      "provider.desc": "修改 LLM 云厂商、API 密钥或模型。",
      "provider.custom": "自定义",
      "provider.platform": "平台",
      "provider.baseUrl": "接口地址",
      "provider.apiKey": "API 密钥",
      "provider.getKey": "获取密钥 →",
      "provider.model": "模型",
      "provider.modelId": "模型 ID",
      "provider.apiType": "接口类型",
      "provider.supportImage": "支持图像输入",
      "common.cancel": "取消",
      "common.confirm": "确认",
      "provider.save": "保存",
      "provider.saving": "保存中…",
      "provider.saved": "配置已保存。",
      "provider.currentUsing": "当前使用: ",
      "feishu.title": "飞书集成",
      "feishu.desc": "连接飞书，在群聊中直接与 AI 对话。",
      "feishu.enabled": "启用状态",
      "feishu.appId": "飞书应用 ID",
      "feishu.appSecret": "应用密钥",
      "feishu.getKey": "打开飞书开放平台 →",
      "feishu.save": "保存",
      "feishu.saving": "保存中…",
      "feishu.saved": "飞书集成配置已保存。",
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
      "feishu.noPairingPending": "当前没有待审批请求。",
      "feishu.approvePairing": "批准",
      "feishu.approvingPairing": "批准中…",
      "feishu.pairingApproved": "配对请求已批准。",
      "feishu.rejectPairing": "拒绝",
      "feishu.rejectingPairing": "拒绝中…",
      "feishu.pairingRejected": "配对请求已拒绝。",
      "feishu.approvedTitle": "已授权用户与群聊",
      "feishu.refreshApproved": "刷新",
      "feishu.refreshingApproved": "刷新中…",
      "feishu.noApproved": "当前没有已授权的用户或群聊。",
      "feishu.noAccessEntries": "当前没有待审批或已授权条目。",
      "feishu.statusPending": "待审批",
      "feishu.statusApprovedUser": "已授权用户",
      "feishu.statusApprovedGroup": "已授权群聊",
      "feishu.addGroup": "添加群 ID",
      "feishu.addingGroup": "添加中…",
      "feishu.groupAdded": "群 ID 已添加。",
      "feishu.groupIdPrompt": "请输入群 ID（必须以 oc_ 开头）：",
      "feishu.groupIdGuideStep1": "在飞书中打开目标群聊，点击群头像进入群信息页面。",
      "feishu.groupIdGuideStep2": "在群信息页面向下滚动至底部。",
      "feishu.groupIdGuideStep3": "在群信息底部的“退出群聊”按钮上方找到会话 ID（以 oc_ 开头），然后点击复制并粘贴到此处。",
      "feishu.removeApproved": "删除",
      "feishu.removingApproved": "删除中…",
      "feishu.approvedRemoved": "已移除授权。",
      "feishu.kindUser": "用户",
      "feishu.kindGroup": "群聊",
      "error.noPairingCode": "配对码无效。",
      "error.loadPairingFailed": "读取待审批请求失败。",
      "error.loadApprovedFailed": "读取已授权列表失败。",
      "error.removeApprovedFailed": "移除授权失败。",
      "error.invalidGroupId": "仅允许填写以 oc_ 开头的群 ID。",
      "error.noAppId": "请输入飞书应用 ID。",
      "error.noAppSecret": "请输入应用密钥。",
      "error.noKey": "请输入 API 密钥。",
      "error.noBaseUrl": "请输入接口地址。",
      "error.noModelId": "请输入模型 ID。",
      "error.verifyFailed": "验证失败，请检查 API 密钥。",
      "error.connection": "连接错误：",
      "nav.kimi": "KimiClaw",
      "nav.appearance": "外观显示",
      "nav.backup": "备份与恢复",
      "kimi.title": "KimiClaw",
      "kimi.desc": "通过 Kimi 远程遥控 OneClaw",
      "kimi.enabled": "启用状态",
      "kimi.getGuide": "前往 kimi.com/bot →",
      "kimi.guideText": '点击"关联已有 OpenClaw" → 复制命令 → 粘贴到下方输入框',
      "kimi.inputLabel": "粘贴 BotToken 或命令(自动解析Token)。",
      "kimi.tokenParsed": "解析到 Token：",
      "kimi.save": "保存",
      "kimi.saving": "保存中…",
      "kimi.saved": "KimiClaw 配置已保存。",
      "error.noKimiBotToken": "请粘贴命令或输入 Bot Token。",
      "nav.advanced": "高级选项",
      "advanced.title": "高级选项",
      "advanced.desc": "浏览器工具与消息频道设置。",
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
      "advanced.cliInstallDone": "CLI 命令已安装。",
      "advanced.cliUninstallDone": "CLI 命令已卸载。",
      "advanced.cliUnavailable": "当前应用版本不支持该 CLI 操作。",
      "advanced.cliOpFailed": "CLI 操作失败。",
      "advanced.cliUninstallConfirm": "确认要卸载 OneClaw 终端命令吗？",
      "advanced.save": "保存",
      "advanced.saving": "保存中…",
      "advanced.saved": "设置已保存。",
      "appearance.title": "外观显示",
      "appearance.desc": "调整主题和聊天展示相关设置。",
      "appearance.theme": "主题",
      "appearance.theme.system": "跟随系统",
      "appearance.theme.light": "浅色",
      "appearance.theme.dark": "深色",
      "appearance.showThinking": "显示思考过程",
      "appearance.save": "保存",
      "appearance.saving": "保存中…",
      "appearance.saved": "外观显示设置已保存。",
      "backup.title": "备份与恢复",
      "backup.desc": "当配置改坏导致无法启动时，可在这里回退 openclaw.json。",
      "backup.restoreLastKnownGood": "恢复最近可用配置",
      "backup.historyTitle": "备份历史",
      "backup.empty": "暂无备份。先保存一次设置即可生成。",
      "backup.restore": "恢复",
      "backup.restoring": "恢复中…",
      "backup.gatewayTitle": "Gateway 控制",
      "backup.gatewayRestart": "重启 Gateway",
      "backup.gatewayStart": "启动 Gateway",
      "backup.gatewayStop": "停止 Gateway",
      "backup.gatewayState": "Gateway 状态：",
      "backup.gatewayStateRunning": "运行中",
      "backup.gatewayStateStarting": "启动中…",
      "backup.gatewayStateStopping": "停止中…",
      "backup.gatewayStateStopped": "已停止",
      "backup.gatewayStateUnknown": "未知",
      "backup.resetTitle": "恢复配置",
      "backup.resetDesc": "删除 openclaw.json 并重启应用，重新进入引导流程。历史数据会保留。",
      "backup.resetButton": "恢复配置并重启",
      "backup.resetting": "恢复中…",
      "backup.confirmReset": "将删除 openclaw.json，保留历史数据，并重启应用重新进入引导流程，确认继续吗？",
      "backup.resetDone": "配置已删除，应用正在重启。",
      "backup.lastKnownGoodAt": "最近成功启动快照时间：",
      "backup.noLastKnownGood": "暂无“最近可用配置”快照。",
      "backup.confirmRestore": "确认恢复该备份并覆盖当前 openclaw.json 吗？",
      "backup.confirmRestoreLastKnownGood": "确认恢复“最近可用配置”并覆盖当前 openclaw.json 吗？",
      "backup.restored": "配置已恢复，已触发 Gateway 重启。",
      "backup.noticeInvalidJson": "检测到 openclaw.json 无法解析，请恢复历史备份。",
      "backup.noticeGatewayFailed": "Gateway 启动失败，建议恢复历史备份后重试。",
      "backup.noticeGatewayRecoverFailed": "自动回退失败，请手动选择备份恢复。",
    },
  };

  // ── DOM 引用 ──

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    // 导航
    navItems: $$(".nav-item"),
    tabPanels: $$(".tab-panel"),
    // Provider tab
    providerTabs: $("#providerTabs"),
    platformLink: $("#platformLink"),
    subPlatformGroup: $("#subPlatformGroup"),
    baseURLGroup: $("#baseURLGroup"),
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
    msgBox: $("#msgBox"),
    btnSave: $("#btnSave"),
    btnSaveText: $("#btnSave .btn-text"),
    btnSaveSpinner: $("#btnSave .btn-spinner"),
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
    // Advanced tab
    imessageEnabled: $("#imessageEnabled"),
    launchAtLoginRow: $("#launchAtLoginRow"),
    launchAtLoginEnabled: $("#launchAtLoginEnabled"),
    cliStatusText: $("#cliStatusText"),
    btnCliToggle: $("#btnCliToggle"),
    btnCliToggleText: $("#btnCliToggleText"),
    btnCliToggleSpinner: $("#btnCliToggleSpinner"),
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

  let currentProvider = "anthropic";
  let saving = false;
  let chSaving = false;
  let chPairingLoading = false;
  let chApprovedLoading = false;
  let chGroupAdding = false;
  let chPairingApprovingCode = "";
  let chPairingRejectingCode = "";
  let chApprovedRemovingKey = "";
  let chPairingRequests = [];
  let chApprovedEntries = [];
  let kimiSaving = false;
  let advSaving = false;
  let cliOperating = false;
  let cliInstalled = false;
  let appearanceSaving = false;
  let backupRestoring = false;
  let backupResetting = false;
  let backupHasLastKnownGood = false;
  let gatewayState = "stopped";
  let gatewayOperating = false;
  let gatewayStateTimer = null;
  let currentLang = "en";
  let initialTab = "provider";
  let startupNotice = "";
  const TAB_ALIAS_MAP = {
    channel: "channels",
    feishu: "channels",
  };

  // ── 语言 ──

  function detectLang() {
    const params = new URLSearchParams(window.location.search);
    const lang = params.get("lang");
    if (lang && I18N[lang]) {
      currentLang = lang;
    } else {
      const browserLang = String(navigator.language || "").toLowerCase();
      currentLang = browserLang.startsWith("zh") ? "zh" : "en";
    }
    const tab = params.get("tab");
    const notice = params.get("notice");
    initialTab = normalizeTabName(tab || "provider");
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
    if (els.btnChAccessRefresh) {
      els.btnChAccessRefresh.setAttribute("title", t("feishu.refreshPairing"));
      els.btnChAccessRefresh.setAttribute("aria-label", t("feishu.refreshPairing"));
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

  function switchTab(tabName) {
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

    if (target === "backup") {
      loadBackupData();
      refreshGatewayState();
    }
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ── Provider 切换 ──

  function getSubPlatform() {
    const checked = document.querySelector('input[name="subPlatform"]:checked');
    return checked ? checked.value : "moonshot-cn";
  }

  function switchProvider(provider) {
    currentProvider = provider;
    const config = PROVIDERS[provider];

    $$(".provider-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.provider === provider);
    });

    els.apiKeyInput.placeholder = config.placeholder;
    els.apiKeyInput.value = "";
    hideMsg();

    updatePlatformLink();
    toggleEl(els.subPlatformGroup, config.hasSubPlatform === true);

    const isCustom = provider === "custom";
    toggleEl(els.baseURLGroup, isCustom);
    toggleEl(els.modelInputGroup, isCustom);
    toggleEl(els.apiTypeGroup, isCustom);
    toggleEl(els.imageSupportGroup, isCustom);
    toggleEl(els.modelSelectGroup, !isCustom);

    // Custom 切换时重置 checkbox 为默认勾选
    if (isCustom) {
      els.supportImageCheckbox.checked = true;
    }

    if (!isCustom) {
      updateModels();
    }
  }

  function updatePlatformLink() {
    var url = PROVIDERS[currentProvider].platformUrl || "";
    if (currentProvider === "moonshot") {
      url = SUB_PLATFORM_URLS[getSubPlatform()] || "";
    }
    if (url) {
      els.platformLink.textContent = t("provider.getKey");
      els.platformLink.dataset.url = url;
      els.platformLink.classList.remove("hidden");
    } else {
      els.platformLink.classList.add("hidden");
    }
  }

  function updateModels() {
    const config = PROVIDERS[currentProvider];
    if (currentProvider === "moonshot" && getSubPlatform() === "kimi-code") {
      populateModels(KIMI_CODE_MODELS);
    } else {
      populateModels(config.models);
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

  // ── 保存 Provider 配置 ──

  async function handleSave() {
    if (saving) return;

    var apiKey = els.apiKeyInput.value.trim();
    if (!apiKey) {
      showMsg(t("error.noKey"), "error");
      return;
    }

    var params = buildParams(apiKey);
    if (!params) return;

    setSaving(true);
    hideMsg();

    try {
      // 先验证
      var verifyResult = await window.oneclaw.settingsVerifyKey(params);
      if (!verifyResult.success) {
        showMsg(verifyResult.message || t("error.verifyFailed"), "error");
        setSaving(false);
        return;
      }

      // 再保存
      var saveResult = await window.oneclaw.settingsSaveProvider(buildSavePayload(params));
      if (!saveResult.success) {
        showMsg(saveResult.message || "Save failed", "error");
        setSaving(false);
        return;
      }

      setSaving(false);
      showToast(t("provider.saved"));
    } catch (err) {
      showMsg(t("error.connection") + (err.message || "Unknown error"), "error");
      setSaving(false);
    }
  }

  function buildParams(apiKey) {
    var params = { provider: currentProvider, apiKey: apiKey };

    if (currentProvider === "custom") {
      var baseURL = (els.baseURLInput.value || "").trim();
      var modelID = (els.modelInput.value || "").trim();
      if (!baseURL) { showMsg(t("error.noBaseUrl"), "error"); return null; }
      if (!modelID) { showMsg(t("error.noModelId"), "error"); return null; }
      params.baseURL = baseURL;
      params.modelID = modelID;
      params.apiType = document.querySelector('input[name="apiType"]:checked').value;
      params.supportImage = els.supportImageCheckbox.checked;
    } else {
      params.modelID = els.modelSelect.value;
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
    els.btnChSave.disabled = loading;
    els.btnChSaveText.textContent = loading ? t("feishu.saving") : t("feishu.save");
    els.btnChSaveSpinner.classList.toggle("hidden", !loading);
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

  // 同步待审批/已授权刷新按钮状态。
  function updateChAccessRefreshState() {
    var loading = chPairingLoading || chApprovedLoading;
    var busy = loading || chGroupAdding || !!chPairingApprovingCode || !!chPairingRejectingCode || !!chApprovedRemovingKey;
    if (els.btnChAccessRefresh) {
      els.btnChAccessRefresh.disabled = busy;
    }
    if (els.btnChAccessAddGroup) {
      var allowAdd = isChEnabled() && isChGroupAllowlistMode() && !busy;
      els.btnChAccessAddGroup.disabled = !allowAdd;
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
    var listEl = els.chAccessList;
    var emptyEl = els.chAccessEmpty;
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
    if (!isChEnabled() || !isChPairingMode()) {
      chPairingRequests = [];
      chPairingApprovingCode = "";
      chPairingRejectingCode = "";
      renderChAccessEntries();
      return;
    }

    setChPairingLoading(true);
    if (!silent) hideChMsg();
    try {
      var result = await window.oneclaw.settingsListFeishuPairing();
      if (!result.success) {
        if (!silent) showChMsg(result.message || t("error.loadPairingFailed"), "error");
        chPairingRequests = [];
      } else {
        chPairingRequests = (result.data && result.data.requests) || [];
      }
      renderChAccessEntries();
    } catch (err) {
      chPairingRequests = [];
      renderChAccessEntries();
      if (!silent) showChMsg(t("error.connection") + (err.message || "Unknown error"), "error");
    } finally {
      setChPairingLoading(false);
    }
  }

  // 读取飞书已配对账号列表（仅在飞书开关启用后展示）。
  async function loadChApprovedEntries(options) {
    var silent = !!(options && options.silent);
    if (!isChEnabled() || !isChAccessPanelMode()) {
      chApprovedEntries = [];
      renderChAccessEntries();
      return;
    }

    setChApprovedLoading(true);
    if (!silent) hideChMsg();
    try {
      var result = await window.oneclaw.settingsListFeishuApproved();
      if (!result.success) {
        if (!silent) showChMsg(result.message || t("error.loadApprovedFailed"), "error");
        chApprovedEntries = [];
      } else {
        chApprovedEntries = (result.data && result.data.entries) || [];
      }
      renderChAccessEntries();
    } catch (err) {
      chApprovedEntries = [];
      renderChAccessEntries();
      if (!silent) showChMsg(t("error.connection") + (err.message || "Unknown error"), "error");
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
    if (!payload || !Array.isArray(payload.requests)) {
      return;
    }
    var requests = payload.requests
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
      showChMsg(t("error.noPairingCode"), "error");
      return;
    }
    if (chPairingApprovingCode || chPairingRejectingCode) return;

    chPairingApprovingCode = trimmed;
    renderChAccessEntries();
    updateChAccessRefreshState();
    hideChMsg();

    try {
      var result = await window.oneclaw.settingsApproveFeishuPairing({
        code: trimmed,
        id: String(id || "").trim(),
        name: String(name || "").trim(),
      });
      if (!result.success) {
        showChMsg(result.message || t("error.verifyFailed"), "error");
      } else {
        showToast(t("feishu.pairingApproved"));
        await refreshChPairingPanels({ silent: true });
      }
    } catch (err) {
      showChMsg(t("error.connection") + (err.message || "Unknown error"), "error");
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
      showChMsg(t("error.noPairingCode"), "error");
      return;
    }
    if (chPairingApprovingCode || chPairingRejectingCode) return;

    chPairingRejectingCode = trimmed;
    renderChAccessEntries();
    updateChAccessRefreshState();
    hideChMsg();

    try {
      var result = await window.oneclaw.settingsRejectFeishuPairing({
        code: trimmed,
        id: String(id || "").trim(),
        name: String(name || "").trim(),
      });
      if (!result.success) {
        showChMsg(result.message || t("error.verifyFailed"), "error");
      } else {
        showToast(t("feishu.pairingRejected"));
        await refreshChPairingPanels({ silent: true });
      }
    } catch (err) {
      showChMsg(t("error.connection") + (err.message || "Unknown error"), "error");
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
      showChMsg(t("error.removeApprovedFailed"), "error");
      return;
    }
    if (chApprovedRemovingKey) return;

    chApprovedRemovingKey = entryKind + ":" + entryId;
    renderChAccessEntries();
    updateChAccessRefreshState();
    hideChMsg();

    try {
      var result = await window.oneclaw.settingsRemoveFeishuApproved({
        kind: entryKind,
        id: entryId,
      });
      if (!result.success) {
        showChMsg(result.message || t("error.removeApprovedFailed"), "error");
      } else {
        showToast(t("feishu.approvedRemoved"));
        await refreshChPairingPanels({ silent: true });
      }
    } catch (err) {
      showChMsg(t("error.connection") + (err.message || "Unknown error"), "error");
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
    if (!els.chPairingSection) return;
    toggleEl(els.chPairingSection, isChEnabled() && isChAccessPanelMode());
    updateChAccessRefreshState();
  }

  // 仅在群聊白名单模式下显示“添加群 ID”按钮。
  function updateChGroupAllowFromState() {
    if (!els.btnChAccessAddGroup) return;
    toggleEl(els.btnChAccessAddGroup, isChGroupAllowlistMode());
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
          showToast(t("feishu.saved"));
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

    if (!appId) { showChMsg(t("error.noAppId"), "error"); return; }
    if (!appSecret) { showChMsg(t("error.noAppSecret"), "error"); return; }
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
        setChSaving(false);
        return;
      }

      setChSaving(false);
      showToast(t("feishu.saved"));
      refreshChPairingPanels({ silent: true });
    } catch (err) {
      showChMsg(t("error.connection") + (err.message || "Unknown error"), "error");
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
      toggleEl(els.chFields, !!enabled);
      updateChPairingSectionVisibility();
      updateChGroupAllowFromState();
      refreshChPairingPanels({ silent: true });
    } catch (err) {
      console.error("[Settings] loadChannelConfig failed:", err);
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

  // 刷新 CLI 状态与按钮文案，确保安装/卸载动作对用户可见。
  function renderCliControls() {
    if (!els.cliStatusText || !els.btnCliToggle || !els.btnCliToggleText || !els.btnCliToggleSpinner) {
      return;
    }

    els.cliStatusText.textContent = cliInstalled
      ? t("advanced.cliStatusInstalled")
      : t("advanced.cliStatusNotInstalled");

    if (cliOperating) {
      els.btnCliToggleText.textContent = cliInstalled
        ? t("advanced.cliUninstalling")
        : t("advanced.cliInstalling");
    } else {
      els.btnCliToggleText.textContent = cliInstalled
        ? t("advanced.cliUninstall")
        : t("advanced.cliInstall");
    }

    els.btnCliToggle.disabled = cliOperating;
    els.btnCliToggleSpinner.classList.toggle("hidden", !cliOperating);
  }

  // 读取主进程 CLI 安装状态；若当前版本未提供接口，则安全降级为禁用按钮。
  async function loadCliStatus() {
    if (
      !window.oneclaw ||
      typeof window.oneclaw.settingsGetCliStatus !== "function" ||
      typeof window.oneclaw.settingsInstallCli !== "function" ||
      typeof window.oneclaw.settingsUninstallCli !== "function"
    ) {
      if (els.cliStatusText) {
        els.cliStatusText.textContent = t("advanced.cliStatusUnknown");
      }
      if (els.btnCliToggle) {
        els.btnCliToggle.disabled = true;
      }
      return;
    }

    try {
      var result = await window.oneclaw.settingsGetCliStatus();
      if (!result || !result.success || !result.data) {
        if (els.cliStatusText) {
          els.cliStatusText.textContent = t("advanced.cliStatusUnknown");
        }
        return;
      }
      cliInstalled = result.data.installed === true;
      renderCliControls();
    } catch (err) {
      if (els.cliStatusText) {
        els.cliStatusText.textContent = t("advanced.cliStatusUnknown");
      }
      console.error("[Settings] loadCliStatus failed:", err);
    }
  }

  // 控制 CLI 按钮 loading 态，避免重复点击导致并发安装/卸载。
  function setCliOperating(loading) {
    cliOperating = loading;
    renderCliControls();
  }

  // 点击同一个按钮在安装和卸载之间切换，便于老用户迁移。
  async function handleCliToggle() {
    if (cliOperating) return;
    hideAdvMsg();

    if (
      !window.oneclaw ||
      typeof window.oneclaw.settingsInstallCli !== "function" ||
      typeof window.oneclaw.settingsUninstallCli !== "function"
    ) {
      showAdvMsg(t("advanced.cliUnavailable"), "error");
      return;
    }

    var isUninstall = cliInstalled === true;
    if (isUninstall && !window.confirm(t("advanced.cliUninstallConfirm"))) {
      return;
    }

    setCliOperating(true);
    try {
      var result = isUninstall
        ? await window.oneclaw.settingsUninstallCli()
        : await window.oneclaw.settingsInstallCli();

      if (!result || !result.success) {
        showAdvMsg(result?.message || t("advanced.cliOpFailed"), "error");
        await loadCliStatus();
        setCliOperating(false);
        return;
      }

      await loadCliStatus();
      setCliOperating(false);
      showToast(isUninstall ? t("advanced.cliUninstallDone") : t("advanced.cliInstallDone"));
      if (result.message) {
        showAdvMsg(result.message, "success");
      }
    } catch (err) {
      await loadCliStatus();
      setCliOperating(false);
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

    try {
      var result = await window.oneclaw.settingsSaveAdvanced({
        browserProfile: browserProfile,
        imessageEnabled: imessageEnabled,
        launchAtLogin: launchAtLogin,
      });
      setAdvSaving(false);
      if (result.success) {
        showToast(t("advanced.saved"));
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
      showToast(t("appearance.saved"));
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
    els.btnKimiSave.disabled = loading;
    els.btnKimiSaveText.textContent = loading ? t("kimi.saving") : t("kimi.save");
    els.btnKimiSaveSpinner.classList.toggle("hidden", !loading);
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
      toggleEl(els.kimiFields, !!enabled);
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
          showToast(t("kimi.saved"));
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
      return;
    }

    setKimiSaving(true);
    hideKimiMsg();

    try {
      var result = await window.oneclaw.settingsSaveKimiConfig({ botToken: botToken, enabled: true });
      if (!result.success) {
        showKimiMsg(result.message || "Save failed", "error");
        setKimiSaving(false);
        return;
      }

      setKimiSaving(false);
      showToast(t("kimi.saved"));
    } catch (err) {
      setKimiSaving(false);
      showKimiMsg(t("error.connection") + (err.message || "Unknown error"), "error");
    }
  }

  // ── 从配置 + 预设合并出模型列表（配置优先，预设补充） ──

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
      var names = { "moonshot-cn": "Moonshot CN", "moonshot-ai": "Moonshot AI", "kimi-code": "Kimi 会员订阅" };
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

      // 用配置中的模型列表 + 预设合并后重新填充下拉
      if (provider !== "custom") {
        var merged = buildMergedModelList(
          data.configuredModels,
          provider,
          data.subPlatform
        );
        if (merged.length > 0) {
          populateModels(merged);
        }

        // 选中 primary model
        if (data.modelID) {
          var found = false;
          for (var i = 0; i < els.modelSelect.options.length; i++) {
            if (els.modelSelect.options[i].value === data.modelID) {
              els.modelSelect.selectedIndex = i;
              found = true;
              break;
            }
          }
          // 仍未找到（理论上不会，合并已覆盖）→ 追加
          if (!found) {
            var opt = document.createElement("option");
            opt.value = data.modelID;
            opt.textContent = data.modelID;
            els.modelSelect.appendChild(opt);
            els.modelSelect.value = data.modelID;
          }
        }
      }

      // Custom 专属字段
      if (provider === "custom") {
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
      loadKimiConfig(),
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
        }
      });
    }

    // 平台链接
    els.platformLink.addEventListener("click", function (e) {
      e.preventDefault();
      var url = els.platformLink.dataset.url;
      if (url && window.oneclaw && window.oneclaw.openExternal) {
        window.oneclaw.openExternal(url);
      }
    });

    // 密码可见性
    els.btnToggleKey.addEventListener("click", togglePasswordVisibility);

    // 保存
    els.btnSave.addEventListener("click", handleSave);

    // Enter 键保存
    els.apiKeyInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") handleSave();
    });

    // Channels tab — 启用/禁用切换
    els.chEnabled.addEventListener("change", function () {
      toggleEl(els.chFields, isChEnabled());
      updateChPairingSectionVisibility();
      updateChGroupAllowFromState();
      refreshChPairingPanels({ silent: true });
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
    els.chConsoleLink.addEventListener("click", function (e) {
      e.preventDefault();
      if (window.oneclaw && window.oneclaw.openExternal) {
        window.oneclaw.openExternal("https://open.feishu.cn/app");
      }
    });
    els.btnChSave.addEventListener("click", handleChSave);
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
      if (e.key === "Enter") handleChSave();
    });
    // Kimi tab — 启用/禁用切换 + Token 可见性
    els.kimiEnabled.addEventListener("change", function () { toggleEl(els.kimiFields, isKimiEnabled()); });
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
    els.btnKimiSave.addEventListener("click", handleKimiSave);
    els.kimiBotPageLink.addEventListener("click", function (e) {
      e.preventDefault();
      if (window.oneclaw && window.oneclaw.openExternal) {
        window.oneclaw.openExternal("https://www.kimi.com/bot?utm_source=oneclaw");
      }
    });

    // Advanced
    els.btnAdvSave.addEventListener("click", handleAdvSave);
    if (els.btnCliToggle) {
      els.btnCliToggle.addEventListener("click", handleCliToggle);
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
    if (window.oneclaw && window.oneclaw.onFeishuPairingState) {
      window.oneclaw.onFeishuPairingState(function (payload) {
        if (!isChEnabled() || !isChPairingMode()) {
          return;
        }
        applyChPairingStateFromPush(payload);
      });
    }
  }

  // ── 初始化 ──

  function init() {
    detectLang();
    applyI18n();

    bindEvents();
    switchProvider("anthropic");
    switchTab(initialTab || "provider");
    applyRecoveryNotice(startupNotice);
    loadCurrentConfig();
    loadChannelConfig();
    loadKimiConfig();
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
