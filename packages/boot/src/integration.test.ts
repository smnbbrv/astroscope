import { describe, expect, test } from 'bun:test';
import { getServerDefaults } from './integration';
import boot from './index';

describe('boot', () => {
  test('returns an Astro integration', () => {
    const integration = boot();

    expect(integration.name).toBe('@astroscope/boot');
    expect(integration.hooks).toBeDefined();
    expect(integration.hooks['astro:config:setup']).toBeFunction();
  });

  test('accepts custom entry option', () => {
    const integration = boot({ entry: 'src/custom-boot.ts' });

    expect(integration.name).toBe('@astroscope/boot');
  });

  test('accepts hmr option', () => {
    const integration = boot({ hmr: true });

    expect(integration.name).toBe('@astroscope/boot');
  });
});

describe('getServerDefaults', () => {
  test('returns localhost:4321 for null config', () => {
    const result = getServerDefaults(null);

    expect(result.host).toBe('localhost');
    expect(result.port).toBe(4321);
  });

  test('returns localhost:4321 for empty config', () => {
    const result = getServerDefaults({} as never);

    expect(result.host).toBe('localhost');
    expect(result.port).toBe(4321);
  });

  test('returns string host from config', () => {
    const result = getServerDefaults({ server: { host: '192.168.1.1' } } as never);

    expect(result.host).toBe('192.168.1.1');
  });

  test('returns 0.0.0.0 when host is true', () => {
    const result = getServerDefaults({ server: { host: true } } as never);

    expect(result.host).toBe('0.0.0.0');
  });

  test('returns localhost when host is false', () => {
    const result = getServerDefaults({ server: { host: false } } as never);

    expect(result.host).toBe('localhost');
  });

  test('returns custom port from config', () => {
    const result = getServerDefaults({ server: { port: 3000 } } as never);

    expect(result.port).toBe(3000);
  });

  test('returns both custom host and port', () => {
    const result = getServerDefaults({ server: { host: '0.0.0.0', port: 8080 } } as never);

    expect(result.host).toBe('0.0.0.0');
    expect(result.port).toBe(8080);
  });
});
