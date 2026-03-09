import test from "node:test";
import assert from "node:assert/strict";
import {
  ChannelPairingMonitor,
  type PairingChannelAdapter,
} from "./channel-pairing-monitor";

function createGateway(state: "running" | "stopped" = "running") {
  return {
    getState() {
      return state;
    },
  };
}

function waitForState<T>(factory: () => T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(factory()), 5);
  });
}

test("ChannelPairingMonitor 应聚合多个渠道的待审批请求并保留渠道标识", async () => {
  const adapters: PairingChannelAdapter[] = [
    {
      channel: "feishu",
      getModeState: () => ({ enabled: true, dmPolicy: "pairing", approvedUserCount: 0 }),
      listRequests: async () => ({
        success: true,
        requests: [
          {
            code: "FS-001",
            id: "ou_1",
            name: "Alice",
            createdAt: "2026-03-09T10:00:00.000Z",
            lastSeenAt: "2026-03-09T10:01:00.000Z",
          },
        ],
      }),
      approveRequest: async () => ({ success: true }),
    },
    {
      channel: "wecom",
      getModeState: () => ({ enabled: true, dmPolicy: "pairing", approvedUserCount: 0 }),
      listRequests: async () => ({
        success: true,
        requests: [
          {
            code: "WC-001",
            id: "wm_1",
            name: "Bob",
            createdAt: "2026-03-09T10:02:00.000Z",
            lastSeenAt: "2026-03-09T10:03:00.000Z",
          },
        ],
      }),
      approveRequest: async () => ({ success: true }),
    },
  ];

  const monitor = new ChannelPairingMonitor({
    gateway: createGateway(),
    adapters,
  });

  await monitor.refreshNow();
  const state = monitor.getState();

  assert.equal(state.pendingCount, 2);
  assert.deepEqual(
    state.requests.map((item) => ({
      channel: item.channel,
      code: item.code,
      id: item.id,
      name: item.name,
    })),
    [
      { channel: "feishu", code: "FS-001", id: "ou_1", name: "Alice" },
      { channel: "wecom", code: "WC-001", id: "wm_1", name: "Bob" },
    ],
  );
  assert.equal(state.channels.feishu.pendingCount, 1);
  assert.equal(state.channels.wecom.pendingCount, 1);
});

test("ChannelPairingMonitor 仅对声明了首配自动批准的渠道执行自动批准", async () => {
  let feishuApproved = 0;
  let wecomApproved = 0;
  const feishuRequests = [
    {
      code: "FS-100",
      id: "ou_100",
      name: "First User",
      createdAt: "2026-03-09T10:00:00.000Z",
      lastSeenAt: "2026-03-09T10:00:00.000Z",
    },
  ];
  const wecomRequests = [
    {
      code: "WC-100",
      id: "wm_100",
      name: "Second User",
      createdAt: "2026-03-09T10:01:00.000Z",
      lastSeenAt: "2026-03-09T10:01:00.000Z",
    },
  ];

  const monitor = new ChannelPairingMonitor({
    gateway: createGateway(),
    adapters: [
      {
        channel: "feishu",
        getModeState: () => ({ enabled: true, dmPolicy: "pairing", approvedUserCount: 0 }),
        listRequests: async () => ({
          success: true,
          requests: feishuRequests,
        }),
        approveRequest: async () => {
          feishuApproved += 1;
          feishuRequests.length = 0;
          return { success: true };
        },
        autoApproveFirst: {
          isActive: () => true,
          consume: () => undefined,
          reset: () => undefined,
        },
      },
      {
        channel: "wecom",
        getModeState: () => ({ enabled: true, dmPolicy: "pairing", approvedUserCount: 0 }),
        listRequests: async () => ({
          success: true,
          requests: wecomRequests,
        }),
        approveRequest: async () => {
          wecomApproved += 1;
          return { success: true };
        },
      },
    ],
  });

  await monitor.refreshNow();
  const state = await waitForState(() => monitor.getState());

  assert.equal(feishuApproved, 1);
  assert.equal(wecomApproved, 0);
  assert.equal(state.channels.feishu.pendingCount, 0);
  assert.equal(state.channels.wecom.pendingCount, 1);
  assert.equal(state.channels.feishu.lastAutoApprovedName, "First User");
});
