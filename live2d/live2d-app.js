/**
 * Live2D 应用核心 — 从 smart-pet index.vue 移植为 vanilla JS
 * PIXI 初始化、模型加载、交互、动画
 */

// PIXI 全局挂载（pixi-live2d-display 要求）
window.PIXI = PIXI;

class Live2DApp {
  constructor() {
    this.app = null;
    this.model = null;
    this.canvas = document.getElementById("live2d-canvas");
    this.loadingOverlay = document.getElementById("loading-overlay");
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.autoAnimTimer = null;
    this.currentModelName = "";

    this.init();
  }

  async init() {
    try {
      // 获取配置
      const config = await window.live2dAPI.getConfig();
      this.currentModelName = config.modelPath || "aidang_2";

      // 初始化 PIXI
      this.initPixi();

      // 加载模型
      await this.loadModel(this.currentModelName);

      // 绑定事件
      this.bindEvents();

      // 启动自动动画
      this.startAutoAnimation();

      // 隐藏加载层
      this.hideLoading();
    } catch (err) {
      console.error("Live2D 初始化失败:", err);
      this.showLoadingText("加载失败: " + err.message);
    }
  }

  initPixi() {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.app = new PIXI.Application({
      view: this.canvas,
      width: width,
      height: height,
      transparent: true,
      autoDensity: true,
      resolution: dpr,
      backgroundAlpha: 0,
      antialias: true,
    });

    // canvas CSS 尺寸必须和逻辑尺寸一致
    this.canvas.style.width = width + "px";
    this.canvas.style.height = height + "px";

    // 自适应窗口大小
    window.addEventListener("resize", () => this.onResize());
  }

  async loadModel(modelName) {
    this.showLoadingText("加载模型中...");

    // 移除旧模型
    if (this.model) {
      this.app.stage.removeChild(this.model);
      this.model.destroy();
      this.model = null;
    }

    try {
      const modelsDir = await window.live2dAPI.getModelsDir();
      // 在模型目录中查找 .model3.json
      const modelDir = modelsDir + "/" + modelName;
      const modelJsonPath = modelDir + "/" + modelName + ".model3.json";

      // 尝试直接加载（pixi-live2d-display 会自动解析）
      const model = await PIXI.live2d.Live2DModel.from(modelJsonPath, {
        autoInteract: false,
      });

      this.model = model;
      this.app.stage.addChild(model);

      // 自适应缩放
      this.fitModel();

      // 设置交互
      model.interactive = true;
      model.buttonMode = true;

      this.currentModelName = modelName;
      console.log("模型加载成功:", modelName);
      this.hideLoading();
    } catch (err) {
      console.error("模型加载失败:", err);
      this.showLoadingText("模型加载失败");
      throw err;
    }
  }

  fitModel() {
    if (!this.model || !this.app) return;

    const { width: stageW, height: stageH } = this.app.screen;
    const modelW = this.model.width / this.model.scale.x; // 原始尺寸
    const modelH = this.model.height / this.model.scale.y;

    if (modelW === 0 || modelH === 0) return;

    // 计算缩放比例，使模型完全适配窗口（留底部控制栏空间）
    const availH = stageH * 0.9;
    const scale = Math.min(stageW / modelW, availH / modelH) * 0.85;

    this.model.scale.set(scale);

    // 居中偏下
    this.model.x = (stageW - modelW * scale) / 2;
    this.model.y = stageH - modelH * scale;
  }

  onResize() {
    if (!this.app) return;
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.app.renderer.resize(width, height);
    this.canvas.style.width = width + "px";
    this.canvas.style.height = height + "px";
    this.fitModel();
  }

  bindEvents() {
    // 鼠标跟随
    this.canvas.addEventListener("mousemove", (e) => {
      if (this.isDragging) return;
      this.onMouseMove(e);
    });

    // 点击交互
    this.canvas.addEventListener("click", (e) => {
      if (this.isDragging) return;
      this.onModelClick(e);
    });

    // 双击打开主窗口
    this.canvas.addEventListener("dblclick", () => {
      window.live2dAPI.openMainWindow();
    });

    // 设置按钮 → 打开主窗口
    document.getElementById("btn-settings").addEventListener("click", () => {
      window.live2dAPI.openMainWindow();
    });

    // 换肤按钮 → 打开模型选择面板
    document.getElementById("btn-skin").addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleSkinPanel();
    });

    // 换肤面板关闭
    document.getElementById("skin-panel-close").addEventListener("click", () => {
      this.hideSkinPanel();
    });

    // 点击面板外关闭
    document.addEventListener("click", (e) => {
      const panel = document.getElementById("skin-panel");
      const btn = document.getElementById("btn-skin");
      if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        this.hideSkinPanel();
      }
    });

    // 拖拽窗口
    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        this.isDragging = false;
        this.dragStartX = e.screenX;
        this.dragStartY = e.screenY;

        const onMouseMove = (me) => {
          const dx = me.screenX - this.dragStartX;
          const dy = me.screenY - this.dragStartY;
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            this.isDragging = true;
            window.live2dAPI.dragWindow(dx, dy);
            this.dragStartX = me.screenX;
            this.dragStartY = me.screenY;
          }
        };
        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          setTimeout(() => { this.isDragging = false; }, 100);
        };
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      }
    });

    // 右键菜单
    this.canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.showContextMenu(e.clientX, e.clientY);
    });

    // 右键菜单点击
    document.getElementById("context-menu").addEventListener("click", (e) => {
      const action = e.target.dataset?.action;
      if (action) this.handleMenuAction(action);
      this.hideContextMenu();
    });

    // 点击其他位置关闭菜单
    document.addEventListener("click", () => this.hideContextMenu());

    // 滚轮缩放
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (!this.model) return;
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      this.model.scale.x *= delta;
      this.model.scale.y *= delta;
    });

    // 模型切换通知
    window.live2dAPI.onChangeModel((modelName) => {
      this.loadModel(modelName).catch(console.error);
    });
  }

  // 鼠标跟随
  onMouseMove(e) {
    if (!this.model) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // 映射到 -1 ~ 1 范围
    const focusX = (x - 0.5) * 2;
    const focusY = (y - 0.5) * 2;

    try {
      const core = this.model.internalModel?.coreModel;
      if (!core) return;

      // 眼球跟随
      core.setParameterValueById("ParamAngleX", focusX * 30);
      core.setParameterValueById("ParamAngleY", -focusY * 30);
      core.setParameterValueById("ParamBodyAngleX", focusX * 10);
      core.setParameterValueById("ParamEyeBallX", focusX);
      core.setParameterValueById("ParamEyeBallY", -focusY);
    } catch {
      // 参数不存在时忽略
    }
  }

  // 点击交互 — 播放随机动画
  onModelClick(e) {
    if (!this.model) return;

    const motionManager = this.model.internalModel?.motionManager;
    if (!motionManager) return;

    // 尝试播放点击相关动画组
    const groups = ["tap_body", "tap", "flick_head", "pinch_in", "shake"];
    for (const group of groups) {
      try {
        motionManager.startRandomMotion(group, PIXI.live2d.MotionPriority.FORCE);
        return;
      } catch {
        // 该动画组不存在，继续尝试
      }
    }

    // 兜底：播放任意 idle 动画
    try {
      motionManager.startRandomMotion("idle", PIXI.live2d.MotionPriority.IDLE);
    } catch {}
  }

  // 自动动画（眨眼 + 呼吸 + idle）
  startAutoAnimation() {
    if (this.autoAnimTimer) clearInterval(this.autoAnimTimer);

    this.autoAnimTimer = setInterval(() => {
      if (!this.model) return;

      const motionManager = this.model.internalModel?.motionManager;
      if (!motionManager) return;

      // 随机播放 idle 动画
      if (!motionManager.isFinished()) return;
      try {
        motionManager.startRandomMotion("idle", PIXI.live2d.MotionPriority.IDLE);
      } catch {}
    }, 5000);
  }

  // 嘴型同步
  setMouthOpenY(value) {
    if (!this.model) return;
    try {
      this.model.internalModel.coreModel
        .setParameterValueById("ParamMouthOpenY", value);
    } catch {}
  }

  // 右键菜单
  showContextMenu(x, y) {
    const menu = document.getElementById("context-menu");
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.classList.remove("hidden");
  }

  hideContextMenu() {
    document.getElementById("context-menu").classList.add("hidden");
  }

  handleMenuAction(action) {
    switch (action) {
      case "open-main":
        window.live2dAPI.openMainWindow();
        break;
      case "voice-chat":
        // 由 voice-chat.js 处理
        if (window.voiceChat) window.voiceChat.toggle();
        break;
      case "change-model":
        this.showModelSelector();
        break;
      case "quit":
        window.close();
        break;
    }
  }

  async showModelSelector() {
    // 右键菜单中的"切换模型"也打开面板
    this.toggleSkinPanel();
  }

  async toggleSkinPanel() {
    const panel = document.getElementById("skin-panel");
    if (!panel.classList.contains("hidden")) {
      this.hideSkinPanel();
      return;
    }

    // 加载模型列表
    try {
      const models = await window.live2dAPI.getModelList();
      const listEl = document.getElementById("skin-list");
      listEl.innerHTML = "";

      if (!models || models.length === 0) {
        listEl.innerHTML = '<div class="skin-item" style="color:#888;cursor:default;">暂无可用模型</div>';
        panel.classList.remove("hidden");
        return;
      }

      for (const model of models) {
        const item = document.createElement("div");
        item.className = "skin-item" + (model.name === this.currentModelName ? " active" : "");

        const icon = document.createElement("div");
        icon.className = "skin-item-icon";
        icon.textContent = "🎭";

        const name = document.createElement("div");
        name.className = "skin-item-name";
        name.textContent = model.name;

        item.appendChild(icon);
        item.appendChild(name);

        if (model.name === this.currentModelName) {
          const check = document.createElement("span");
          check.className = "skin-item-check";
          check.textContent = "✓";
          item.appendChild(check);
        }

        item.addEventListener("click", async () => {
          if (model.name === this.currentModelName) return;
          this.hideSkinPanel();
          try {
            await window.live2dAPI.changeModel(model.name);
          } catch (err) {
            console.error("切换模型失败:", err);
          }
        });

        listEl.appendChild(item);
      }

      panel.classList.remove("hidden");
    } catch (err) {
      console.error("获取模型列表失败:", err);
    }
  }

  hideSkinPanel() {
    document.getElementById("skin-panel").classList.add("hidden");
  }

  showLoadingText(text) {
    const el = this.loadingOverlay?.querySelector(".loading-text");
    if (el) el.textContent = text;
    if (this.loadingOverlay) this.loadingOverlay.classList.remove("hidden");
  }

  hideLoading() {
    if (this.loadingOverlay) this.loadingOverlay.classList.add("hidden");
  }
}

// 全局实例
window.live2dApp = new Live2DApp();
