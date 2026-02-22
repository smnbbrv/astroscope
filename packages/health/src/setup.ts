import { config } from 'virtual:@astroscope/health/config';
import { registerHealth } from './register.js';

registerHealth(config);
