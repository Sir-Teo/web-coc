import Phaser from 'phaser';
import { nativeBlendMode } from './native-blend';
import { configureNativeTriangleRendering } from './quad-renderer';
import {
  nativeMeshTexture,
  nativeTriangles,
  nativeVertices,
  type NativeMeshGraph,
  type NativeMeshPose,
} from './native-mesh';

export { nativeMeshTexture };

export function preloadNativeMeshes(scene: Phaser.Scene, graph: NativeMeshGraph, prefix: string) {
  for (const [id, texture] of Object.entries(graph.textures))
    scene.load.image(nativeMeshTexture(prefix, id), '/' + texture.path);
}

/**
 * Source multiply/add colors are applied per texel before bilinear sampling.
 * X-Bow RGB variants only use the small packed projectile texture; building
 * textures keep their original pixels. Alpha remains on each retained mesh.
 */
const TINT_ORDER: string[] = [];
const MAX_TINTED_TEXTURES = 256;
/**
 * Meshes a tinted texture is drawing right now. A mesh holds the `Frame` itself, not its key,
 * so removing a texture still on screen leaves that frame without a source and the triangle
 * batcher throws reading its `glTexture` — which ends the frame, and with it the game loop.
 */
const TINT_REFS = new Map<string, number>();
const isTinted = (key: string) => key.includes(':color:');
export function retainTint(key: string) {
  if (isTinted(key)) TINT_REFS.set(key, (TINT_REFS.get(key) ?? 0) + 1);
}
export function releaseTint(key: string) {
  if (!isTinted(key)) return;
  const left = (TINT_REFS.get(key) ?? 0) - 1;
  if (left > 0) TINT_REFS.set(key, left);
  else TINT_REFS.delete(key);
}
function tintedTexture(scene: Phaser.Scene, prefix: string, pose: NativeMeshPose) {
  const original = nativeMeshTexture(prefix, pose.texture);
  const mul = pose.multiply.slice(0, 3),
    add = pose.add.slice(0, 3);
  if (mul.every((v) => v === 1) && add.every((v) => v === 0)) return original;
  const key = `${original}:color:${[...mul, ...add].join(',')}`;
  if (scene.textures.exists(key)) {
    // Refresh LRU order on hit.
    const at = TINT_ORDER.indexOf(key);
    if (at >= 0) {
      TINT_ORDER.splice(at, 1);
      TINT_ORDER.push(key);
    }
    return key;
  }
  const image = scene.textures.get(original).getSourceImage() as HTMLImageElement;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw Error('Native color transform needs a 2D canvas');
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4)
    for (let c = 0; c < 3; c++)
      pixels.data[i + c] = Math.round(
        Math.min(255, Math.max(0, pixels.data[i + c] * mul[c] + add[c] * 255)),
      );
  ctx.putImageData(pixels, 0, 0);
  scene.textures.addCanvas(key, canvas);
  TINT_ORDER.push(key);
  // Evict only what nothing is drawing; a texture in use waits for its meshes to let it go.
  for (let scan = TINT_ORDER.length; TINT_ORDER.length > MAX_TINTED_TEXTURES && scan > 0; scan--) {
    const oldest = TINT_ORDER.shift()!;
    if (oldest === key || TINT_REFS.has(oldest)) {
      TINT_ORDER.push(oldest);
      continue;
    }
    if (scene.textures.exists(oldest)) scene.textures.remove(oldest);
  }
  return key;
}

/** Retained polygon meshes follow the caller's battle/replay clock, with no tweens. */
export class NativeMeshView {
  readonly meshes = new Map<string, Phaser.GameObjects.Mesh2D>();
  constructor(
    private scene: Phaser.Scene,
    private prefix: string,
  ) {
    configureNativeTriangleRendering(scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer);
  }
  render(poses: readonly NativeMeshPose[], x: number, y: number, depth: number, alpha = 1) {
    const wanted = new Set<string>();
    for (const [order, pose] of poses.entries()) {
      wanted.add(pose.key);
      // Multiply-only tints run on the GPU via the mesh tint: no canvas bake,
      // no texture upload and no eviction pressure. Anything with an additive
      // term, or a multiply outside the 0..1 tint range, still bakes.
      const mul = pose.multiply.slice(0, 3);
      const add = pose.add.slice(0, 3);
      const identityMul = mul.every((v) => v === 1);
      const hasAdd = add.some((v) => v !== 0);
      const gpuTintable =
        !hasAdd && !identityMul && mul.every((v) => v >= 0 && v <= 1);
      let texture: string;
      let tint: number | undefined;
      if (gpuTintable) {
        texture = nativeMeshTexture(this.prefix, pose.texture);
        tint =
          (Math.round(mul[0] * 255) << 16) |
          (Math.round(mul[1] * 255) << 8) |
          Math.round(mul[2] * 255);
      } else {
        texture = tintedTexture(this.scene, this.prefix, pose);
        tint = undefined;
      }
      const vertices = nativeVertices(pose);
      const indices = nativeTriangles(vertices);
      let mesh = this.meshes.get(pose.key);
      if (!mesh) {
        mesh = this.scene.add.mesh2d(x, y, texture, vertices, indices, true);
        mesh.setOrigin(0, 0).setRenderAsTriangles(true);
        this.meshes.set(pose.key, mesh);
        retainTint(texture);
      }
      if (mesh.indices !== indices) mesh.indices = indices;
      else if (mesh.vertices.length !== vertices.length) mesh.vertices = vertices;
      else {
        let same = true;
        const current = mesh.vertices;
        for (let i = 0; i < vertices.length; i++)
          if (current[i] !== vertices[i]) {
            same = false;
            break;
          }
        if (!same) mesh.vertices = vertices;
      }
      if (mesh.texture.key !== texture) {
        releaseTint(mesh.texture.key);
        retainTint(texture);
        mesh.setTexture(texture);
      }
      const tinted = mesh as unknown as {
        tint: number;
        setTint(color: number): void;
        clearTint(): void;
      };
      if (tint === undefined) {
        if (tinted.tint !== 0xffffff) tinted.clearTint();
      } else if (tinted.tint !== tint) tinted.setTint(tint);
      if (mesh.x !== x || mesh.y !== y) mesh.setPosition(x, y);
      const wantDepth = depth + order * 0.0001;
      if (mesh.depth !== wantDepth) mesh.setDepth(wantDepth);
      const wantAlpha = alpha * pose.multiply[3];
      if (mesh.alpha !== wantAlpha) mesh.setAlpha(wantAlpha);
      const wantBlend = nativeBlendMode(
        this.scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer,
        pose.blend,
      );
      if ((mesh as unknown as { blendMode: unknown }).blendMode !== wantBlend)
        mesh.setBlendMode(wantBlend);
      if (!mesh.visible) mesh.setVisible(true);
    }
    for (const [key, mesh] of this.meshes)
      if (!wanted.has(key)) {
        releaseTint(mesh.texture.key);
        mesh.destroy();
        this.meshes.delete(key);
      }
  }
  clear() {
    for (const mesh of this.meshes.values()) {
      releaseTint(mesh.texture.key);
      mesh.destroy();
    }
    this.meshes.clear();
  }
  destroy() {
    this.clear();
  }
}
