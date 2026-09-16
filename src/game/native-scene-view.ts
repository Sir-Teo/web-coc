import Phaser from 'phaser';
import { NativeMeshView } from './native-mesh-scene';
import { nativeBlendMode, nativeMultiplyModes } from './native-blend';
import { NativeGroupColor } from './native-group-color';
import {
  nativeMatrix,
  nativeVertices,
  type NativeMatrix,
  type NativeMeshPose,
  type NativeScenePose,
} from './native-mesh';

type NativeObject = Phaser.GameObjects.Mesh2D | Phaser.GameObjects.Image;

function groupSignature(poses: readonly NativeScenePose[], density: number): string {
  // Value hash of everything baked into the isolated buffer: leaf geometry
  // transforms, texture selection and per-texel colors. Group-level
  // multiply/add use the GPU color filter on the composed image, and group
  // blend/alpha/position are image state, so they are intentionally excluded
  // and never force a render-target redraw by themselves.
  const parts: string[] = [`d${density}`];
  const walk = (list: readonly NativeScenePose[]) => {
    for (const p of list) {
      if ('group' in p) {
        parts.push(`G${p.key}:${p.blend}:`);
        walk(p.group);
        parts.push(';');
      } else {
        parts.push(`${p.key}|${p.texture}|${p.blend}|`);
        parts.push(p.matrix.join(','));
        parts.push('|');
        parts.push(p.multiply.join(','));
        parts.push('|');
        parts.push(p.add.join(','));
        parts.push(';');
      }
    }
  };
  walk(poses);
  return parts.join('');
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

/** Retains native polygons and composites native blend groups in separate GPU buffers. */
export class NativeSceneView {
  private leaves: NativeMeshView;
  readonly groups = new Map<
    string,
    {
      image: Phaser.GameObjects.RenderTexture;
      content: NativeSceneView;
      color?: NativeGroupColor;
      multiplyImage?: Phaser.GameObjects.Image;
      signature?: string;
    }
  >();
  objects: NativeObject[] = [];
  constructor(
    private scene: Phaser.Scene,
    private prefix: string,
    private detached = false,
  ) {
    this.leaves = new NativeMeshView(scene, prefix);
    if (!detached)
      scene.game.renderer.on(Phaser.Renderer.Events.LOSE_WEBGL, this.onContextLost, this);
  }
  private onContextLost() {
    // Phaser 4.2.1 otherwise deletes stale handles in the restored context.
    // Filters also use pooled framebuffers outside this view's own textures.
    // Every handle belongs to the lost context and is already invalidated;
    // retain the wrappers/attachment descriptions so Phaser can recreate them.
    const renderer = this.scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    for (const framebuffer of renderer.glFramebufferWrappers) framebuffer.webGLFramebuffer = null;
    this.invalidate();
  }
  /** Force isolated buffers to repaint (context loss drops their pixels). */
  invalidate() {
    for (const entry of this.groups.values()) {
      entry.signature = undefined;
      entry.content.invalidate();
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
    // Direct multiply leaves also need isolation before the two destination passes.
    poses = poses.map((p) =>
      !('group' in p) && p.blend === 3
        ? {
            key: p.key,
            blend: 3,
            multiply: p.multiply,
            add: p.add,
            group: [{ ...p, blend: 0, multiply: [1, 1, 1, 1], add: [0, 0, 0, 0] }],
          }
        : p,
    );
    // Color filters must run before the destination passes. Applying a filter to
    // pass one would preserve the cleared filter buffer's zero alpha. Screen on
    // a transparent isolated buffer is source-over, so this inner group colors
    // the composed source once without changing its premultiplied result.
    poses = poses.map((p) =>
      'group' in p &&
      p.blend === 3 &&
      (p.multiply.slice(0, 3).some((v) => v !== 1) || p.add.some((v) => v !== 0))
        ? {
            ...p,
            multiply: [1, 1, 1, p.multiply[3]],
            add: [0, 0, 0, 0],
            group: [
              {
                ...p,
                key: p.key + ':multiply-color',
                blend: 4,
                multiply: [...p.multiply.slice(0, 3), 1],
              },
            ],
          }
        : p,
    );
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
          entry.image.setOrigin(0, 0);
          this.groups.set(pose.key, entry);
        }
        const renderer = this.scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
        entry.image.setBlendMode(
          pose.blend === 3
            ? nativeMultiplyModes(renderer)[0]
            : nativeBlendMode(renderer, pose.blend),
        );
        if (pose.blend !== 3 && entry.multiplyImage) {
          entry.multiplyImage.destroy();
          entry.multiplyImage = undefined;
        }
        const colored =
          pose.multiply.slice(0, 3).some((v) => v !== 1) || pose.add.some((v) => v !== 0);
        if (colored && !entry.color) entry.color = new NativeGroupColor(entry.image);
        if (entry.color) {
          entry.color.active = colored;
          entry.color.setColor(pose.multiply, pose.add);
        }
        // Idle groups reuse the same isolated pixels: skip the render-target
        // switch, mesh re-upload and draw when nothing baked into the buffer
        // changed. Image transform, blend, filter color and alpha still update
        // below so fades and moves never stick.
        const signature = groupSignature(pose.group, density);
        const resized = entry.image.width !== width || entry.image.height !== height;
        if (entry.signature !== signature || resized) {
          entry.content.render(
            transformed(pose.group, [density, 0, -left, 0, density, -top]),
            0,
            0,
            0,
            1,
            1,
          );
          // Resize reallocates the GPU buffer: only do it when bounds actually change.
          if (resized) entry.image.resize(width, height);
          (entry.image.texture as Phaser.Textures.DynamicTexture).commandBuffer.length = 0;
          entry.image.clear().draw(entry.content.objects).setRenderMode('all', true);
          entry.signature = signature;
        }
        const wantX = x + left / density;
        const wantY = y + top / density;
        const wantScale = 1 / density;
        const wantAlpha = alpha * pose.multiply[3];
        if (entry.image.x !== wantX || entry.image.y !== wantY) entry.image.setPosition(wantX, wantY);
        if (entry.image.scaleX !== wantScale || entry.image.scaleY !== wantScale)
          entry.image.setScale(wantScale);
        if (entry.image.alpha !== wantAlpha) entry.image.setAlpha(wantAlpha);
        if (pose.blend === 3) {
          if (!entry.multiplyImage)
            entry.multiplyImage = this.scene.add.image(0, 0, entry.image.texture).setOrigin(0, 0);
          const second = entry.multiplyImage;
          second
            .setFrame(entry.image.frame.name)
            .setPosition(entry.image.x, entry.image.y)
            .setScale(1 / density)
            .setAlpha(alpha * pose.multiply[3])
            .setBlendMode(nativeMultiplyModes(renderer)[1])
            .setDepth(depth + order * 0.0001 + 0.00005)
            .setVisible(true);
          if (this.detached) second.removeFromDisplayList();
        }
        object = entry.image;
      } else object = this.meshes.get(pose.key)!;
      object.setDepth(depth + order * 0.0001).setVisible(true);
      if (this.detached) object.removeFromDisplayList();
      this.objects.push(object);
      if ('group' in pose && pose.blend === 3)
        this.objects.push(this.groups.get(pose.key)!.multiplyImage!);
    }
    for (const [key, entry] of this.groups)
      if (!wanted.has(key)) {
        entry.content.destroy();
        entry.multiplyImage?.destroy();
        entry.image.destroy();
        this.groups.delete(key);
      }
  }
  clear() {
    this.leaves.clear();
    for (const entry of this.groups.values()) {
      entry.content.destroy();
      entry.multiplyImage?.destroy();
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
