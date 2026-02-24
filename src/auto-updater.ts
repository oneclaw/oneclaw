import { autoUpdater } from "electron-updater";
import { dialog } from "electron";
import * as log from "./logger";
import {
  canStartUpdateDownload,
  createInitialUpdateBannerState,
  reduceUpdateBannerState,
  type UpdateBannerState,
} from "./update-banner-state";

// ── 常量 ──

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 小时定时检查
const STARTUP_DELAY_MS = 30 * 1000;            // 启动后延迟 30 秒（避免与 gateway 启动争资源）

// ── 状态 ──

let isManualCheck = false;
let startupTimer: ReturnType<typeof setTimeout> | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;
let progressCallback: ((percent: number | null) => void) | null = null;
let beforeQuitForInstallCallback: (() => void) | null = null;
let updateBannerStateCallback: ((state: UpdateBannerState) => void) | null = null;
let updateBannerState = createInitialUpdateBannerState();
let downloadInFlight: Promise<boolean> | null = null;

// 统一格式化更新错误，避免日志出现 [object Object]
function formatUpdaterError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// 统一发布侧栏更新状态，保证主进程与渲染层状态一致。
function publishUpdateBannerState(
  event: Parameters<typeof reduceUpdateBannerState>[1],
): UpdateBannerState {
  updateBannerState = reduceUpdateBannerState(updateBannerState, event);
  updateBannerStateCallback?.({ ...updateBannerState });
  return updateBannerState;
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

  // 发现新版本后仅更新侧栏状态，不再弹窗打断用户流程。
  autoUpdater.on("update-available", (info) => {
    log.info(`[updater] 发现新版本 ${info.version}`);
    publishUpdateBannerState({
      type: "update-available",
      version: info.version,
    });
    isManualCheck = false;
  });

  // 已是最新版本
  autoUpdater.on("update-not-available", (info) => {
    log.info(`[updater] 已是最新版本 ${info.version}`);
    if (updateBannerState.status !== "downloading") {
      publishUpdateBannerState({ type: "update-not-available" });
    }
    if (isManualCheck) {
      void dialog.showMessageBox({
        type: "info",
        title: "No Updates",
        message: `当前已是最新版本 (${info.version})`,
      });
    }
    isManualCheck = false;
  });

  // 下载进度
  autoUpdater.on("download-progress", (progress) => {
    const normalizedPercent = Number.isFinite(progress.percent)
      ? Math.max(0, Math.min(100, progress.percent))
      : 0;
    const pct = normalizedPercent.toFixed(1);
    log.info(`[updater] 下载进度: ${pct}%`);
    progressCallback?.(normalizedPercent);
    publishUpdateBannerState({
      type: "download-progress",
      percent: normalizedPercent,
    });
  });

  // 下载完成后直接重启安装，不再二次确认弹窗。
  autoUpdater.on("update-downloaded", () => {
    log.info("[updater] 更新下载完成");
    progressCallback?.(null);
    publishUpdateBannerState({ type: "download-finished" });
    log.info("[updater] 准备自动重启安装更新");
    beforeQuitForInstallCallback?.();
    autoUpdater.quitAndInstall();
  });

  // 错误处理
  autoUpdater.on("error", (err) => {
    log.error(`[updater] 更新失败: ${err.message}`);
    progressCallback?.(null);
    if (updateBannerState.status === "downloading") {
      publishUpdateBannerState({ type: "download-failed" });
    }
    if (isManualCheck) {
      void dialog.showMessageBox({
        type: "error",
        title: "Update Error",
        message: "检查更新失败",
        detail: err.message,
      });
    }
    isManualCheck = false;
  });
}

// 检查更新（manual=true 时弹窗反馈"已是最新"或错误）
export function checkForUpdates(manual = false): void {
  isManualCheck = manual;
  void autoUpdater.checkForUpdates().catch((err) => {
    log.error(`[updater] 检查更新调用失败: ${formatUpdaterError(err)}`);
    if (manual) {
      void dialog.showMessageBox({
        type: "error",
        title: "Update Error",
        message: "检查更新失败",
        detail: formatUpdaterError(err),
      });
    }
    isManualCheck = false;
  });
}

// 用户在侧栏点击“重新启动即可更新”后才触发下载，下载完成自动重启安装。
export async function downloadAndInstallUpdate(): Promise<boolean> {
  if (!canStartUpdateDownload(updateBannerState)) {
    return false;
  }
  if (downloadInFlight) {
    return downloadInFlight;
  }

  publishUpdateBannerState({ type: "download-started" });
  downloadInFlight = autoUpdater
    .downloadUpdate()
    .then(() => true)
    .catch((err) => {
      log.error(`[updater] 下载更新触发失败: ${formatUpdaterError(err)}`);
      publishUpdateBannerState({ type: "download-failed" });
      return false;
    })
    .finally(() => {
      downloadInFlight = null;
    });
  return downloadInFlight;
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

// 注入侧栏更新状态回调（供主进程转发给渲染层）。
export function setUpdateBannerStateCallback(cb: (state: UpdateBannerState) => void): void {
  updateBannerStateCallback = cb;
  updateBannerStateCallback({ ...updateBannerState });
}

// 获取当前侧栏更新状态（供渲染层首屏同步）。
export function getUpdateBannerState(): UpdateBannerState {
  return { ...updateBannerState };
}
