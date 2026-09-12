import type Phaser from 'phaser';

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

/** Native polygon meshes share the sprite sampler and need the same slot fix. */
export function configureNativeTriangleRendering(renderer: Phaser.Renderer.WebGL.WebGLRenderer) {
  stableTextureSampling(
    renderer,
    renderer.renderNodes.getNode(
      'BatchHandlerTri',
    ) as Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad,
  );
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
