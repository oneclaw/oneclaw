import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("live2dAPI", {
  // ── 窗口控制 ──
  openMainWindow: () => ipcRenderer.send("live2d:open-main"),
  dragWindow: (deltaX: number, deltaY: number) =>
    ipcRenderer.send("live2d:drag-window", deltaX, deltaY),

  // ── 模型管理 ──
  getConfig: () => ipcRenderer.invoke("live2d:get-config"),
  getModelList: () => ipcRenderer.invoke("live2d:get-model-list"),
  changeModel: (modelPath: string) => ipcRenderer.invoke("live2d:change-model", modelPath),
  getModelsDir: () => ipcRenderer.invoke("live2d:get-models-dir"),

  // ── 模型变更通知 ──
  onChangeModel: (callback: (modelName: string) => void) => {
    ipcRenderer.on("live2d:change-model", (_e, modelName) => callback(modelName));
  },

  // ── 聊天 ──
  sendChat: (text: string) => ipcRenderer.invoke("live2d:send-chat", text),

  // ── 语音控制 ──
  startListening: () => ipcRenderer.invoke("live2d:start-listening"),
  stopListening: () => ipcRenderer.invoke("live2d:stop-listening"),
  checkSpeechModels: () => ipcRenderer.invoke("live2d:check-speech-models"),

  // ── 语音事件（主进程 → 渲染进程） ──
  onInterimResult: (callback: (text: string) => void) => {
    ipcRenderer.on("live2d:interim-result", (_e, text) => callback(text));
  },
  onFinalResult: (callback: (text: string) => void) => {
    ipcRenderer.on("live2d:final-result", (_e, text) => callback(text));
  },
  onAIReply: (callback: (reply: string, audioData?: ArrayBuffer) => void) => {
    ipcRenderer.on("live2d:ai-reply", (_e, reply, audioData) => callback(reply, audioData));
  },
  onListeningStateChange: (callback: (state: string) => void) => {
    ipcRenderer.on("live2d:listening-state", (_e, state) => callback(state));
  },
});
