/**
 * SpeechEngine — sherpa-onnx 语音引擎
 *
 * 运行在 Electron 主进程，提供：
 *   - 流式 ASR（OnlineRecognizer + streaming paraformer）
 *   - VAD（Silero VAD）
 *   - TTS（OfflineTts + VITS，可选）
 *   - 麦克风录入（naudiodon2 / PortAudio）
 *
 * 设计原则：
 *   - 懒加载：首次调用 startListening() 时才初始化引擎
 *   - 模型路径可配置：开发时从 resources/models/speech/ 读取；打包后从 extraResources 读取
 *   - 主线程安全：所有 sherpa-onnx 调用都是同步 N-API，音频处理在 PortAudio 线程
 */

import { app, BrowserWindow } from "electron";
import * as path from "path";
import * as fs from "fs";
import * as log from "./logger";
import type {
  OnlineRecognizer,
  OnlineStream,
  OfflineTts,
  Vad,
} from "sherpa-onnx-node";
import type { AudioIO } from "naudiodon2";

// ── 模型路径解析 ──

/** 语音模型基目录 */
function resolveSpeechModelsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "resources", "models", "speech");
  }
  return path.join(app.getAppPath(), "resources", "models", "speech");
}

/** Silero VAD 模型路径 */
function resolveVadModelPath(): string {
  return path.join(resolveSpeechModelsDir(), "silero_vad.onnx");
}

/** 流式 Paraformer 模型目录 */
function resolveStreamingAsrDir(): string {
  return path.join(
    resolveSpeechModelsDir(),
    "sherpa-onnx-streaming-paraformer-bilingual-zh-en",
  );
}

/** TTS VITS 模型目录 */
function resolveTtsDir(): string {
  return path.join(resolveSpeechModelsDir(), "vits-zh-hf-theresa");
}

// ── 模型可用性检查 ──

export interface SpeechModelStatus {
  vadAvailable: boolean;
  asrAvailable: boolean;
  ttsAvailable: boolean;
  vadPath: string;
  asrPath: string;
  ttsPath: string;
}

export function checkSpeechModels(): SpeechModelStatus {
  const vadPath = resolveVadModelPath();
  const asrPath = resolveStreamingAsrDir();
  const ttsPath = resolveTtsDir();

  return {
    vadAvailable: fs.existsSync(vadPath),
    asrAvailable:
      fs.existsSync(path.join(asrPath, "encoder.int8.onnx")) &&
      fs.existsSync(path.join(asrPath, "decoder.int8.onnx")) &&
      fs.existsSync(path.join(asrPath, "tokens.txt")),
    ttsAvailable:
      fs.existsSync(path.join(ttsPath, "model.onnx")) &&
      fs.existsSync(path.join(ttsPath, "tokens.txt")),
    vadPath,
    asrPath,
    ttsPath,
  };
}

// ── SpeechEngine ──

export type SpeechEngineState = "idle" | "listening" | "processing" | "error";

export class SpeechEngine {
  private state: SpeechEngineState = "idle";
  private sherpa: typeof import("sherpa-onnx-node") | null = null;
  private recognizer: OnlineRecognizer | null = null;
  private stream: OnlineStream | null = null;
  private vad: Vad | null = null;
  private tts: OfflineTts | null = null;
  private audioInput: AudioIO | null = null;
  private portAudio: typeof import("naudiodon2") | null = null;

  // Live2D 窗口引用，用于发送 IPC 事件
  private targetWindow: BrowserWindow | null = null;

  // 最新中间结果（用于去重）
  private lastInterimText = "";

  // 采样率
  private readonly sampleRate = 16000;

  // 初始化锁：防止并发初始化
  private initPromise: Promise<void> | null = null;
  private initFailed = false;

  /**
   * 设置 IPC 事件目标窗口
   */
  setTargetWindow(win: BrowserWindow | null): void {
    this.targetWindow = win;
  }

  /**
   * 获取引擎状态
   */
  getState(): SpeechEngineState {
    return this.state;
  }

  /**
   * 初始化引擎（懒加载：首次调用时才 require）
   * 抛出异常表示引擎初始化失败
   */
  async initialize(): Promise<void> {
    if (this.recognizer && this.portAudio) return; // 已初始化

    // 如果之前初始化失败过，不再重试
    if (this.initFailed) {
      throw new Error("语音引擎初始化曾经失败，请重启应用后重试");
    }

    // 防止并发初始化
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    try {
      await this.initPromise;
    } catch (err) {
      this.initFailed = true;
      throw err;
    } finally {
      this.initPromise = null;
    }
  }

  private async doInitialize(): Promise<void> {
    log.info("initialize() 开始执行");

    const models = checkSpeechModels();
    log.info(`模型检查结果: ASR=${models.asrAvailable} VAD=${models.vadAvailable} TTS=${models.ttsAvailable}`);
    log.info(`模型路径: ASR=${models.asrPath}`);

    if (!models.asrAvailable) {
      throw new Error(
        `ASR 模型未找到。请下载 streaming paraformer 模型到: ${models.asrPath}`,
      );
    }

    log.info("初始化 sherpa-onnx 语音引擎...");

    try {
      // sherpa-onnx .node addon 依赖同目录下的 .dylib（macOS）/ .so（Linux）。
      // macOS 的 DYLD_LIBRARY_PATH 必须在进程启动前设置（dev 脚本已处理）。
      // 这里先尝试正常 require，失败则用 process.dlopen 直接加载绝对路径。
      const os = require("os");
      const platform = os.platform() === "win32" ? "win" : os.platform();
      const arch = os.arch();
      const nativeDir = path.join(
        app.getAppPath(),
        "node_modules",
        `sherpa-onnx-${platform}-${arch}`,
      );

      log.info(`Native addon 目录: ${nativeDir}`);
      log.info(`DYLD_LIBRARY_PATH: ${process.env.DYLD_LIBRARY_PATH || "(not set)"}`);

      try {
        // 优先尝试正常加载（需要 DYLD_LIBRARY_PATH 已在进程启动前设置）
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        this.sherpa = require("sherpa-onnx-node") as typeof import("sherpa-onnx-node");
      } catch (normalErr) {
        log.warn(`正常 require 失败，尝试 process.dlopen 方式: ${normalErr}`);

        // 回退方案：用 process.dlopen 直接加载 .node 文件（绝对路径）
        const addonPath = path.join(nativeDir, "sherpa-onnx.node");
        if (!fs.existsSync(addonPath)) {
          throw new Error(`Native addon 不存在: ${addonPath}`);
        }

        // 手动 dlopen .node 文件
        const addonModule = { exports: {} as Record<string, unknown> };
        process.dlopen(addonModule, addonPath);

        // 将 addon 注入到 sherpa-onnx-node 的模块系统中
        // 通过 monkey-patch addon-static-import 的缓存来实现
        const sherpaNodeDir = path.join(
          app.getAppPath(),
          "node_modules",
          "sherpa-onnx-node",
        );
        const addonStaticPath = path.join(sherpaNodeDir, "addon-static-import.js");
        // 清除已缓存的失败模块
        delete require.cache[require.resolve(addonStaticPath)];
        const addonJsPath = path.join(sherpaNodeDir, "addon.js");
        delete require.cache[require.resolve(addonJsPath)];
        // 预设 addon-static-import 的缓存为我们手动加载的 addon
        require.cache[require.resolve(addonStaticPath)] = {
          id: addonStaticPath,
          filename: addonStaticPath,
          loaded: true,
          exports: addonModule.exports,
          parent: null,
          children: [],
          paths: [],
          path: sherpaNodeDir,
        } as unknown as NodeJS.Module;

        // 重新 require sherpa-onnx-node（这次会使用我们注入的 addon）
        const sherpaMainPath = path.join(sherpaNodeDir, "sherpa-onnx.js");
        delete require.cache[require.resolve(sherpaMainPath)];
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        this.sherpa = require(sherpaMainPath) as typeof import("sherpa-onnx-node");
        log.info("通过 process.dlopen 回退方案加载成功");
      }

      log.info(`sherpa-onnx-node 加载成功`);
    } catch (err) {
      log.error(`sherpa-onnx-node 加载失败: ${err}`);
      throw new Error(`sherpa-onnx-node 加载失败: ${err}`);
    }

    // ── 初始化 OnlineRecognizer（流式 ASR）──
    const asrDir = resolveStreamingAsrDir();
    const onlineConfig = {
      featConfig: {
        sampleRate: this.sampleRate,
        featureDim: 80,
      },
      modelConfig: {
        paraformer: {
          encoder: path.join(asrDir, "encoder.int8.onnx"),
          decoder: path.join(asrDir, "decoder.int8.onnx"),
        },
        tokens: path.join(asrDir, "tokens.txt"),
        numThreads: 2,
        provider: "cpu",
        debug: false,
      },
      decodingMethod: "greedy_search",
      enableEndpoint: true,
      rule1MinTrailingSilence: 2.4,
      rule2MinTrailingSilence: 1.2,
      rule3MinUtteranceLength: 20,
    };

    try {
      this.recognizer = new this.sherpa.OnlineRecognizer(
        onlineConfig,
      );
      log.info("OnlineRecognizer 初始化成功");
    } catch (err) {
      log.error(`OnlineRecognizer 初始化失败: ${err}`);
      throw err;
    }

    // ── 初始化 VAD（可选）──
    if (models.vadAvailable) {
      try {
        const vadConfig = {
          sileroVad: {
            model: resolveVadModelPath(),
            threshold: 0.5,
            minSilenceDuration: 0.5,
            minSpeechDuration: 0.25,
            windowSize: 512,
          },
          sampleRate: this.sampleRate,
          numThreads: 1,
          provider: "cpu",
          debug: false,
        };
        this.vad = new this.sherpa.Vad(vadConfig, 30);
        log.info("VAD 初始化成功");
      } catch (err) {
        log.warn(`VAD 初始化失败（非致命）: ${err}`);
        this.vad = null;
      }
    }

    // ── 初始化 TTS（可选）──
    if (models.ttsAvailable) {
      try {
        const ttsDir = resolveTtsDir();
        const ttsConfig = {
          model: {
            vits: {
              model: path.join(ttsDir, "model.onnx"),
              tokens: path.join(ttsDir, "tokens.txt"),
              lexicon: path.join(ttsDir, "lexicon.txt"),
            },
            numThreads: 2,
            provider: "cpu",
            debug: false,
          },
          maxNumSentences: 1,
        };
        this.tts = new this.sherpa.OfflineTts(
          ttsConfig,
        );
        log.info(
          `OfflineTts 初始化成功: speakers=${this.tts.numSpeakers} sampleRate=${this.tts.sampleRate}`,
        );
      } catch (err) {
        log.warn(`TTS 初始化失败（非致命）: ${err}`);
        this.tts = null;
      }
    }

    // ── 初始化 naudiodon2（麦克风）──
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.portAudio = require("naudiodon2") as typeof import("naudiodon2");
      log.info("naudiodon2 加载成功");
    } catch (err) {
      log.error(`naudiodon2 加载失败: ${err}`);
      throw new Error(`naudiodon2 加载失败（麦克风不可用）: ${err}`);
    }

    log.info("语音引擎初始化完成");
  }

  /**
   * 开始监听麦克风输入
   */
  async startListening(): Promise<void> {
    if (this.state === "listening") return;

    // 确保已初始化
    await this.initialize();

    if (!this.recognizer || !this.portAudio) {
      const detail = `recognizer=${!!this.recognizer} portAudio=${!!this.portAudio} sherpa=${!!this.sherpa}`;
      log.error(`语音引擎未初始化: ${detail}`);
      throw new Error(`语音引擎未初始化 (${detail})`);
    }

    log.info("开始语音识别...");
    this.state = "listening";
    this.lastInterimText = "";
    this.sendStateChange("listening");

    // 创建新的 stream
    this.stream = this.recognizer.createStream();

    // 创建麦克风输入
    this.audioInput = new this.portAudio.AudioIO({
      inOptions: {
        channelCount: 1,
        sampleFormat: this.portAudio.SampleFormat16Bit,
        sampleRate: this.sampleRate,
        deviceId: -1, // 默认设备
        closeOnError: false,
      },
    });

    // 处理麦克风音频数据
    this.audioInput.on("data", (buf: Buffer) => {
      if (this.state !== "listening" || !this.stream || !this.recognizer) return;

      // 将 Int16 PCM → Float32Array
      const int16 = new Int16Array(
        buf.buffer,
        buf.byteOffset,
        buf.length / 2,
      );
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      // 送入 ASR
      this.stream.acceptWaveform({
        samples: float32,
        sampleRate: this.sampleRate,
      });

      // 解码
      while (this.recognizer.isReady(this.stream)) {
        this.recognizer.decode(this.stream);
      }

      // 获取中间结果
      const result = this.recognizer.getResult(this.stream);
      if (result.text && result.text !== this.lastInterimText) {
        this.lastInterimText = result.text;
        this.sendInterimResult(result.text);
      }

      // 检查端点（一句话结束）
      if (this.recognizer.isEndpoint(this.stream)) {
        const finalText = result.text;
        if (finalText) {
          log.info(`ASR 最终结果: ${finalText}`);
          this.sendFinalResult(finalText);
          this.lastInterimText = "";
        }
        this.recognizer.reset(this.stream);
      }
    });

    this.audioInput.on("error", (err: Error) => {
      log.error(`麦克风错误: ${err.message}`);
      this.stopListening();
    });

    // 开始录音
    this.audioInput.start();
    log.info("麦克风录音已启动");
  }

  /**
   * 停止监听
   */
  stopListening(): void {
    if (this.state !== "listening") return;

    log.info("停止语音识别...");

    // 停止麦克风
    if (this.audioInput) {
      try {
        this.audioInput.quit();
      } catch (err) {
        log.warn(`停止麦克风时出错: ${err}`);
      }
      this.audioInput = null;
    }

    // 处理剩余音频
    if (this.stream && this.recognizer) {
      this.stream.inputFinished();
      while (this.recognizer.isReady(this.stream)) {
        this.recognizer.decode(this.stream);
      }
      const lastResult = this.recognizer.getResult(this.stream);
      if (lastResult.text) {
        log.info(`ASR 最终结果（停止时）: ${lastResult.text}`);
        this.sendFinalResult(lastResult.text);
      }
    }

    this.stream = null;
    this.state = "idle";
    this.sendStateChange("stopped");
  }

  /**
   * TTS 合成
   * @returns Float32Array 音频数据 + 采样率，或 null 表示 TTS 不可用
   */
  async synthesize(
    text: string,
  ): Promise<{ samples: Float32Array; sampleRate: number } | null> {
    if (!this.tts) {
      log.warn("TTS 不可用");
      return null;
    }

    log.info(`TTS 合成: ${text.slice(0, 50)}...`);
    try {
      const audio = await this.tts.generateAsync({
        text,
        sid: 0,
        speed: 1.0,
      });
      log.info(
        `TTS 合成完成: ${audio.samples.length} samples @ ${audio.sampleRate}Hz`,
      );
      return audio;
    } catch (err) {
      log.error(`TTS 合成失败: ${err}`);
      return null;
    }
  }

  /**
   * 销毁引擎（应用退出前调用）
   */
  destroy(): void {
    this.stopListening();
    this.recognizer = null;
    this.stream = null;
    this.vad = null;
    this.tts = null;
    this.sherpa = null;
    this.portAudio = null;
    this.targetWindow = null;
    log.info("语音引擎已销毁");
  }

  // ── IPC 事件发送 ──

  private sendInterimResult(text: string): void {
    if (!this.targetWindow || this.targetWindow.isDestroyed()) return;
    this.targetWindow.webContents.send("live2d:interim-result", text);
  }

  private sendFinalResult(text: string): void {
    if (!this.targetWindow || this.targetWindow.isDestroyed()) return;
    this.targetWindow.webContents.send("live2d:final-result", text);
  }

  private sendStateChange(state: "listening" | "stopped"): void {
    if (!this.targetWindow || this.targetWindow.isDestroyed()) return;
    this.targetWindow.webContents.send(
      "live2d:listening-state",
      state,
    );
  }
}
