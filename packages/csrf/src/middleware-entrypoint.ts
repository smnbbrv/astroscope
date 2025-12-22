// @ts-expect-error - virtual module
import { enabled, excludePatterns, origins, trustProxy } from 'virtual:@astroscope/csrf/config';
import { createCsrfMiddleware } from './middleware.js';
import type { CsrfMiddlewareOptions } from './types.js';

const options: CsrfMiddlewareOptions = trustProxy
  ? { enabled, exclude: excludePatterns, trustProxy: true as const }
  : { enabled, exclude: excludePatterns, origin: origins };

export const onRequest = createCsrfMiddleware(options);
