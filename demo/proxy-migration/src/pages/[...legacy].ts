import { createProxyHandler } from '@astroscope/proxy';

export const ALL = createProxyHandler({
  upstream: 'https://httpbin.org',
  onRequest: (request, targetUrl) => {
    console.log(`[proxy] Forwarding to legacy: ${request.method} ${targetUrl.pathname}`);
    return request;
  },
  onResponse: (response, targetUrl) => {
    console.log(`[proxy] Legacy responded: ${response.status} for ${targetUrl.pathname}`);
    return response;
  },
});
