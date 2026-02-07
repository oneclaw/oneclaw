import { autoUpdater } from "electron-updater";
import { dialog } from "electron";

// 初始化自动更新
export function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    dialog
      .showMessageBox({
        type: "info",
        title: "Update Available",
        message: `发现新版本 ${info.version}`,
        buttons: ["下载", "稍后"],
      })
      .then((r) => {
        if (r.response === 0) autoUpdater.downloadUpdate();
      });
  });

  autoUpdater.on("update-downloaded", () => {
    dialog
      .showMessageBox({
        type: "info",
        title: "Update Ready",
        message: "更新已下载，重启以安装",
        buttons: ["立即重启", "稍后"],
      })
      .then((r) => {
        if (r.response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on("error", (err) => {
    console.error("[updater] 检查更新失败:", err.message);
  });
}

// 手动检查更新
export function checkForUpdates(): void {
  autoUpdater.checkForUpdates();
}
