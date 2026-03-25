// @ts-expect-error virtual module provided by integration
import { staticDir } from 'virtual:@astroscope/hyperspace/config';

import { createHyperspaceMiddleware } from './middleware.js';

const configStaticDir = staticDir as string;

export const onRequest = createHyperspaceMiddleware(configStaticDir);
