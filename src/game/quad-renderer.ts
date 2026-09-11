import type Phaser from 'phaser';

/** Keep Phaser's sprite batching, but avoid degenerate triangles between sprites. */
export function configureQuadRendering(renderer: Phaser.Renderer.WebGL.WebGLRenderer) {
  const node = renderer.renderNodes.getNode('BatchHandlerQuad') as
    Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad;
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
  // @ts-expect-error Phaser accepts null to unbind a VAO; its declaration omits null.
  renderer.glWrapper.update({ vao: null, bindings: { elementArrayBuffer: node.indexBuffer } }, true);
  node.indexBuffer.update();
  node.topology = renderer.gl.TRIANGLES;
}
