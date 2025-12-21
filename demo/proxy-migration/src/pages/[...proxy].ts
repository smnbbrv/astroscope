import { createProxyHandler } from "@astroscope/proxy";

// Catch-all route: forward unhandled requests to the legacy backend.
// As you build new Astro pages, they take precedence over this route.
//
// Example: If you create src/pages/contact.astro, requests to /contact
// will be handled by Astro instead of being proxied.

export const ALL = createProxyHandler({
  // Using httpbin.org as a stand-in for a legacy backend
  // In a real migration, this would be your WordPress, Rails, Django, etc. server
  upstream: "https://httpbin.org",
  onRequest: (request, targetUrl) => {
    console.log(`[proxy] Forwarding to legacy: ${request.method} ${targetUrl.pathname}`);
    return request;
  },
  onResponse: (response, targetUrl) => {
    // You could modify responses here, e.g., inject a migration banner
    console.log(`[proxy] Legacy responded: ${response.status} for ${targetUrl.pathname}`);
    return response;
  },
});
