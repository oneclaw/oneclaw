// ============================================
// OneClaw Setup — 三步向导交互逻辑
// （与 kimiclaw macOS ProviderSetupView.swift 对齐）
// ============================================

(function () {
  "use strict";

  // ---- Provider 预设配置 ----
  const PROVIDERS = {
    anthropic: {
      placeholder: "sk-ant-...",
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
      models: ["gpt-5.2", "gpt-5.2-codex"],
    },
    google: {
      placeholder: "AI...",
      models: ["gemini-3-pro-preview", "gemini-3-flash-preview"],
    },
    custom: {
      placeholder: "",
      models: [],
    },
  };

  // Kimi Code 子平台使用独立模型列表
  const KIMI_CODE_MODELS = ["k2p5"];

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
    subPlatformGroup: $("#subPlatformGroup"),
    baseURLGroup: $("#baseURLGroup"),
    apiKeyInput: $("#apiKey"),
    btnToggleKey: $("#btnToggleKey"),
    modelSelectGroup: $("#modelSelectGroup"),
    modelSelect: $("#modelSelect"),
    modelInputGroup: $("#modelInputGroup"),
    modelInput: $("#modelInput"),
    apiTypeGroup: $("#apiTypeGroup"),
    errorMsg: $("#errorMsg"),
    btnBackToStep1: $("#btnBackToStep1"),
    btnVerify: $("#btnVerify"),
    btnVerifyText: $("#btnVerify .btn-text"),
    btnVerifySpinner: $("#btnVerify .btn-spinner"),
    // Step 3
    btnStart: $("#btnStart"),
  };

  // ---- 状态 ----
  let currentStep = 1;
  let currentProvider = "anthropic";
  let verifying = false;

  // ---- 步骤切换 ----
  function goToStep(step) {
    currentStep = step;
    els.progressFill.style.width = `${step * 33.33}%`;

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

    // Moonshot 子平台
    toggleEl(els.subPlatformGroup, config.hasSubPlatform === true);

    // Custom 专属字段
    const isCustom = provider === "custom";
    toggleEl(els.baseURLGroup, isCustom);
    toggleEl(els.modelInputGroup, isCustom);
    toggleEl(els.apiTypeGroup, isCustom);

    // 模型选择
    toggleEl(els.modelSelectGroup, !isCustom);

    if (!isCustom) {
      updateModels();
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

  // ---- 验证并保存配置 ----
  async function handleVerify() {
    if (verifying) return;

    const apiKey = els.apiKeyInput.value.trim();
    if (!apiKey) {
      showError("Please enter your API key.");
      return;
    }

    const params = buildParams(apiKey);
    if (!params) return;

    setVerifying(true);
    hideError();

    try {
      const result = await window.oneclaw.verifyKey(params);

      if (!result.success) {
        showError(result.message || "Verification failed. Please check your API key.");
        setVerifying(false);
        return;
      }

      await window.oneclaw.saveConfig(buildSavePayload(params));
      setVerifying(false);
      goToStep(3);
    } catch (err) {
      showError("Connection error: " + (err.message || "Unknown error"));
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
        showError("Please enter the Base URL.");
        return null;
      }
      if (!modelID) {
        showError("Please enter the Model ID.");
        return null;
      }
      params.baseURL = baseURL;
      params.modelID = modelID;
      params.apiType = document.querySelector('input[name="apiType"]:checked').value;
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
    };
  }

  // ---- 完成 Setup ----
  function handleComplete() {
    window.oneclaw.completeSetup();
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

  // ---- 事件绑定 ----
  function bindEvents() {
    els.btnToStep2.addEventListener("click", () => goToStep(2));
    els.btnBackToStep1.addEventListener("click", () => goToStep(1));

    // Provider Tab 切换
    els.providerTabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".provider-tab");
      if (tab) switchProvider(tab.dataset.provider);
    });

    // Moonshot 子平台切换 → 更新模型列表
    if (els.subPlatformGroup) {
      els.subPlatformGroup.addEventListener("change", () => {
        if (currentProvider === "moonshot") {
          updateModels();
        }
      });
    }

    els.btnToggleKey.addEventListener("click", toggleKeyVisibility);
    els.btnVerify.addEventListener("click", handleVerify);

    els.apiKeyInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleVerify();
    });

    els.btnStart.addEventListener("click", handleComplete);
  }

  // ---- 初始化 ----
  function init() {
    bindEvents();
    switchProvider("anthropic");
    goToStep(1);
  }

  init();
})();
