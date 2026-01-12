import { createProxyHandler } from '@astroscope/proxy';

export const ALL = createProxyHandler({
  upstream: 'https://httpbin.org',
  onRequest: (context, targetUrl) => {
    console.log(`[proxy] Forwarding to legacy: ${context.request.method} ${targetUrl.pathname}`);
  },
  onResponse: (_context, response, targetUrl) => {
    console.log(`[proxy] Legacy responded: ${response.status} for ${targetUrl.pathname}`);
  },
});
