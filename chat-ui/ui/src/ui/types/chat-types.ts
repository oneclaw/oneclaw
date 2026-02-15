/**
 * Chat rendering types used by the message normalizer,
 * grouped render, tool cards, and chat view.
 */

export type MessageContentItem = {
  type: string;
  text?: string;
  name?: string;
  arguments?: unknown;
  args?: unknown;
  toolCallId?: string;
  tool_call_id?: string;
  [key: string]: unknown;
};

export type NormalizedMessage = {
  role: string;
  content: MessageContentItem[];
  toolCallId?: string;
  toolName?: string;
  raw?: unknown;
  [key: string]: unknown;
};

export type ChatItem = {
  role: string;
  content?: unknown;
  message?: unknown;
  [key: string]: unknown;
};

export type MessageGroup = {
  role: string;
  messages: unknown[];
  key?: string;
  [key: string]: unknown;
};

export type ToolCard = {
  kind: "call" | "result";
  name: string;
  args?: unknown;
  output?: unknown;
  error?: string;
  [key: string]: unknown;
};
