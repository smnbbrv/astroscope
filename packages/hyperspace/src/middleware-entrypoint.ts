import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHyperspaceMiddleware } from './middleware.js';

const staticDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'hyperclient');

export const onRequest = createHyperspaceMiddleware(staticDir);
