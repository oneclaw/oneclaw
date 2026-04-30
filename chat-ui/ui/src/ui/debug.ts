// 通用 debug 日志门控：默认关，不打扰用户；想看时在 DevTools 里跑
//   localStorage.setItem("oneclaw.debug", "1") 然后刷新窗口即可全开
//   localStorage.setItem("oneclaw.debug", "stream,tool") 则只开指定类别
//
// Why localStorage 而不是 build flag：dev:isolated 走的是 vite build（production），
// import.meta.env.DEV 在 dev/prod 包都是 false，没法做"本地默认开"。localStorage 由用户/调试者按需开，
// 用户环境完全 zero overhead（cached === false 时调用站点是空函数）。

const DEBUG_KEY = "oneclaw.debug";

type DebugCategory = "stream" | "tool" | "lifecycle" | "gateway" | "ui";

let cachedAllowAll = false;
let cachedCategories: Set<DebugCategory> = new Set();

function readFlag(): { all: boolean; cats: Set<DebugCategory> } {
  try {
    if (typeof localStorage === "undefined") return { all: false, cats: new Set() };
    const raw = localStorage.getItem(DEBUG_KEY);
    if (!raw) return { all: false, cats: new Set() };
    if (raw === "1" || raw === "all" || raw === "true") {
      return { all: true, cats: new Set() };
    }
    const cats = new Set<DebugCategory>(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is DebugCategory =>
          ["stream", "tool", "lifecycle", "gateway", "ui"].includes(s),
        ),
    );
    return { all: false, cats };
  } catch {
    return { all: false, cats: new Set() };
  }
}

function applyFlag() {
  const { all, cats } = readFlag();
  cachedAllowAll = all;
  cachedCategories = cats;
}

applyFlag();

// 暴露到 window 方便从 DevTools 触发
if (typeof window !== "undefined") {
  (window as unknown as { __ocDebug?: { refresh: () => void; status: () => unknown } }).__ocDebug =
    {
      refresh: applyFlag,
      status: () => ({ all: cachedAllowAll, categories: [...cachedCategories] }),
    };
}

export function isDebugEnabled(category?: DebugCategory): boolean {
  if (cachedAllowAll) return true;
  if (!category) return cachedCategories.size > 0;
  return cachedCategories.has(category);
}

export function debugLog(category: DebugCategory, message: string, data?: unknown): void {
  if (!isDebugEnabled(category)) return;
  const ts = new Date().toISOString().slice(11, 23);
  const head = `[oc:${category}] ${ts} ${message}`;
  if (data !== undefined) {
    // eslint-disable-next-line no-console
    console.log(head, data);
  } else {
    // eslint-disable-next-line no-console
    console.log(head);
  }
}
