import type Phaser from 'phaser';

type Transformer = Phaser.Renderer.WebGL.RenderNodes.TransformerTileSprite;
type Texturer = Phaser.Renderer.WebGL.RenderNodes.TexturerTileSprite;

/** TL, BL, BR, TR rectangle corners become top, left, bottom, right edge midpoints. */
function diamond(quad: ArrayLike<number>, out: Float32Array) {
  out[0] = (quad[0] + quad[6]) / 2;
  out[1] = (quad[1] + quad[7]) / 2;
  out[2] = (quad[0] + quad[2]) / 2;
  out[3] = (quad[1] + quad[3]) / 2;
  out[4] = (quad[2] + quad[4]) / 2;
  out[5] = (quad[3] + quad[5]) / 2;
  out[6] = (quad[4] + quad[6]) / 2;
  out[7] = (quad[5] + quad[7]) / 2;
}

/**
 * Draw the uniformly tinted field checks as one diamond, without stencil apply/release passes.
 * Both positions and repeating UVs use the same affine edge midpoints: tile registration,
 * filtering and camera transforms stay intact. Interpolation can differ by one color byte
 * from the rectangular, stencil-clipped reference. No shader, texture or per-frame allocation.
 */
export function configureFieldTiles(tile: Phaser.GameObjects.TileSprite) {
  const defaults = tile.defaultRenderNodes as { Transformer: Transformer; Texturer: Texturer };
  const positions = new Float32Array(8);
  const uvs = new Float32Array(8);
  const transformer: Pick<Transformer, 'quad' | 'run'> = {
    quad: positions,
    run(context, object, texturer, parent, element) {
      defaults.Transformer.run(context, object, texturer, parent, element);
      diamond(defaults.Transformer.quad, positions);
    },
  };
  const texturer: {
    frame: Phaser.Textures.Frame | undefined;
    uvMatrix: { quad: Float32Array };
    run: Texturer['run'];
  } = {
    frame: undefined,
    uvMatrix: { quad: uvs },
    run(context, object, element) {
      defaults.Texturer.run(context, object, element);
      this.frame = defaults.Texturer.frame;
      diamond(defaults.Texturer.uvMatrix.quad, uvs);
    },
  };
  Object.assign(tile.customRenderNodes, { Transformer: transformer, Texturer: texturer });
}
