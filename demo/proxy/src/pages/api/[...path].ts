import { createProxyHandler } from '@astroscope/proxy';

export const ALL = createProxyHandler({
  upstream: 'https://jsonplaceholder.typicode.com',
  onRequest: (request, targetUrl) => {
    targetUrl.pathname = targetUrl.pathname.replace(/^\/api/, '');
    console.log(`Proxying: ${request.method} ${targetUrl}`);
    return request;
  },
  onResponse: (response, targetUrl) => {
    console.log(`Response: ${response.status} from ${targetUrl}`);
    return response;
  },
});
