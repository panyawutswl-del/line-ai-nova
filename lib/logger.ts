type LogLevel = "debug" | "info" | "warn" | "error";

function log(level: LogLevel, event: string, data?: Record<string, unknown>) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>) =>
    log("debug", event, data),
  info: (event: string, data?: Record<string, unknown>) =>
    log("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) =>
    log("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) =>
    log("error", event, data),
};

export function errorInfo(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { error: err.message, stack: err.stack?.split("\n")[1]?.trim() };
  }
  return { error: String(err) };
}
