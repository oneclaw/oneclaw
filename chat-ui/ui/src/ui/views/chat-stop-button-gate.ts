// Stop 按钮的可见性门——纯函数，单独成文件方便 node:test 直接跑（不用拉 Lit）。
//
// 历史教训：曾有过 isBusy = sending || stream !== null。
// - sending = chatSending：仅覆盖 chat.send HTTP 在途阶段，ack 后立即 false
// - stream  = chatStream：工具调用之间会被冻进 leadingSegment 后置 null
// 于是 run 还在跑、用户也无法 /stop 时，Stop 按钮会消失，用户只能 kill 进程。
// 现在用 canAbort（=chatRunId 仍在）兜底，整个 run 期间 Stop 始终可见。

export function computeStopButtonVisible(props: {
  sending: boolean;
  stream: string | null;
  canAbort?: boolean;
  onAbort?: () => void;
}): { isBusy: boolean; canAbort: boolean; showStop: boolean } {
  const canAbort = Boolean(props.canAbort && props.onAbort);
  const isBusy = props.sending || props.stream !== null || canAbort;
  return { isBusy, canAbort, showStop: isBusy && canAbort };
}
