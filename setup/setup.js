// ============================================
// OneClaw Setup — 四步向导交互逻辑
// ============================================

(function () {
  "use strict";

  // ---- Provider 预设配置 ----
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

  // Moonshot 子平台各自的 URL
  const SUB_PLATFORM_URLS = {
    "moonshot-cn": "https://platform.moonshot.cn?utm_source=oneclaw",
    "moonshot-ai": "https://platform.moonshot.ai?utm_source=oneclaw",
    "kimi-code": "https://kimi.com/code?utm_source=oneclaw",
  };

  // Kimi Code 子平台使用独立模型列表
  const KIMI_CODE_MODELS = ["k2p5"];

  // ---- 国际化文案 ----
  const I18N = {
    en: {
      title: "OneClaw Setup",
      "welcome.title": "Welcome to OneClaw",
      "welcome.subtitle": "Your intelligent desktop assistant powered by large language models. Let's get you set up in just a few steps.",
      "welcome.security.title": "Your keys stay local",
      "welcome.security.desc": "API keys are stored securely on your machine and never sent to any third-party server.",
      "welcome.next": "Next",
      "config.title": "Configure Provider",
      "config.subtitle": "Choose your LLM provider and enter your API key.",
      "config.platform": "Platform",
      "config.baseUrl": "Base URL",
      "config.apiKey": "API Key",
      "config.getKey": "Get API Key →",
      "config.model": "Model",
      "config.modelId": "Model ID",
      "config.apiType": "API Type",
      "config.custom": "Custom",
      "config.back": "Back",
      "config.verify": "Verify & Continue",
      "config.imageSupport": "Model supports image input",
      "channel.title": "Connect Channels (Optional)",
      "channel.subtitle": "Connect channels to extend OneClaw capabilities.",
      "channel.kimiTitle": "KimiClaw",
      "channel.kimiDesc": "Control OneClaw remotely via Kimi",
      "channel.kimiGuide1": "Visit ",
      "channel.kimiGuide2": " → click 'Associate existing OpenClaw' → copy command → paste below",
      "channel.kimiInputLabel": "Paste command or Bot Token",
      "channel.kimiParsed": "Token parsed: ",
      "channel.feishuTitle": "Feishu Integration",
      "channel.feishuDesc": "Chat with AI directly in your Feishu group.",
      "channel.appId": "Feishu App ID",
      "channel.appSecret": "App Secret",
      "channel.getKey": "Open Feishu Console →",
      "channel.skip": "Set up later",
      "channel.continue": "Save & Continue",
      "channel.saving": "Saving...",
      "done.title": "All Set!",
      "done.subtitle": "OneClaw is ready. Here's what you can do:",
      "done.feature1": "Chat with state-of-the-art language models",
      "done.feature2": "Generate and execute code in real time",
      "done.feature3": "Manage multiple conversations and contexts",
      "done.feature4": "Switch providers or models anytime in Settings",
      "done.start": "Start OneClaw",
      "done.starting": "Starting Gateway…",
      "done.startFailed": "Gateway failed to start. Please click Start OneClaw to retry.",
      "error.noKey": "Please enter your API key.",
      "error.noKimiBotToken": "Please paste the command or enter your Bot Token.",
      "error.noBaseUrl": "Please enter the Base URL.",
      "error.noModelId": "Please enter the Model ID.",
      "error.verifyFailed": "Verification failed. Please check your API key.",
      "error.connection": "Connection error: ",
      "error.noAppId": "Please enter the Feishu App ID.",
      "error.noAppSecret": "Please enter the App Secret.",
    },
    zh: {
      title: "OneClaw 安装引导",
      "welcome.title": "欢迎使用 OneClaw",
      "welcome.subtitle": "基于大语言模型的智能桌面助手，只需几步即可完成配置。",
      "welcome.security.title": "密钥安全存储",
      "welcome.security.desc": "API 密钥安全存储在本地设备，绝不会发送到任何第三方服务器。",
      "welcome.next": "下一步",
      "config.title": "配置服务商",
      "config.subtitle": "选择 LLM 服务商并输入 API 密钥。",
      "config.platform": "平台",
      "config.baseUrl": "接口地址",
      "config.apiKey": "API 密钥",
      "config.getKey": "获取密钥 →",
      "config.model": "模型",
      "config.modelId": "模型 ID",
      "config.apiType": "接口类型",
      "config.custom": "自定义",
      "config.back": "返回",
      "config.verify": "验证并继续",
      "config.imageSupport": "模型支持图片输入",
      "channel.title": "连接频道（可选）",
      "channel.subtitle": "通过频道连接外部服务，扩展 OneClaw 能力。",
      "channel.kimiTitle": "KimiClaw",
      "channel.kimiDesc": "通过 Kimi 远程遥控 OneClaw",
      "channel.kimiGuide1": "访问 ",
      "channel.kimiGuide2": ' → 点击"关联已有 OpenClaw" → 复制命令 → 粘贴到下方',
      "channel.kimiInputLabel": "粘贴命令或 Bot Token",
      "channel.kimiParsed": "解析到 Token：",
      "channel.feishuTitle": "飞书集成",
      "channel.feishuDesc": "在飞书群聊中直接与 AI 对话。",
      "channel.appId": "飞书应用 ID",
      "channel.appSecret": "应用密钥",
      "channel.getKey": "打开飞书开放平台 →",
      "channel.skip": "稍后设置",
      "channel.continue": "保存并继续",
      "channel.saving": "保存中...",
      "done.title": "配置完成！",
      "done.subtitle": "OneClaw 已就绪，你可以：",
      "done.feature1": "与最先进的大语言模型对话",
      "done.feature2": "实时生成并执行代码",
      "done.feature3": "管理多个对话和上下文",
      "done.feature4": "随时在设置中切换服务商或模型",
      "done.start": "启动 OneClaw",
      "done.starting": "正在启动 Gateway…",
      "done.startFailed": 'Gateway 启动失败，请点击"启动 OneClaw"重试。',
      "error.noKey": "请输入 API 密钥。",
      "error.noKimiBotToken": "请粘贴命令或输入 Bot Token。",
      "error.noBaseUrl": "请输入接口地址。",
      "error.noModelId": "请输入模型 ID。",
      "error.verifyFailed": "验证失败，请检查 API 密钥。",
      "error.connection": "连接错误：",
      "error.noAppId": "请输入飞书应用 ID。",
      "error.noAppSecret": "请输入应用密钥。",
    },
  };

  // ---- DOM 引用 ----
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    progressFill: $("#progressFill"),
    steps: $$(".step"),
    // Step 1
    btnToStep2: $("#btnToStep2"),
    // Step 2
    providerTabs: $("#providerTabs"),
    platformLink: $("#platformLink"),
    subPlatformGroup: $("#subPlatformGroup"),
    baseURLGroup: $("#baseURLGroup"),
    apiKeyInput: $("#apiKey"),
    btnToggleKey: $("#btnToggleKey"),
    modelSelectGroup: $("#modelSelectGroup"),
    modelSelect: $("#modelSelect"),
    modelInputGroup: $("#modelInputGroup"),
    modelInput: $("#modelInput"),
    apiTypeGroup: $("#apiTypeGroup"),
    imageSupportGroup: $("#imageSupportGroup"),
    imageSupport: $("#imageSupport"),
    errorMsg: $("#errorMsg"),
    btnBackToStep1: $("#btnBackToStep1"),
    btnVerify: $("#btnVerify"),
    btnVerifyText: $("#btnVerify .btn-text"),
    btnVerifySpinner: $("#btnVerify .btn-spinner"),
    // Step 3 — 频道配置
    kimiEnabled: $("#kimiEnabled"),
    kimiFields: $("#kimiFields"),
    kimiCommandInput: $("#kimiCommandInput"),
    kimiParsedToken: $("#kimiParsedToken"),
    kimiMaskedToken: $("#kimiMaskedToken"),
    kimiBotLink: $("#kimiBotLink"),
    feishuEnabled: $("#feishuEnabled"),
    feishuFields: $("#feishuFields"),
    feishuAppId: $("#feishuAppId"),
    feishuAppSecret: $("#feishuAppSecret"),
    btnToggleSecret: $("#btnToggleSecret"),
    feishuConsoleLink: $("#feishuConsoleLink"),
    channelErrorMsg: $("#channelErrorMsg"),
    btnSkipChannel: $("#btnSkipChannel"),
    btnSaveChannels: $("#btnSaveChannels"),
    btnSaveChannelsText: $("#btnSaveChannels .btn-text"),
    btnSaveChannelsSpinner: $("#btnSaveChannels .btn-spinner"),
    // Step 4 — 完成
    btnStart: $("#btnStart"),
    btnStartText: $("#btnStart .btn-text"),
    btnStartSpinner: $("#btnStartSpinner"),
    doneStatus: $("#doneStatus"),
  };

  // ---- 状态 ----
  let currentStep = 1;
  let currentProvider = "anthropic";
  let verifying = false;
  let starting = false;
  let channelSaving = false;
  let currentLang = "en";

  // ---- 语言检测（从 URL ?lang= 参数读取） ----
  function detectLang() {
    const params = new URLSearchParams(window.location.search);
    const lang = params.get("lang");
    currentLang = lang && I18N[lang] ? lang : "en";
  }

  // 翻译取值
  function t(key) {
    return (I18N[currentLang] && I18N[currentLang][key]) || I18N.en[key] || key;
  }

  // 遍历 data-i18n 属性，替换文本
  function applyI18n() {
    document.title = t("title");
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
  }

  // ---- 步骤切换 ----
  function goToStep(step) {
    currentStep = step;
    els.progressFill.style.width = `${step * 25}%`;

    els.steps.forEach((el, i) => {
      el.classList.toggle("active", i + 1 === step);
    });
  }

  // ---- 获取当前 Moonshot 子平台 ----
  function getSubPlatform() {
    const checked = document.querySelector('input[name="subPlatform"]:checked');
    return checked ? checked.value : "moonshot-cn";
  }

  // ---- Provider 切换 ----
  function switchProvider(provider) {
    currentProvider = provider;
    const config = PROVIDERS[provider];

    // 高亮当前 tab
    $$(".provider-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.provider === provider);
    });

    // 更新 API Key 占位符
    els.apiKeyInput.placeholder = config.placeholder;
    els.apiKeyInput.value = "";

    hideError();

    // 平台链接
    updatePlatformLink();

    // Moonshot 子平台
    toggleEl(els.subPlatformGroup, config.hasSubPlatform === true);

    // Custom 专属字段
    const isCustom = provider === "custom";
    toggleEl(els.baseURLGroup, isCustom);
    toggleEl(els.modelInputGroup, isCustom);
    toggleEl(els.apiTypeGroup, isCustom);
    toggleEl(els.imageSupportGroup, isCustom);

    // 模型选择
    toggleEl(els.modelSelectGroup, !isCustom);

    if (!isCustom) {
      updateModels();
    }
  }

  // ---- 更新平台链接 ----
  function updatePlatformLink() {
    let url = PROVIDERS[currentProvider].platformUrl || "";
    // Moonshot 子平台各有独立 URL
    if (currentProvider === "moonshot") {
      url = SUB_PLATFORM_URLS[getSubPlatform()] || "";
    }
    if (url) {
      els.platformLink.textContent = t("config.getKey");
      els.platformLink.dataset.url = url;
      els.platformLink.classList.remove("hidden");
    } else {
      els.platformLink.classList.add("hidden");
    }
  }

  // ---- 更新模型列表（Moonshot 子平台会影响列表） ----
  function updateModels() {
    const config = PROVIDERS[currentProvider];
    if (currentProvider === "moonshot" && getSubPlatform() === "kimi-code") {
      populateModels(KIMI_CODE_MODELS);
    } else {
      populateModels(config.models);
    }
  }

  // 填充模型下拉选项
  function populateModels(models) {
    els.modelSelect.innerHTML = "";
    models.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      els.modelSelect.appendChild(opt);
    });
  }

  // ---- 密码可见性切换 ----
  function toggleKeyVisibility() {
    const input = els.apiKeyInput;
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";

    const eyeOn = els.btnToggleKey.querySelector(".icon-eye");
    const eyeOff = els.btnToggleKey.querySelector(".icon-eye-off");
    eyeOn.classList.toggle("hidden", !isPassword);
    eyeOff.classList.toggle("hidden", isPassword);
  }

  // ---- Bot Token 解析 ----

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

  // ---- 验证并保存配置（Step 2） ----
  async function handleVerify() {
    if (verifying) return;

    const apiKey = els.apiKeyInput.value.trim();
    if (!apiKey) {
      showError(t("error.noKey"));
      return;
    }

    const params = buildParams(apiKey);
    if (!params) return;

    setVerifying(true);
    hideError();

    try {
      const result = await window.oneclaw.verifyKey(params);

      if (!result.success) {
        showError(result.message || t("error.verifyFailed"));
        setVerifying(false);
        return;
      }

      await window.oneclaw.saveConfig(buildSavePayload(params));
      setVerifying(false);
      goToStep(3);
    } catch (err) {
      showError(t("error.connection") + (err.message || "Unknown error"));
      setVerifying(false);
    }
  }

  // 根据当前表单状态构建验证参数
  function buildParams(apiKey) {
    const params = {
      provider: currentProvider,
      apiKey,
    };

    if (currentProvider === "custom") {
      const baseURL = ($("#baseURL").value || "").trim();
      const modelID = (els.modelInput.value || "").trim();
      if (!baseURL) {
        showError(t("error.noBaseUrl"));
        return null;
      }
      if (!modelID) {
        showError(t("error.noModelId"));
        return null;
      }
      params.baseURL = baseURL;
      params.modelID = modelID;
      params.apiType = document.querySelector('input[name="apiType"]:checked').value;
      params.supportImage = els.imageSupport.checked;
    } else {
      params.modelID = els.modelSelect.value;
    }

    // Moonshot 子平台
    if (currentProvider === "moonshot") {
      params.subPlatform = getSubPlatform();
    }

    return params;
  }

  // 构建保存配置的 payload
  function buildSavePayload(params) {
    return {
      provider: params.provider,
      apiKey: params.apiKey,
      modelID: params.modelID,
      baseURL: params.baseURL || "",
      api: params.apiType || "",
      subPlatform: params.subPlatform || "",
      supportImage: params.supportImage ?? true,
    };
  }

  // ---- Step 3：保存频道配置 ----
  async function handleSaveChannels() {
    if (channelSaving) return;

    var kimiChecked = els.kimiEnabled.checked;
    var feishuChecked = els.feishuEnabled.checked;

    // 都没勾选 → 直接跳过
    if (!kimiChecked && !feishuChecked) {
      goToStep(4);
      return;
    }

    // 验证 Kimi token
    var botToken = "";
    if (kimiChecked) {
      botToken = parseBotToken(els.kimiCommandInput.value);
      if (!botToken) {
        showChannelError(t("error.noKimiBotToken"));
        return;
      }
    }

    // 验证 Feishu 字段
    var appId = "";
    var appSecret = "";
    if (feishuChecked) {
      appId = els.feishuAppId.value.trim();
      appSecret = els.feishuAppSecret.value.trim();
      if (!appId) { showChannelError(t("error.noAppId")); return; }
      if (!appSecret) { showChannelError(t("error.noAppSecret")); return; }
    }

    setChannelSaving(true);
    hideChannelError();

    try {
      // 先验证 Feishu（如果启用）
      if (feishuChecked) {
        var verifyResult = await window.oneclaw.verifyKey({
          provider: "feishu",
          appId: appId,
          appSecret: appSecret,
        });
        if (!verifyResult.success) {
          showChannelError(verifyResult.message || t("error.verifyFailed"));
          setChannelSaving(false);
          return;
        }
        await window.oneclaw.saveChannelConfig({ appId: appId, appSecret: appSecret });
      }

      // 保存 Kimi（如果启用）
      if (kimiChecked) {
        var kimiResult = await window.oneclaw.saveKimiChannelConfig({ botToken: botToken });
        if (!kimiResult.success) {
          showChannelError(kimiResult.message || "Save Kimi config failed");
          setChannelSaving(false);
          return;
        }
      }

      setChannelSaving(false);
      goToStep(4);
    } catch (err) {
      showChannelError(t("error.connection") + (err.message || "Unknown error"));
      setChannelSaving(false);
    }
  }

  // ---- 完成 Setup ----
  async function handleComplete() {
    if (starting) return;
    setStarting(true);
    setDoneStatus("");

    try {
      const result = await window.oneclaw.completeSetup();
      if (!result || !result.success) {
        setStarting(false);
        setDoneStatus(result?.message || t("done.startFailed"), true);
      }
    } catch (err) {
      setStarting(false);
      setDoneStatus((err && err.message) || t("done.startFailed"), true);
    }
  }

  // ---- UI 辅助 ----
  function toggleEl(el, show) {
    el.classList.toggle("hidden", !show);
  }

  function showError(msg) {
    els.errorMsg.textContent = msg;
    els.errorMsg.classList.remove("hidden");
  }

  function hideError() {
    els.errorMsg.classList.add("hidden");
    els.errorMsg.textContent = "";
  }

  function setVerifying(loading) {
    verifying = loading;
    els.btnVerify.disabled = loading;
    els.btnVerifyText.classList.toggle("hidden", loading);
    els.btnVerifySpinner.classList.toggle("hidden", !loading);
  }

  // Step 4 启动状态（等待 Gateway 就绪）
  function setStarting(loading) {
    starting = loading;
    els.btnStart.disabled = loading;
    if (loading) {
      els.btnStartText.textContent = t("done.starting");
      els.btnStartSpinner.classList.remove("hidden");
    } else {
      els.btnStartText.textContent = t("done.start");
      els.btnStartSpinner.classList.add("hidden");
    }
  }

  // Step 4 状态提示
  function setDoneStatus(msg, isError) {
    if (!msg) {
      els.doneStatus.classList.add("hidden");
      els.doneStatus.classList.remove("error");
      els.doneStatus.textContent = "";
      return;
    }
    els.doneStatus.textContent = msg;
    els.doneStatus.classList.remove("hidden");
    els.doneStatus.classList.toggle("error", !!isError);
  }

  // ---- Step 3 频道辅助 ----

  function showChannelError(msg) {
    els.channelErrorMsg.textContent = msg;
    els.channelErrorMsg.classList.remove("hidden");
  }

  function hideChannelError() {
    els.channelErrorMsg.classList.add("hidden");
    els.channelErrorMsg.textContent = "";
  }

  function setChannelSaving(loading) {
    channelSaving = loading;
    els.btnSaveChannels.disabled = loading;
    els.btnSaveChannelsText.textContent = loading ? t("channel.saving") : t("channel.continue");
    els.btnSaveChannelsSpinner.classList.toggle("hidden", !loading);
  }

  // 密码可见性切换（App Secret）
  function toggleSecretVisibility() {
    const input = els.feishuAppSecret;
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";

    const eyeOn = els.btnToggleSecret.querySelector(".icon-eye");
    const eyeOff = els.btnToggleSecret.querySelector(".icon-eye-off");
    eyeOn.classList.toggle("hidden", !isPassword);
    eyeOff.classList.toggle("hidden", isPassword);
  }

  // ---- 事件绑定 ----
  function bindEvents() {
    els.btnToStep2.addEventListener("click", () => goToStep(2));
    els.btnBackToStep1.addEventListener("click", () => goToStep(1));

    // Provider Tab 切换
    els.providerTabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".provider-tab");
      if (tab) switchProvider(tab.dataset.provider);
    });

    // Moonshot 子平台切换 → 更新模型列表和平台链接
    if (els.subPlatformGroup) {
      els.subPlatformGroup.addEventListener("change", () => {
        if (currentProvider === "moonshot") {
          updateModels();
          updatePlatformLink();
        }
      });
    }

    // 平台链接点击 → 用系统浏览器打开
    els.platformLink.addEventListener("click", (e) => {
      e.preventDefault();
      const url = els.platformLink.dataset.url;
      if (url && window.oneclaw?.openExternal) {
        window.oneclaw.openExternal(url);
      }
    });

    els.btnToggleKey.addEventListener("click", toggleKeyVisibility);
    els.btnVerify.addEventListener("click", handleVerify);

    els.apiKeyInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleVerify();
    });

    // Step 3 — 频道配置
    els.kimiEnabled.addEventListener("change", () => {
      toggleEl(els.kimiFields, els.kimiEnabled.checked);
      hideChannelError();
    });
    els.feishuEnabled.addEventListener("change", () => {
      toggleEl(els.feishuFields, els.feishuEnabled.checked);
      hideChannelError();
    });

    // Kimi 命令输入 → 实时解析 token
    els.kimiCommandInput.addEventListener("input", () => {
      var token = parseBotToken(els.kimiCommandInput.value);
      if (token) {
        els.kimiMaskedToken.textContent = maskToken(token);
        els.kimiParsedToken.classList.remove("hidden");
      } else {
        els.kimiParsedToken.classList.add("hidden");
      }
    });

    // Kimi Bot 链接
    els.kimiBotLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (window.oneclaw?.openExternal) {
        window.oneclaw.openExternal("https://www.kimi.com/bot");
      }
    });

    els.btnSkipChannel.addEventListener("click", () => goToStep(4));
    els.btnSaveChannels.addEventListener("click", handleSaveChannels);
    els.btnToggleSecret.addEventListener("click", toggleSecretVisibility);

    els.feishuConsoleLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (window.oneclaw?.openExternal) {
        window.oneclaw.openExternal("https://open.feishu.cn/app");
      }
    });

    // Step 4 — 完成
    els.btnStart.addEventListener("click", handleComplete);
  }

  // ---- 初始化 ----
  function init() {
    detectLang();
    applyI18n();
    bindEvents();
    switchProvider("anthropic");
    goToStep(1);
  }

  init();
})();
