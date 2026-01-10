declare module 'virtual:@astroscope/i18n/manifest' {
  import type { ExtractionManifest } from './extraction/types.js';
  export const manifest: ExtractionManifest;
  export function getManifest(): ExtractionManifest;
}
