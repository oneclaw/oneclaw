const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadAnalyticsModule(options = {}) {
  const {
    config = null,
    resourcesPath = "/tmp/oneclaw-resources",
    appPath = "/Applications/OneClaw.app/Contents/Resources/app.asar",
    fetchImpl = async () => {
      throw new Error("fetch should not be called in analytics build-config tests");
    },
  } = options;
  const scriptPath = path.join(__dirname, "..", "src", "analytics.ts");
  const source = fs.readFileSync(scriptPath, "utf-8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: scriptPath,
  }).outputText;

  const configPath = path.join(resourcesPath, "build-config.json");
  const infoLogs = [];
  const warnLogs = [];
  const errorLogs = [];
  const intervals = [];
  const module = { exports: {} };
  const sandboxProcess = {
    platform: process.platform,
    arch: process.arch,
    env: { ...process.env },
    versions: { ...process.versions, electron: "40.2.1" },
    resourcesPath,
    getSystemVersion: () => "14.5",
  };
  const sandbox = {
    require(id) {
      switch (id) {
        case "electron":
          return {
            app: {
              getVersion: () => "2026.420.0",
              getAppPath: () => appPath,
            },
          };
        case "fs":
          return {
            existsSync(candidate) {
              return config !== null && candidate === configPath;
            },
            readFileSync(candidate, encoding) {
              if (candidate === configPath && encoding === "utf-8" && config !== null) {
                return JSON.stringify(config);
              }
              return fs.readFileSync(candidate, encoding);
            },
          };
        case "./constants":
          return { resolveResourcesPath: () => resourcesPath };
        case "./oneclaw-config":
          return {
            ensureDeviceId: () => "12345678-1234-5678-9abc-def012345678",
            getChannelId: () => "",
          };
        case "./logger":
          return {
            info(message) {
              infoLogs.push(String(message));
            },
            warn(message) {
              warnLogs.push(String(message));
            },
            error(message) {
              errorLogs.push(String(message));
            },
          };
        case "./analytics-events":
          return {
            buildActionResultProps: () => ({}),
            buildActionStartedProps: () => ({}),
            classifyAnalyticsErrorType: () => "unknown",
          };
        default:
          return require(id);
      }
    },
    module,
    exports: module.exports,
    process: sandboxProcess,
    console,
    AbortSignal,
    Date,
    JSON,
    URL,
    setInterval(callback, delay) {
      const handle = { callback, delay };
      intervals.push(handle);
      return handle;
    },
    clearInterval(handle) {
      const index = intervals.indexOf(handle);
      if (index >= 0) intervals.splice(index, 1);
    },
    setTimeout,
    clearTimeout,
    fetch: fetchImpl,
  };

  vm.createContext(sandbox);
  vm.runInContext(compiled, sandbox, { filename: scriptPath });
  return {
    module: module.exports,
    infoLogs,
    warnLogs,
    errorLogs,
    intervals,
    configPath,
  };
}

test("parseAnalyticsBuildConfig 应兼容旧版 analytics 嵌套字段", () => {
  const { module } = loadAnalyticsModule();
  const { parseAnalyticsBuildConfig } = module;

  const config = JSON.parse(JSON.stringify(parseAnalyticsBuildConfig({
    analytics: {
      enabled: true,
      captureURL: "https://posthog.example/capture",
      apiKey: "legacy-posthog-key",
      requestTimeoutMs: 9000,
      retryDelaysMs: [0, 1000],
    },
    volcano: {
      enabled: true,
      appId: 1,
      appKey: "volcano-key",
      endpoint: "https://collector.example/v2/event/json",
    },
  })));

  assert.deepEqual(config, {
    posthog: {
      enabled: true,
      captureURL: "https://posthog.example/capture",
      apiKey: "legacy-posthog-key",
      requestTimeoutMs: 9000,
      retryDelaysMs: [0, 1000],
    },
    volcano: {
      enabled: true,
      appId: 1,
      appKey: "volcano-key",
      endpoint: "https://collector.example/v2/event/json",
    },
  });
});

// 沙箱里的对象和宿主不同 realm，deepStrictEqual 会对非同源原型失败，统一走 JSON 序列化再比较。
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("normalizeVolcanoConfig 空入参时禁用并回填默认值", () => {
  const { module } = loadAnalyticsModule();
  const { normalizeVolcanoConfig } = module;

  assert.deepEqual(plain(normalizeVolcanoConfig({})), {
    enabled: false,
    appId: 0,
    appKey: "",
    endpoint: "",
    fallbackEndpoint: "",
    requestTimeoutMs: 8000,
    retryDelaysMs: [0, 500, 1500],
  });
});

test("normalizeVolcanoConfig 缺 appId/appKey/endpoint 任一时禁用", () => {
  const { module } = loadAnalyticsModule();
  const { normalizeVolcanoConfig } = module;

  assert.equal(
    normalizeVolcanoConfig({ enabled: true, appId: 1, appKey: "only-key", endpoint: "" }).enabled,
    false,
  );
  assert.equal(
    normalizeVolcanoConfig({ enabled: true, appId: 1, appKey: "", endpoint: "https://ep.example" }).enabled,
    false,
  );
  assert.equal(
    normalizeVolcanoConfig({ enabled: true, appKey: "k", endpoint: "https://ep.example" }).enabled,
    false,
  );
  assert.equal(
    normalizeVolcanoConfig({ enabled: true, appId: 0, appKey: "k", endpoint: "https://ep.example" }).enabled,
    false,
  );
});

test("normalizeVolcanoConfig 完整配置时启用并用 endpoint 兜底 fallback", () => {
  const { module } = loadAnalyticsModule();
  const { normalizeVolcanoConfig } = module;

  assert.deepEqual(
    plain(normalizeVolcanoConfig({
      enabled: true,
      appId: 1,
      appKey: "  volcano-key  ",
      endpoint: "https://collector.example/v2/event/json",
      requestTimeoutMs: 5000,
      retryDelaysMs: [0, 200, 800],
    })),
    {
      enabled: true,
      appId: 1,
      appKey: "volcano-key",
      endpoint: "https://collector.example/v2/event/json",
      fallbackEndpoint: "https://collector.example/v2/event/json",
      requestTimeoutMs: 5000,
      retryDelaysMs: [0, 200, 800],
    },
  );
});

test("normalizeVolcanoConfig 命中客户端 SDK 域名时禁用并打 warn", () => {
  const loaded = loadAnalyticsModule();
  const { normalizeVolcanoConfig } = loaded.module;

  // 主端点踩坑：mcs.ctobsnssdk.com 是客户端 SDK 接收域名，server-side payload 会被拒。
  const result = normalizeVolcanoConfig({
    enabled: true,
    appId: 1,
    appKey: "k",
    endpoint: "https://mcs.ctobsnssdk.com/v1/list",
  });
  assert.equal(result.enabled, false);
  assert.ok(loaded.warnLogs.some((m) => m.includes("命中客户端 SDK 域名")));

  // fallback 也得校验，否则用户主备同时配错时只在主域名上告警就漏报。
  const result2 = normalizeVolcanoConfig({
    enabled: true,
    appId: 1,
    appKey: "k",
    endpoint: "https://gator.volces.com/v2/event/json",
    fallbackEndpoint: "https://x.ctobsnssdk.com/v1",
  });
  assert.equal(result2.enabled, false);
});

test("normalizeVolcanoConfig 非法 retryDelaysMs 回退到默认值", () => {
  const { module } = loadAnalyticsModule();
  const { normalizeVolcanoConfig } = module;

  assert.deepEqual(
    plain(normalizeVolcanoConfig({
      enabled: true,
      appId: 1,
      appKey: "k",
      endpoint: "https://ep.example",
      retryDelaysMs: ["bad", -1],
    }).retryDelaysMs),
    [0, 500, 1500],
  );
});

test("createVolcanoSink.buildPayload 输出 DataFinder 期望的信封结构", () => {
  const { module: mod } = loadAnalyticsModule();
  // init() 负责把 deviceId 从 oneclaw-config mock 拉进模块作用域
  mod.init();

  try {
    const sink = mod.createVolcanoSink({
      enabled: true,
      appId: 1,
      appKey: "volcano-key",
      endpoint: "https://collector.example/v2/event/json",
      fallbackEndpoint: "https://collector-backup.example/v2/event/json",
      requestTimeoutMs: 8000,
      retryDelaysMs: [0, 500, 1500],
    });

    assert.equal(sink.name, "volcano");
    assert.equal(sink.enabled, true);
    assert.equal(sink.headers["X-MCS-AppKey"], "volcano-key");
    assert.equal(sink.headers["Content-Type"], "application/json");
    assert.match(sink.headers["User-Agent"], /^OneClaw\//);

    const payload = plain(sink.buildPayload("setup_action_started", { action: "verify_key", foo: "bar" }));

    assert.deepEqual(payload.user, { user_unique_id: "" });
    assert.equal(payload.header.app_id, 1);
    assert.equal(payload.header.app_name, "oneclaw");
    assert.equal(payload.header.app_version, "2026.420.0");
    // UUID 12345678-...-12345678 折叠出 0x8888888800000000，按 INT63_MASK 钳到 0x0888...0000。
    // 期望值不能是未 mask 的 9838263503687778304；analytics.ts 主动剥掉符号位避免服务端读成负数。
    assert.equal(payload.header.device_id, "614891466833002496");
    // os_name 由 sandboxProcess.platform 决定，这里只校验是枚举值之一
    assert.ok(["mac", "windows", "linux"].includes(payload.header.os_name));
    // custom 必须是 JSON 字符串（DataFinder 协议要求）
    assert.equal(typeof payload.header.custom, "string");
    assert.deepEqual(JSON.parse(payload.header.custom), {
      arch: process.arch,
      electron_version: "40.2.1",
    });

    assert.equal(payload.events.length, 1);
    const event = payload.events[0];
    assert.equal(event.event, "setup_action_started");
    assert.equal(typeof event.params, "string");
    assert.deepEqual(JSON.parse(event.params), { action: "verify_key", foo: "bar" });
    assert.equal(typeof event.local_time_ms, "number");
    assert.ok(event.local_time_ms > 0);
  } finally {
    // init() 启动了 heartbeat setInterval，必须回收，否则测试进程挂起
    mod.shutdown();
  }
});

test("init 应记录 enabled sinks 的 fan-out 规模", () => {
  const loaded = loadAnalyticsModule({
    config: {
      posthog: {
        enabled: true,
        captureURL: "https://posthog.example/capture",
        apiKey: "posthog-key",
      },
      volcano: {
        enabled: true,
        appId: 1,
        appKey: "volcano-key",
        endpoint: "https://collector.example/v2/event/json",
      },
    },
  });

  loaded.module.init();

  try {
    assert.ok(
      loaded.infoLogs.includes(`[analytics] posthog enabled config=${loaded.configPath}`),
    );
    assert.ok(
      loaded.infoLogs.includes(`[analytics] volcano enabled config=${loaded.configPath}`),
    );
    assert.ok(
      loaded.infoLogs.includes("[analytics] track fan-out=2 sinks=[posthog,volcano]"),
    );
    assert.equal(loaded.intervals.length, 1);
  } finally {
    loaded.module.shutdown();
  }
});

test("init 的 fan-out 日志只统计 enabled sinks", () => {
  const loaded = loadAnalyticsModule({
    config: {
      posthog: {
        enabled: true,
        captureURL: "https://posthog.example/capture",
        apiKey: "posthog-key",
      },
      volcano: {
        enabled: false,
        appKey: "volcano-key",
        endpoint: "https://collector.example/v2/event/json",
      },
    },
  });

  loaded.module.init();

  try {
    assert.ok(loaded.infoLogs.includes("[analytics] volcano disabled"));
    assert.ok(
      loaded.infoLogs.includes("[analytics] track fan-out=1 sinks=[posthog]"),
    );
    assert.ok(
      !loaded.infoLogs.includes("[analytics] track fan-out=2 sinks=[posthog,volcano]"),
    );
    assert.equal(loaded.intervals.length, 1);
  } finally {
    loaded.module.shutdown();
  }
});

test("track 遇到不可 JSON 序列化的 Volcano 属性时只丢弃当前 sink", async () => {
  const loaded = loadAnalyticsModule({
    config: {
      volcano: {
        enabled: true,
        appId: 1,
        appKey: "volcano-key",
        endpoint: "https://collector.example/v2/event/json",
      },
    },
  });

  loaded.module.init();

  try {
    const circular = {};
    circular.self = circular;

    loaded.module.track("bad_event", circular);
    await Promise.resolve();

    assert.ok(
      loaded.errorLogs.some((message) => (
        message.includes("[analytics] drop event=bad_event sink=volcano")
        && message.includes("Converting circular structure to JSON")
      )),
    );
  } finally {
    await loaded.module.shutdown();
  }
});

test("shutdown 会等待短暂 flush 窗口以发送退出前已在途的埋点", async () => {
  let completed = false;
  const loaded = loadAnalyticsModule({
    config: {
      posthog: {
        enabled: true,
        captureURL: "https://posthog.example/capture",
        apiKey: "posthog-key",
        retryDelaysMs: [0],
      },
    },
    fetchImpl: async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      completed = true;
      return { ok: true };
    },
  });

  loaded.module.init();

  loaded.module.track("app_closed");
  await loaded.module.shutdown();

  assert.equal(completed, true);
});
