import type Phaser from 'phaser';
import { nativeMeshTexture, type NativeMeshGraph } from './native-mesh';

export type NativeRow = Readonly<Record<string, string>>;
/** Shared shape of the lazily fetched battle art packs (projectiles, effects, defenses). */
export interface NativeArtPack {
  effects: Record<string, NativeRow[]>;
  emitters: Record<string, NativeRow[]>;
  scenes: Record<string, NativeMeshGraph>;
  skipped?: Record<string, string>;
}

/** `sc/buildings.sc` -> `buildings`; rows that leave the SWF blank default to the building scene. */
export const nativeSceneId = (swf: string | undefined) =>
  (swf || 'sc/buildings.sc').split('/').at(-1)!.replace(/\.sc$/, '');

/** Texture namespace of one scene inside one pack, for NativeSceneView and NativeMeshView. */
export const nativePackPrefix = (path: string, scene: string) => `pack:${path}:${scene}`;

interface TextureLease {
  texture: Phaser.Textures.Texture;
  owners: number;
  created: boolean;
}
const textureLeases = new WeakMap<Phaser.Textures.TextureManager, Map<string, TextureLease>>();

/** Packs may share a texture manager; only the final owner can remove a pack-created texture. */
function retainTexture(manager: Phaser.Textures.TextureManager, key: string, created: boolean) {
  let leases = textureLeases.get(manager);
  if (!leases) textureLeases.set(manager, (leases = new Map()));
  const texture = manager.get(key);
  let lease = leases.get(key);
  if (!lease || lease.texture !== texture) {
    lease = { texture, owners: 0, created };
    leases.set(key, lease);
  }
  const retained = lease;
  retained.owners++;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    if (--retained.owners) return;
    if (retained.created && manager.exists(key) && manager.get(key) === retained.texture)
      manager.remove(key);
    if (leases.get(key) === retained) leases.delete(key);
  };
}

/**
 * Fetches graph.json packs and retains their cropped source texture pages while this loader lives.
 * A pack is returned only after every texture is registered, so callers can fall back while loading.
 */
export class NativeArtPacks<T extends { scenes: Record<string, NativeMeshGraph> }> {
  private packs = new Map<string, T>();
  private pending = new Set<string>();
  private ownedTextures = new Map<string, () => void>();
  /** Packs whose last request failed, and when (performance.now ms) to request them again. */
  private failed = new Map<string, { attempts: number; retryAt: number }>();
  private alive = true;
  /** Back online: every failed pack is due for another request. */
  private online = () => {
    for (const failure of this.failed.values()) failure.retryAt = 0;
  };
  constructor(private scene: Phaser.Scene) {
    if (typeof window !== 'undefined') window.addEventListener('online', this.online);
  }
  get(path: string): T | undefined {
    if (!this.alive) return undefined;
    const pack = this.packs.get(path);
    if (!pack) void this.load(path);
    return pack;
  }
  /** True while a pack's last request failed; callers keep their drawn fallback meanwhile. */
  unavailable(path: string) {
    return this.failed.has(path);
  }
  private async load(path: string) {
    if (!this.alive || this.pending.has(path)) return;
    // A failed pack is requested again after a bounded backoff (5 s doubling to five minutes).
    const failure = this.failed.get(path);
    if (failure && performance.now() < failure.retryAt) return;
    this.pending.add(path);
    const acquired = new Set<string>();
    let active = true;
    try {
      const response = await fetch('/' + path);
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const pack = (await response.json()) as T;
      if (!this.alive) return;
      await Promise.all(
        Object.entries(pack.scenes).flatMap(([name, graph]) =>
          Object.entries(graph.textures).map(async ([id, texture]) => {
            const key = nativeMeshTexture(nativePackPrefix(path, name), id);
            let created = false;
            if (!this.scene.textures.exists(key)) {
              const image = new Image();
              image.src = '/' + texture.path;
              await image.decode();
              if (!this.alive || !active) return;
              if (!this.scene.textures.exists(key)) {
                this.scene.textures.addImage(key, image);
                created = true;
              }
            }
            if (!this.alive || !active) return;
            if (!this.scene.textures.exists(key))
              throw Error(`Texture registration failed: ${key}`);
            acquired.add(key);
            if (!this.ownedTextures.has(key))
              this.ownedTextures.set(key, retainTexture(this.scene.textures, key, created));
          }),
        ),
      );
      if (this.alive) {
        this.packs.set(path, pack);
        this.failed.delete(path);
      }
    } catch (error) {
      active = false;
      for (const key of acquired) this.releaseTexture(key);
      if (!this.alive) return;
      const attempts = (failure?.attempts ?? 0) + 1;
      this.failed.set(path, {
        attempts,
        retryAt: performance.now() + Math.min(300_000, 5000 * 2 ** (attempts - 1)),
      });
      console.error('Native battle artwork', path, error);
    } finally {
      this.pending.delete(path);
    }
  }
  private releaseTexture(key: string) {
    this.ownedTextures.get(key)?.();
    this.ownedTextures.delete(key);
  }
  destroy() {
    if (!this.alive) return;
    this.alive = false;
    if (typeof window !== 'undefined') window.removeEventListener('online', this.online);
    for (const key of this.ownedTextures.keys()) this.releaseTexture(key);
    this.packs.clear();
    this.pending.clear();
    this.failed.clear();
  }
}
