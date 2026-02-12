import { autoUpdater } from "electron-updater";
import { dialog } from "electron";
import * as log from "./logger";

// ── 常量 ──

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 小时定时检查
const STARTUP_DELAY_MS = 30 * 1000;            // 启动后延迟 30 秒（避免与 gateway 启动争资源）

// ── 状态 ──

let isManualCheck = false;
let startupTimer: ReturnType<typeof setTimeout> | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;
let progressCallback: ((percent: number | null) => void) | null = null;
let beforeQuitForInstallCallback: (() => void) | null = null;

// 统一格式化更新错误，避免日志出现 [object Object]
function formatUpdaterError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// 初始化自动更新
export function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // 将 electron-updater 内部日志转发到 app.log
  autoUpdater.logger = {
    info: (msg: unknown) => log.info(`[updater] ${msg}`),
    warn: (msg: unknown) => log.warn(`[updater] ${msg}`),
    error: (msg: unknown) => log.error(`[updater] ${msg}`),
  };

  autoUpdater.on("checking-for-update", () => {
    log.info("[updater] 正在检查更新...");
  });

  // 发现新版本
  autoUpdater.on("update-available", (info) => {
    log.info(`[updater] 发现新版本 ${info.version}`);
    void dialog
      .showMessageBox({
        type: "info",
        title: "Update Available",
        message: `发现新版本 ${info.version}`,
        buttons: ["下载", "稍后"],
      })
      .then((r) => {
        if (r.response !== 0) return;
        void autoUpdater.downloadUpdate().catch((err) => {
          log.error(`[updater] 下载更新触发失败: ${formatUpdaterError(err)}`);
        });
      })
      .catch((err) => {
        log.error(`[updater] 更新提示框失败: ${formatUpdaterError(err)}`);
      });
  });

  // 已是最新版本
  autoUpdater.on("update-not-available", (info) => {
    log.info(`[updater] 已是最新版本 ${info.version}`);
    if (isManualCheck) {
      dialog.showMessageBox({
        type: "info",
        title: "No Updates",
        message: `当前已是最新版本 (${info.version})`,
      });
    }
  });

  // 下载进度
  autoUpdater.on("download-progress", (progress) => {
    const pct = progress.percent.toFixed(1);
    log.info(`[updater] 下载进度: ${pct}%`);
    progressCallback?.(progress.percent);
  });

  // 下载完成
  autoUpdater.on("update-downloaded", () => {
    log.info("[updater] 更新下载完成");
    progressCallback?.(null);
    void dialog
      .showMessageBox({
        type: "info",
        title: "Update Ready",
        message: "更新已下载，重启以安装",
        buttons: ["立即重启", "稍后"],
      })
      .then((r) => {
        if (r.response !== 0) return;
        log.info("[updater] 用户确认立即重启，准备安装更新");
        beforeQuitForInstallCallback?.();
        autoUpdater.quitAndInstall();
      })
      .catch((err) => {
        log.error(`[updater] 安装确认框失败: ${formatUpdaterError(err)}`);
      });
  });

  // 错误处理
  autoUpdater.on("error", (err) => {
    log.error(`[updater] 更新失败: ${err.message}`);
    progressCallback?.(null);
    if (isManualCheck) {
      dialog.showMessageBox({
        type: "error",
        title: "Update Error",
        message: "检查更新失败",
        detail: err.message,
      });
    }
  });
}

// 检查更新（manual=true 时弹窗反馈"已是最新"或错误）
export function checkForUpdates(manual = false): void {
  isManualCheck = manual;
  void autoUpdater.checkForUpdates().catch((err) => {
    log.error(`[updater] 检查更新调用失败: ${formatUpdaterError(err)}`);
  });
}

// 启动定时检查（延迟首次 + 周期轮询）
export function startAutoCheckSchedule(): void {
  startupTimer = setTimeout(() => {
    checkForUpdates(false);
    intervalTimer = setInterval(() => checkForUpdates(false), CHECK_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

// 停止定时检查
export function stopAutoCheckSchedule(): void {
  if (startupTimer) { clearTimeout(startupTimer); startupTimer = null; }
  if (intervalTimer) { clearInterval(intervalTimer); intervalTimer = null; }
}

// 注入下载进度回调（供 tray 显示 tooltip）
export function setProgressCallback(cb: (percent: number | null) => void): void {
  progressCallback = cb;
}

// 注入更新安装前回调（供主进程放行窗口关闭）
export function setBeforeQuitForInstallCallback(cb: () => void): void {
  beforeQuitForInstallCallback = cb;
}
