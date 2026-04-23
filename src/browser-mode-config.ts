export const BROWSER_MODES = ["openclaw", "chrome", "webbridge"] as const;

export type BrowserMode = (typeof BROWSER_MODES)[number];

export function isBrowserMode(value: unknown): value is BrowserMode {
  return (
    typeof value === "string" &&
    (BROWSER_MODES as readonly string[]).includes(value)
  );
}
