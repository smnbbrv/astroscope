import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import pino, { type Bindings, type Logger, type LoggerOptions } from 'pino';

const als = new AsyncLocalStorage<Logger>();

let rootLogger: Logger = pino({ level: 'info' });

/**
 * Override the root logger with a custom configuration.
 *
 * Call this in your boot.ts to configure logging before the server starts.
 *
 * @example
 * ```ts
 * // src/boot.ts
 * import pino from 'pino';
 * import { initLogger } from '@astroscope/pino';
 *
 * export function onStartup() {
 *   initLogger(pino({
 *     level: process.env.LOG_LEVEL ?? 'info',
 *   }));
 * }
 * ```
 */
export function initLogger(logger: Logger): void;
export function initLogger(options: LoggerOptions): void;
export function initLogger(loggerOrOptions: Logger | LoggerOptions): void {
  if ('info' in loggerOrOptions && typeof loggerOrOptions.info === 'function') {
    rootLogger = loggerOrOptions as Logger;
  } else {
    rootLogger = pino(loggerOrOptions as LoggerOptions);
  }
}

/**
 * Get the current request logger, or root logger if outside request context.
 * @internal
 */
function logger(): Logger {
  return als.getStore() ?? rootLogger;
}

/**
 * Generate a short request ID.
 * @internal
 */
export function generateReqId(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Run a function with a logger in the async context.
 * @internal
 */
export function runWithLogger<T>(logger: Logger, fn: () => T): T {
  return als.run(logger, fn);
}

/**
 * Log proxy interface - provides context-aware logging via getters.
 */
export interface LogProxy {
  /** Log at trace level */
  readonly trace: Logger['trace'];
  /** Log at debug level */
  readonly debug: Logger['debug'];
  /** Log at info level */
  readonly info: Logger['info'];
  /** Log at warn level */
  readonly warn: Logger['warn'];
  /** Log at error level */
  readonly error: Logger['error'];
  /** Log at fatal level */
  readonly fatal: Logger['fatal'];
  /** Log at silent level (noop) */
  readonly silent: Logger['silent'];
  /** Create a child logger with additional bindings */
  child(bindings: Bindings): LogProxy;
  /** Access the current context's raw pino Logger */
  readonly raw: Logger;
  /** Access the root logger (no request context) */
  readonly root: Logger;
}

/**
 * Create a log proxy for a specific logger instance.
 */
function createLogProxy(logger: Logger): LogProxy {
  return {
    get trace() {
      return logger.trace.bind(logger);
    },
    get debug() {
      return logger.debug.bind(logger);
    },
    get info() {
      return logger.info.bind(logger);
    },
    get warn() {
      return logger.warn.bind(logger);
    },
    get error() {
      return logger.error.bind(logger);
    },
    get fatal() {
      return logger.fatal.bind(logger);
    },
    get silent() {
      return logger.silent.bind(logger);
    },
    child(bindings: Bindings): LogProxy {
      return createLogProxy(logger.child(bindings));
    },
    get raw() {
      return logger;
    },
    get root() {
      return rootLogger;
    },
  };
}

/**
 * Context-aware logger with getter-based API.
 *
 * @example
 * ```ts
 * import { log } from '@astroscope/pino';
 *
 * // Basic logging - automatically uses request context
 * log.info('handling request');
 * log.info({ userId: 123 }, 'user logged in');
 * log.error(err, 'operation failed');
 *
 * // Create child logger with additional bindings
 * const dbLog = log.child({ component: 'db' });
 * dbLog.debug('executing query');
 *
 * // Access raw pino Logger when needed
 * log.raw.level;           // current level
 * log.raw.bindings();      // current bindings
 *
 * // Access root logger (no request context)
 * log.root.info('startup message');
 * ```
 */
export const log: LogProxy = {
  get trace() {
    return logger().trace.bind(logger());
  },
  get debug() {
    return logger().debug.bind(logger());
  },
  get info() {
    return logger().info.bind(logger());
  },
  get warn() {
    return logger().warn.bind(logger());
  },
  get error() {
    return logger().error.bind(logger());
  },
  get fatal() {
    return logger().fatal.bind(logger());
  },
  get silent() {
    return logger().silent.bind(logger());
  },
  child(bindings: Bindings): LogProxy {
    return createLogProxy(logger().child(bindings));
  },
  get raw() {
    return logger();
  },
  get root() {
    return rootLogger;
  },
};
