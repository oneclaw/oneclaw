/**
 * UI-specific types used by the chat and cron form views.
 */

export type ChatAttachment = {
  id: string;
  name?: string;
  type?: string;
  size?: number;
  dataUrl?: string;
  url?: string;
  /** 本地文件绝对路径（非图片附件，发送时拼到消息前面） */
  filePath?: string;
  [key: string]: unknown;
};

export type ChatQueueItem = {
  id: string;
  message: string;
  attachments?: ChatAttachment[];
  timestamp?: number;
  [key: string]: unknown;
};

export type CronFormState = {
  name: string;
  description: string;
  agentId: string;
  enabled: boolean;
  scheduleKind: "at" | "every" | "cron";
  scheduleAt: string;
  everyAmount: string;
  everyUnit: string;
  cronExpr: string;
  cronTz: string;
  sessionTarget: string;
  wakeMode: string;
  payloadKind: "agentTurn" | "systemEvent";
  payloadText: string;
  deliveryMode: string;
  deliveryChannel: string;
  deliveryTo: string;
  timeoutSeconds: string;
};
