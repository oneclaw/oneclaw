import { buildDeviceAuthPayload } from "../../../src/gateway/device-auth.js";
import {
  GATEWAY_CLIENT_CAPS,
  GATEWAY_CLIENT_MODES,
  GATEWAY_CLIENT_NAMES,
  type GatewayClientMode,
  type GatewayClientName,
} from "../../../src/gateway/protocol/client-info.js";
import { clearDeviceAuthToken, loadDeviceAuthToken, storeDeviceAuthToken } from "./device-auth.ts";
import { loadOrCreateDeviceIdentity, signDevicePayload } from "./device-identity.ts";
import { generateUUID } from "./uuid.ts";

export type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: { presence: number; health: number };
};

export type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string; details?: unknown };
};

export type GatewayHelloOk = {
  type: "hello-ok";
  protocol: number;
  features?: { methods?: string[]; events?: string[] };
  snapshot?: unknown;
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
    issuedAtMs?: number;
  };
  policy?: { tickIntervalMs?: number };
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  timeoutId: number | null;
};

export type GatewayBrowserClientOptions = {
  url: string;
  token?: string;
  password?: string;
  clientName?: GatewayClientName;
  clientVersion?: string;
  platform?: string;
  mode?: GatewayClientMode;
  instanceId?: string;
  onHello?: (hello: GatewayHelloOk) => void;
  onEvent?: (evt: GatewayEventFrame) => void;
  onClose?: (info: { code: number; reason: string }) => void;
  onGap?: (info: { expected: number; received: number }) => void;
};

// 4008 = application-defined code (browser rejects 1008 "Policy Violation")
const CONNECT_FAILED_CLOSE_CODE = 4008;
const REQUEST_TIMEOUT_MS = 30_000;

export class GatewayBrowserClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private closed = false;
  private lastSeq: number | null = null;
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private helloReceived = false;
  private socketGeneration = 0;
  private backoffMs = 800;

  constructor(private opts: GatewayBrowserClientOptions) {}

  start() {
    this.closed = false;
    this.connect();
  }

  // 停止客户端时，必须同时清理握手与重连状态，避免旧回调继续污染新连接。
  stop() {
    this.closed = true;
    this.resetHandshakeState();
    this.clearReconnectTimer();
    this.lastSeq = null;
    const ws = this.ws;
    this.ws = null;
    this.flushPending(new Error("gateway client stopped"));
    ws?.close();
  }

  get connected() {
    return this.helloReceived && this.ws?.readyState === WebSocket.OPEN;
  }

  // 手动立即重连（重置 backoff），用于刷新按钮
  reconnectNow() {
    if (this.connected) return;
    this.closed = false;
    this.backoffMs = 800;
    this.clearReconnectTimer();
    this.resetHandshakeState();
    const ws = this.ws;
    this.ws = null;
    this.flushPending(new Error("gateway reconnecting"));
    ws?.close();
    this.connect();
  }

  // 只允许一个活动 socket；陈旧连接的事件一律忽略。
  private connect() {
    if (this.closed) {
      return;
    }
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)
    ) {
      return;
    }
    this.clearReconnectTimer();
    console.info(`[gateway] websocket opening ${this.opts.url}`);
    const ws = new WebSocket(this.opts.url);
    const generation = ++this.socketGeneration;
    this.ws = ws;
    this.resetHandshakeState();
    ws.addEventListener("open", () => {
      if (!this.isActiveSocket(ws, generation)) {
        return;
      }
      console.info("[gateway] websocket opened");
      this.queueConnect(ws, generation);
    });
    ws.addEventListener("message", (ev) => this.handleMessage(ws, generation, String(ev.data ?? "")));
    ws.addEventListener("close", (ev) => {
      if (!this.isActiveSocket(ws, generation)) {
        return;
      }
      const reason = String(ev.reason ?? "");
      this.ws = null;
      this.resetHandshakeState();
      console.warn(`[gateway] websocket closed code=${ev.code} reason=${reason}`);
      this.flushPending(new Error(`gateway closed (${ev.code}): ${reason}`));
      this.opts.onClose?.({ code: ev.code, reason });
      this.scheduleReconnect();
    });
    ws.addEventListener("error", (ev) => {
      if (!this.isActiveSocket(ws, generation)) {
        return;
      }
      console.error("[gateway] websocket error", ev);
    });
  }

  private scheduleReconnect() {
    if (this.closed) {
      return;
    }
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 1.7, 15_000);
    this.clearReconnectTimer();
    console.warn(`[gateway] scheduling reconnect in ${delay}ms`);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private flushPending(err: Error) {
    for (const [, p] of this.pending) {
      if (p.timeoutId !== null) {
        window.clearTimeout(p.timeoutId);
      }
      p.reject(err);
    }
    this.pending.clear();
  }

  // connect 请求必须绑定到触发它的那条 socket，不能走全局 this.ws。
  private async sendConnect(ws: WebSocket, generation: number) {
    if (!this.isActiveSocket(ws, generation) || this.connectSent) {
      return;
    }
    this.connectSent = true;
    this.clearConnectTimer();

    // crypto.subtle is only available in secure contexts (HTTPS, localhost).
    // Over plain HTTP, we skip device identity and fall back to token-only auth.
    // Gateways may reject this unless gateway.controlUi.allowInsecureAuth is enabled.
    const isSecureContext = typeof crypto !== "undefined" && !!crypto.subtle;

    const scopes = ["operator.admin", "operator.approvals", "operator.pairing"];
    const role = "operator";
    let deviceIdentity: Awaited<ReturnType<typeof loadOrCreateDeviceIdentity>> | null = null;
    let canFallbackToShared = false;
    let authToken = this.opts.token;
    console.debug("[gateway] begin sendConnect", {
      hasSecureContext: isSecureContext,
      hasToken: Boolean(authToken),
      hasPassword: Boolean(this.opts.password),
      role,
    });

    if (isSecureContext) {
      deviceIdentity = await loadOrCreateDeviceIdentity();
      const storedToken = loadDeviceAuthToken({
        deviceId: deviceIdentity.deviceId,
        role,
      })?.token;
      authToken = storedToken ?? this.opts.token;
      canFallbackToShared = Boolean(storedToken && this.opts.token);
    }
    const auth =
      authToken || this.opts.password
        ? {
            token: authToken,
            password: this.opts.password,
          }
        : undefined;

    let device:
      | {
          id: string;
          publicKey: string;
          signature: string;
          signedAt: number;
          nonce: string | undefined;
        }
      | undefined;

    if (isSecureContext && deviceIdentity) {
      const signedAtMs = Date.now();
      const nonce = this.connectNonce ?? undefined;
      const payload = buildDeviceAuthPayload({
        deviceId: deviceIdentity.deviceId,
        clientId: this.opts.clientName ?? GATEWAY_CLIENT_NAMES.CONTROL_UI,
        clientMode: this.opts.mode ?? GATEWAY_CLIENT_MODES.WEBCHAT,
        role,
        scopes,
        signedAtMs,
        token: authToken ?? null,
        nonce,
      });
      const signature = await signDevicePayload(deviceIdentity.privateKey, payload);
      device = {
        id: deviceIdentity.deviceId,
        publicKey: deviceIdentity.publicKey,
        signature,
        signedAt: signedAtMs,
        nonce,
      };
    }
    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: this.opts.clientName ?? GATEWAY_CLIENT_NAMES.CONTROL_UI,
        version: this.opts.clientVersion ?? "dev",
        platform: this.opts.platform ?? navigator.platform ?? "web",
        mode: this.opts.mode ?? GATEWAY_CLIENT_MODES.WEBCHAT,
        instanceId: this.opts.instanceId,
      },
      role,
      scopes,
      device,
      // 声明 tool-events：gateway 只给带此 cap 的客户端推送 tool call/result 流。
      // 不声明则 chat 消息列表只有最终 assistant 文本，看不到中间的多轮 tool 调用。
      // 对照：openclaw 自带的 control-ui bundle 默认声明 ['tool-events']。
      caps: [GATEWAY_CLIENT_CAPS.TOOL_EVENTS],
      auth,
      userAgent: navigator.userAgent,
      locale: navigator.language,
    };

    if (!this.isActiveSocket(ws, generation)) {
      return;
    }

    void this.requestOnSocket<GatewayHelloOk>(ws, generation, "connect", params, {
      allowBeforeHello: true,
    })
      .then((hello) => {
        if (!this.isActiveSocket(ws, generation)) {
          return;
        }
        console.info("[gateway] connect response ok");
        if (hello?.auth?.deviceToken && deviceIdentity) {
          storeDeviceAuthToken({
            deviceId: deviceIdentity.deviceId,
            role: hello.auth.role ?? role,
            token: hello.auth.deviceToken,
            scopes: hello.auth.scopes ?? [],
          });
        }
        this.helloReceived = true;
        this.backoffMs = 800;
        this.opts.onHello?.(hello);
      })
      .catch((err) => {
        if (!this.isActiveSocket(ws, generation)) {
          return;
        }
        console.error("[gateway] connect request failed", err);
        if (canFallbackToShared && deviceIdentity) {
          clearDeviceAuthToken({ deviceId: deviceIdentity.deviceId, role });
        }
        ws.close(CONNECT_FAILED_CLOSE_CODE, "connect failed");
      });
  }

  private handleMessage(ws: WebSocket, generation: number, raw: string) {
    if (!this.isActiveSocket(ws, generation)) {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[gateway] message parse error", raw);
      return;
    }

    const frame = parsed as { type?: unknown };
    if (frame.type === "event") {
      const evt = parsed as GatewayEventFrame;
      if (evt.event === "connect.challenge") {
        const payload = evt.payload as { nonce?: unknown } | undefined;
        const nonce = payload && typeof payload.nonce === "string" ? payload.nonce : null;
        if (nonce) {
          this.connectNonce = nonce;
          console.debug("[gateway] challenge recv nonce", nonce);
          void this.sendConnect(ws, generation);
        }
        return;
      }
      const seq = typeof evt.seq === "number" ? evt.seq : null;
      if (seq !== null) {
        if (this.lastSeq !== null && seq > this.lastSeq + 1) {
          this.opts.onGap?.({ expected: this.lastSeq + 1, received: seq });
        }
        this.lastSeq = seq;
      }
      try {
        this.opts.onEvent?.(evt);
      } catch (err) {
        console.error("[gateway] event handler error:", err);
      }
      return;
    }

    if (frame.type === "res") {
      const res = parsed as GatewayResponseFrame;
      const pending = this.pending.get(res.id);
      if (!pending) {
        return;
      }
      this.pending.delete(res.id);
      if (pending.timeoutId !== null) {
        window.clearTimeout(pending.timeoutId);
      }
      if (res.ok) {
        pending.resolve(res.payload);
      } else {
        pending.reject(new Error(res.error?.message ?? "request failed"));
      }
      return;
    }
  }

  // 业务请求只允许走当前且已完成 hello 的连接。
  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error("[gateway] request with closed socket", method);
      return Promise.reject(new Error("gateway not connected"));
    }
    if (!this.helloReceived) {
      console.error("[gateway] request before hello", method);
      return Promise.reject(new Error("gateway handshake not complete"));
    }
    return this.requestOnSocket<T>(this.ws, this.socketGeneration, method, params);
  }

  private requestOnSocket<T = unknown>(
    ws: WebSocket,
    generation: number,
    method: string,
    params?: unknown,
    options: { allowBeforeHello?: boolean } = {},
  ): Promise<T> {
    if (!this.isActiveSocket(ws, generation) || ws.readyState !== WebSocket.OPEN) {
      console.error("[gateway] request with stale socket", method);
      return Promise.reject(new Error("gateway not connected"));
    }
    if (!options.allowBeforeHello && !this.helloReceived) {
      console.error("[gateway] request before hello", method);
      return Promise.reject(new Error("gateway handshake not complete"));
    }
    const id = generateUUID();
    const frame = { type: "req", id, method, params };
    const p = new Promise<T>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        const pending = this.pending.get(id);
        if (!pending) {
          return;
        }
        this.pending.delete(id);
        pending.reject(new Error(`gateway request timeout: ${method}`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, {
        timeoutId,
        resolve: (v) => resolve(v as T),
        reject,
      });
    });
    ws.send(JSON.stringify(frame));
    console.debug("[gateway] request sent", method);
    return p;
  }

  private queueConnect(ws: WebSocket, generation: number) {
    this.connectNonce = null;
    this.connectSent = false;
    this.clearConnectTimer();
    this.connectTimer = window.setTimeout(() => {
      if (!this.isActiveSocket(ws, generation)) {
        return;
      }
      console.debug("[gateway] queueConnect timeout fire");
      void this.sendConnect(ws, generation);
    }, 750);
  }

  private resetHandshakeState() {
    this.connectSent = false;
    this.connectNonce = null;
    this.helloReceived = false;
    this.clearConnectTimer();
  }

  private clearConnectTimer() {
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private isActiveSocket(ws: WebSocket, generation: number) {
    return this.ws === ws && this.socketGeneration === generation;
  }
}
