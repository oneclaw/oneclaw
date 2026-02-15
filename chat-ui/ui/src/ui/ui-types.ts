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
