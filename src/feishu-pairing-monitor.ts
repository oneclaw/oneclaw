import { GatewayProcess } from "./gateway-process";
import * as log from "./logger";
import {
  type FeishuPairingRequestView,
  approveFeishuPairingRequest,
  closeFeishuFirstPairingWindow,
  consumeFeishuFirstPairingWindow,
  getFeishuPairingModeState,
  isFeishuFirstPairingWindowActive,
  listFeishuPairingRequests,
} from "./settings-ipc";

export type FeishuPairingState = {
  pendingCount: number;
  requests: FeishuPairingRequestView[];
  updatedAt: number;
  lastAutoApprovedAt: number | null;
  lastAutoApprovedName: string | null;
};

interface FeishuPairingMonitorOptions {
  gateway: GatewayProcess;
  onStateChange?: (state: FeishuPairingState) => void;
  isAppInForeground?: () => boolean;
}

const FOREGROUND_POLL_INTERVAL_MS = 10_000;
const BACKGROUND_POLL_INTERVAL_MS = 60_000;

// 统一创建飞书配对状态的默认值，确保渲染层拿到稳定结构。
function createInitialState(): FeishuPairingState {
  return {
    pendingCount: 0,
    requests: [],
    updatedAt: Date.now(),
    lastAutoApprovedAt: null,
    lastAutoApprovedName: null,
  };
}

// 将时间字符串解析为毫秒时间戳；无法解析时返回极大值，避免影响“最早请求”排序。
function parseRequestTime(value: string): number {
  const ms = Date.parse(String(value ?? "").trim());
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

// 从待审批列表中选择最早请求，减少“抢最新消息”导致的顺序抖动。
function pickFirstRequest(requests: FeishuPairingRequestView[]): FeishuPairingRequestView | null {
  if (!Array.isArray(requests) || requests.length === 0) {
    return null;
  }
  const cloned = [...requests];
  cloned.sort((a, b) => {
    const aTime = parseRequestTime(a.createdAt || a.lastSeenAt);
    const bTime = parseRequestTime(b.createdAt || b.lastSeenAt);
    if (aTime !== bTime) return aTime - bTime;
    return String(a.code || "").localeCompare(String(b.code || ""), "en");
  });
  return cloned[0] ?? null;
}

export class FeishuPairingMonitor {
  private readonly gateway: GatewayProcess;

  private readonly onStateChange?: (state: FeishuPairingState) => void;
  private readonly isAppInForeground?: () => boolean;

  private timer: ReturnType<typeof setTimeout> | null = null;

  private running = false;

  private polling = false;

  private state: FeishuPairingState = createInitialState();

  private lastFingerprint = "";

  constructor(opts: FeishuPairingMonitorOptions) {
    this.gateway = opts.gateway;
    this.onStateChange = opts.onStateChange;
    this.isAppInForeground = opts.isAppInForeground;
  }

  // 返回当前快照副本，避免外部直接修改内部状态。
  getState(): FeishuPairingState {
    return {
      ...this.state,
      requests: [...this.state.requests],
    };
  }

  // 启动轮询循环；重复调用是幂等的。
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.schedule(800);
  }

  // 停止轮询，应用退出前调用。
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // 触发一次立即刷新（比如用户刚点击“批准”）。
  triggerNow(): void {
    if (!this.running) {
      return;
    }
    this.schedule(0);
  }

  // 统一发布状态：只有内容变化才广播，避免渲染层无意义重绘。
  private publish(next: FeishuPairingState): void {
    const fingerprint = JSON.stringify({
      pendingCount: next.pendingCount,
      codes: next.requests.map((item) => item.code),
      lastAutoApprovedAt: next.lastAutoApprovedAt,
      lastAutoApprovedName: next.lastAutoApprovedName,
    });
    if (fingerprint === this.lastFingerprint) {
      return;
    }
    this.lastFingerprint = fingerprint;
    this.state = {
      ...next,
      requests: [...next.requests],
    };
    this.onStateChange?.(this.getState());
  }

  // 调度下一次轮询，统一控制 timer 生命周期。
  private schedule(delayMs: number): void {
    if (!this.running) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pollOnce();
    }, Math.max(0, delayMs));
  }

  // 根据应用前后台状态返回轮询间隔：前台 10s，后台 60s。
  private resolvePollIntervalMs(): number {
    const foreground = this.isAppInForeground?.();
    return foreground === false ? BACKGROUND_POLL_INTERVAL_MS : FOREGROUND_POLL_INTERVAL_MS;
  }

  // 单次轮询：检查配置状态、拉取待审批、必要时自动批准首个请求。
  private async pollOnce(): Promise<void> {
    if (!this.running) {
      return;
    }
    if (this.polling) {
      this.schedule(this.resolvePollIntervalMs());
      return;
    }
    this.polling = true;

    try {
      if (this.gateway.getState() !== "running") {
        this.publish({
          ...this.state,
          pendingCount: 0,
          requests: [],
          updatedAt: Date.now(),
        });
        return;
      }

      const mode = getFeishuPairingModeState();
      if (!mode.enabled || mode.dmPolicy !== "pairing") {
        closeFeishuFirstPairingWindow();
        this.publish({
          ...this.state,
          pendingCount: 0,
          requests: [],
          updatedAt: Date.now(),
        });
        return;
      }

      const listed = await listFeishuPairingRequests();
      if (!listed.success) {
        log.warn(`Feishu pairing list failed: ${listed.message || "unknown"}`);
        return;
      }

      let requests = listed.requests;
      let autoApprovedTarget: FeishuPairingRequestView | null = null;

      if (mode.approvedUserCount === 0 && isFeishuFirstPairingWindowActive()) {
        const first = pickFirstRequest(requests);
        if (first && first.code) {
          const approved = await approveFeishuPairingRequest({
            code: first.code,
            id: first.id,
            name: first.name,
          });
          consumeFeishuFirstPairingWindow(first.id);
          if (approved.success) {
            autoApprovedTarget = first;
            const refreshed = await listFeishuPairingRequests();
            if (refreshed.success) {
              requests = refreshed.requests;
            }
          } else {
            log.warn(`Feishu first pairing auto-approve failed: ${approved.message || "unknown"}`);
          }
        }
      }

      this.publish({
        pendingCount: requests.length,
        requests,
        updatedAt: Date.now(),
        lastAutoApprovedAt: autoApprovedTarget ? Date.now() : this.state.lastAutoApprovedAt,
        lastAutoApprovedName: autoApprovedTarget
          ? (autoApprovedTarget.name || autoApprovedTarget.id || autoApprovedTarget.code)
          : this.state.lastAutoApprovedName,
      });
    } catch (err: any) {
      log.error(`Feishu pairing monitor error: ${err?.message || String(err)}`);
    } finally {
      this.polling = false;
      this.schedule(this.resolvePollIntervalMs());
    }
  }
}
