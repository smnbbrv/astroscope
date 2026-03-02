/**
 * A wormhole transfers state from server middleware to client-side components.
 *
 * **Security:** wormhole data is serialized into an inline `<script>` tag and sent to the browser.
 * Never store secrets (tokens, API keys, credentials) in a wormhole.
 */
export interface Wormhole<T> {
  readonly name: string;
  readonly key: string;
  get(): T;
  /**
   * Update the wormhole value on the **client only**.
   * Throws on the server — use `open(wormhole, data, fn)` from `@astroscope/wormhole/server` instead.
   */
  set(data: T): void;
  subscribe(fn: (data: T) => void): () => void;
}
