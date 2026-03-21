/**
 * 统一的 60 秒客户端轮询定时器
 *
 * 所有需要周期性执行的客户端逻辑注册到这里，共享同一个 setInterval，
 * 避免多个独立定时器导致的时序混乱和资源浪费。
 */

const TICK_INTERVAL_MS = 60_000;

const handlers = new Map<string, () => void | Promise<void>>();
let timerId: number | null = null;

// 执行所有已注册的 tick 回调，每个独立 try-catch
async function runAllHandlers(): Promise<void> {
  for (const [name, fn] of handlers) {
    try {
      await fn();
    } catch (err) {
      console.error(`[client-ticker] handler "${name}" failed:`, err);
    }
  }
}

// 注册一个 tick 回调，name 必须唯一
export function registerTickHandler(
  name: string,
  fn: () => void | Promise<void>,
): void {
  handlers.set(name, fn);
}

// 移除一个 tick 回调
export function unregisterTickHandler(name: string): void {
  handlers.delete(name);
}

// 启动定时器（幂等），立即执行一轮所有回调
export function startTicker(): void {
  if (timerId !== null) return;
  timerId = window.setInterval(() => void runAllHandlers(), TICK_INTERVAL_MS);
  void runAllHandlers();
}

// 停止定时器
export function stopTicker(): void {
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}
