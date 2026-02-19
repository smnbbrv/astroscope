export interface Wormhole<T> {
  readonly name: string;
  readonly key: string;
  get(): T;
  set(data: T): void;
  subscribe(fn: (data: T) => void): () => void;
}
