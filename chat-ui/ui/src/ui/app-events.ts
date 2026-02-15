/**
 * Event log entry type used by the debug/event log views.
 */

export type EventLogEntry = {
  id?: string;
  type?: string;
  event?: string;
  ts?: number;
  payload?: unknown;
  [key: string]: unknown;
};
