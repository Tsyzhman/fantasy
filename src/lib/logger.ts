type LogLevel = "error" | "info" | "warn";

type LogFields = Record<string, unknown>;

type LoggerSink = Pick<Console, LogLevel>;

type LoggerOptions = {
  json?: boolean;
  sink?: LoggerSink;
};

export type AppLogger = ReturnType<typeof createLogger>;

export function createLogger(scope: string, options: LoggerOptions = {}) {
  const sink = options.sink ?? console;
  const json = options.json ?? shouldUseJsonLogs();

  return {
    error(message: string, fields?: LogFields) {
      writeLog(sink, json, "error", scope, message, fields);
    },
    info(message: string, fields?: LogFields) {
      writeLog(sink, json, "info", scope, message, fields);
    },
    warn(message: string, fields?: LogFields) {
      writeLog(sink, json, "warn", scope, message, fields);
    }
  };
}

function writeLog(sink: LoggerSink, json: boolean, level: LogLevel, scope: string, message: string, fields: LogFields = {}) {
  if (json) {
    sink[level](
      JSON.stringify({
        level,
        scope,
        message,
        timestamp: new Date().toISOString(),
        ...serializeFields(fields)
      })
    );
    return;
  }

  const serializedFields = serializeFields(fields);
  const suffix = Object.keys(serializedFields).length > 0 ? ` ${JSON.stringify(serializedFields)}` : "";
  sink[level](`[${scope}] ${message}${suffix}`);
}

function serializeFields(fields: LogFields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, serializeValue(value)]));
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }
  if (typeof value === "bigint") return value.toString();
  return value;
}

function shouldUseJsonLogs() {
  if (process.env.LOG_FORMAT === "json") return true;
  if (process.env.LOG_FORMAT === "text") return false;
  return process.env.NODE_ENV === "production";
}
