import { contextBridge, ipcRenderer } from "electron";

// 安全桥接 — 向渲染进程暴露有限 API
contextBridge.exposeInMainWorld("oneclaw", {
  // Gateway 控制
  restartGateway: () => ipcRenderer.send("gateway:restart"),
  getGatewayState: () => ipcRenderer.invoke("gateway:state"),

  // 自动更新
  checkForUpdates: () => ipcRenderer.send("app:check-updates"),

  // Setup 相关
  verifyKey: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("setup:verify-key", params),
  saveConfig: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("setup:save-config", params),
  completeSetup: () => ipcRenderer.invoke("setup:complete"),

  // Settings 相关
  settingsGetConfig: () => ipcRenderer.invoke("settings:get-config"),
  settingsVerifyKey: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:verify-key", params),
  settingsSaveProvider: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:save-provider", params),
  settingsGetChannelConfig: () => ipcRenderer.invoke("settings:get-channel-config"),
  settingsSaveChannel: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:save-channel", params),
  settingsListFeishuPairing: () =>
    ipcRenderer.invoke("settings:list-feishu-pairing"),
  settingsListFeishuApproved: () =>
    ipcRenderer.invoke("settings:list-feishu-approved"),
  settingsApproveFeishuPairing: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:approve-feishu-pairing", params),
  settingsAddFeishuGroupAllowFrom: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:add-feishu-group-allow-from", params),
  settingsRemoveFeishuApproved: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:remove-feishu-approved", params),
  settingsGetKimiConfig: () => ipcRenderer.invoke("settings:get-kimi-config"),
  settingsSaveKimiConfig: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:save-kimi-config", params),
  settingsRunDoctor: () => ipcRenderer.invoke("settings:run-doctor"),
  settingsGetAdvanced: () => ipcRenderer.invoke("settings:get-advanced"),
  settingsSaveAdvanced: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:save-advanced", params),
  settingsListConfigBackups: () => ipcRenderer.invoke("settings:list-config-backups"),
  settingsRestoreConfigBackup: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:restore-config-backup", params),
  settingsRestoreLastKnownGood: () => ipcRenderer.invoke("settings:restore-last-known-good"),

  // Doctor 流式事件监听
  onDoctorOutput: (cb: (text: string) => void) => {
    ipcRenderer.on("settings:doctor-output", (_e, text) => cb(text));
  },
  onDoctorExit: (cb: (code: number) => void) => {
    ipcRenderer.on("settings:doctor-exit", (_e, code) => cb(code));
  },
  onSettingsNavigate: (cb: (payload: { tab: string; notice: string }) => void) => {
    ipcRenderer.on("settings:navigate", (_e, payload) => cb(payload));
  },

  // 打开外部链接（走 IPC 到主进程，sandbox 下 shell 不可用）
  openExternal: (url: string) => ipcRenderer.invoke("app:open-external", url),

  // Chat UI 侧边栏操作
  openSettings: () => ipcRenderer.send("app:open-settings"),
  openWebUI: () => ipcRenderer.send("app:open-webui"),
  getGatewayPort: () => ipcRenderer.invoke("gateway:port"),
  onNavigate: (cb: (payload: { view: "settings" }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { view: "settings" }) => {
      cb(payload);
    };
    ipcRenderer.on("app:navigate", listener);
    return () => ipcRenderer.removeListener("app:navigate", listener);
  },
});
