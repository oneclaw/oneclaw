# Client Ticker — 公共定时器

OneClaw Chat UI 的统一轮询机制。

## 概述

`client-ticker.ts` 提供一个 30 秒间隔的 `setInterval`，所有客户端需要定期执行的逻辑都应注册到这个定时器中，而不是各自创建独立的 interval。

## API

- `registerTickHandler(name, fn)` — 注册回调，name 唯一标识
- `unregisterTickHandler(name)` — 移除回调
- `startTicker()` — 启动定时器（幂等），立即执行一轮
- `stopTicker()` — 停止定时器

## 生命周期

- Gateway WebSocket 连接成功时调用 `startTicker()`
- Gateway 断开时调用 `stopTicker()`
- 每个 handler 独立 try-catch，异常不影响其他 handler

## 已注册的 handler

| Name | 用途 | 注册位置 |
|---|---|---|
| `cron` | 轮询 `cron.list`，更新侧边栏 badge | `app-gateway.ts` |
| `sessions` | 轮询会话列表，保持侧边栏对话列表同步 | `app-gateway.ts` |

## 添加新的轮询逻辑

1. 在合适位置调用 `registerTickHandler("your-name", fn)`
2. 更新此文档的 handler 表
3. 如需在 ticker 外也触发，直接调用你的函数即可（handler 只是额外的周期调用）
