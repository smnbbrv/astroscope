import type { APIContext } from "astro";
import type { Agent } from "undici";
import { request as undiciRequest } from "undici";
import { createHttpAgent } from "./client.js";
import type { ProxyOptions } from "./types.js";

/**
 * Creates an Astro API route handler that proxies requests to an upstream server.
 *
 * @example
 * ```ts
 * // src/pages/[...proxy].ts
 * import { createProxyHandler } from '@astroscope/proxy';
 *
 * export const ALL = createProxyHandler({
 *   upstream: process.env.LEGACY_UPSTREAM!,
 * });
 * ```
 */
export function createProxyHandler(options: ProxyOptions) {
  const upstreamUrl = new URL(options.upstream);
  const httpAgent = createHttpAgent(options.client);

  return async (context: APIContext): Promise<Response> => {
    const { request } = context;

    // Build target URL
    const targetUrl = new URL(request.url);
    targetUrl.protocol = upstreamUrl.protocol;
    targetUrl.hostname = upstreamUrl.hostname;
    targetUrl.port = upstreamUrl.port;

    try {
      // Allow request modification or short-circuit
      if (options.onRequest) {
        const result = await options.onRequest(request, targetUrl);
        if (result instanceof Response) {
          return result;
        }
        if (result instanceof Request) {
          return await proxyRequest(result, targetUrl, httpAgent, options);
        }
      }

      return await proxyRequest(request, targetUrl, httpAgent, options);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (options.onError) {
        const result = await options.onError(err, targetUrl);
        if (result instanceof Response) {
          return result;
        }
      }

      return new Response("Upstream is down", {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      });
    }
  };
}

async function proxyRequest(
  request: Request,
  targetUrl: URL,
  httpAgent: Agent,
  options: ProxyOptions
): Promise<Response> {
  const { method, body, headers: reqHeaders } = request;

  // Prepare headers with host rewrite
  const headers = new Headers(reqHeaders);
  headers.set("host", targetUrl.host);

  // Make upstream request
  const upstreamResponse = await undiciRequest(targetUrl, {
    method,
    headers: Object.fromEntries(headers.entries()),
    body: method !== "GET" && method !== "HEAD" ? (body as never) : null,
    dispatcher: httpAgent,
    signal: request.signal,
  });

  const { statusCode, headers: resHeaders, body: resBody } = upstreamResponse;

  // Convert response headers
  const responseHeaders = new Headers();
  for (const [key, value] of Object.entries(resHeaders)) {
    if (Array.isArray(value)) {
      value.forEach((v) => responseHeaders.append(key, v));
    } else if (value != null) {
      responseHeaders.set(key, value);
    }
  }

  // 204 and 304 responses must not have a body
  if (statusCode === 204 || statusCode === 304) {
    resBody.destroy();
    const response = new Response(null, {
      status: statusCode,
      headers: responseHeaders,
    });
    return maybeTransformResponse(response, targetUrl, options);
  }

  // Convert undici body to Web ReadableStream
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const cleanup = () => {
        if (!closed) {
          closed = true;
          resBody.destroy();
        }
      };

      // Handle request cancellation
      if (request.signal) {
        request.signal.addEventListener("abort", cleanup);
      }

      resBody.on("data", (chunk) => {
        if (!closed && !request.signal?.aborted) {
          try {
            controller.enqueue(chunk);
          } catch {
            cleanup();
          }
        }
      });

      resBody.on("end", () => {
        if (!closed && !request.signal?.aborted) {
          closed = true;
          try {
            controller.close();
          } catch {
            // Controller might already be closed due to cancellation
          }
        }
      });

      resBody.on("error", (err) => {
        cleanup();
        if (!closed) {
          controller.error(err);
        }
      });
    },
  });

  const response = new Response(stream, {
    status: statusCode,
    headers: responseHeaders,
  });

  return maybeTransformResponse(response, targetUrl, options);
}

async function maybeTransformResponse(
  response: Response,
  targetUrl: URL,
  options: ProxyOptions
): Promise<Response> {
  if (options.onResponse) {
    const result = await options.onResponse(response, targetUrl);
    if (result instanceof Response) {
      return result;
    }
  }
  return response;
}
