import Phaser from 'phaser';
import { nativeBlendMode } from './native-blend';
import { PART_DEPTH_STEP } from './unit-depth';
import { configureNativeTriangleRendering, NATIVE_COLOR_TINT_MODE } from './quad-renderer';
import {
  nativeMeshTexture,
  nativeTriangles,
  type NativeMeshGraph,
  type NativeMeshPose,
  type NativeScenePose,
} from './native-mesh';

export { nativeMeshTexture };

export function preloadNativeMeshes(scene: Phaser.Scene, graph: NativeMeshGraph, prefix: string) {
  for (const [id, texture] of Object.entries(graph.textures))
    scene.load.image(nativeMeshTexture(prefix, id), '/' + texture.path);
}

/**
 * Source multiply/add colors run on the GPU (NATIVE_COLOR_TINT_MODE: tint = multiply, tint2 =
 * add) whenever no texel can saturate (multiply + add <= 1 per channel). The source applies the
 * color per texel before bilinear filtering, so saturating colors (and colors outside 0..1) bake
 * the texels their leaf samples instead; see tintedTexture. LRU order of baked textures (bytes).
 */
const TINT_ORDER = new Map<string, number>();
/** Baked textures are texel copies: budget bytes, not texture count. */
const MAX_TINTED_BYTES = 32 << 20;
let tintedBytesTotal = 0;
/** Baked colors quantize to byte steps (source colors are 8-bit) so keys stay bounded. */
const TINT_STEP = 255;
/**
 * Meshes a tinted texture is drawing right now. A mesh holds the `Frame` itself, not its key,
 * so removing a texture still on screen leaves that frame without a source and the triangle
 * batcher throws reading its `glTexture` — which ends the frame, and with it the game loop.
 */
const TINT_REFS = new Map<string, number>();
const isTinted = (key: string) => key.includes(':color:');
let tintTextures: Phaser.Textures.TextureManager | undefined;
export function retainTint(key: string) {
  if (isTinted(key)) TINT_REFS.set(key, (TINT_REFS.get(key) ?? 0) + 1);
}
export function releaseTint(key: string) {
  if (!isTinted(key)) return;
  const left = (TINT_REFS.get(key) ?? 0) - 1;
  if (left > 0) TINT_REFS.set(key, left);
  else {
    TINT_REFS.delete(key);
    evictTints();
  }
}
/** Drops least recently used unreferenced pages while over budget. */
function evictTints(keep?: string) {
  if (tintedBytesTotal <= MAX_TINTED_BYTES || !tintTextures) return;
  for (const [key, bytes] of TINT_ORDER) {
    if (tintedBytesTotal <= MAX_TINTED_BYTES) break;
    if (key === keep || TINT_REFS.has(key)) continue;
    if (tintTextures.exists(key)) tintTextures.remove(key);
    tintedBytesTotal -= bytes;
    TINT_ORDER.delete(key);
  }
}
const q = (v: number) => Math.round(v * TINT_STEP) / TINT_STEP;

/** Texel region (top-down image pixels) a leaf samples, with a bilinear guard margin. */
interface TintRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
}
const regions = new WeakMap<readonly number[], TintRegion>();
function leafRegion(vertices: readonly number[], pageWidth: number, pageHeight: number) {
  let region = regions.get(vertices);
  if (region && region.pageWidth === pageWidth && region.pageHeight === pageHeight) return region;
  let u0 = Infinity,
    v0 = Infinity,
    u1 = -Infinity,
    v1 = -Infinity;
  for (let i = 0; i < vertices.length; i += 4) {
    u0 = Math.min(u0, vertices[i + 2]);
    u1 = Math.max(u1, vertices[i + 2]);
    v0 = Math.min(v0, vertices[i + 3]);
    v1 = Math.max(v1, vertices[i + 3]);
  }
  const x = Math.max(0, Math.floor(u0 * pageWidth) - 2),
    y = Math.max(0, Math.floor(v0 * pageHeight) - 2);
  region = {
    x,
    y,
    width: Math.max(1, Math.min(pageWidth, Math.ceil(u1 * pageWidth) + 2) - x),
    height: Math.max(1, Math.min(pageHeight, Math.ceil(v1 * pageHeight) + 2) - y),
    pageWidth,
    pageHeight,
  };
  regions.set(vertices, region);
  return region;
}

/**
 * Bakes the leaf's source color into a copy of only the texels it samples (plus a guard band),
 * keyed by page, region and byte-quantized color, so animated colors reuse a bounded set of small
 * textures instead of re-baking whole 8-64 MB pages. The caller remaps UVs into the region.
 */
function tintedTexture(
  scene: Phaser.Scene,
  original: string,
  pose: NativeMeshPose,
): { key: string; region: TintRegion } {
  const image = scene.textures.get(original).getSourceImage() as HTMLImageElement;
  const region = leafRegion(pose.vertices, image.width, image.height);
  const m = pose.multiply,
    a = pose.add;
  const mul0 = q(m[0]),
    mul1 = q(m[1]),
    mul2 = q(m[2]),
    add0 = q(a[0]),
    add1 = q(a[1]),
    add2 = q(a[2]);
  const key =
    original +
    ':color:' +
    region.x +
    ',' +
    region.y +
    ',' +
    region.width +
    ',' +
    region.height +
    ':' +
    mul0 +
    ',' +
    mul1 +
    ',' +
    mul2 +
    ',' +
    add0 +
    ',' +
    add1 +
    ',' +
    add2;
  const bytes = TINT_ORDER.get(key);
  if (bytes !== undefined && scene.textures.exists(key)) {
    // Refresh LRU order on hit.
    TINT_ORDER.delete(key);
    TINT_ORDER.set(key, bytes);
    return { key, region };
  }
  tintTextures = scene.textures;
  const canvas = document.createElement('canvas');
  canvas.width = region.width;
  canvas.height = region.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw Error('Native color transform needs a 2D canvas');
  ctx.drawImage(
    image,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height,
  );
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  const mul = [mul0, mul1, mul2],
    add = [add0 * 255, add1 * 255, add2 * 255];
  for (let i = 0; i < data.length; i += 4)
    for (let c = 0; c < 3; c++)
      data[i + c] = Math.round(Math.min(255, Math.max(0, data[i + c] * mul[c] + add[c])));
  ctx.putImageData(pixels, 0, 0);
  scene.textures.addCanvas(key, canvas);
  const size = canvas.width * canvas.height * 4;
  TINT_ORDER.set(key, size);
  tintedBytesTotal += size;
  // Evict only what nothing is drawing; a texture in use waits for its meshes to let it go.
  evictTints(key);
  return { key, region };
}

const white = (m: readonly number[]) => m[0] === 1 && m[1] === 1 && m[2] === 1;
const unit = (v: number) => v >= 0 && v <= 1;
const byte = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
const rgb = (c: readonly number[]) => (byte(c[0]) << 16) | (byte(c[1]) << 8) | byte(c[2]);

type NativeMesh = Phaser.GameObjects.Mesh2D & {
  tint: number;
  tint2: number;
  tintMode: number;
  blendMode: unknown;
  /** Render pass that last used this mesh; stale meshes are released. */
  nativeStamp: number;
};

/** Retained polygon meshes follow the caller's battle/replay clock, with no tweens. */
export class NativeMeshView {
  readonly meshes = new Map<string, Phaser.GameObjects.Mesh2D>();
  private textureKeys: string[] = [];
  private stamp = 0;
  private renderer: Phaser.Renderer.WebGL.WebGLRenderer;
  constructor(
    private scene: Phaser.Scene,
    private prefix: string,
    /** Detached meshes are drawn by an owner (a group buffer), never by the scene display list. */
    private detached = false,
  ) {
    this.renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    configureNativeTriangleRendering(this.renderer);
  }
  private baseTexture(id: number) {
    return (this.textureKeys[id] ??= nativeMeshTexture(this.prefix, id));
  }
  render(
    poses: readonly NativeScenePose[],
    x: number,
    y: number,
    depth: number,
    alpha = 1,
    /**
     * False when the caller assigns final depths itself (NativeSceneView orders
     * leaves among blend groups, a different order than the leaf list here):
     * skips a depth write that would be overwritten one line later.
     */
    assignDepth = true,
  ) {
    // Group poses are skipped: NativeSceneView passes its full list and composites groups itself.
    const stamp = ++this.stamp;
    let seen = 0;
    for (let order = 0; order < poses.length; order++) {
      const pose = poses[order];
      if ('group' in pose) continue;
      seen++;
      const m = pose.multiply,
        a = pose.add;
      const identityMul = white(m);
      const hasAdd = a[0] !== 0 || a[1] !== 0 || a[2] !== 0;
      let texture = this.baseTexture(pose.texture);
      let tint = 0xffffff,
        tint2 = 0,
        mode = 0;
      let region: TintRegion | undefined;
      if (!identityMul || hasAdd) {
        if (
          unit(m[0]) &&
          unit(m[1]) &&
          unit(m[2]) &&
          a[0] >= 0 &&
          a[1] >= 0 &&
          a[2] >= 0 &&
          // No texel can saturate, so transforming after bilinear filtering equals before.
          m[0] + a[0] <= 1 &&
          m[1] + a[1] <= 1 &&
          m[2] + a[2] <= 1
        ) {
          tint = rgb(m);
          if (hasAdd) {
            tint2 = rgb(a);
            mode = NATIVE_COLOR_TINT_MODE;
          }
        } else {
          // Saturating colors clamp per texel before filtering: bake just those texels.
          const baked = tintedTexture(this.scene, texture, pose);
          texture = baked.key;
          region = baked.region;
        }
      }
      const src = pose.vertices,
        mat = pose.matrix;
      const ma = mat[0],
        mc = mat[1],
        mx = mat[2],
        mb = mat[3],
        md = mat[4],
        my = mat[5];
      let mesh = this.meshes.get(pose.key) as NativeMesh | undefined;
      let vertices: number[];
      if (!mesh) {
        vertices = new Array<number>(src.length);
      } else {
        vertices = mesh.vertices as number[];
        if (vertices.length !== src.length) vertices = new Array<number>(src.length);
      }
      // Written in place: the triangle batcher streams every vertex each frame regardless.
      for (let i = 0; i < src.length; i += 4) {
        const sx = src[i],
          sy = src[i + 1];
        vertices[i] = ma * sx + mc * sy + mx;
        vertices[i + 1] = mb * sx + md * sy + my;
        vertices[i + 2] = src[i + 2];
        vertices[i + 3] = src[i + 3];
      }
      if (region)
        for (let i = 0; i < src.length; i += 4) {
          vertices[i + 2] = (src[i + 2] * region.pageWidth - region.x) / region.width;
          vertices[i + 3] = (src[i + 3] * region.pageHeight - region.y) / region.height;
        }
      const indices = nativeTriangles(vertices);
      if (!mesh) {
        mesh = new Phaser.GameObjects.Mesh2D(
          this.scene,
          x,
          y,
          texture,
          vertices,
          indices,
          true,
        ) as NativeMesh;
        mesh.setOrigin(0, 0).setRenderAsTriangles(true);
        if (!this.detached) this.scene.add.existing(mesh);
        this.meshes.set(pose.key, mesh);
        retainTint(texture);
      } else {
        if (mesh.vertices !== vertices) mesh.vertices = vertices;
        if (mesh.indices !== indices) mesh.indices = indices;
        if (mesh.texture.key !== texture) {
          releaseTint(mesh.texture.key);
          retainTint(texture);
          mesh.setTexture(texture);
        }
      }
      mesh.nativeStamp = stamp;
      if (mesh.tint !== tint) mesh.tint = tint;
      if (mesh.tint2 !== tint2) mesh.tint2 = tint2;
      if (mesh.tintMode !== mode) mesh.tintMode = mode;
      if (mesh.x !== x || mesh.y !== y) mesh.setPosition(x, y);
      if (assignDepth) {
        const wantDepth = depth + order * PART_DEPTH_STEP;
        if (mesh.depth !== wantDepth) mesh.setDepth(wantDepth);
      }
      const wantAlpha = alpha * m[3];
      if (mesh.alpha !== wantAlpha) mesh.setAlpha(wantAlpha);
      const wantBlend =
        pose.blend === 0 ? Phaser.BlendModes.NORMAL : nativeBlendMode(this.renderer, pose.blend);
      if (mesh.blendMode !== wantBlend) mesh.setBlendMode(wantBlend);
      if (!mesh.visible) mesh.setVisible(true);
    }
    if (seen !== this.meshes.size)
      for (const [key, mesh] of this.meshes)
        if ((mesh as NativeMesh).nativeStamp !== stamp) {
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
