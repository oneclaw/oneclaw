import type { InstallResult } from "./webbridge-installer";

export interface UpdateSchedulerLogger {
  info: (msg: string) => void;
  error: (msg: string) => void;
}

export interface CheckResult {
  upToDate: boolean;
}

export interface UpdateSchedulerDeps {
  checkForUpdate: () => Promise<CheckResult>;
  installWebbridge: () => Promise<InstallResult>;
  binaryExists: () => boolean;
  intervalMs?: number;
  initialDelayMs?: number;
  logger?: UpdateSchedulerLogger;
}

export interface UpdateSchedulerHandle {
  stop: () => void;
}

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INITIAL_DELAY_MS = 10 * 60 * 1000;

const NOOP_LOGGER: UpdateSchedulerLogger = {
  info: () => {},
  error: () => {},
};

export function startUpdateScheduler(
  deps: UpdateSchedulerDeps,
): UpdateSchedulerHandle {
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  const initialDelayMs = deps.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const log = deps.logger ?? NOOP_LOGGER;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const runOnce = async (): Promise<void> => {
    if (stopped) return;

    if (!deps.binaryExists()) {
      log.info(
        "[webbridge-update] binary 不存在，跳过更新检查（用户可能从未用过 webbridge 模式）",
      );
      return;
    }

    try {
      const result = await deps.checkForUpdate();
      if (result.upToDate) {
        log.info("[webbridge-update] 已是最新版本");
        return;
      }
      log.info("[webbridge-update] 发现新版本，开始下载");
      try {
        const installed = await deps.installWebbridge();
        log.info(
          `[webbridge-update] 更新完成: version=${installed.version} skipped=${installed.skipped}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`[webbridge-update] 下载新版失败: ${msg}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`[webbridge-update] 检查更新失败: ${msg}`);
    }
  };

  const scheduleNext = (delay: number): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      timer = null;
      runOnce().finally(() => {
        if (!stopped) scheduleNext(intervalMs);
      });
    }, delay);
  };

  scheduleNext(initialDelayMs);

  return {
    stop: () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
