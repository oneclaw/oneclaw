import type { GatewaySessionRow, SessionsListResult } from "./types.ts";

// Pending labels are delayed until chat.event state="final" so the agent
// runtime cannot overwrite them; they also identify local-only sessions.
export const pendingSessionLabels = new Map<string, string>();

export function removePendingSessionLabel(key: string) {
  const trimmed = key.trim();
  if (trimmed) {
    pendingSessionLabels.delete(trimmed);
  }
}

export function withPendingSessionRows(
  result: SessionsListResult,
  now = Date.now(),
): SessionsListResult {
  if (pendingSessionLabels.size === 0) {
    return result;
  }

  const sessions = [...(result.sessions ?? [])];
  const pendingRows: GatewaySessionRow[] = [];
  let changed = false;

  for (const [rawKey, label] of pendingSessionLabels) {
    const key = rawKey.trim();
    if (!key) {
      continue;
    }

    const existingIndex = sessions.findIndex((row) => row.key === key);
    if (existingIndex >= 0) {
      const existing = sessions[existingIndex];
      if (!existing || existing.label === label) {
        continue;
      }
      sessions[existingIndex] = {
        ...existing,
        label,
      };
      changed = true;
      continue;
    }

    pendingRows.push({
      key,
      label,
      updatedAt: now,
    });
    changed = true;
  }

  if (!changed) {
    return result;
  }

  return {
    ...result,
    sessions: [...pendingRows, ...sessions],
  };
}
