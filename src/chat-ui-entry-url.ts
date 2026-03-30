import { pathToFileURL } from "node:url";

type ChatUiEntryOptions = {
  port: number;
  token?: string;
};

// 首次加载时直接携带 gateway 参数，避免先启动 renderer 再二次 reload。
export function buildChatUiEntryUrl(chatUiIndex: string, opts: ChatUiEntryOptions): string {
  const url = pathToFileURL(chatUiIndex);
  url.searchParams.set("gatewayUrl", `ws://127.0.0.1:${opts.port}`);
  if (opts.token?.trim()) {
    url.searchParams.set("token", opts.token.trim());
  }
  return url.toString();
}
