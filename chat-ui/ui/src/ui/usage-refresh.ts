export type UsageSnapshot = string | null;

export function shouldRefreshSessionsForChatState(state: string | null | undefined): boolean {
  return state === "final" || state === "error" || state === "aborted";
}

export function shouldFinishUsageRefreshAttempt(
  baseline: UsageSnapshot,
  current: UsageSnapshot,
  isLastAttempt: boolean,
): boolean {
  if (isLastAttempt) {
    return true;
  }
  if (current === null || baseline === null) {
    return false;
  }
  return current !== baseline;
}
