type LogLevel = "info" | "warn" | "error";
type LogContext = Record<string, string | number | boolean | null | undefined>;

function write(level: LogLevel, message: string, context: LogContext = {}): void {
  const entry = { timestamp: new Date().toISOString(), level, message, ...context };
  const output = JSON.stringify(entry);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.info(output);
}

export const logger = {
  info: (message: string, context?: LogContext): void => write("info", message, context),
  warn: (message: string, context?: LogContext): void => write("warn", message, context),
  error: (message: string, context?: LogContext): void => write("error", message, context),
};
