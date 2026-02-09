import { type Server, createServer } from 'node:http';

import { probes } from './probes.js';
import type { HealthServerOptions } from './types.js';

/**
 * Manages the HTTP server for health endpoints.
 */
export class HealthServer {
  private instance: Server | null = null;

  /**
   * Start the health check HTTP server.
   */
  start(options: HealthServerOptions = {}): void {
    if (this.instance) {
      return;
    }

    const host = options.host ?? 'localhost';
    const port = options.port ?? 9090;

    const instance = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const response = await this.handleRequest(url.pathname);

        res.statusCode = response.status;

        for (const [key, value] of response.headers.entries()) {
          res.setHeader(key, value);
        }

        const body = await response.text();

        res.end(body);
      } catch {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Internal Server Error');
      }
    });

    instance.listen(port, host);
    this.instance = instance;
  }

  /**
   * Stop the health check HTTP server.
   */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.instance) {
        resolve();

        return;
      }

      this.instance.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.instance = null;
          resolve();
        }
      });
    });
  }

  private async handleRequest(pathname: string): Promise<Response> {
    switch (pathname) {
      case '/livez':
        return probes.livez.response();
      case '/startupz':
        return probes.startupz.response();
      case '/readyz':
        return probes.readyz.response();
      case '/healthz':
        return probes.healthz.response();
      default:
        return new Response('Not Found', { status: 404 });
    }
  }
}

export const server = new HealthServer();
