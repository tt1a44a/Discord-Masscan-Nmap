/* Structured JSON logger with timestamps. Swap for pino/winston later if needed. */

function safeStringify(obj: Record<string, unknown>): string {
  try {
    return JSON.stringify(obj);
  } catch {
    // Handle circular references gracefully.
    return JSON.stringify({ error: "failed to serialize log entry" });
  }
}

export const log = {
  info: (msg: string, meta: Record<string, unknown> = {}) =>
    console.log(safeStringify({ ts: new Date().toISOString(), level: "info", msg, ...meta })),
  warn: (msg: string, meta: Record<string, unknown> = {}) =>
    console.warn(safeStringify({ ts: new Date().toISOString(), level: "warn", msg, ...meta })),
  error: (msg: string, meta: Record<string, unknown> = {}) =>
    console.error(safeStringify({ ts: new Date().toISOString(), level: "error", msg, ...meta }))
};
