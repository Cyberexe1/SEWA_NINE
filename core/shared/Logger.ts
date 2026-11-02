/**
 * NINE Protocol - Logger Interface
 *
 * Structured logging for debugging and monitoring.
 * Implementations can be swapped (console, file, silent for tests).
 */

export enum LogLevel {
  SILENT = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

export interface ILogger {
  readonly module: string;

  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;

  /** Create a child logger with sub-module prefix */
  child(subModule: string): ILogger;
}

export interface ILoggerFactory {
  setLevel(level: LogLevel): void;
  create(module: string): ILogger;
}
