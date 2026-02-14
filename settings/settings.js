// ============================================
// OneClaw Settings — 双栏设置交互逻辑
// ============================================

(function () {
  "use strict";

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
      "nav.channels": "Feishu Integration",
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
      "channel.title": "Feishu Integration",
      "channel.desc": "Connect Feishu to chat with AI directly in your group.",
      "channel.appId": "Feishu App ID",
      "channel.appSecret": "App Secret",
      "channel.getKey": "Open Feishu Console →",
      "channel.save": "Save",
      "channel.saving": "Saving…",
      "channel.saved": "Feishu integration saved.",
      "channel.status": "Connected: Feishu",
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
      "nav.advanced": "Advanced",
      "advanced.title": "Advanced",
      "advanced.desc": "Browser tool and messaging channel settings.",
      "advanced.browserProfile": "Browser Profile",
      "advanced.browserOpenclaw": "Standalone browser instance",
      "advanced.browserChrome": "Chrome extension",
      "advanced.imessage": "iMessage channel",
      "advanced.imessageOn": "Enable",
      "advanced.imessageOff": "Disable",
      "advanced.save": "Save",
      "advanced.saving": "Saving…",
      "advanced.saved": "Settings saved.",
    },
    zh: {
      "title": "设置",
      "nav.provider": "模型配置",
      "nav.channels": "飞书集成",
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
      "channel.title": "飞书集成",
      "channel.desc": "连接飞书，在群聊中直接与 AI 对话。",
      "channel.appId": "飞书应用 ID",
      "channel.appSecret": "应用密钥",
      "channel.getKey": "打开飞书开放平台 →",
      "channel.save": "保存",
      "channel.saving": "保存中…",
      "channel.saved": "飞书集成配置已保存。",
      "channel.status": "已连接: 飞书",
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
      "nav.advanced": "高级选项",
      "advanced.title": "高级选项",
      "advanced.desc": "浏览器工具与消息频道设置。",
      "advanced.browserProfile": "浏览器配置",
      "advanced.browserOpenclaw": "独立浏览器实例",
      "advanced.browserChrome": "Chrome 扩展",
      "advanced.imessage": "iMessage 频道",
      "advanced.imessageOn": "启用",
      "advanced.imessageOff": "禁用",
      "advanced.save": "保存",
      "advanced.saving": "保存中…",
      "advanced.saved": "设置已保存。",
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
    chAppId: $("#chAppId"),
    chAppSecret: $("#chAppSecret"),
    btnToggleChSecret: $("#btnToggleChSecret"),
    chConsoleLink: $("#chConsoleLink"),
    chMsgBox: $("#chMsgBox"),
    chStatus: $("#chStatus"),
    btnChSave: $("#btnChSave"),
    btnChSaveText: $("#btnChSave .btn-text"),
    btnChSaveSpinner: $("#btnChSave .btn-spinner"),
    // Doctor tab
    btnDoctor: $("#btnDoctor"),
    btnDoctorText: $("#btnDoctor .btn-text"),
    btnDoctorSpinner: $("#btnDoctor .btn-spinner"),
    doctorLog: $("#doctorLog"),
    doctorExit: $("#doctorExit"),
    // Advanced tab
    advMsgBox: $("#advMsgBox"),
    btnAdvSave: $("#btnAdvSave"),
    btnAdvSaveText: $("#btnAdvSave .btn-text"),
    btnAdvSaveSpinner: $("#btnAdvSave .btn-spinner"),
  };

  // ── 状态 ──

  let currentProvider = "anthropic";
  let saving = false;
  let chSaving = false;
  let doctorRunning = false;
  let advSaving = false;
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

  // ── 密码可见性切换 ──

  function toggleKeyVisibility() {
    var input = els.apiKeyInput;
    var isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    var eyeOn = els.btnToggleKey.querySelector(".icon-eye");
    var eyeOff = els.btnToggleKey.querySelector(".icon-eye-off");
    eyeOn.classList.toggle("hidden", !isPassword);
    eyeOff.classList.toggle("hidden", isPassword);
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
      showMsg(t("provider.saved"), "success");
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

  // 频道密码可见性切换
  function toggleChSecretVisibility() {
    var input = els.chAppSecret;
    var isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    var eyeOn = els.btnToggleChSecret.querySelector(".icon-eye");
    var eyeOff = els.btnToggleChSecret.querySelector(".icon-eye-off");
    eyeOn.classList.toggle("hidden", !isPassword);
    eyeOff.classList.toggle("hidden", isPassword);
  }

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
    els.btnChSaveText.textContent = loading ? t("channel.saving") : t("channel.save");
    els.btnChSaveSpinner.classList.toggle("hidden", !loading);
  }

  // 保存频道配置
  async function handleChSave() {
    if (chSaving) return;

    var appId = els.chAppId.value.trim();
    var appSecret = els.chAppSecret.value.trim();

    if (!appId) { showChMsg(t("error.noAppId"), "error"); return; }
    if (!appSecret) { showChMsg(t("error.noAppSecret"), "error"); return; }

    setChSaving(true);
    hideChMsg();

    try {
      // 先验证飞书凭据
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

      // 保存配置
      var saveResult = await window.oneclaw.settingsSaveChannel({ appId: appId, appSecret: appSecret });
      if (!saveResult.success) {
        showChMsg(saveResult.message || "Save failed", "error");
        setChSaving(false);
        return;
      }

      setChSaving(false);
      showChMsg(t("channel.saved"), "success");
      // 更新状态指示
      els.chStatus.textContent = t("channel.status");
      els.chStatus.classList.remove("hidden");
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

      // 有配置且已启用 → 显示连接状态
      if (data.enabled && data.appId) {
        els.chStatus.textContent = t("channel.status");
        els.chStatus.classList.remove("hidden");
      }
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
      // 回填 iMessage radio
      var imVal = data.imessageEnabled ? "on" : "off";
      var imRadio = document.querySelector('input[name="imessageEnabled"][value="' + imVal + '"]');
      if (imRadio) imRadio.checked = true;
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
    var imessageEnabled = document.querySelector('input[name="imessageEnabled"]:checked').value === "on";

    try {
      var result = await window.oneclaw.settingsSaveAdvanced({
        browserProfile: browserProfile,
        imessageEnabled: imessageEnabled,
      });
      setAdvSaving(false);
      if (result.success) {
        showAdvMsg(t("advanced.saved"), "success");
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
    els.btnToggleKey.addEventListener("click", toggleKeyVisibility);

    // 保存
    els.btnSave.addEventListener("click", handleSave);

    // Enter 键保存
    els.apiKeyInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") handleSave();
    });

    // Channels tab
    els.btnToggleChSecret.addEventListener("click", toggleChSecretVisibility);
    els.chConsoleLink.addEventListener("click", function (e) {
      e.preventDefault();
      if (window.oneclaw && window.oneclaw.openExternal) {
        window.oneclaw.openExternal("https://open.feishu.cn/app");
      }
    });
    els.btnChSave.addEventListener("click", handleChSave);
    els.chAppSecret.addEventListener("keydown", function (e) {
      if (e.key === "Enter") handleChSave();
    });
    // Doctor
    els.btnDoctor.addEventListener("click", handleDoctor);

    // Advanced
    els.btnAdvSave.addEventListener("click", handleAdvSave);

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
    loadAdvancedConfig();
  }

  init();
})();
