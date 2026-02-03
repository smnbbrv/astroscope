export interface BootContext {
  /** Whether running in development mode (vite dev server) */
  dev: boolean;
  /** Server host from Astro config */
  host: string;
  /** Server port from Astro config */
  port: number;
}

export interface WarmupResult {
  /** Modules that were successfully loaded */
  success: string[];
  /** Modules that failed to load */
  failed: string[];
  /** Time taken in milliseconds */
  duration: number;
}
