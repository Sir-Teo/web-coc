import Phaser from 'phaser';

function stableTextureSampling(
  renderer: Phaser.Renderer.WebGL.WebGLRenderer,
  node: Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad,
) {
  const sampler = node.programManager.getAdditionsByTag('TEXTURE')[0];
  if (sampler) {
    // The engine compares an interpolated float texture ID with exact integers.
    // Rounding near IDs such as 3 and 5 can fall through to transparent black.
    // Half-integer boundaries keep all pixels in the intended texture slot.
    const branches = Array.from(
      { length: renderer.maxTextures },
      (_, i) =>
        `#if TEXTURE_COUNT > ${i}\nif (outTexDatum < ${i}.5) return texture2D(uMainSampler[${i}], texCoord);\n#endif`,
    ).join('\n');
    node.programManager.replaceAddition(sampler.name, {
      name: 'StableTextureSampling',
      // A distinct tag prevents Phaser replacing this sampler when it adjusts
      // batch sizes. Its TexCount addition still controls the active samplers.
      tags: ['StableTextureSampling'],
      additions: {
        fragmentHeader: `uniform sampler2D uMainSampler[TEXTURE_COUNT];
vec4 getTexture(vec2 texCoord) {
#if TEXTURE_COUNT == 1
return texture2D(uMainSampler[0], texCoord);
#else
${branches}
return vec4(0.0);
#endif
}`,
        fragmentProcess: 'vec4 fragColor = getTexture(texCoord);',
      },
    });
  }
}

import { NATIVE_ADDITIVE_TINT_MODE, NATIVE_COLOR_TINT_MODE } from './native-tint-modes';
export { NATIVE_ADDITIVE_TINT_MODE, NATIVE_COLOR_TINT_MODE };

/**
 * Triangle meshes extend Phaser's MULTIPLY tint mode with an additive term: `clamp(texel * tint +
 * tint2)` before premultiplication, i.e. the retained multiply/add color transform of a native
 * leaf, evaluated on the GPU instead of baking a recolored copy of its texture page. Mesh2D keeps
 * multiply in `tint` and add in `tint2` (0x000000 by default, which is plain MULTIPLY). The
 * additive mode draws additive parts in the normal blend state (see native-tint-modes.ts).
 */
const NATIVE_COLOR_BRANCH = `
    if (tintMode == ${NATIVE_COLOR_TINT_MODE}.0) {
        vec3 source = texture.a > 0.0 ? texture.rgb / texture.a : vec3(0.0);
        vec3 transformed = clamp(source * outTint.bgr + outTintEffect.bgr, 0.0, 1.0);
        float transformedAlpha = texture.a * outTint.a;
        return vec4(transformed * transformedAlpha, transformedAlpha);
    }
    // The mode byte arrives denormalized (x 255.0): compare with a tolerance, not equality.
    if (abs(tintMode - ${NATIVE_ADDITIVE_TINT_MODE}.0) < 0.5) {
        vec3 source = texture.a > 0.0 ? texture.rgb / texture.a : vec3(0.0);
        vec3 transformed = clamp(source * outTint.bgr + outTintEffect.bgr, 0.0, 1.0);
        return vec4(transformed * texture.a * outTint.a, 0.0);
    }
`;

/** Installs the native color branches; true when the node's tint shader carries them. */
function nativeColorTint(node: Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad) {
  const manager = node.programManager;
  const tint = manager.getAdditionsByTag('TINT')[0];
  const header = (tint?.additions as { fragmentHeader?: unknown } | undefined)?.fragmentHeader;
  if (!tint || typeof header !== 'string') return false;
  if (header.includes('NativeColorTint')) return true;
  const declaration = 'float tintMode = outTintEffect.a;';
  const at = header.indexOf(declaration);
  if (at < 0) return false;
  const end = at + declaration.length;
  manager.replaceAddition(tint.name, {
    ...tint,
    // Compiled programs are cached by addition names: a new name forces the new source.
    name: 'NativeColorTint',
    additions: {
      ...tint.additions,
      fragmentHeader: `// NativeColorTint\n${header.slice(0, end)}${NATIVE_COLOR_BRANCH}${header.slice(end)}`,
    },
  });
  return true;
}

type NativeIndexedQuad = Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad & {
  /** Kept on the node so timestamped development imports cannot wrap its hooks twice. */
  nativeTriangleIndexFlags?: Uint8Array;
};

/** Share four vertices without changing either native triangle's vertex order. */
function nativeTriangleIndices(node: Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad) {
  const indexed = node as NativeIndexedQuad;
  const cached = indexed.nativeTriangleIndexFlags;
  if (cached) return cached;
  const flags = new Uint8Array(node.instancesPerBatch);
  const previous = new Uint8Array(flags.length);
  const indices = new Uint16Array(node.indexBuffer.dataBuffer);
  const renderer = node.manager.renderer;
  // This element buffer now changes between batches. Keep the managed wrapper's hint in
  // sync too, so context restoration recreates the same dynamic allocation.
  node.indexBuffer.bufferUsage = renderer.gl.DYNAMIC_DRAW;
  renderer.glWrapper.update(
    {
      vao: null as unknown as Phaser.Renderer.WebGL.Wrappers.WebGLVAOWrapper,
      bindings: { elementArrayBuffer: node.indexBuffer },
    },
    true,
  );
  renderer.gl.bufferData(
    renderer.gl.ELEMENT_ARRAY_BUFFER,
    node.indexBuffer.dataBuffer,
    renderer.gl.DYNAMIC_DRAW,
  );
  const originalRun = node.run;
  const originalSetup = node.setupUniforms;
  let uploaded = false;
  const setup: typeof node.setupUniforms = function (this: typeof node, drawingContext) {
    originalSetup.call(this, drawingContext);
    if (uploaded) return;
    uploaded = true;
    let first = this.instanceCount,
      last = -1;
    for (let slot = 0; slot < this.instanceCount; slot++) {
      const native = flags[slot];
      if (previous[slot] === native) continue;
      previous[slot] = native;
      first = Math.min(first, slot);
      last = slot;
      const at = slot * 6,
        vertex = slot * 4;
      if (native) {
        indices[at] = vertex;
        indices[at + 1] = vertex + 1;
        indices[at + 2] = vertex + 2;
        indices[at + 3] = vertex + 2;
        indices[at + 4] = vertex + 1;
      } else {
        indices[at] = vertex + 1;
        indices[at + 1] = vertex;
        indices[at + 2] = vertex + 2;
        indices[at + 3] = vertex + 1;
        indices[at + 4] = vertex + 2;
      }
      indices[at + 5] = vertex + 3;
    }
    if (last >= first) {
      // Element bindings belong to the VAO: bind this batch's VAO before updating its EBO.
      const renderer = this.manager.renderer;
      const suite = this.programManager.getCurrentProgramSuite() as {
        vao: Phaser.Renderer.WebGL.Wrappers.WebGLVAOWrapper;
      };
      renderer.glWrapper.update({
        vao: suite.vao,
        bindings: { elementArrayBuffer: this.indexBuffer },
      });
      this.indexBuffer.update((last - first + 1) * 12, first * 12);
    }
  };
  const run: typeof node.run = function (this: typeof node, drawingContext) {
    const count = this.instanceCount;
    try {
      return originalRun.call(this, drawingContext);
    } finally {
      flags.fill(0, 0, count);
      uploaded = false;
    }
  };
  node.setupUniforms = setup;
  node.run = run;
  indexed.nativeTriangleIndexFlags = flags;
  return flags;
}

/** Carry native tint2 and combine adjacent strip triangles without changing vertex order. */
function batchTrianglesWithTint2(
  node: Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad,
  asQuads = false,
) {
  const getTint = Phaser.Renderer.WebGL.Utils.getTintAppendFloatAlpha;
  const indexFlags = asQuads ? nativeTriangleIndices(node) : undefined;
  type Batcher = {
    instanceCount: number;
    manager: { setCurrentBatchNode(node: unknown, context: unknown): void };
    updateRenderOptions(options: unknown): void;
    _renderOptionsChanged: boolean;
    run(context: unknown): void;
    updateShaderConfig(): void;
    floatsPerInstance: number;
    instancesPerBatch: number;
    vertexBufferLayout: { buffer: { viewF32: Float32Array; viewU32: Uint32Array } };
    batchTextures(texture: unknown, options: unknown): number;
    currentBatchEntry: { count: number };
    batchTriangles: unknown;
  };
  type Transformer = {
    setupMatrix(context: unknown, object: unknown, parent: unknown): { matrix: ArrayLike<number> };
    /** Set by setupMatrix: whether this object's vertices snap to whole device pixels. */
    _roundVertices: boolean;
  };
  type TriangleObject = {
    flipV: boolean;
    tintMode: number;
    tint: number;
    tint2?: number;
    alpha: number;
    texture: { source: { glTexture: unknown }[] };
  };
  (node as unknown as Batcher).batchTriangles = function (
    this: Batcher,
    drawingContext: { alphaStrategy: unknown },
    gameObject: TriangleObject,
    parentMatrix: unknown,
    transformerNode: Transformer,
    vertices: ArrayLike<number>,
    indices: ArrayLike<number>,
    renderOptions: { alphaStrategy: unknown },
  ) {
    if (this.instanceCount === 0) this.manager.setCurrentBatchNode(this, drawingContext);
    renderOptions.alphaStrategy = drawingContext.alphaStrategy;
    this.updateRenderOptions(renderOptions);
    if (this._renderOptionsChanged) {
      this.run(drawingContext);
      this.updateShaderConfig();
    }
    // setupMatrix returns the transform every vertex of this object shares. Reading it here and
    // projecting inline keeps three method calls and a Vector2 round trip out of the per-vertex
    // path; `transformVertex` does exactly this arithmetic.
    const calc = transformerNode.setupMatrix(drawingContext, gameObject, parentMatrix).matrix;
    const ma = calc[0],
      mb = calc[1],
      mc = calc[2],
      md = calc[3],
      mtx = calc[4],
      mty = calc[5];
    const round = transformerNode._roundVertices;
    // A camera with no rotation over an unrotated mesh — every native part in the battle — leaves
    // the off-diagonal terms at zero, so each vertex is a scale and an offset per axis.
    const upright = mb === 0 && mc === 0;
    const flipV = gameObject.flipV;
    const tint = getTint(gameObject.tint, gameObject.alpha);
    const tint2 = ((gameObject.tintMode << 24) | ((gameObject.tint2 ?? 0) & 0xffffff)) >>> 0;
    const sources = gameObject.texture.source;
    const floatsPerInstance = this.floatsPerInstance;
    const instancesPerBatch = this.instancesPerBatch;
    const buffer = this.vertexBufferLayout.buffer;
    const viewF32 = buffer.viewF32,
      viewU32 = buffer.viewU32;
    const triangles = (indices.length / 4) | 0;
    // A mesh nearly always draws from one texture source: resolving the slot again per triangle
    // is a call into the texture batcher for an answer that has not changed.
    let lastSource = -1;
    let textureDatum = 0;
    for (let i = 0; i < triangles; i++) {
      const i4 = i * 4;
      const source = indices[i4 + 3];
      if (source !== lastSource) {
        textureDatum = this.batchTextures(sources[source].glTexture, renderOptions);
        lastSource = source;
      }
      const baseOffset = this.instanceCount * floatsPerInstance;
      const paired =
        !!indexFlags &&
        i + 1 < triangles &&
        indices[i4 + 7] === source &&
        indices[i4 + 4] === indices[i4 + 2] &&
        indices[i4 + 5] === indices[i4 + 1];
      if (paired) indexFlags[this.instanceCount] = 1;
      for (let corner = 0; corner < (paired ? 4 : 3); corner++) {
        // Sprite vertex order is BL, TL, BR, TR: b, a, c, c draws the original a, b, c.
        const target = !paired && asQuads && corner < 2 ? 1 - corner : corner;
        let offset = baseOffset + target * 7;
        const v = indices[paired && corner === 3 ? i4 + 6 : i4 + corner] * 4;
        const vx = vertices[v],
          vy = vertices[v + 1];
        let x: number, y: number;
        if (upright) {
          x = ma * vx + mtx;
          y = md * vy + mty;
        } else {
          x = ma * vx + mc * vy + mtx;
          y = mb * vx + md * vy + mty;
        }
        if (round) {
          x = Math.round(x);
          y = Math.round(y);
        }
        const texV = vertices[v + 3];
        viewF32[offset++] = x;
        viewF32[offset++] = y;
        viewF32[offset++] = vertices[v + 2];
        viewF32[offset++] = flipV ? 1 - texV : texV;
        viewF32[offset++] = textureDatum;
        viewU32[offset++] = tint2;
        viewU32[offset++] = tint;
      }
      if (asQuads && !paired)
        // Copy all seven attribute words exactly; transform each source vertex only once.
        viewU32.copyWithin(baseOffset + 21, baseOffset + 14, baseOffset + 21);
      if (paired) i++;
      this.instanceCount++;
      this.currentBatchEntry.count++;
      if (this.instanceCount === instancesPerBatch) {
        this.run(drawingContext);
        // A flush can rebind textures, so the cached slot no longer stands.
        lastSource = -1;
      }
    }
  };
}

/** The texture count a sub-batch's shader is compiled for: a power of two, capped at `max`. */
export function textureBucket(count: number, max: number) {
  if (count <= 1) return 1;
  return Math.min(max, 2 ** Math.ceil(Math.log2(count)));
}

type ShaderAddition = { name: string; tags?: string[]; disable?: boolean };
type BucketedNode = {
  finalizeTextureCount(count: number): void;
  programManager: {
    currentConfig: { base: unknown; additions: ShaderAddition[]; features: string[] };
    getCurrentProgramSuite(): unknown;
  };
  textureBuckets?: true;
};
/**
 * Phaser compiles its batch shader once for every texture count a sub-batch happens to use (1 up
 * to the GPU's limit, usually 16), and each is a blocking program link the first time that count
 * occurs: in play, when a busier battle first puts more textures in one batch. Counts round up
 * to a power of two instead, which is always safe: every sampler slot is bound to a texture unit
 * at startup and each vertex carries the index of the one it reads, so extra slots are never
 * sampled. The first draw with a new shader configuration also links all of its buckets at once,
 * so for the configurations the village uses the links land behind the loading screen.
 */
function bucketTextureCounts(
  renderer: Phaser.Renderer.WebGL.WebGLRenderer,
  target: Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad,
) {
  const node = target as unknown as BucketedNode;
  if (node.textureBuckets || typeof node.finalizeTextureCount !== 'function') return;
  node.textureBuckets = true;
  const finalize = node.finalizeTextureCount;
  const max = Math.max(1, renderer.maxTextures);
  const buckets: number[] = [];
  for (let count = 1; count < max; count *= 2) buckets.push(count);
  buckets.push(max);
  const factory = renderer.shaderProgramFactory as unknown as {
    getKey(base: unknown, additions: ShaderAddition[], features: string[]): string;
  };
  const warmed = new Set<string>();
  node.finalizeTextureCount = function (this: BucketedNode, count: number) {
    const bucket = textureBucket(count, max);
    finalize.call(this, bucket);
    const manager = this.programManager;
    const config = manager.currentConfig;
    if (!config) return;
    // The configuration without its texture-count additions.
    const signature = factory.getKey(
      config.base,
      config.additions.filter(
        (addition) => !addition.tags?.some((tag) => tag === 'TexCount' || tag === 'TEXTURE'),
      ),
      [...(config.features ?? [])],
    );
    if (warmed.has(signature)) return;
    warmed.add(signature);
    for (const other of buckets) {
      if (other === bucket) continue;
      finalize.call(this, other);
      manager.getCurrentProgramSuite();
    }
    finalize.call(this, bucket);
  };
}

const configuredTriangles = new WeakMap<Phaser.Renderer.WebGL.WebGLRenderer, boolean>();
/**
 * Native polygon meshes share the sprite sampler and need the same slot fix; they also get the
 * GPU source-color tint. Shader additions and the batcher override live on the render node (and
 * survive context restore), so this runs once per renderer. Returns whether the triangle shader
 * carries the native tint branches (false for test doubles without a tint addition).
 */
export function configureNativeTriangleRendering(renderer: Phaser.Renderer.WebGL.WebGLRenderer) {
  const known = configuredTriangles.get(renderer);
  if (known !== undefined) return known;
  const node = renderer.renderNodes.getNode(
    'BatchHandlerTri',
  ) as Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad;
  stableTextureSampling(renderer, node);
  bucketTextureCounts(renderer, node);
  const supported = nativeColorTint(node);
  batchTrianglesWithTint2(node);
  configuredTriangles.set(renderer, supported);
  return supported;
}

const configuredQuadColor = new WeakMap<Phaser.Renderer.WebGL.WebGLRenderer, boolean>();
/**
 * Sprite quads (blend-group buffer images) get the same GPU multiply/add color as native meshes,
 * so a colored group needs no filter pass. Returns false when the renderer's quad shader has no
 * tint branch to extend (test doubles): callers then keep their filter path.
 */
export function configureNativeQuadColor(renderer: Phaser.Renderer.WebGL.WebGLRenderer) {
  const known = configuredQuadColor.get(renderer);
  if (known !== undefined) return known;
  let supported = false;
  try {
    const node = renderer.renderNodes?.getNode('BatchHandlerQuad') as
      Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad | undefined;
    if (node?.programManager) supported = nativeColorTint(node);
  } catch {
    supported = false;
  }
  configuredQuadColor.set(renderer, supported);
  return supported;
}

const sharedTriangleNodes = new WeakMap<
  Phaser.Renderer.WebGL.WebGLRenderer,
  Phaser.Renderer.WebGL.RenderNodes.BatchHandlerTri | undefined
>();
/**
 * Native strips share the sprite batch. Adjacent a,b,c / c,b,d triangles use four vertices
 * with their original index order; a lone triangle uses b,a,c,c with a degenerate second.
 * Source UVs, color words and sprite indices stay intact across shared-batch flushes.
 */
export function nativeQuadTriangleBatcher(renderer: Phaser.Renderer.WebGL.WebGLRenderer) {
  if (sharedTriangleNodes.has(renderer)) return sharedTriangleNodes.get(renderer);
  const quad = renderer.renderNodes?.getNode('BatchHandlerQuad') as
    Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad | undefined;
  // Presentation doubles without real buffers retain the ordinary triangle path.
  if (
    !quad?.indexBuffer?.dataBuffer ||
    !quad.vertexBufferLayout?.buffer ||
    !configureNativeQuadColor(renderer)
  ) {
    sharedTriangleNodes.set(renderer, undefined);
    return undefined;
  }
  configureQuadRendering(renderer);
  batchTrianglesWithTint2(quad, true);
  const node = quad as Phaser.Renderer.WebGL.RenderNodes.BatchHandlerTri;
  sharedTriangleNodes.set(renderer, node);
  return node;
}

/** Keep Phaser's sprite batching, but avoid degenerate triangles between sprites. */
export function configureQuadRendering(renderer: Phaser.Renderer.WebGL.WebGLRenderer) {
  const node = renderer.renderNodes.getNode(
    'BatchHandlerQuad',
  ) as Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad;
  stableTextureSampling(renderer, node);
  bucketTextureCounts(renderer, node);
  if (node.topology === renderer.gl.TRIANGLES) return;

  // Phaser 4.2.1 stores each quad as BL, TL, BR, TR. Its default strip uses
  // six indices, including repeated endpoints that join consecutive quads.
  // Two independent triangles use the same buffer size, diagonal and pixels,
  // without sending the intervening degenerate triangles to the rasterizer.
  const indices = new Uint16Array(node.indexBuffer.dataBuffer);
  for (let i = 0; i < indices.length; i += 6) {
    const vertex = (i / 6) * 4;
    indices.set([vertex + 1, vertex, vertex + 2, vertex + 1, vertex + 2, vertex + 3], i);
  }
  // Element-buffer bindings belong to the active VAO. Upload outside any VAO
  // and force the binding, so initialization after an earlier draw is safe too.
  renderer.glWrapper.update(
    // Phaser accepts null to unbind a VAO; its declaration omits null.
    {
      vao: null as unknown as Phaser.Renderer.WebGL.Wrappers.WebGLVAOWrapper,
      bindings: { elementArrayBuffer: node.indexBuffer },
    },
    true,
  );
  node.indexBuffer.update();
  node.topology = renderer.gl.TRIANGLES;
}
