/** Retained native scene data. Source UVs are normalized after lossless packing. */
export interface NativeMeshGraph {
  exports: Record<string, number>;
  shapes: Record<string, [texture: number, vertices: number[]][]>;
  clips: Record<
    string,
    {
      fps: number;
      children: number[];
      names: string[];
      blending: number[];
      frames: number[][][];
      timeline: number[];
    }
  >;
  matrices: number[][];
  colors: number[][];
  textures: Record<string, { path: string; width: number; height: number }>;
}
export type NativeMatrix = [number, number, number, number, number, number];
export type NativeBlend = 0 | 3 | 4 | 8;
export interface NativeMeshPose {
  key: string;
  texture: number;
  vertices: number[];
  matrix: NativeMatrix;
  multiply: number[];
  add: number[];
  blend: NativeBlend;
}
export interface NativeGroupPose {
  key: string;
  group: NativeScenePose[];
  multiply: number[];
  add: number[];
  blend: 3 | 4 | 8;
}
export type NativeScenePose = NativeMeshPose | NativeGroupPose;
export const NATIVE_IDENTITY: NativeMatrix = [1, 0, 0, 0, 1, 0];

export function nativeMatrix(a: readonly number[], b: readonly number[]): NativeMatrix {
  return [
    a[0] * b[0] + a[1] * b[3],
    a[0] * b[1] + a[1] * b[4],
    a[0] * b[2] + a[1] * b[5] + a[2],
    a[3] * b[0] + a[4] * b[3],
    a[3] * b[1] + a[4] * b[4],
    a[3] * b[2] + a[4] * b[5] + a[5],
  ];
}

const ages = new WeakMap<NativeMeshGraph, Map<number, Map<number, number[]>>>();
/** -1 means the slot is continuously present across the complete source loop. */
function placementAges(graph: NativeMeshGraph, id: number, slot: number) {
  let byClip = ages.get(graph);
  if (!byClip) ages.set(graph, (byClip = new Map()));
  let bySlot = byClip.get(id);
  if (!bySlot) byClip.set(id, (bySlot = new Map()));
  let result = bySlot.get(slot);
  if (result) return result;
  const clip = graph.clips[id];
  const present = clip.timeline.map((i) => clip.frames[i].some((p) => p[0] === slot));
  result = present.map((exists, f) => {
    if (!exists) return 0;
    let age = 0;
    while (age < present.length && present[(f - age - 1 + present.length) % present.length]) age++;
    return age === present.length ? -1 : age;
  });
  bySlot.set(slot, result);
  return result;
}

/**
 * Deterministic source playback. Named controls select source frames directly;
 * native engine direction mapping and subclip clocks need separate validation.
 * Sampling cost is independent of how long the battle has been running.
 */
export function nativeMeshPoses(
  graph: NativeMeshGraph,
  name: string,
  seconds: number,
  controls: Readonly<Record<string, number | false>> = {},
  root: NativeMatrix = NATIVE_IDENTITY,
): NativeMeshPose[] {
  return sampleNativeScene(graph, name, seconds, controls, root, false) as NativeMeshPose[];
}

/** Retains screen/additive container boundaries instead of distributing their blend to leaves. */
export function nativeScenePoses(
  graph: NativeMeshGraph,
  name: string,
  seconds: number,
  controls: Readonly<Record<string, number | false>> = {},
  root: NativeMatrix = NATIVE_IDENTITY,
): NativeScenePose[] {
  return sampleNativeScene(graph, name, seconds, controls, root, true);
}

function sampleNativeScene(
  graph: NativeMeshGraph,
  name: string,
  seconds: number,
  controls: Readonly<Record<string, number | false>>,
  root: NativeMatrix,
  isolate: boolean,
): NativeScenePose[] {
  const id = graph.exports[name];
  if (id === undefined) throw Error(`Unknown native export: ${name}`);
  const poses: NativeScenePose[] = [];
  const walk = (
    id: number,
    frame: number,
    matrix: NativeMatrix,
    multiply: number[],
    add: number[],
    blend: NativeBlend,
    path: string,
    ancestors: number[],
    output: NativeScenePose[],
  ) => {
    if (ancestors.includes(id) || ancestors.length >= 32) throw Error('Recursive native scene');
    const commands = graph.shapes[id];
    if (commands) {
      for (const [index, [texture, vertices]] of commands.entries())
        output.push({ key: `${path}:${index}`, texture, vertices, matrix, multiply, add, blend });
      return;
    }
    const clip = graph.clips[id];
    if (!clip) throw Error(`Missing native object: ${id}`);
    const f = frame % clip.timeline.length;
    for (const [slot, transform, tint] of clip.frames[clip.timeline[f]]) {
      const child = clip.children[slot];
      const nested = graph.clips[child];
      const age = placementAges(graph, id, slot)[f];
      const elapsed = age < 0 ? frame : Math.min(frame, age);
      const control = controls[clip.names[slot]];
      if (control === false) continue;
      const phase = Number.isFinite(control)
        ? Math.max(0, Math.floor(control))
        : nested
          ? Math.floor((elapsed * nested.fps) / clip.fps)
          : 0;
      const mode = clip.blending[slot];
      if (mode !== 0 && mode !== 3 && mode !== 4 && mode !== 8)
        throw Error('Unsupported native blend');
      const color = graph.colors[tint];
      if (color[7] !== 0) throw Error('Additive native alpha is unsupported');
      const nextMatrix = nativeMatrix(matrix, graph.matrices[transform]);
      const nextMultiply = multiply.map((v, i) => v * color[i]);
      const nextAdd = add.map((v, i) => multiply[i] * color[i + 4] + v);
      if (mode === 3 || ((mode === 4 || mode === 8) && nested?.children.length)) {
        if (!isolate) throw Error('Native blend group requires isolated compositing');
        const group: NativeScenePose[] = [];
        output.push({
          key: `${path}/${slot}`,
          group,
          multiply: nextMultiply,
          add: nextAdd,
          blend: mode,
        });
        walk(
          child,
          phase,
          nextMatrix,
          [1, 1, 1, 1],
          [0, 0, 0, 0],
          0,
          `${path}/${slot}`,
          [...ancestors, id],
          group,
        );
        continue;
      }
      walk(
        child,
        phase,
        nextMatrix,
        nextMultiply,
        nextAdd,
        mode || blend,
        `${path}/${slot}`,
        [...ancestors, id],
        output,
      );
    }
  };
  const fps = graph.clips[id]?.fps ?? 1;
  walk(
    id,
    Math.floor((Number.isFinite(seconds) ? Math.max(0, seconds) : 0) * fps + 1e-9),
    root,
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    0,
    String(id),
    [],
    poses,
  );
  return poses;
}

/** Exact native strip topology, with one triangle per adjacent triple. */
export function nativeTriangles(vertices: readonly number[]) {
  const indices: number[] = [];
  for (let i = 0; i < vertices.length / 4 - 2; i++)
    indices.push(i % 2 ? i + 1 : i, i % 2 ? i : i + 1, i + 2, 0);
  return indices;
}

export function nativeVertices(pose: NativeMeshPose) {
  const [a, c, x, b, d, y] = pose.matrix;
  return pose.vertices.map((v, i, vertices) => {
    if (i % 4 === 0) return a * v + c * vertices[i + 1] + x;
    if (i % 4 === 1) return b * vertices[i - 1] + d * v + y;
    return v;
  });
}
