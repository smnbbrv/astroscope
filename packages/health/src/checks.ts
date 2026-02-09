import type { HealthCheck, HealthCheckResult } from './types.js';

const DEFAULT_TIMEOUT = 5000;

/**
 * Manages health check registration and execution.
 */
export class HealthChecks {
  private readonly registered = new Map<string, HealthCheck>();

  /**
   * Register a health check.
   * Returns an unregister function.
   */
  register(name: string, check: () => Promise<HealthCheckResult | void> | HealthCheckResult | void): () => void;
  register(check: HealthCheck): () => void;
  register(
    nameOrCheck: string | HealthCheck,
    checkFn?: () => Promise<HealthCheckResult | void> | HealthCheckResult | void,
  ): () => void {
    const check: HealthCheck = typeof nameOrCheck === 'string' ? { name: nameOrCheck, check: checkFn! } : nameOrCheck;

    if (this.registered.has(check.name)) {
      console.warn(`[health] overwriting existing check "${check.name}"`);
    }

    this.registered.set(check.name, check);

    return () => {
      this.registered.delete(check.name);
    };
  }

  /**
   * Run a single check with timeout.
   */
  private async run(check: HealthCheck): Promise<HealthCheckResult> {
    const timeout = check.timeout ?? DEFAULT_TIMEOUT;
    const start = performance.now();

    try {
      const result = await Promise.race([
        Promise.resolve(check.check()),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`check "${check.name}" timed out after ${timeout}ms`)), timeout);
        }),
      ]);

      const latency = Math.round(performance.now() - start);

      if (result) {
        return { ...result, latency };
      }

      return { status: 'healthy', latency };
    } catch (error) {
      const latency = Math.round(performance.now() - start);
      const errorMessage = error instanceof Error ? error.message : String(error);

      return { status: 'unhealthy', latency, error: errorMessage };
    }
  }

  /**
   * Run all registered health checks.
   */
  async runAll(): Promise<Record<string, HealthCheckResult>> {
    const results: Record<string, HealthCheckResult> = {};
    const checks = [...this.registered.values()];

    const checkPromises = checks.map(async (check) => {
      const result = await this.run(check);

      results[check.name] = result;
    });

    await Promise.all(checkPromises);

    return results;
  }

  /**
   * Run only required checks and return whether they all pass.
   */
  async runRequired(): Promise<boolean> {
    const requiredChecks = [...this.registered.values()].filter((check) => !check.optional);

    if (requiredChecks.length === 0) {
      return true;
    }

    const checkPromises = requiredChecks.map(async (check) => {
      const result = await this.run(check);

      return result.status === 'healthy';
    });

    const results = await Promise.all(checkPromises);

    return results.every(Boolean);
  }

  /**
   * Get all registered checks.
   */
  getChecks(): HealthCheck[] {
    return [...this.registered.values()];
  }
}

export const checks = new HealthChecks();
