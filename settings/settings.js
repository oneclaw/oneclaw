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
      "nav.doctor": "Doctor",
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
      "feishu.pairingTitle": "Pending Pairing Requests",
      "feishu.refreshPairing": "Refresh",
      "feishu.refreshingPairing": "Refreshing…",
      "feishu.noPairingPending": "No pending pairing requests.",
      "feishu.approvePairing": "Approve",
      "feishu.approvingPairing": "Approving…",
      "feishu.pairingApproved": "Pairing request approved.",
      "error.noPairingCode": "Invalid pairing code.",
      "error.loadPairingFailed": "Failed to load pairing requests.",
      "error.noAppId": "Please enter the Feishu App ID.",
      "error.noAppSecret": "Please enter the App Secret.",
      "error.noKey": "Please enter your API key.",
      "error.noBaseUrl": "Please enter the Base URL.",
      "error.noModelId": "Please enter the Model ID.",
      "error.verifyFailed": "Verification failed. Please check your API key.",
      "error.connection": "Connection error: ",
      "doctor.title": "Doctor",
      "doctor.desc": "Run diagnostics and auto-repair configuration issues.",
      "doctor.run": "Run Doctor",
      "doctor.running": "Running…",
      "doctor.pass": "All checks passed (exit code: 0)",
      "doctor.fail": "Some checks failed (exit code: {code})",
      "nav.kimi": "KimiClaw",
      "nav.appearance": "Appearance",
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
    },
    zh: {
      "title": "设置",
      "nav.provider": "模型配置",
      "nav.feishu": "飞书集成",
      "nav.doctor": "诊断修复",
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
      "feishu.pairingTitle": "待审批配对请求",
      "feishu.refreshPairing": "刷新",
      "feishu.refreshingPairing": "刷新中…",
      "feishu.noPairingPending": "当前没有待审批请求。",
      "feishu.approvePairing": "批准",
      "feishu.approvingPairing": "批准中…",
      "feishu.pairingApproved": "配对请求已批准。",
      "error.noPairingCode": "配对码无效。",
      "error.loadPairingFailed": "读取待审批请求失败。",
      "error.noAppId": "请输入飞书应用 ID。",
      "error.noAppSecret": "请输入应用密钥。",
      "error.noKey": "请输入 API 密钥。",
      "error.noBaseUrl": "请输入接口地址。",
      "error.noModelId": "请输入模型 ID。",
      "error.verifyFailed": "验证失败，请检查 API 密钥。",
      "error.connection": "连接错误：",
      "doctor.title": "诊断修复",
      "doctor.desc": "运行诊断并自动修复配置问题。",
      "doctor.run": "运行诊断",
      "doctor.running": "运行中…",
      "doctor.pass": "全部检查通过（退出码：0）",
      "doctor.fail": "部分检查未通过（退出码：{code}）",
      "nav.kimi": "KimiClaw",
      "nav.appearance": "外观",
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
      "advanced.save": "保存",
      "advanced.saving": "保存中…",
      "advanced.saved": "设置已保存。",
      "appearance.title": "外观",
      "appearance.desc": "调整主题和聊天展示相关设置。",
      "appearance.theme": "主题",
      "appearance.theme.system": "跟随系统",
      "appearance.theme.light": "浅色",
      "appearance.theme.dark": "深色",
      "appearance.showThinking": "显示思考过程",
      "appearance.save": "保存",
      "appearance.saving": "保存中…",
      "appearance.saved": "外观设置已保存。",
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
    btnToggleChSecret: $("#btnToggleChSecret"),
    chConsoleLink: $("#chConsoleLink"),
    chMsgBox: $("#chMsgBox"),
    btnChSave: $("#btnChSave"),
    btnChSaveText: $("#btnChSave .btn-text"),
    btnChSaveSpinner: $("#btnChSave .btn-spinner"),
    btnChPairingRefresh: $("#btnChPairingRefresh"),
    chPairingEmpty: $("#chPairingEmpty"),
    chPairingList: $("#chPairingList"),
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
    // Doctor tab
    btnDoctor: $("#btnDoctor"),
    btnDoctorText: $("#btnDoctor .btn-text"),
    btnDoctorSpinner: $("#btnDoctor .btn-spinner"),
    doctorLog: $("#doctorLog"),
    doctorExit: $("#doctorExit"),
    // Advanced tab
    imessageEnabled: $("#imessageEnabled"),
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
  };

  // ── 状态 ──

  let currentProvider = "anthropic";
  let saving = false;
  let chSaving = false;
  let chPairingLoading = false;
  let chPairingApprovingCode = "";
  let chPairingRequests = [];
  let kimiSaving = false;
  let doctorRunning = false;
  let advSaving = false;
  let appearanceSaving = false;
  let currentLang = "en";

  // ── 语言 ──

  function detectLang() {
    const params = new URLSearchParams(window.location.search);
    const lang = params.get("lang");
    currentLang = lang && I18N[lang] ? lang : "en";
  }

  function t(key) {
    return (I18N[currentLang] && I18N[currentLang][key]) || I18N.en[key] || key;
  }

  function applyI18n() {
    document.title = t("title");
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
  }

  // ── Tab 切换 ──

  function switchTab(tabName) {
    els.navItems.forEach((item) => {
      item.classList.toggle("active", item.dataset.tab === tabName);
    });
    els.tabPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.id === "tab" + capitalize(tabName));
    });
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

  // 将 ISO 时间转换为本地可读时间，异常时回退原始字符串。
  function formatLocalTime(value) {
    if (!value) return "";
    var date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }

  // 切换飞书配对列表刷新状态。
  function setChPairingLoading(loading) {
    chPairingLoading = loading;
    if (!els.btnChPairingRefresh) return;
    els.btnChPairingRefresh.disabled = loading || !!chPairingApprovingCode;
    els.btnChPairingRefresh.textContent = loading
      ? t("feishu.refreshingPairing")
      : t("feishu.refreshPairing");
  }

  // 渲染飞书待审批配对列表。
  function renderChPairingRequests() {
    var listEl = els.chPairingList;
    var emptyEl = els.chPairingEmpty;
    if (!listEl || !emptyEl) return;

    if (!Array.isArray(chPairingRequests) || chPairingRequests.length === 0) {
      listEl.innerHTML = "";
      toggleEl(listEl, false);
      toggleEl(emptyEl, true);
      return;
    }

    toggleEl(emptyEl, false);
    toggleEl(listEl, true);

    listEl.innerHTML = chPairingRequests.map(function (item) {
      var code = String(item.code || "");
      var isApproving = chPairingApprovingCode === code;
      var buttonText = isApproving ? t("feishu.approvingPairing") : t("feishu.approvePairing");
      var name = String(item.name || "");
      var nameText = name ? " · " + escapeHtml(name) : "";
      var createdAt = formatLocalTime(item.createdAt);
      var createdText = createdAt ? " · " + escapeHtml(createdAt) : "";
      return [
        '<div class="pairing-item">',
        '  <div class="pairing-item-main">',
        '    <div class="pairing-id">' + escapeHtml(item.id || "") + nameText + "</div>",
        '    <div class="pairing-meta"><span class="pairing-code">' + escapeHtml(code) + "</span>" + createdText + "</div>",
        "  </div>",
        '  <button type="button" class="btn-secondary" data-pairing-approve="' + escapeHtml(code) + '"' + (isApproving ? " disabled" : "") + ">",
        "    " + buttonText,
        "  </button>",
        "</div>",
      ].join("");
    }).join("");
  }

  // 读取飞书待审批列表（仅在飞书开关启用后展示）。
  async function loadChPairingRequests(options) {
    var silent = !!(options && options.silent);
    if (!isChEnabled()) {
      chPairingRequests = [];
      chPairingApprovingCode = "";
      renderChPairingRequests();
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
      renderChPairingRequests();
    } catch (err) {
      chPairingRequests = [];
      renderChPairingRequests();
      if (!silent) showChMsg(t("error.connection") + (err.message || "Unknown error"), "error");
    } finally {
      setChPairingLoading(false);
    }
  }

  // 批准指定飞书配对码，并自动刷新列表。
  async function handleChPairingApprove(code) {
    var trimmed = String(code || "").trim();
    if (!trimmed) {
      showChMsg(t("error.noPairingCode"), "error");
      return;
    }
    if (chPairingApprovingCode) return;

    chPairingApprovingCode = trimmed;
    renderChPairingRequests();
    setChPairingLoading(chPairingLoading);
    hideChMsg();

    try {
      var result = await window.oneclaw.settingsApproveFeishuPairing({ code: trimmed });
      if (!result.success) {
        showChMsg(result.message || t("error.verifyFailed"), "error");
      } else {
        showToast(t("feishu.pairingApproved"));
        await loadChPairingRequests({ silent: true });
      }
    } catch (err) {
      showChMsg(t("error.connection") + (err.message || "Unknown error"), "error");
    } finally {
      chPairingApprovingCode = "";
      renderChPairingRequests();
      setChPairingLoading(false);
    }
  }

  // 获取飞书启用/禁用状态
  function isChEnabled() {
    return els.chEnabled.checked;
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
          loadChPairingRequests({ silent: true });
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

      var saveResult = await window.oneclaw.settingsSaveChannel({ appId: appId, appSecret: appSecret, enabled: true });
      if (!saveResult.success) {
        showChMsg(saveResult.message || "Save failed", "error");
        setChSaving(false);
        return;
      }

      setChSaving(false);
      showToast(t("feishu.saved"));
      loadChPairingRequests({ silent: true });
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
      toggleEl(els.chFields, !!enabled);
      loadChPairingRequests({ silent: true });
    } catch (err) {
      console.error("[Settings] loadChannelConfig failed:", err);
    }
  }

  // ── Doctor ──

  async function handleDoctor() {
    if (doctorRunning) return;
    setDoctorRunning(true);

    // 清空上次输出
    els.doctorLog.textContent = "";
    els.doctorLog.classList.remove("hidden");
    els.doctorExit.classList.add("hidden");

    try {
      var result = await window.oneclaw.settingsRunDoctor();
      if (!result.success) {
        els.doctorLog.textContent = result.message || "Failed to start doctor";
        setDoctorRunning(false);
      }
      // 成功时等待流式输出 + exit 事件
    } catch (err) {
      els.doctorLog.textContent = (err && err.message) || "Failed to start doctor";
      setDoctorRunning(false);
    }
  }

  // Doctor 流式输出回调
  function onDoctorOutput(text) {
    els.doctorLog.textContent += text;
    // 自动滚动到底部
    els.doctorLog.scrollTop = els.doctorLog.scrollHeight;
  }

  // Doctor 退出回调
  function onDoctorExit(code) {
    setDoctorRunning(false);
    els.doctorExit.classList.remove("hidden");
    if (code === 0) {
      els.doctorExit.textContent = t("doctor.pass");
      els.doctorExit.className = "doctor-exit pass";
    } else {
      els.doctorExit.textContent = t("doctor.fail").replace("{code}", String(code));
      els.doctorExit.className = "doctor-exit fail";
    }
  }

  // ── Advanced ──

  // 加载高级配置
  async function loadAdvancedConfig() {
    try {
      var result = await window.oneclaw.settingsGetAdvanced();
      if (!result.success || !result.data) return;

      var data = result.data;
      // 回填 browser profile radio
      var radio = document.querySelector('input[name="browserProfile"][value="' + data.browserProfile + '"]');
      if (radio) radio.checked = true;
      // 回填 iMessage toggle
      els.imessageEnabled.checked = !!data.imessageEnabled;
    } catch (err) {
      console.error("[Settings] loadAdvancedConfig failed:", err);
    }
  }

  // 保存高级配置
  async function handleAdvSave() {
    if (advSaving) return;
    setAdvSaving(true);
    hideAdvMsg();

    var browserProfile = document.querySelector('input[name="browserProfile"]:checked').value;
    var imessageEnabled = els.imessageEnabled.checked;

    try {
      var result = await window.oneclaw.settingsSaveAdvanced({
        browserProfile: browserProfile,
        imessageEnabled: imessageEnabled,
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
      var names = { "moonshot-cn": "Moonshot CN", "moonshot-ai": "Moonshot AI", "kimi-code": "Kimi Code" };
      return names[subPlatform] || "Moonshot";
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

  function setDoctorRunning(loading) {
    doctorRunning = loading;
    els.btnDoctor.disabled = loading;
    els.btnDoctorText.textContent = loading ? t("doctor.running") : t("doctor.run");
    els.btnDoctorSpinner.classList.toggle("hidden", !loading);
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
      loadChPairingRequests({ silent: true });
    });
    els.btnToggleChSecret.addEventListener("click", togglePasswordVisibility);
    els.chConsoleLink.addEventListener("click", function (e) {
      e.preventDefault();
      if (window.oneclaw && window.oneclaw.openExternal) {
        window.oneclaw.openExternal("https://open.feishu.cn/app");
      }
    });
    els.btnChSave.addEventListener("click", handleChSave);
    if (els.btnChPairingRefresh) {
      els.btnChPairingRefresh.addEventListener("click", function () {
        loadChPairingRequests();
      });
    }
    if (els.chPairingList) {
      els.chPairingList.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-pairing-approve]");
        if (!btn) return;
        handleChPairingApprove(btn.getAttribute("data-pairing-approve"));
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

    // Doctor
    els.btnDoctor.addEventListener("click", handleDoctor);

    // Advanced
    els.btnAdvSave.addEventListener("click", handleAdvSave);

    // Appearance
    els.btnAppearanceSave.addEventListener("click", handleAppearanceSave);

    // Doctor 流式输出监听
    if (window.oneclaw && window.oneclaw.onDoctorOutput) {
      window.oneclaw.onDoctorOutput(onDoctorOutput);
    }
    if (window.oneclaw && window.oneclaw.onDoctorExit) {
      window.oneclaw.onDoctorExit(onDoctorExit);
    }
  }

  // ── 初始化 ──

  function init() {
    detectLang();
    applyI18n();

    bindEvents();
    switchProvider("anthropic");
    loadCurrentConfig();
    loadChannelConfig();
    loadKimiConfig();
    loadAdvancedConfig();
    loadAppearanceSettings();
  }

  init();
})();
