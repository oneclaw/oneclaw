import test from "node:test";
import assert from "node:assert/strict";
import {
  startUpdateScheduler,
  type UpdateSchedulerDeps,
} from "./webbridge-update-scheduler";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface CallLog {
  checkCount: number;
  installCount: number;
  errorLogs: string[];
  infoLogs: string[];
}

function makeDeps(
  overrides: Partial<UpdateSchedulerDeps> = {},
): { deps: UpdateSchedulerDeps; log: CallLog } {
  const log: CallLog = {
    checkCount: 0,
    installCount: 0,
    errorLogs: [],
    infoLogs: [],
  };
  const baseCheck = async () => {
    log.checkCount++;
    return { upToDate: true };
  };
  const baseInstall = async () => {
    log.installCount++;
    return {
      installed: true,
      skipped: false,
      version: "1.0.1",
      binaryPath: "/fake/bin",
      etag: "W/new",
    };
  };
  const deps: UpdateSchedulerDeps = {
    checkForUpdate: overrides.checkForUpdate ?? baseCheck,
    installWebbridge: overrides.installWebbridge ?? baseInstall,
    binaryExists: overrides.binaryExists ?? (() => true),
    intervalMs: overrides.intervalMs ?? 50,
    initialDelayMs: overrides.initialDelayMs ?? 10,
    logger: overrides.logger ?? {
      info: (m) => log.infoLogs.push(m),
      error: (m) => log.errorLogs.push(m),
    },
  };
  // 如果 overrides 里传了自定义 checkForUpdate/installWebbridge 而没拦截 log，
  // 需要用户显式更新 log 计数。以下两个分支专门给"想复用 log 但覆盖行为"的场景用
  return { deps, log };
}

test("binary 不存在 → 不跑 check", async () => {
  const { deps, log } = makeDeps({ binaryExists: () => false });
  const handle = startUpdateScheduler(deps);
  await sleep(120);
  handle.stop();
  assert.equal(log.checkCount, 0, "不应 check");
  assert.equal(log.installCount, 0);
});

test("binary 存在 + upToDate=true → check 但不 install", async () => {
  const { deps, log } = makeDeps();
  const handle = startUpdateScheduler(deps);
  await sleep(90);
  handle.stop();
  assert.ok(log.checkCount >= 1, `应至少 check 1 次，实得 ${log.checkCount}`);
  assert.equal(log.installCount, 0);
});

test("upToDate=false → install 被调", async () => {
  const log = { c: 0, i: 0 };
  const deps: UpdateSchedulerDeps = {
    checkForUpdate: async () => {
      log.c++;
      return { upToDate: false };
    },
    installWebbridge: async () => {
      log.i++;
      return {
        installed: true,
        skipped: false,
        version: "2.0.0",
        binaryPath: "/fake/bin",
        etag: "W/new",
      };
    },
    binaryExists: () => true,
    intervalMs: 50,
    initialDelayMs: 10,
    logger: { info: () => {}, error: () => {} },
  };
  const handle = startUpdateScheduler(deps);
  await sleep(90);
  handle.stop();
  assert.ok(log.c >= 1);
  assert.ok(log.i >= 1);
});

test("stop 后不再 tick", async () => {
  const { deps, log } = makeDeps();
  const handle = startUpdateScheduler(deps);
  await sleep(30);
  handle.stop();
  const before = log.checkCount;
  await sleep(200);
  assert.equal(
    log.checkCount,
    before,
    `stop 后不该再 tick，delta=${log.checkCount - before}`,
  );
});

test("checkForUpdate 抛错 → 记 error log 但不 crash 调度器", async () => {
  const errorLogs: string[] = [];
  const deps: UpdateSchedulerDeps = {
    checkForUpdate: async () => {
      throw new Error("CDN 500");
    },
    installWebbridge: async () => ({} as any),
    binaryExists: () => true,
    intervalMs: 50,
    initialDelayMs: 10,
    logger: {
      info: () => {},
      error: (m) => errorLogs.push(m),
    },
  };
  const handle = startUpdateScheduler(deps);
  await sleep(150);
  handle.stop();
  assert.ok(errorLogs.length >= 1, "至少一条 error log");
  assert.match(errorLogs[0], /CDN 500/);
});

test("installWebbridge 抛错 → 记 error 但不 crash", async () => {
  const errorLogs: string[] = [];
  const deps: UpdateSchedulerDeps = {
    checkForUpdate: async () => ({ upToDate: false }),
    installWebbridge: async () => {
      throw new Error("disk full");
    },
    binaryExists: () => true,
    intervalMs: 50,
    initialDelayMs: 10,
    logger: {
      info: () => {},
      error: (m) => errorLogs.push(m),
    },
  };
  const handle = startUpdateScheduler(deps);
  await sleep(80);
  handle.stop();
  assert.ok(errorLogs.length >= 1);
  assert.match(errorLogs.join("\n"), /disk full/);
});

test("连续多轮 tick：binary 存在 → check 多次", async () => {
  const { deps, log } = makeDeps({ intervalMs: 30, initialDelayMs: 5 });
  const handle = startUpdateScheduler(deps);
  await sleep(150);
  handle.stop();
  assert.ok(log.checkCount >= 3, `应 >= 3 次 check, 实得 ${log.checkCount}`);
});

test("installed=true && skipped=false → installSkill 被调 1 次/轮", async () => {
  const skillCalls: string[] = [];
  const deps: UpdateSchedulerDeps = {
    checkForUpdate: async () => ({ upToDate: false }),
    installWebbridge: async () => ({
      installed: true,
      skipped: false,
      version: "2.0.0",
      binaryPath: "/fake/bin",
      etag: "W/new",
    }),
    binaryExists: () => true,
    installSkill: async (bp) => {
      skillCalls.push(bp);
      return { success: true, output: "✓" };
    },
    intervalMs: 50,
    initialDelayMs: 10,
    logger: { info: () => {}, error: () => {} },
  };
  const handle = startUpdateScheduler(deps);
  await sleep(90);
  handle.stop();
  assert.ok(skillCalls.length >= 1, `应 >= 1 次，实得 ${skillCalls.length}`);
  assert.equal(skillCalls[0], "/fake/bin");
});

test("installed=false 或 skipped=true → installSkill 不被调", async () => {
  const skillCalls: string[] = [];
  const deps: UpdateSchedulerDeps = {
    checkForUpdate: async () => ({ upToDate: false }),
    installWebbridge: async () => ({
      installed: false,
      skipped: true,
      version: "1.0.0",
      binaryPath: "/fake/bin",
      etag: "W/old",
    }),
    binaryExists: () => true,
    installSkill: async (bp) => {
      skillCalls.push(bp);
      return { success: true, output: "" };
    },
    intervalMs: 50,
    initialDelayMs: 10,
    logger: { info: () => {}, error: () => {} },
  };
  const handle = startUpdateScheduler(deps);
  await sleep(150);
  handle.stop();
  assert.equal(skillCalls.length, 0, "skipped=true 时不该装 skill");
});

test("installSkill 抛错 → scheduler 不 crash，下轮继续", async () => {
  let checkCount = 0;
  const deps: UpdateSchedulerDeps = {
    checkForUpdate: async () => {
      checkCount++;
      return { upToDate: false };
    },
    installWebbridge: async () => ({
      installed: true,
      skipped: false,
      version: "2.0.0",
      binaryPath: "/fake/bin",
      etag: "W/new",
    }),
    binaryExists: () => true,
    installSkill: async () => {
      throw new Error("skill crashed");
    },
    intervalMs: 40,
    initialDelayMs: 10,
    logger: { info: () => {}, error: () => {} },
  };
  const handle = startUpdateScheduler(deps);
  await sleep(200);
  handle.stop();
  assert.ok(checkCount >= 2, `应至少 2 轮，实得 ${checkCount}`);
});

test("长 tick 不重叠：上一轮未结束时不并发启动新轮", async () => {
  let concurrent = 0;
  let maxConcurrent = 0;
  let checkCount = 0;
  const deps: UpdateSchedulerDeps = {
    checkForUpdate: async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await sleep(80);
      concurrent--;
      checkCount++;
      return { upToDate: true };
    },
    installWebbridge: async () => ({} as any),
    binaryExists: () => true,
    intervalMs: 50,
    initialDelayMs: 5,
    logger: { info: () => {}, error: () => {} },
  };
  const handle = startUpdateScheduler(deps);
  await sleep(300);
  handle.stop();
  // 再等一轮让 in-flight 的 check 收尾
  await sleep(100);
  assert.equal(maxConcurrent, 1, `不得并发，实得最大并发 ${maxConcurrent}`);
  assert.ok(checkCount >= 2, `应至少 2 轮完成，实得 ${checkCount}`);
});
