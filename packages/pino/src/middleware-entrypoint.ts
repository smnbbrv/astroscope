import type { ExcludePattern } from '@astroscope/excludes';
// @ts-expect-error virtual module provided by integration
import { exclude, extended } from 'virtual:@astroscope/pino/config';
import { createPinoMiddleware } from './middleware.js';

const configExclude = exclude as ExcludePattern[];
const configExtended = extended as boolean;

export const onRequest = createPinoMiddleware({
  exclude: configExclude,
  extended: configExtended,
});
