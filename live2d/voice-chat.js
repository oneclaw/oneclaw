/**
 * 语音对话控制器
 * 连接主进程 SpeechEngine（sherpa-onnx）与 Live2D 渲染进程
 */

class VoiceChat {
  constructor() {
    this.isListening = false;
    this.micBtn = document.getElementById("btn-mic");
    this.chatBubble = window.chatBubble;

    this.bindEvents();
    this.bindIPC();
  }

  bindEvents() {
    // 点击麦克风按钮切换
    this.micBtn.addEventListener("click", () => {
      this.toggle();
    });

    // 按住说话（麦克风按钮长按模式）
    this.micBtn.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      this.holdTimer = setTimeout(() => {
        this.holdMode = true;
        this.startListening();
      }, 500);
    });

    this.micBtn.addEventListener("mouseup", () => {
      if (this.holdTimer) {
        clearTimeout(this.holdTimer);
        this.holdTimer = null;
      }
      if (this.holdMode) {
        this.holdMode = false;
        this.stopListening();
      }
    });

    this.micBtn.addEventListener("mouseleave", () => {
      if (this.holdTimer) {
        clearTimeout(this.holdTimer);
        this.holdTimer = null;
      }
      if (this.holdMode) {
        this.holdMode = false;
        this.stopListening();
      }
    });

    // ── 键盘快捷键：按住 C 键说话，松开停止 ──
    this.keyHolding = false;
    document.addEventListener("keydown", (e) => {
      // 忽略输入框中的按键、重复事件、带修饰键的组合
      if (e.repeat) return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== "c") return;

      e.preventDefault();
      this.keyHolding = true;
      this.startListening();
    });

    document.addEventListener("keyup", (e) => {
      if (e.key.toLowerCase() !== "c") return;
      if (!this.keyHolding) return;

      e.preventDefault();
      this.keyHolding = false;
      this.stopListening();
    });

    // 窗口失焦时自动停止（防止按键松开事件丢失）
    window.addEventListener("blur", () => {
      if (this.keyHolding) {
        this.keyHolding = false;
        this.stopListening();
      }
    });
  }

  bindIPC() {
    // 接收实时识别中间结果
    window.live2dAPI.onInterimResult((text) => {
      if (text) {
        this.chatBubble.showUserText(text, { interim: true });
      }
    });

    // 接收最终识别结果
    window.live2dAPI.onFinalResult((text) => {
      if (text) {
        this.chatBubble.showUserText(text, { interim: false });
        this.chatBubble.showStatus("思考中...");
        // AI 回复由主进程自动处理（ASR→Gateway→TTS→live2d:ai-reply）
      }
    });

    // 接收 AI 回复（含可选 TTS 音频文件名）
    window.live2dAPI.onAIReply((reply, audioFileName, sampleRate) => {
      this.chatBubble.clearStatus();
      this.chatBubble.showAIText(reply);

      // 播放 TTS 音频并同步嘴型
      if (audioFileName && typeof audioFileName === "string") {
        this.playTTSFromFile(audioFileName, sampleRate || 22050);
      } else {
        // 无音频时用文字长度模拟嘴型
        this.simulateLipSync(reply.length);
      }
    });

    // 监听状态变化
    window.live2dAPI.onListeningStateChange((state) => {
      if (state === "listening") {
        this.setListeningUI(true);
      } else if (state === "stopped") {
        this.setListeningUI(false);
      }
    });
  }

  toggle() {
    if (this.holdMode) return; // 长按模式中不处理点击切换
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  async startListening() {
    if (this.isListening) return;

    try {
      this.chatBubble.showStatus("正在听...");
      this.setListeningUI(true);
      await window.live2dAPI.startListening();
      this.isListening = true;
    } catch (err) {
      console.error("开始语音识别失败:", err);
      this.chatBubble.showStatus("语音识别不可用");
      this.setListeningUI(false);
      setTimeout(() => this.chatBubble.clearStatus(), 3000);
    }
  }

  async stopListening() {
    if (!this.isListening) return;

    try {
      await window.live2dAPI.stopListening();
      this.isListening = false;
      this.setListeningUI(false);
      this.chatBubble.clearStatus();
    } catch (err) {
      console.error("停止语音识别失败:", err);
    }
  }

  setListeningUI(active) {
    if (active) {
      this.micBtn.classList.add("active");
    } else {
      this.micBtn.classList.remove("active");
    }
  }

  // 从 WAV 文件播放 TTS 音频并驱动 Live2D 嘴型
  async playTTSFromFile(fileName, sampleRate) {
    try {
      // 通过自定义协议加载 TTS WAV 文件（绕过 file:// 安全限制）
      const audioUrl = `oneclaw-tts://audio/${encodeURIComponent(fileName)}`;
      const audio = new Audio(audioUrl);

      await new Promise((resolve, reject) => {
        audio.addEventListener("canplaythrough", resolve, { once: true });
        audio.addEventListener("error", (e) => reject(new Error(`Audio load error: ${e.message || "unknown"}`)), { once: true });
        audio.load();
      });

      // 创建 AudioContext + MediaElementSource 用于音量分析驱动嘴型
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaElementSource(audio);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;

      source.connect(analyser);
      analyser.connect(audioContext.destination);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let animFrameId = null;

      const updateMouth = () => {
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const volume = sum / dataArray.length / 255;
        const mouthOpen = Math.min(1.0, volume * 3);

        if (window.live2dApp) {
          window.live2dApp.setMouthOpenY(mouthOpen);
        }

        animFrameId = requestAnimationFrame(updateMouth);
      };

      audio.play();
      updateMouth();

      audio.addEventListener("ended", () => {
        if (animFrameId) cancelAnimationFrame(animFrameId);
        if (window.live2dApp) {
          window.live2dApp.setMouthOpenY(0);
        }
        audioContext.close();
      });
    } catch (err) {
      console.error("TTS 文件播放失败:", err);
      // 降级到文字模拟
      this.simulateLipSync(20);
    }
  }

  // 文字长度模拟嘴型（无 TTS 音频时的降级方案）
  simulateLipSync(textLength) {
    const durationMs = textLength * 150;
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed > durationMs) {
        clearInterval(interval);
        if (window.live2dApp) {
          window.live2dApp.setMouthOpenY(0);
        }
        return;
      }
      const n = Math.sin(elapsed / 100) * 0.4 + 0.4;
      if (window.live2dApp) {
        window.live2dApp.setMouthOpenY(n);
      }
    }, 50);
  }
}

// 等待 DOM 和其他组件初始化完成
window.addEventListener("load", () => {
  window.voiceChat = new VoiceChat();
});
