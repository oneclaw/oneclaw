import { pathToFileURL } from "node:url";

type ChatUiEntryOptions = {
  port: number;
  token?: string;
  initialView?: "setup" | "chat";
};

// 首次加载时直接携带启动参数，保证 renderer 首帧就拿到正确视图和 gateway 信息。
export function buildChatUiEntryUrl(chatUiIndex: string, opts: ChatUiEntryOptions): string {
  const url = pathToFileURL(chatUiIndex);
  url.searchParams.set("gatewayUrl", `ws://127.0.0.1:${opts.port}`);
  if (opts.token?.trim()) {
    url.searchParams.set("token", opts.token.trim());
  }
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  if (opts.initialView === "setup") {
    hashParams.set("view", "setup");
  } else {
    hashParams.delete("view");
  }
  const hash = hashParams.toString();
  url.hash = hash ? `#${hash}` : "";
  return url.toString();
}
