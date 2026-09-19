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

/**
 * Triangle meshes extend Phaser's MULTIPLY tint mode with an additive term: `clamp(texel * tint +
 * tint2)` before premultiplication, i.e. the retained multiply/add color transform of a native
 * leaf, evaluated on the GPU instead of baking a recolored copy of its texture page. Mesh2D keeps
 * multiply in `tint` and add in `tint2` (0x000000 by default, which is plain MULTIPLY). Keeping the
 * mode number means callers that reset a mesh to MULTIPLY (status tints) keep its source color.
 */
export const NATIVE_COLOR_TINT_MODE = 0;
const NATIVE_COLOR_BRANCH = `
    if (tintMode == ${NATIVE_COLOR_TINT_MODE}.0) {
        vec3 source = texture.a > 0.0 ? texture.rgb / texture.a : vec3(0.0);
        vec3 transformed = clamp(source * outTint.bgr + outTintEffect.bgr, 0.0, 1.0);
        float transformedAlpha = texture.a * outTint.a;
        return vec4(transformed * transformedAlpha, transformedAlpha);
    }
`;

function nativeColorTint(node: Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad) {
  const manager = node.programManager;
  const tint = manager.getAdditionsByTag('TINT')[0];
  const header = (tint?.additions as { fragmentHeader?: unknown } | undefined)?.fragmentHeader;
  if (!tint || typeof header !== 'string' || header.includes('NativeColorTint')) return;
  const declaration = 'float tintMode = outTintEffect.a;';
  const at = header.indexOf(declaration);
  if (at < 0) return;
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
}

/**
 * Phaser 4.2.1's triangle batcher writes only the tint mode into the second tint attribute. This
 * copy also writes the object's `tint2` color there (as its quad batcher does), which the native
 * color mode reads as the additive term. Everything else matches BatchHandlerTri.batchTriangles.
 */
function batchTrianglesWithTint2(node: Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad) {
  const getTint = Phaser.Renderer.WebGL.Utils.getTintAppendFloatAlpha;
  const point = new Phaser.Math.Vector2();
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
    setupMatrix(context: unknown, object: unknown, parent: unknown): void;
    transformVertex(point: Phaser.Math.Vector2): void;
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
    transformerNode.setupMatrix(drawingContext, gameObject, parentMatrix);
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
    for (let i = 0; i < triangles; i++) {
      const i4 = i * 4;
      const textureDatum = this.batchTextures(sources[indices[i4 + 3]].glTexture, renderOptions);
      let offset = this.instanceCount * floatsPerInstance;
      for (let corner = 0; corner < 3; corner++) {
        const v = indices[i4 + corner] * 4;
        point.set(vertices[v], vertices[v + 1]);
        transformerNode.transformVertex(point);
        const texV = vertices[v + 3];
        viewF32[offset++] = point.x;
        viewF32[offset++] = point.y;
        viewF32[offset++] = vertices[v + 2];
        viewF32[offset++] = flipV ? 1 - texV : texV;
        viewF32[offset++] = textureDatum;
        viewU32[offset++] = tint2;
        viewU32[offset++] = tint;
      }
      this.instanceCount++;
      this.currentBatchEntry.count++;
      if (this.instanceCount === instancesPerBatch) this.run(drawingContext);
    }
  };
}

const configuredTriangles = new WeakSet<Phaser.Renderer.WebGL.WebGLRenderer>();
/**
 * Native polygon meshes share the sprite sampler and need the same slot fix; they also get the
 * GPU source-color tint. Shader additions and the batcher override live on the render node (and
 * survive context restore), so this runs once per renderer.
 */
export function configureNativeTriangleRendering(renderer: Phaser.Renderer.WebGL.WebGLRenderer) {
  if (configuredTriangles.has(renderer)) return;
  configuredTriangles.add(renderer);
  const node = renderer.renderNodes.getNode(
    'BatchHandlerTri',
  ) as Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad;
  stableTextureSampling(renderer, node);
  nativeColorTint(node);
  batchTrianglesWithTint2(node);
}

/** Keep Phaser's sprite batching, but avoid degenerate triangles between sprites. */
export function configureQuadRendering(renderer: Phaser.Renderer.WebGL.WebGLRenderer) {
  const node = renderer.renderNodes.getNode(
    'BatchHandlerQuad',
  ) as Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad;
  stableTextureSampling(renderer, node);
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
    // @ts-expect-error Phaser accepts null to unbind a VAO; its declaration omits null.
    { vao: null, bindings: { elementArrayBuffer: node.indexBuffer } },
    true,
  );
  node.indexBuffer.update();
  node.topology = renderer.gl.TRIANGLES;
}
