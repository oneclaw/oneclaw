import type { GatewayHelloOk } from "./gateway.ts";
import type { SessionsListResult } from "./types.ts";

type SessionDefaultsSnapshot = {
  mainSessionKey?: string;
  mainKey?: string;
};

export function resolveMainSessionKey(
  hello: GatewayHelloOk | null | undefined,
  sessions: SessionsListResult | null,
): string | null {
  const snapshot = hello?.snapshot as { sessionDefaults?: SessionDefaultsSnapshot } | undefined;
  const mainSessionKey = snapshot?.sessionDefaults?.mainSessionKey?.trim();
  if (mainSessionKey) {
    return mainSessionKey;
  }
  const mainKey = snapshot?.sessionDefaults?.mainKey?.trim();
  if (mainKey) {
    return mainKey;
  }
  if (sessions?.sessions?.some((row) => row.key === "main")) {
    return "main";
  }
  return null;
}

export function hasVisibleSession(
  sessions: SessionsListResult | null | undefined,
  sessionKey: string | null | undefined,
): boolean {
  const key = sessionKey?.trim();
  if (!key) {
    return false;
  }
  return Boolean(sessions?.sessions?.some((row) => row.key === key));
}

export function resolveVisibleSessionFallback(
  hello: GatewayHelloOk | null | undefined,
  sessions: SessionsListResult | null,
): string {
  const mainSessionKey = resolveMainSessionKey(hello, sessions)?.trim();
  if (mainSessionKey && hasVisibleSession(sessions, mainSessionKey)) {
    return mainSessionKey;
  }
  const firstVisible = sessions?.sessions?.[0]?.key?.trim();
  if (firstVisible) {
    return firstVisible;
  }
  return "main";
}

export function resolveVisibleSessionSelection(
  sessionKey: string | null | undefined,
  hello: GatewayHelloOk | null | undefined,
  sessions: SessionsListResult | null,
): string {
  const current = sessionKey?.trim();
  if (current && hasVisibleSession(sessions, current)) {
    return current;
  }
  return resolveVisibleSessionFallback(hello, sessions);
}
