// 合成的流式回放 fixture，覆盖三个不变量：
//   1. tool 之间多次说话，chat:delta 给的是"截至当前的全部累计文本"——
//      渲染层（evictedLeadingSegments + leadingSegment + chatStream）必须等于累计文本，
//      不能把已冻结成 leadingSegment 的旧段在 chatStream 里再渲一次。
//   2. 跨 turn 状态 reset：第 2 轮开始时上轮的 frozenPrefix / chatStream 必须清零。
//   3. eviction：当 tool 数量超过 TOOL_STREAM_LIMIT(50) 时，被淘汰 entry 的 leadingSegment
//      必须被收进 evictedLeadingSegments，否则首段开场白会"凭空消失"。
//
// 占位符约定：
//   - 用户文本："用户问1" / "用户问2"
//   - assistant 文本段："段A" / "段B" / "段C" / "段X"（首段开场白）/ "段Y"（结尾段）
//   - 工具：toolN（id=tool-N，name=tN，input=I-N，output=O-N）
//
// chat:delta 的 message.content[0].text 始终是"截至当前已吐出的所有文本之拼接"。
// agent tool start 之后的下一帧 chat:delta 仍然是累计文本（包含被冻结的前缀）。

export type FixtureEntry = {
  ts: number;
  event: "chat" | "agent";
  payload: Record<string, unknown>;
};

const RUN1 = "run-0001";
const RUN2 = "run-0002";
const RUN3 = "run-0003";
const SESSION = "agent:test:fixture";

let _ts = 1_700_000_000_000;
const tick = () => ++_ts;

function chatDelta(runId: string, fullText: string): FixtureEntry {
  return {
    ts: tick(),
    event: "chat",
    payload: {
      runId,
      sessionKey: SESSION,
      state: "delta",
      message: {
        role: "assistant",
        content: [{ type: "text", text: fullText }],
        timestamp: _ts,
      },
    },
  };
}

function chatFinal(runId: string, fullText: string): FixtureEntry {
  return {
    ts: tick(),
    event: "chat",
    payload: {
      runId,
      sessionKey: SESSION,
      state: "final",
      message: {
        role: "assistant",
        content: [{ type: "text", text: fullText }],
        timestamp: _ts,
      },
    },
  };
}

function toolStart(runId: string, toolId: string, name: string, input: unknown): FixtureEntry {
  const ts = tick();
  return {
    ts,
    event: "agent",
    payload: {
      runId,
      sessionKey: SESSION,
      seq: ts,
      stream: "tool",
      ts,
      data: { phase: "start", toolCallId: toolId, name, args: input },
    },
  };
}

function toolResult(runId: string, toolId: string, name: string, output: unknown): FixtureEntry {
  const ts = tick();
  return {
    ts,
    event: "agent",
    payload: {
      runId,
      sessionKey: SESSION,
      seq: ts,
      stream: "tool",
      ts,
      data: { phase: "result", toolCallId: toolId, name, result: { text: String(output) } },
    },
  };
}

// ---- Turn 1：tool 之间多次说话，验证不变量 1 ----
// 时间线：段A → tool1 → 段A段B → tool2 → 段A段B段C → final
const turn1: FixtureEntry[] = [
  chatDelta(RUN1, "段A"),
  toolStart(RUN1, "t-1", "t1", "I-1"),
  toolResult(RUN1, "t-1", "t1", "O-1"),
  // gateway 在 tool 后继续往同一 text block 里追加，delta 又给一份"全部累计"
  chatDelta(RUN1, "段A段B"),
  toolStart(RUN1, "t-2", "t2", "I-2"),
  toolResult(RUN1, "t-2", "t2", "O-2"),
  chatDelta(RUN1, "段A段B段C"),
  chatFinal(RUN1, "段A段B段C"),
];

// ---- Turn 2：跨 turn reset，验证不变量 2 ----
// 用户再发一条；新 run 用全新前缀 "段X"+"段Y"，不能继承上一轮的 frozenPrefix。
// 关键：turn 2 开头的 delta 文本 "段X" 不以 "段A段B段C" 开头，若 frozenPrefix 没清零，
// chat.ts 里 startsWith 会失败、走降级直显，但更糟糕的是 frozenPrefix 会被永久残留——
// 这里通过 tool 开始后再发 delta 来暴露：tool 把 "段X" 冻成 leadingSegment 时，
// frozenPrefix 应该是 "段X"（而不是 "段A段B段C段X"），否则下一帧 "段X段Y" 会被切空。
const turn2: FixtureEntry[] = [
  chatDelta(RUN2, "段X"),
  toolStart(RUN2, "t2-1", "t1", "I-3"),
  toolResult(RUN2, "t2-1", "t1", "O-3"),
  chatDelta(RUN2, "段X段Y"),
  chatFinal(RUN2, "段X段Y"),
];

// ---- Turn 3：eviction，验证不变量 3 ----
// 51 个 tool（>TOOL_STREAM_LIMIT=50），第 1 个 tool 的 leadingSegment 是 "首段"。
// 没有 evictedLeadingSegments 兜底，trimToolStream 会把 "首段" 永远丢掉。
const turn3: FixtureEntry[] = [];
turn3.push(chatDelta(RUN3, "首段"));
const TOOL_COUNT = 51;
for (let i = 1; i <= TOOL_COUNT; i++) {
  turn3.push(toolStart(RUN3, `t3-${i}`, "t1", `I-${i}`));
  turn3.push(toolResult(RUN3, `t3-${i}`, "t1", `O-${i}`));
}
// tool 之间没有再打字，所以累计文本一直是 "首段"。最后 final 也是 "首段"。
turn3.push(chatFinal(RUN3, "首段"));

export const TURN1: FixtureEntry[] = turn1;
export const TURN2: FixtureEntry[] = turn2;
export const TURN3: FixtureEntry[] = turn3;
export const ALL_TURNS: FixtureEntry[][] = [turn1, turn2, turn3];
