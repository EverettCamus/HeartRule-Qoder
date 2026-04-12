export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_LOG_LEVEL: LogLevel = 'info';
const LOG_LEVEL: LogLevel = (() => {
  // Check if we're in a Node.js environment (process exists)
  if (typeof process !== 'undefined' && process.env) {
    const envLevel = process.env.LOG_LEVEL;
    if (envLevel && LOG_LEVELS[envLevel as LogLevel] !== undefined) {
      return envLevel as LogLevel;
    }
  }
  return DEFAULT_LOG_LEVEL;
})();

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL];
}

function truncate(str: string, maxLen: number = 200): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, 100) + `... (${str.length} chars total)`;
}

function summarize(data: unknown, maxDepth: number = 2): unknown {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    return truncate(data);
  }

  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    if (data.length <= 3) return data.map((item) => summarize(item, maxDepth - 1));
    return {
      _type: 'array',
      length: data.length,
      sample: data.slice(0, 2).map((item) => summarize(item, maxDepth - 1)),
    };
  }

  if (maxDepth <= 0) {
    return { _type: 'object', keys: Object.keys(data as object).slice(0, 5) };
  }

  const obj = data as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  const keys = Object.keys(obj);

  for (const key of keys.slice(0, 10)) {
    const value = obj[key];
    if (typeof value === 'string' && value.length > 200) {
      summary[key] = truncate(value);
    } else if (typeof value === 'object' && value !== null) {
      summary[key] = summarize(value, maxDepth - 1);
    } else {
      summary[key] = value;
    }
  }

  if (keys.length > 10) {
    summary['_additionalKeys'] = keys.length - 10;
  }

  return summary;
}

export class Logger {
  constructor(private prefix: string) {}

  private formatMessage(level: LogLevel, message: string): string {
    return `[${this.prefix}] ${level.toUpperCase()}: ${message}`;
  }

  debug(message: string, data?: unknown): void {
    if (!shouldLog('debug')) return;
    const formatted = this.formatMessage('debug', message);
    if (data !== undefined) {
      console.log(formatted, JSON.stringify(summarize(data), null, 2));
    } else {
      console.log(formatted);
    }
  }

  info(message: string, data?: unknown): void {
    if (!shouldLog('info')) return;
    const formatted = this.formatMessage('info', message);
    if (data !== undefined) {
      console.info(
        formatted,
        typeof data === 'object' ? JSON.stringify(summarize(data), null, 2) : data
      );
    } else {
      console.info(formatted);
    }
  }

  warn(message: string, data?: unknown): void {
    if (!shouldLog('warn')) return;
    const formatted = this.formatMessage('warn', message);
    if (data !== undefined) {
      console.warn(
        formatted,
        typeof data === 'object' ? JSON.stringify(summarize(data), null, 2) : data
      );
    } else {
      console.warn(formatted);
    }
  }

  error(message: string, data?: unknown): void {
    if (!shouldLog('error')) return;
    const formatted = this.formatMessage('error', message);
    if (data !== undefined) {
      console.error(
        formatted,
        typeof data === 'object' ? JSON.stringify(summarize(data), null, 2) : data
      );
    } else {
      console.error(formatted);
    }
  }

  raw(message: string): void {
    console.log(formatLogPrefix(this.prefix), message);
  }
}

export function formatLogPrefix(prefix: string): string {
  return `[${prefix}]`;
}

export function createLogger(prefix: string): Logger {
  return new Logger(prefix);
}

export const LOG_LEVEL_ORDER = LOG_LEVELS;
export const CURRENT_LOG_LEVEL = LOG_LEVEL;
