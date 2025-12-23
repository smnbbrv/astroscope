import type { ExcludePattern } from '@astroscope/excludes';
// @ts-expect-error virtual module provided by integration
import { exclude } from 'virtual:@astroscope/pino/config';
import { createPinoMiddleware } from './middleware.js';

const configExclude = exclude as ExcludePattern[];

export const onRequest = createPinoMiddleware({
  exclude: configExclude,
});
