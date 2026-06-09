type LogLevel = "error" | "info" | "warn";

type LogFields = Record<string, unknown>;

type LoggerSink = Pick<Console, LogLevel>;

type LoggerOptions = {
  json?: boolean;
  sink?: LoggerSink;
};

const redactedLogValue = "[REDACTED]";
const sensitiveLogKeyPattern = /(cookie|authorization|secret|token|password|x-mas)/i;

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
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, serializeValue(value, key)]));
}

function serializeValue(value: unknown, key?: string, seen = new WeakSet<object>()): unknown {
  if (key && sensitiveLogKeyPattern.test(key)) return redactedLogValue;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result = value.map((item) => serializeValue(item, undefined, seen));
    seen.delete(value);
    return result;
  }
  if (isPlainRecord(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result = Object.fromEntries(Object.entries(value).map(([nestedKey, nestedValue]) => [nestedKey, serializeValue(nestedValue, nestedKey, seen)]));
    seen.delete(value);
    return result;
  }
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function shouldUseJsonLogs() {
  if (process.env.LOG_FORMAT === "json") return true;
  if (process.env.LOG_FORMAT === "text") return false;
  return process.env.NODE_ENV === "production";
}
