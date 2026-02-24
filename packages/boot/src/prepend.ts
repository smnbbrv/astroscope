const code: string[] = [];

/**
 * Register code to prepend to `entry.mjs` before boot's startup.
 *
 * Used by integrations (e.g. `@astroscope/health`) to ensure their
 * setup runs before `onStartup` in production builds.
 */
export function prepend(value: string): void {
  code.push(value);
}

/**
 * Get all registered prepend code strings.
 * Used internally by boot's generateBundle.
 */
export function getPrependCode(): string[] {
  return code;
}
