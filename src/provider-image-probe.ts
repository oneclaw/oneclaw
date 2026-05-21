export type JsonRequest = (
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<void>;

export type ImageProbeAuth = "bearer" | "x-api-key" | "none";

export type ImageProbeOutcome =
  | { kind: "supported" }
  | { kind: "unsupported" }
  | { kind: "error"; message: string; code?: number };

export interface ImageProbeParams {
  apiType: string;
  baseURL?: string;
  modelID?: string;
  apiKey?: string;
  auth: ImageProbeAuth;
  request: JsonRequest;
}

const UA_ANTHROPIC = "Anthropic/JS 0.73.0";
const UA_OPENAI = "OpenAI/JS 6.10.0";

// 1x1 grayscale PNG (67 bytes) as base64, encoded with stock zlib.deflate.
// The earlier "shortest possible" 1x1 PNG (deflate body `08 d7 63 60 00 02 00
// 05 00 01 36`) is a hand-crafted minimum that some gateways
// reject at the image-decode layer with 400 "failed to decode
// image: invalid or unsupported image format" — that message contains "image"
// + "unsupported" so isExplicitImageUnsupported() silently demotes
// image-capable models to text-only. A normal zlib-compressed payload of the
// same 1x1 dimension passes every gateway tested. See docs/gotchas.md.
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR42mNg" +
  "AAAAAgAB5Sfe/AAAAABJRU5ErkJggg==";

function resolveAnthropicMessagesUrl(baseURL: string): string {
  const base = baseURL.replace(/\/+$/, "");
  return base.endsWith("/v1") ? `${base}/messages` : `${base}/v1/messages`;
}

function readErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (typeof err === "string" && err.trim()) return err.trim();
  return "Unknown image capability probe error";
}

function readErrorCode(err: unknown, message: string): number | undefined {
  if (err && typeof err === "object") {
    const record = err as { status?: unknown; statusCode?: unknown; code?: unknown };
    if (typeof record.status === "number") return record.status;
    if (typeof record.statusCode === "number") return record.statusCode;
    if (typeof record.code === "number") return record.code;
  }
  const match = message.match(/\b(?:status|code)?\s*\(?([1-5][0-9]{2})\)?\b/i);
  return match ? Number(match[1]) : undefined;
}

function errorOutcome(message: string, code?: number): ImageProbeOutcome {
  return code === undefined ? { kind: "error", message } : { kind: "error", message, code };
}

function outcomeFromError(err: unknown): ImageProbeOutcome {
  const message = readErrorMessage(err);
  const code = readErrorCode(err, message);
  if (isExplicitImageUnsupported(code, message)) return { kind: "unsupported" };
  return errorOutcome(message, code);
}

function isExplicitImageUnsupported(code: number | undefined, message: string): boolean {
  if (code === undefined || code < 400 || code >= 500) return false;
  if (code === 401 || code === 403 || code === 429) return false;

  const lower = message.toLowerCase();
  const mentionsImageInput =
    /image|vision|visual|multimodal|multi-modal|image_url/.test(lower) ||
    /图片|图像|视觉|多模态|影像/.test(message);
  if (mentionsImageInput) {
    if (
      /unsupported|not support|does not support|doesn't support|not capable|does not accept|cannot accept|can't accept|not allowed|text[- ]?only|only supports text/.test(lower) ||
      /不支持|不接受|无法|不能|仅支持文本|只支持文本/.test(message)
    ) return true;
  }

  // 探测请求总是带 multimodal body（image_url / input_image / inline_data + 文本）。
  // 文本-only 上游对这种 body 形状的 4xx 拒收，等价于"不支持图片输入"。
  return (
    /content\s+(must|should)\s+be\s+(a\s+)?string|content\s+is\s+not\s+of\s+type\s+string|expected\s+string,?\s+(but\s+)?got\s+array|(unknown|unrecognized|invalid|unexpected)\s+(field|parameter|property|key|variant)[^.]*image_url/.test(lower) ||
    /content\s*必须是字符串|content\s*不是字符串/.test(message)
  );
}

export async function probeImageSupport(params: ImageProbeParams): Promise<ImageProbeOutcome> {
  const { apiType, baseURL, modelID, apiKey, auth, request } = params;
  if (!baseURL) return errorOutcome("Image capability probe requires Base URL");
  if (!modelID) return errorOutcome("Image capability probe requires Model ID");

  try {
    if (apiType === "anthropic-messages") {
      const headers: Record<string, string> = {
        "User-Agent": UA_ANTHROPIC,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      };
      if (auth === "x-api-key" && apiKey) headers["x-api-key"] = apiKey;

      await request(resolveAnthropicMessagesUrl(baseURL), {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelID,
          max_tokens: 1,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: TINY_PNG_B64 } },
              { type: "text", text: "hi" },
            ],
          }],
        }),
      });
      return { kind: "supported" };
    }

    if (apiType === "openai-completions") {
      const headers: Record<string, string> = {
        "User-Agent": UA_OPENAI,
        "content-type": "application/json",
      };
      if (auth === "bearer" && apiKey) headers.Authorization = `Bearer ${apiKey}`;

      await request(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelID,
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:image/png;base64,${TINY_PNG_B64}` } },
              { type: "text", text: "hi" },
            ],
          }],
        }),
      });
      return { kind: "supported" };
    }

    if (apiType === "openai-responses") {
      const headers: Record<string, string> = {
        "User-Agent": UA_OPENAI,
        "content-type": "application/json",
      };
      if (auth === "bearer" && apiKey) headers.Authorization = `Bearer ${apiKey}`;

      await request(`${baseURL.replace(/\/+$/, "")}/v1/responses`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelID,
          max_output_tokens: 1,
          input: [{
            role: "user",
            content: [
              { type: "input_image", image_url: `data:image/png;base64,${TINY_PNG_B64}` },
              { type: "input_text", text: "hi" },
            ],
          }],
        }),
      });
      return { kind: "supported" };
    }

    if (apiType === "google-generative-ai") {
      if (!apiKey) return errorOutcome("Image capability probe requires API key");
      const base = baseURL.replace(/\/+$/, "");
      const url = `${base}/models/${encodeURIComponent(modelID)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      await request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { inline_data: { mime_type: "image/png", data: TINY_PNG_B64 } },
              { text: "hi" },
            ],
          }],
          generationConfig: { maxOutputTokens: 1 },
        }),
      });
      return { kind: "supported" };
    }

    return errorOutcome(`Image capability probe does not support API protocol: ${apiType || "unknown"}`);
  } catch (err) {
    return outcomeFromError(err);
  }
}
