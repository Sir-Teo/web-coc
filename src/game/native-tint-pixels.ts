/** Clamp before filtering, then pack premultiplied, bottom-up bytes for a raw upload. */
export function nativeTintPixels(
  source: Pick<ImageData, 'data' | 'width' | 'height'>,
  multiply: readonly number[],
  add: readonly number[],
): Uint8Array {
  const { data, width, height } = source;
  const output = new Uint8Array(data.length);
  const stride = width * 4;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < stride; x += 4) {
      const from = y * stride + x;
      const to = (height - 1 - y) * stride + x;
      const alpha = data[from + 3] / 255;
      for (let c = 0; c < 3; c++)
        output[to + c] = Math.round(
          Math.min(255, Math.max(0, data[from + c] * multiply[c] + add[c] * 255)) * alpha,
        );
      output[to + 3] = data[from + 3];
    }
  return output;
}
