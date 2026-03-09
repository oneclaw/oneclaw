import { GatewayProcess } from "./gateway-process";
import * as log from "./logger";

export type PairingRequestView = {
  code: string;
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
};

export type PairingRequestWithChannel = PairingRequestView & {
  channel: string;
};

export type PairingModeState = {
  enabled: boolean;
  dmPolicy: "open" | "pairing" | "allowlist";
  approvedUserCount: number;
};

export type PairingActionResult = {
  success: boolean;
  message?: string;
};

export type PairingListResult = PairingActionResult & {
  requests: PairingRequestView[];
};

export type PairingChannelState = {
  channel: string;
  pendingCount: number;
  requests: PairingRequestView[];
  updatedAt: number;
  lastAutoApprovedAt: number | null;
  lastAutoApprovedName: string | null;
};

export type PairingState = {
  pendingCount: number;
  requests: PairingRequestWithChannel[];
  updatedAt: number;
  channels: Record<string, PairingChannelState>;
};

export interface PairingAutoApproveAdapter {
  isActive(): boolean;
  consume(id: string): void;
  reset(): void;
}

export interface PairingChannelAdapter {
  channel: string;
  getModeState(): PairingModeState;
  listRequests(): Promise<PairingListResult>;
  approveRequest(params: Record<string, unknown>): Promise<PairingActionResult>;
  autoApproveFirst?: PairingAutoApproveAdapter;
  onInactive?: () => void;
}

interface ChannelPairingMonitorOptions {
  gateway: Pick<GatewayProcess, "getState">;
  adapters: PairingChannelAdapter[];
  onStateChange?: (state: PairingState) => void;
  isAppInForeground?: () => boolean;
}

const FOREGROUND_POLL_INTERVAL_MS = 10_000;
const BACKGROUND_POLL_INTERVAL_MS = 60_000;

// 统一创建空渠道快照，确保 UI 层始终拿到稳定结构。
function createEmptyChannelState(channel: string, previous?: PairingChannelState): PairingChannelState {
  return {
    channel,
    pendingCount: 0,
    requests: [],
    updatedAt: Date.now(),
    lastAutoApprovedAt: previous?.lastAutoApprovedAt ?? null,
    lastAutoApprovedName: previous?.lastAutoApprovedName ?? null,
  };
}

// 统一创建 monitor 初始状态，避免首屏取值时出现 undefined。
function createInitialState(adapters: PairingChannelAdapter[]): PairingState {
  const channels = Object.fromEntries(
    adapters.map((adapter) => [adapter.channel, createEmptyChannelState(adapter.channel)])
  );
  return {
    pendingCount: 0,
    requests: [],
    updatedAt: Date.now(),
    channels,
  };
}

// 将时间字符串解析为毫秒时间戳；无法解析时返回极大值，避免影响“最早请求”排序。
function parseRequestTime(value: string): number {
  const ms = Date.parse(String(value ?? "").trim());
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

// 从待审批列表中选择最早请求，减少“抢最新消息”导致的顺序抖动。
function pickFirstRequest(requests: PairingRequestView[]): PairingRequestView | null {
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

// 统一聚合多渠道快照，供主窗口和设置页共用一份来源。
function buildAggregateState(channels: Record<string, PairingChannelState>): PairingState {
  const requests: PairingRequestWithChannel[] = [];
  let pendingCount = 0;
  let updatedAt = 0;

  for (const channelState of Object.values(channels)) {
    pendingCount += channelState.pendingCount;
    updatedAt = Math.max(updatedAt, channelState.updatedAt);
    for (const request of channelState.requests) {
      requests.push({
        channel: channelState.channel,
        code: request.code,
        id: request.id,
        name: request.name,
        createdAt: request.createdAt,
        lastSeenAt: request.lastSeenAt,
      });
    }
  }

  return {
    pendingCount,
    requests,
    updatedAt: updatedAt || Date.now(),
    channels,
  };
}

export class ChannelPairingMonitor {
  private readonly gateway: Pick<GatewayProcess, "getState">;
  private readonly adapters: PairingChannelAdapter[];
  private readonly onStateChange?: (state: PairingState) => void;
  private readonly isAppInForeground?: () => boolean;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private polling = false;
  private state: PairingState;
  private lastFingerprint = "";

  constructor(opts: ChannelPairingMonitorOptions) {
    this.gateway = opts.gateway;
    this.adapters = [...opts.adapters];
    this.onStateChange = opts.onStateChange;
    this.isAppInForeground = opts.isAppInForeground;
    this.state = createInitialState(this.adapters);
  }

  // 返回当前快照副本，避免外部直接修改内部状态。
  getState(): PairingState {
    return {
      pendingCount: this.state.pendingCount,
      requests: this.state.requests.map((item) => ({ ...item })),
      updatedAt: this.state.updatedAt,
      channels: Object.fromEntries(
        Object.entries(this.state.channels).map(([channel, snapshot]) => [
          channel,
          {
            ...snapshot,
            requests: snapshot.requests.map((item) => ({ ...item })),
          },
        ])
      ),
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

  // 触发一次立即刷新；供测试和用户手动批准后复用。
  async refreshNow(): Promise<void> {
    await this.pollOnce(false);
  }

  // 触发一次立即刷新（比如用户刚点击“批准”）。
  triggerNow(): void {
    if (!this.running) {
      return;
    }
    this.schedule(0);
  }

  // 统一发布状态：只有内容变化才广播，避免渲染层无意义重绘。
  private publish(next: PairingState): void {
    const fingerprint = JSON.stringify({
      pendingCount: next.pendingCount,
      requests: next.requests.map((item) => [item.channel, item.code]),
      channels: Object.fromEntries(
        Object.entries(next.channels).map(([channel, snapshot]) => [
          channel,
          {
            pendingCount: snapshot.pendingCount,
            lastAutoApprovedAt: snapshot.lastAutoApprovedAt,
            lastAutoApprovedName: snapshot.lastAutoApprovedName,
          },
        ])
      ),
    });
    if (fingerprint === this.lastFingerprint) {
      return;
    }
    this.lastFingerprint = fingerprint;
    this.state = next;
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
      void this.pollOnce(true);
    }, Math.max(0, delayMs));
  }

  // 根据应用前后台状态返回轮询间隔：前台 10s，后台 60s。
  private resolvePollIntervalMs(): number {
    const foreground = this.isAppInForeground?.();
    return foreground === false ? BACKGROUND_POLL_INTERVAL_MS : FOREGROUND_POLL_INTERVAL_MS;
  }

  // 单次轮询：检查配置状态、拉取待审批、必要时自动批准首个请求。
  private async pollOnce(reschedule: boolean): Promise<void> {
    if (this.polling) {
      if (reschedule) {
        this.schedule(this.resolvePollIntervalMs());
      }
      return;
    }
    this.polling = true;

    try {
      if (this.gateway.getState() !== "running") {
        const cleared = Object.fromEntries(
          this.adapters.map((adapter) => {
            adapter.autoApproveFirst?.reset();
            adapter.onInactive?.();
            return [adapter.channel, createEmptyChannelState(adapter.channel, this.state.channels[adapter.channel])];
          })
        );
        this.publish(buildAggregateState(cleared));
        return;
      }

      const nextChannels: Record<string, PairingChannelState> = {};

      for (const adapter of this.adapters) {
        const previous = this.state.channels[adapter.channel];
        const mode = adapter.getModeState();

        if (!mode.enabled || mode.dmPolicy !== "pairing") {
          adapter.autoApproveFirst?.reset();
          adapter.onInactive?.();
          nextChannels[adapter.channel] = createEmptyChannelState(adapter.channel, previous);
          continue;
        }

        const listed = await adapter.listRequests();
        if (!listed.success) {
          log.warn(`${adapter.channel} pairing list failed: ${listed.message || "unknown"}`);
          nextChannels[adapter.channel] = previous ?? createEmptyChannelState(adapter.channel);
          continue;
        }

        let requests = listed.requests;
        let autoApprovedTarget: PairingRequestView | null = null;
        const autoApprove = adapter.autoApproveFirst;

        if (mode.approvedUserCount === 0 && autoApprove?.isActive()) {
          const first = pickFirstRequest(requests);
          if (first && first.code) {
            const approved = await adapter.approveRequest({
              code: first.code,
              id: first.id,
              name: first.name,
            });
            autoApprove.consume(first.id);
            if (approved.success) {
              autoApprovedTarget = first;
              const refreshed = await adapter.listRequests();
              if (refreshed.success) {
                requests = refreshed.requests;
              }
            } else {
              log.warn(`${adapter.channel} first pairing auto-approve failed: ${approved.message || "unknown"}`);
            }
          }
        }

        nextChannels[adapter.channel] = {
          channel: adapter.channel,
          pendingCount: requests.length,
          requests: requests.map((item) => ({ ...item })),
          updatedAt: Date.now(),
          lastAutoApprovedAt: autoApprovedTarget ? Date.now() : previous?.lastAutoApprovedAt ?? null,
          lastAutoApprovedName: autoApprovedTarget
            ? (autoApprovedTarget.name || autoApprovedTarget.id || autoApprovedTarget.code)
            : previous?.lastAutoApprovedName ?? null,
        };
      }

      this.publish(buildAggregateState(nextChannels));
    } catch (err: any) {
      log.error(`channel pairing monitor error: ${err?.message || String(err)}`);
    } finally {
      this.polling = false;
      if (reschedule && this.running) {
        this.schedule(this.resolvePollIntervalMs());
      }
    }
  }
}
