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

/**
 * Fetches graph.json packs and decodes their cropped source texture pages once per session.
 * A pack is returned only after every texture is registered, so callers can fall back while loading.
 */
export class NativeArtPacks<T extends { scenes: Record<string, NativeMeshGraph> }> {
  private packs = new Map<string, T>();
  private pending = new Set<string>();
  private failed = new Set<string>();
  private alive = true;
  constructor(private scene: Phaser.Scene) {}
  get(path: string): T | undefined {
    const pack = this.packs.get(path);
    if (!pack) void this.load(path);
    return pack;
  }
  /** True when a pack could not be fetched; callers keep their drawn fallback. */
  unavailable(path: string) {
    return this.failed.has(path);
  }
  private async load(path: string) {
    if (this.pending.has(path) || this.failed.has(path)) return;
    this.pending.add(path);
    try {
      const response = await fetch('/' + path);
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const pack = (await response.json()) as T;
      await Promise.all(
        Object.entries(pack.scenes).flatMap(([name, graph]) =>
          Object.entries(graph.textures).map(async ([id, texture]) => {
            const key = nativeMeshTexture(nativePackPrefix(path, name), id);
            if (this.scene.textures.exists(key)) return;
            const image = new Image();
            image.src = '/' + texture.path;
            await image.decode();
            if (this.alive && !this.scene.textures.exists(key))
              this.scene.textures.addImage(key, image);
          }),
        ),
      );
      if (this.alive) this.packs.set(path, pack);
    } catch (error) {
      this.failed.add(path);
      console.error('Native battle artwork', path, error);
    } finally {
      this.pending.delete(path);
    }
  }
  destroy() {
    this.alive = false;
  }
}
