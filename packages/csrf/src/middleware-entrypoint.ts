// @ts-expect-error - virtual module
import { enabled, excludePatterns } from 'virtual:@astroscope/csrf/config';
import { createCsrfMiddleware } from './middleware.js';

export const onRequest = createCsrfMiddleware({ enabled, exclude: excludePatterns });
