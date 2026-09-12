import Phaser from 'phaser';
import { NativeMeshView } from './native-mesh-scene';
import {
  nativeMatrix,
  nativeVertices,
  type NativeMatrix,
  type NativeMeshPose,
  type NativeScenePose,
} from './native-mesh';

type NativeObject = Phaser.GameObjects.Mesh2D | Phaser.GameObjects.RenderTexture;
const additiveModes = new WeakMap<Phaser.Renderer.WebGL.WebGLRenderer, number>();
function additiveMode(renderer: Phaser.Renderer.WebGL.WebGLRenderer) {
  let mode = additiveModes.get(renderer);
  if (mode === undefined) {
    const gl = renderer.gl;
    // Phaser ADD uses DST_ALPHA for the destination, which darkens partially
    // transparent intermediate buffers. Preserve destination RGB inside groups.
    // Phaser 4.2.1 addBlendMode returns the preceding index and accepts only
    // combined factors. Capture the allocated slot and set separate alpha here.
    mode = renderer.blendModes.length;
    renderer.addBlendMode([gl.ONE, gl.ONE], gl.FUNC_ADD);
    renderer.updateBlendMode(mode, [gl.ONE, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA], gl.FUNC_ADD);
    additiveModes.set(renderer, mode);
  }
  return mode;
}

function transformed(poses: readonly NativeScenePose[], matrix: NativeMatrix): NativeScenePose[] {
  return poses.map((pose) =>
    'group' in pose
      ? { ...pose, group: transformed(pose.group, matrix) }
      : { ...pose, matrix: nativeMatrix(matrix, pose.matrix) },
  );
}

export function nativeSceneBounds(
  poses: readonly NativeScenePose[],
): [number, number, number, number] | undefined {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const pose of poses) {
    if ('group' in pose) {
      const bounds = nativeSceneBounds(pose.group);
      if (bounds) {
        left = Math.min(left, bounds[0]);
        top = Math.min(top, bounds[1]);
        right = Math.max(right, bounds[2]);
        bottom = Math.max(bottom, bounds[3]);
      }
    } else {
      const v = nativeVertices(pose);
      for (let i = 0; i < v.length; i += 4) {
        left = Math.min(left, v[i]);
        top = Math.min(top, v[i + 1]);
        right = Math.max(right, v[i]);
        bottom = Math.max(bottom, v[i + 1]);
      }
    }
  }
  return left === Infinity ? undefined : [left, top, right, bottom];
}

/** Retains native polygons and composites additive containers in separate GPU buffers. */
export class NativeSceneView {
  private leaves: NativeMeshView;
  readonly groups = new Map<
    string,
    { image: Phaser.GameObjects.RenderTexture; content: NativeSceneView }
  >();
  objects: NativeObject[] = [];
  constructor(
    private scene: Phaser.Scene,
    private prefix: string,
    private detached = false,
  ) {
    this.leaves = new NativeMeshView(
      scene,
      prefix,
      additiveMode(scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer),
    );
    if (!detached)
      scene.game.renderer.on(Phaser.Renderer.Events.LOSE_WEBGL, this.onContextLost, this);
  }
  private onContextLost() {
    for (const entry of this.groups.values()) {
      // Phaser 4.2.1 tries deleting stale framebuffer/renderbuffer handles in
      // the restored context. Lost-context resources are already invalidated;
      // drop the old handle so its wrapper only recreates the attachments.
      const texture = entry.image.texture as Phaser.Textures.DynamicTexture;
      texture.drawingContext.framebuffer.webGLFramebuffer = null;
      entry.content.onContextLost();
    }
  }
  get meshes() {
    return this.leaves.meshes;
  }
  render(
    poses: readonly NativeScenePose[],
    x: number,
    y: number,
    depth: number,
    alpha = 1,
    density = Math.max(1, this.scene.cameras.main.zoomX, this.scene.cameras.main.zoomY),
  ) {
    this.leaves.render(
      poses.filter((p): p is NativeMeshPose => !('group' in p)),
      x,
      y,
      depth,
      alpha,
    );
    this.objects = [];
    const wanted = new Set<string>();
    for (const [order, pose] of poses.entries()) {
      let object: NativeObject;
      if ('group' in pose) {
        const bounds = nativeSceneBounds(pose.group);
        if (!bounds) continue;
        wanted.add(pose.key);
        // Pixel-aligned edges and a transparent guard texel avoid clipping the
        // source strips. Buffers follow physical camera zoom, including retina.
        const left = Math.floor(bounds[0] * density) - 1,
          top = Math.floor(bounds[1] * density) - 1;
        const width = Math.ceil(bounds[2] * density) - left + 1,
          height = Math.ceil(bounds[3] * density) - top + 1;
        let entry = this.groups.get(pose.key);
        if (!entry) {
          entry = {
            image: this.scene.add.renderTexture(0, 0, width, height),
            content: new NativeSceneView(this.scene, this.prefix, true),
          };
          entry.image
            .setOrigin(0, 0)
            .setBlendMode(
              additiveMode(this.scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer),
            );
          this.groups.set(pose.key, entry);
        }
        entry.content.render(
          transformed(pose.group, [density, 0, -left, 0, density, -top]),
          0,
          0,
          0,
          1,
          1,
        );
        entry.image
          .resize(width, height)
          .setPosition(x + left / density, y + top / density)
          .setScale(1 / density)
          .setAlpha(alpha * pose.multiply[3]);
        (entry.image.texture as Phaser.Textures.DynamicTexture).commandBuffer.length = 0;
        entry.image.clear().draw(entry.content.objects).setRenderMode('all', true);
        object = entry.image;
      } else object = this.meshes.get(pose.key)!;
      object.setDepth(depth + order * 0.0001).setVisible(true);
      if (this.detached) object.removeFromDisplayList();
      this.objects.push(object);
    }
    for (const [key, entry] of this.groups)
      if (!wanted.has(key)) {
        entry.content.destroy();
        entry.image.destroy();
        this.groups.delete(key);
      }
  }
  clear() {
    this.leaves.clear();
    for (const entry of this.groups.values()) {
      entry.content.destroy();
      entry.image.destroy();
    }
    this.groups.clear();
    this.objects = [];
  }
  destroy() {
    if (!this.detached)
      this.scene.game.renderer.off(Phaser.Renderer.Events.LOSE_WEBGL, this.onContextLost, this);
    this.clear();
  }
}
