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
function tintedTexture(scene: Phaser.Scene, prefix: string, pose: NativeMeshPose) {
  const original = nativeMeshTexture(prefix, pose.texture);
  const mul = pose.multiply.slice(0, 3),
    add = pose.add.slice(0, 3);
  if (mul.every((v) => v === 1) && add.every((v) => v === 0)) return original;
  const key = `${original}:color:${[...mul, ...add].join(',')}`;
  if (scene.textures.exists(key)) return key;
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
      const texture = tintedTexture(this.scene, this.prefix, pose);
      const vertices = nativeVertices(pose);
      let mesh = this.meshes.get(pose.key);
      if (!mesh) {
        mesh = this.scene.add.mesh2d(x, y, texture, vertices, nativeTriangles(vertices), true);
        mesh.setOrigin(0, 0).setRenderAsTriangles(true);
        this.meshes.set(pose.key, mesh);
      }
      mesh.vertices = vertices;
      mesh.indices = nativeTriangles(vertices);
      mesh
        .setTexture(texture)
        .setPosition(x, y)
        .setDepth(depth + order * 0.0001)
        .setAlpha(alpha * pose.multiply[3])
        .setBlendMode(
          nativeBlendMode(
            this.scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer,
            pose.blend,
          ),
        )
        .setVisible(true);
    }
    for (const [key, mesh] of this.meshes)
      if (!wanted.has(key)) {
        mesh.destroy();
        this.meshes.delete(key);
      }
  }
  clear() {
    for (const mesh of this.meshes.values()) mesh.destroy();
    this.meshes.clear();
  }
  destroy() {
    this.clear();
  }
}
