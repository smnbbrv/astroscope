import { type ViteDevServer, isRunnableDevEnvironment } from 'vite';

/**
 * load a module via the Vite Environment API.
 */
export async function ssrImport<T = Record<string, unknown>>(server: ViteDevServer, moduleId: string): Promise<T> {
  const ssr = server.environments['ssr'];

  if (!isRunnableDevEnvironment(ssr)) {
    throw new Error('SSR environment is not runnable');
  }

  return ssr.runner.import(moduleId) as Promise<T>;
}
