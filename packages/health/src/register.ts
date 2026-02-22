import { on } from '@astroscope/boot/events';
import { type HealthServerOptions, probes, server } from 'health-probes';

export function registerHealth(config: HealthServerOptions) {
  on('beforeOnStartup', () => {
    server.start(config);

    probes.live.enable();
  });

  on('afterOnStartup', () => {
    probes.startup.enable();
    probes.ready.enable();
  });

  on('beforeOnShutdown', () => {
    probes.ready.disable();
  });

  on('afterOnShutdown', async () => {
    await server.stop();
  });
}
