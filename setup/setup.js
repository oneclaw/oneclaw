// ============================================
// OneClaw Setup — 三步向导交互逻辑
// ============================================

(function () {
  "use strict";

  // ---- Provider 预设配置 ----
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

  // Moonshot 子平台各自的 URL
  const SUB_PLATFORM_URLS = {
    "moonshot-cn": "https://platform.moonshot.cn?utm_source=oneclaw",
    "moonshot-ai": "https://platform.moonshot.ai?utm_source=oneclaw",
    "kimi-code": "https://kimi.com/code?utm_source=oneclaw",
  };

  // Kimi Code 子平台使用独立模型列表
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
      providerKey: "zai",
      placeholder: "...",
      models: ["glm-5", "glm-4.7", "glm-4.7-flash", "glm-4.7-flashx"],
    },
    "zai-cn": {
      providerKey: "zai",
      placeholder: "...",
      models: ["glm-5", "glm-4.7", "glm-4.7-flash", "glm-4.7-flashx"],
    },
    "zai-cn-coding": {
      providerKey: "zai",
      placeholder: "...",
      models: ["glm-5", "glm-4.7", "glm-4.7-flash", "glm-4.7-flashx"],
    },
    "volcengine": {
      providerKey: "volcengine",
      placeholder: "...",
      models: ["doubao-seed-2.0-pro", "doubao-seed-2.0-lite", "doubao-seed-2.0-code", "doubao-seed-code"],
    },
    "volcengine-coding": {
      providerKey: "volcengine",
      placeholder: "...",
      models: ["doubao-seed-2.0-code", "doubao-seed-2.0-pro", "doubao-seed-2.0-lite", "doubao-seed-code", "minimax-m2.5", "glm-4.7", "deepseek-v3.2", "kimi-k2.5", "ark-code-latest"],
    },
    "qwen": {
      providerKey: "qwen",
      placeholder: "sk-...",
      models: ["qwen-coder-plus-latest", "qwen-plus-latest", "qwen-max-latest", "qwen-turbo-latest"],
    },
    "qwen-coding": {
      providerKey: "qwen",
      placeholder: "sk-sp-...",
      models: ["qwen3.5-plus", "kimi-k2.5", "glm-5", "MiniMax-M2.5",],
    },
    "deepseek": {
      providerKey: "deepseek",
      placeholder: "sk-...",
      models: ["deepseek-chat", "deepseek-reasoner"],
    },
  };

  // ---- 国际化文案 ----
  const I18N = {
    en: {
      title: "OneClaw Setup",
      "welcome.title": "Welcome to OneClaw",
      "welcome.subtitle": "OneClaw is a one-click installer for OpenClaw",
      "welcome.feat2": "OpenClaw can access files on your computer and automate tasks",
      "welcome.feat3": "Connect to Feishu, WeCom, DingTalk, QQ Bot",
      "welcome.security": "API keys stored locally, never sent to third-party servers",
      "welcome.warning": "OpenClaw has high system privileges and can control your computer — please use it responsibly",
      "welcome.next": "Next",
      "config.title": "Configure Provider",
      "config.subtitle": "Choose your LLM provider and enter your API key",
      "config.keyNotice": "OneClaw does not provide API keys. Please click the link to purchase one from the provider's website",
      "config.platform": "Platform",
      "config.baseUrl": "Base URL",
      "config.apiKey": "API Key",
      "config.getKey": "Get API Key →",
      "config.getKey.kimi-code": "Get Key (Kimi for Code) →",
      "config.getKey.moonshot-cn": "Get Key (Kimi Open Platform) →",
      "config.model": "Model",
      "config.modelId": "Model ID",
      "config.apiType": "API Type",
      "config.preset": "Preset",
      "config.presetManual": "Manual",
      "config.customModelId": "Custom Model ID",
      "config.customModelOption": "Custom Model…",
      "config.custom": "Other",
      "config.presetPlaceholder": "Please select",
      "config.docsLink": "Tutorial Docs →",
      "config.back": "Back",
      "config.verify": "Verify & Continue",
      "config.imageSupport": "Model supports image input",
      "config.oauthLogin": "Log in with Kimi",
      "config.oauthCancel": "Cancel",
      "config.oauthWaiting": "Waiting for authorization in browser…",
      "config.oauthSuccess": "Login successful!",
      "config.oauthNoMembership": "Login succeeded, but your account has no active Kimi membership. Please subscribe and try again.",
      "config.oauthSubscribeLink": "Subscribe now →",
      "config.oauthAdvanced": "Advanced options",
      "config.oauthOr": "or enter API Key manually",
      "done.title": "All Set!",
      "done.subtitle": "OneClaw is ready — switch providers or models anytime in Settings",
      "done.feature1": "Chat with state-of-the-art language models",
      "done.feature2": "Generate and execute code in real time",
      "done.feature3": "Manage multiple conversations and contexts",
      "done.feature4": "Switch providers or models anytime in Settings",
      "done.sessionMemory": "Auto-save session memory on /new",
      "done.launchAtLogin": "Launch at login",
      "done.installCli": "Add openclaw command to terminal PATH",
      "done.start": "Start OneClaw",
      "done.starting": "Starting Gateway…",
      "done.retryPort": "Try a different port",
      "done.retryPortStarting": "Switching port…",
      "done.retryPortSuccess": "Switched to port {port}, restarting…",
      "done.startFailed": "Gateway failed to start — please click Start OneClaw to retry",
      "conflict.title": "Existing OpenClaw Detected",
      "conflict.subtitle": "An existing OpenClaw installation was found on your system, which may cause port conflicts with OneClaw",
      "conflict.reassure": "Your personas and chat history will be preserved",
      "conflict.portInUse": "Port {port} is in use by process: {process} (PID: {pid})",
      "conflict.globalInstalled": "Global installation found: {path}",
      "conflict.uninstall": "Uninstall old version & continue",
      "conflict.quit": "Quit",
      "conflict.uninstalling": "Uninstalling…",
      "conflict.failed": "Operation failed: ",
      "error.noKey": "Please enter your API key",
      "error.noBaseUrl": "Please enter the Base URL",
      "error.noModelId": "Please enter the Model ID",
      "error.verifyFailed": "Verification failed — please check your API key",
      "error.connection": "Connection error: ",
    },
    zh: {
      title: "OneClaw 安装引导",
      "welcome.title": "欢迎使用 OneClaw",
      "welcome.subtitle": "OneClaw 是 OpenClaw 的一键安装包",
      "welcome.feat2": "OpenClaw 可以访问电脑上的文件，自动执行各种办公任务",
      "welcome.feat3": "连接飞书、企业微信、钉钉、QQ 机器人",
      "welcome.security": "API 密钥安全存储在本地 绝不会发送到任何第三方服务器",
      "welcome.warning": "OpenClaw 权限非常高 可以控制本地电脑 请注意使用安全",
      "welcome.next": "下一步",
      "config.title": "配置服务商",
      "config.subtitle": "选择 LLM 服务商并输入 API 密钥",
      "config.keyNotice": "OneClaw 不提供 API 密钥 请点击链接前往服务商官网购买 API 密钥后使用",
      "config.platform": "平台",
      "config.baseUrl": "接口地址",
      "config.apiKey": "API 密钥",
      "config.getKey": "获取密钥 →",
      "config.getKey.kimi-code": "购买会员获取密钥 (Kimi for Code) →",
      "config.getKey.moonshot-cn": "获取密钥 (Kimi 开放平台（企业用户）) →",
      "config.model": "模型",
      "config.modelId": "模型 ID",
      "config.apiType": "接口类型",
      "config.preset": "预设",
      "config.presetManual": "手动配置",
      "config.customModelId": "自定义模型 ID",
      "config.customModelOption": "自定义模型…",
      "config.custom": "其他",
      "config.presetPlaceholder": "请选择",
      "config.docsLink": "教程文档 →",
      "config.back": "返回",
      "config.verify": "验证并继续",
      "config.imageSupport": "模型支持图片输入",
      "config.oauthLogin": "Kimi 会员登录",
      "config.oauthCancel": "取消",
      "config.oauthWaiting": "请在浏览器中完成授权…",
      "config.oauthSuccess": "登录成功！",
      "config.oauthNoMembership": "登录成功，但当前账号未开通 Kimi 会员，请订阅后重试。",
      "config.oauthSubscribeLink": "前往订阅 →",
      "config.oauthAdvanced": "高级选项",
      "config.oauthOr": "或手动输入 API Key",
      "done.title": "配置完成！",
      "done.subtitle": "OneClaw 已就绪 随时可在设置中切换服务商或模型",
      "done.feature1": "与最先进的大语言模型对话",
      "done.feature2": "实时生成并执行代码",
      "done.feature3": "管理多个对话和上下文",
      "done.feature4": "随时在设置中切换服务商或模型",
      "done.sessionMemory": "开新对话时自动保存会话记忆",
      "done.launchAtLogin": "开机启动",
      "done.installCli": "将 openclaw 命令添加到终端 PATH",
      "done.start": "启动 OneClaw",
      "done.starting": "正在启动 Gateway…",
      "done.retryPort": "换个端口试试",
      "done.retryPortStarting": "正在切换端口…",
      "done.retryPortSuccess": "已切换到端口 {port}，正在重启…",
      "done.startFailed": 'Gateway 启动失败 请点击"启动 OneClaw"重试',
      "conflict.title": "检测到已安装的 OpenClaw",
      "conflict.subtitle": "系统中已存在 OpenClaw 安装 可能与 OneClaw 产生端口冲突",
      "conflict.reassure": "你的人设和聊天记录将会被保留",
      "conflict.portInUse": "端口 {port} 被占用，进程: {process} (PID: {pid})",
      "conflict.globalInstalled": "全局安装路径: {path}",
      "conflict.uninstall": "卸载旧版并继续",
      "conflict.quit": "退出",
      "conflict.uninstalling": "正在卸载…",
      "conflict.failed": "操作失败：",
      "error.noKey": "请输入 API 密钥",
      "error.noBaseUrl": "请输入接口地址",
      "error.noModelId": "请输入模型 ID",
      "error.verifyFailed": "验证失败 请检查 API 密钥",
      "error.connection": "连接错误：",
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
    docsLink: $("#docsLink"),
    subPlatformGroup: $("#subPlatformGroup"),
    baseURLGroup: $("#baseURLGroup"),
    apiKeyGroup: $("#apiKeyGroup"),
    apiKeyInput: $("#apiKey"),
    btnToggleKey: $("#btnToggleKey"),
    modelSelectGroup: $("#modelSelectGroup"),
    modelSelect: $("#modelSelect"),
    modelInputGroup: $("#modelInputGroup"),
    modelInput: $("#modelInput"),
    apiTypeGroup: $("#apiTypeGroup"),
    imageSupportGroup: $("#imageSupportGroup"),
    imageSupport: $("#imageSupport"),
    customPresetGroup: $("#customPresetGroup"),
    customPreset: $("#customPreset"),
    customModelInputGroup: $("#customModelInputGroup"),
    customModelInput: $("#customModelInput"),
    oauthGroup: $("#oauthGroup"),
    btnOAuth: $("#btnOAuth"),
    btnOAuthText: document.querySelector("#btnOAuth .btn-oauth-text"),
    btnOAuthSpinner: document.querySelector("#btnOAuth .btn-oauth-spinner"),
    btnOAuthCancel: $("#btnOAuthCancel"),
    oauthStatus: $("#oauthStatus"),
    oauthAdvanced: $("#oauthAdvanced"),
    errorMsg: $("#errorMsg"),
    btnBackToStep1: $("#btnBackToStep1"),
    btnVerify: $("#btnVerify"),
    btnVerifyText: $("#btnVerify .btn-text"),
    btnVerifySpinner: $("#btnVerify .btn-spinner"),
    // Step 0 — 冲突检测
    conflictDetails: $("#conflictDetails"),
    conflictPort: $("#conflictPort"),
    conflictPortText: $("#conflictPortText"),
    conflictGlobal: $("#conflictGlobal"),
    conflictGlobalText: $("#conflictGlobalText"),
    conflictError: $("#conflictError"),
    btnUninstall: $("#btnUninstall"),
    btnUninstallText: document.querySelector("#btnUninstall .btn-text"),
    btnUninstallSpinner: document.querySelector("#btnUninstall .btn-spinner"),
    btnQuitConflict: $("#btnQuitConflict"),
    conflictStatus: $("#conflictStatus"),
    // Step 3 — 完成
    sessionMemoryEnabled: $("#sessionMemoryEnabled"),
    installCliCheck: $("#installCliCheck"),
    btnStart: $("#btnStart"),
    btnStartText: $("#btnStart .btn-text"),
    btnStartSpinner: $("#btnStartSpinner"),
    doneStatus: $("#doneStatus"),
    launchAtLoginRow: $("#launchAtLoginRow"),
    launchAtLoginEnabled: $("#launchAtLoginEnabled"),
    btnRetryPort: $("#btnRetryPort"),
    btnRetryPortText: document.querySelector("#btnRetryPort .btn-text"),
    btnRetryPortSpinner: document.querySelector("#btnRetryPort .btn-spinner"),
  };

  // ---- 状态 ----
  let currentStep = 1;
  let currentProvider = "moonshot";
  let verifying = false;
  let starting = false;
  let currentLang = "en";
  let launchAtLoginSupported = false;
  let detectionResult = null;
  let resolving = false;

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
    // Step 0 不算进度条，进度条从 Step 1 开始
    if (step === 0) {
      els.progressFill.style.width = "0%";
    } else {
      els.progressFill.style.width = `${Math.round(step * 100 / 3)}%`;
    }

    // steps NodeList 顺序: step0(index=0), step1(index=1), step2(index=2), step3(index=3)
    els.steps.forEach((el, i) => {
      el.classList.toggle("active", i === step);
    });
  }

  // ---- 获取当前 Moonshot 子平台 ----
  function getSubPlatform() {
    const checked = document.querySelector('input[name="subPlatform"]:checked');
    return checked ? checked.value : "kimi-code";
  }

  // ---- 环境检测（Step 0） ----

  // 检查系统中是否已有 OpenClaw 安装
  async function checkExistingInstallation() {
    if (!window.oneclaw?.detectInstallation) {
      goToStep(1);
      return;
    }
    try {
      const res = await window.oneclaw.detectInstallation();
      if (!res?.success || !res.data) {
        goToStep(1);
        return;
      }
      detectionResult = res.data;
      const hasConflict = detectionResult.portInUse || detectionResult.globalInstalled;
      if (!hasConflict) {
        goToStep(1);
        return;
      }
      // 展示冲突详情
      if (detectionResult.portInUse) {
        els.conflictPortText.textContent = t("conflict.portInUse")
          .replace("{port}", "18789")
          .replace("{process}", detectionResult.portProcess || "unknown")
          .replace("{pid}", String(detectionResult.portPid || "?"));
        els.conflictPort.classList.remove("hidden");
      }
      if (detectionResult.globalInstalled) {
        els.conflictGlobalText.textContent = t("conflict.globalInstalled")
          .replace("{path}", detectionResult.globalPath || "openclaw");
        els.conflictGlobal.classList.remove("hidden");
      }
      goToStep(0);
    } catch {
      // 检测失败不阻断流程
      goToStep(1);
    }
  }

  // 卸载旧版
  async function handleUninstall() {
    if (resolving) return;
    resolving = true;
    setConflictBtnState(els.btnUninstall, els.btnUninstallText, els.btnUninstallSpinner, true, t("conflict.uninstalling"));
    els.btnQuitConflict.disabled = true;
    hideConflictError();

    try {
      const res = await window.oneclaw.resolveConflict({
        action: "uninstall",
        pid: detectionResult?.portPid || 0,
      });
      if (res?.success) {
        goToStep(1);
      } else {
        showConflictError(t("conflict.failed") + (res?.message || ""));
      }
    } catch (err) {
      showConflictError(t("conflict.failed") + (err.message || ""));
    } finally {
      resolving = false;
      setConflictBtnState(els.btnUninstall, els.btnUninstallText, els.btnUninstallSpinner, false, t("conflict.uninstall"));
      els.btnQuitConflict.disabled = false;
    }
  }

  // 退出应用
  function handleQuitConflict() {
    window.close();
  }

  // 冲突页按钮状态控制
  function setConflictBtnState(btn, textEl, spinnerEl, loading, text) {
    btn.disabled = loading;
    textEl.textContent = text;
    spinnerEl.classList.toggle("hidden", !loading);
  }

  function showConflictError(msg) {
    els.conflictError.textContent = msg;
    els.conflictError.classList.remove("hidden");
  }

  function hideConflictError() {
    els.conflictError.classList.add("hidden");
    els.conflictError.textContent = "";
  }

  // ---- Provider 切换 ----
  function switchProvider(provider) {
    currentProvider = provider;
    const config = PROVIDERS[provider];

    $$(".provider-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.provider === provider);
    });

    els.apiKeyInput.placeholder = config.placeholder;
    els.apiKeyInput.value = "";
    hideError();
    updatePlatformLink();
    toggleEl(els.subPlatformGroup, config.hasSubPlatform === true);

    const isCustom = provider === "custom";
    // 预设下拉仅 Custom tab 显示
    toggleEl(els.customPresetGroup, isCustom);

    if (isCustom) {
      els.customPreset.value = "__placeholder__";
      applyCustomPreset("__placeholder__");
    } else {
      toggleEl(els.baseURLGroup, false);
      toggleEl(els.modelInputGroup, false);
      toggleEl(els.apiTypeGroup, false);
      toggleEl(els.imageSupportGroup, false);
      toggleEl(els.customModelInputGroup, false);
      toggleEl(els.modelSelectGroup, true);
      els.btnVerify.disabled = false;
      updateModels();
    }
    updateOAuthVisibility();
  }

  // 自定义 Model ID 哨兵值（下拉最后一项）
  const CUSTOM_MODEL_SENTINEL = "__custom__";

  // 根据预设切换 Custom tab 的字段显隐
  function applyCustomPreset(presetKey) {
    const preset = CUSTOM_PRESETS[presetKey];

    if (presetKey === "__placeholder__") {
      // 占位状态：隐藏所有字段，禁用验证按钮
      toggleEl(els.baseURLGroup, false);
      toggleEl(els.apiTypeGroup, false);
      toggleEl(els.imageSupportGroup, false);
      toggleEl(els.modelInputGroup, false);
      toggleEl(els.modelSelectGroup, false);
      toggleEl(els.customModelInputGroup, false);
      toggleEl(els.apiKeyGroup, true);
      els.btnVerify.disabled = true;
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
      els.btnVerify.disabled = false;
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
      els.btnVerify.disabled = false;
      updatePlatformLink();
    }
  }

  // 填充预设模型列表，末尾追加"自定义模型"选项
  function populatePresetModels(models) {
    populateModels(models);
    const opt = document.createElement("option");
    opt.value = CUSTOM_MODEL_SENTINEL;
    opt.textContent = t("config.customModelOption");
    els.modelSelect.appendChild(opt);
  }

  // 模型下拉切换时，判断是否显示自定义输入框
  function handleModelSelectChange() {
    // custom provider 手动模式（无预设）不走这里
    if (currentProvider === "custom" && !els.customPreset.value) return;
    const isCustomModel = els.modelSelect.value === CUSTOM_MODEL_SENTINEL;
    toggleEl(els.customModelInputGroup, isCustomModel);
    if (isCustomModel) {
      els.customModelInput.focus();
    }
  }

  // ---- 更新平台链接 ----
  function updatePlatformLink() {
    let url = PROVIDERS[currentProvider].platformUrl || "";
    // Moonshot 子平台各有独立 URL
    if (currentProvider === "moonshot") {
      url = SUB_PLATFORM_URLS[getSubPlatform()] || "";
    }
    // Custom 预设的平台链接
    if (currentProvider === "custom") {
      const preset = CUSTOM_PRESETS[els.customPreset.value];
      url = preset ? preset.platformUrl : "";
    }
    if (url) {
      // Moonshot 子平台显示带平台名的链接文本
      var linkKey = currentProvider === "moonshot"
        ? "config.getKey." + getSubPlatform()
        : "config.getKey";
      els.platformLink.textContent = t(linkKey);
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
      // OAuth 模式：API Key / Model 收入折叠高级选项，隐藏平台链接
      els.oauthAdvanced.classList.remove("hidden", "details-advanced--plain");
      els.oauthAdvanced.removeAttribute("open");
      els.platformLink.classList.add("hidden");
    } else {
      // 非 OAuth 模式：展开且隐藏折叠外观
      els.oauthAdvanced.classList.remove("hidden");
      els.oauthAdvanced.classList.add("details-advanced--plain");
      els.oauthAdvanced.setAttribute("open", "");
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

  // ---- Kimi OAuth 一键登录 ----
  async function handleOAuthLogin() {
    if (verifying) return;
    setOAuthLoading(true);
    hideError();

    try {
      var result = await window.oneclaw.kimiOAuthLogin();
      if (!result.success) {
        showError(result.message || t("error.verifyFailed"));
        setOAuthLoading(false);
        return;
      }

      // OAuth 成功 → 先验证 token 是否有会员权限
      var modelID = els.modelSelect.value === CUSTOM_MODEL_SENTINEL
        ? (els.customModelInput.value || "").trim() || "k2p5"
        : els.modelSelect.value || "k2p5";

      var verifyResult = await window.oneclaw.verifyKey({
        provider: "moonshot",
        apiKey: result.accessToken,
        modelID: modelID,
        subPlatform: "kimi-code",
      });

      if (!verifyResult.success) {
        // 验证失败 → 退出 OAuth 登录，提示用户需要会员
        if (window.oneclaw.kimiOAuthLogout) {
          window.oneclaw.kimiOAuthLogout();
        }
        showOAuthNoMembership();
        setOAuthLoading(false);
        return;
      }

      await window.oneclaw.saveConfig({
        provider: "moonshot",
        apiKey: result.accessToken,
        modelID: modelID,
        baseURL: "",
        api: "",
        subPlatform: "kimi-code",
        supportImage: true,
        customPreset: "",
      });

      setOAuthLoading(false);
      showOAuthSuccess();
      setTimeout(function () { goToStep(3); }, 600);
    } catch (err) {
      showError(t("error.connection") + (err.message || ""));
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

  function setOAuthLoading(loading) {
    els.btnOAuth.disabled = loading;
    els.btnOAuthText.classList.toggle("hidden", loading);
    els.btnOAuthSpinner.classList.toggle("hidden", !loading);
    toggleEl(els.btnOAuthCancel, loading);
    if (loading) {
      els.oauthStatus.textContent = t("config.oauthWaiting");
      els.oauthStatus.classList.remove("hidden", "success");
    }
  }

  function showOAuthSuccess() {
    els.oauthStatus.textContent = t("config.oauthSuccess");
    els.oauthStatus.classList.remove("hidden");
    els.oauthStatus.classList.add("success");
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
      const presetKey = els.customPreset.value;
      if (presetKey === "__placeholder__") return null;
      if (presetKey) {
        // 预设模式：自定义输入框可见（含空 models 预设）或选了"自定义模型"时用输入框
        if (!els.customModelInputGroup.classList.contains("hidden") || els.modelSelect.value === CUSTOM_MODEL_SENTINEL) {
          const customModel = (els.customModelInput.value || "").trim();
          if (!customModel) {
            showError(t("error.noModelId"));
            return null;
          }
          params.modelID = customModel;
        } else {
          params.modelID = els.modelSelect.value;
        }
        params.customPreset = presetKey;
      } else {
        // 手动模式
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
      }
    } else {
      // 非 custom provider：支持自定义模型输入
      if (els.modelSelect.value === CUSTOM_MODEL_SENTINEL) {
        const customModel = (els.customModelInput.value || "").trim();
        if (!customModel) {
          showError(t("error.noModelId"));
          return null;
        }
        params.modelID = customModel;
      } else {
        params.modelID = els.modelSelect.value;
      }
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
      customPreset: params.customPreset || "",
    };
  }

  // ---- 完成 Setup ----
  async function handleComplete() {
    if (starting) return;
    setStarting(true);
    setDoneStatus("");

    try {
      const payload = {
        installCli: true,
        sessionMemory: true,
      };
      if (launchAtLoginSupported) {
        payload.launchAtLogin = !!els.launchAtLoginEnabled.checked;
      }
      const result = await window.oneclaw.completeSetup(payload);
      if (!result || !result.success) {
        setStarting(false);
        setDoneStatus(result?.message || t("done.startFailed"), true);
        showRetryPortButton();
      }
    } catch (err) {
      setStarting(false);
      setDoneStatus((err && err.message) || t("done.startFailed"), true);
      showRetryPortButton();
    }
  }

  // 显示换端口重试按钮
  function showRetryPortButton() {
    if (window.oneclaw?.retryRandomPort) {
      els.btnRetryPort.classList.remove("hidden");
    }
  }

  // 换随机端口重试
  async function handleRetryPort() {
    if (starting) return;

    els.btnRetryPort.disabled = true;
    els.btnRetryPortText.textContent = t("done.retryPortStarting");
    els.btnRetryPortSpinner.classList.remove("hidden");
    setDoneStatus("");

    try {
      const portResult = await window.oneclaw.retryRandomPort();
      if (!portResult || !portResult.success) {
        setDoneStatus(portResult?.message || t("done.startFailed"), true);
        els.btnRetryPort.disabled = false;
        els.btnRetryPortText.textContent = t("done.retryPort");
        els.btnRetryPortSpinner.classList.add("hidden");
        return;
      }

      // 端口切换成功，提示并自动重试启动
      setDoneStatus(t("done.retryPortSuccess").replace("{port}", String(portResult.port)));
      els.btnRetryPort.classList.add("hidden");
      els.btnRetryPortText.textContent = t("done.retryPort");
      els.btnRetryPortSpinner.classList.add("hidden");
      els.btnRetryPort.disabled = false;

      // 自动触发启动
      handleComplete();
    } catch (err) {
      setDoneStatus((err && err.message) || t("done.startFailed"), true);
      els.btnRetryPort.disabled = false;
      els.btnRetryPortText.textContent = t("done.retryPort");
      els.btnRetryPortSpinner.classList.add("hidden");
    }
  }

  // 读取系统层开机启动状态并回填 Step 3 开关。
  async function loadLaunchAtLoginState() {
    if (!window.oneclaw?.setupGetLaunchAtLogin) {
      return;
    }
    try {
      const result = await window.oneclaw.setupGetLaunchAtLogin();
      if (!result?.success || !result.data) {
        return;
      }
      launchAtLoginSupported = result.data.supported === true;
      toggleEl(els.launchAtLoginRow, launchAtLoginSupported);
      if (launchAtLoginSupported) {
        // Setup 阶段默认开启开机启动，用户可在此页手动关闭。
        els.launchAtLoginEnabled.checked = true;
      }
    } catch {
      // 获取失败时不阻断 Setup 流程，保持开关隐藏。
      launchAtLoginSupported = false;
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

  // 非会员提示（带订阅超链接）
  function showOAuthNoMembership() {
    var url = "https://kimi.com/membership/pricing?utm_source=oneclaw";
    els.errorMsg.textContent = "";
    els.errorMsg.appendChild(document.createTextNode(t("config.oauthNoMembership") + " "));
    var link = document.createElement("a");
    link.href = "#";
    link.textContent = t("config.oauthSubscribeLink");
    link.className = "oauth-membership-link";
    link.addEventListener("click", function (e) {
      e.preventDefault();
      if (window.oneclaw?.openExternal) window.oneclaw.openExternal(url);
    });
    els.errorMsg.appendChild(link);
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

  // ---- 事件绑定 ----
  function bindEvents() {
    els.btnUninstall.addEventListener("click", handleUninstall);
    els.btnQuitConflict.addEventListener("click", handleQuitConflict);
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
          updateOAuthVisibility();
        }
      });
    }

    // Custom 预设切换
    els.customPreset.addEventListener("change", () => {
      applyCustomPreset(els.customPreset.value);
    });

    // 模型下拉切换 → 控制自定义模型输入框显隐
    els.modelSelect.addEventListener("change", handleModelSelectChange);

    // 平台链接点击 → 用系统浏览器打开
    els.platformLink.addEventListener("click", (e) => {
      e.preventDefault();
      const url = els.platformLink.dataset.url;
      if (url && window.oneclaw?.openExternal) {
        window.oneclaw.openExternal(url);
      }
    });

    // 教程文档链接 → 用系统浏览器打开
    els.docsLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (window.oneclaw?.openExternal) {
        window.oneclaw.openExternal("https://oneclaw.cn/docs");
      }
    });

    els.btnOAuth.addEventListener("click", handleOAuthLogin);
    if (els.btnOAuthCancel) {
      els.btnOAuthCancel.addEventListener("click", handleOAuthCancel);
    }
    els.btnToggleKey.addEventListener("click", toggleKeyVisibility);
    els.btnVerify.addEventListener("click", handleVerify);

    els.apiKeyInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleVerify();
    });

    // Step 3 — 完成
    els.btnStart.addEventListener("click", handleComplete);
    els.btnRetryPort.addEventListener("click", handleRetryPort);
  }

  // ---- 初始化 ----
  function init() {
    detectLang();
    applyI18n();
    bindEvents();
    switchProvider("moonshot");
    checkExistingInstallation();
    loadLaunchAtLoginState();
  }

  init();
})();
