import type Phaser from 'phaser';

/**
 * Images the scene fetches when something first needs them instead of at boot: per-level
 * fallback sprites a starter village never draws. Callers draw a loaded stand-in meanwhile and
 * restyle when `revision` moves.
 */
export class LazyTextures {
  /** Increments whenever a requested texture arrives. */
  revision = 0;
  private pending = new Map<string, Promise<void>>();
  private retryAt = new Map<string, number>();
  constructor(private scene: Phaser.Scene) {}
  /** Whether `key` is loaded. When it is not, it starts loading from `url`. */
  has(key: string, url: string) {
    if (this.scene.textures.exists(key)) return true;
    void this.request(key, url);
    return false;
  }
  /** Loads `key` from `url` unless it is loaded or loading; resolves when it is in (or failed). */
  request(key: string, url: string): Promise<void> {
    if (this.scene.textures.exists(key)) return Promise.resolve();
    const pending = this.pending.get(key);
    if (pending) return pending;
    if ((this.retryAt.get(key) ?? 0) > performance.now()) return Promise.resolve();
    const job = this.fetch(key, url).finally(() => this.pending.delete(key));
    this.pending.set(key, job);
    return job;
  }
  private async fetch(key: string, url: string) {
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!this.scene.textures.exists(key)) this.scene.textures.addImage(key, image);
      this.revision++;
    } catch (error) {
      // A texture that fails is asked for again after five seconds.
      this.retryAt.set(key, performance.now() + 5000);
      console.error('Deferred texture', key, error);
    }
  }
}
