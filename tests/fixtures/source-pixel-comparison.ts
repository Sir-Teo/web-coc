interface PixelSize {
  width: number;
  height: number;
}

interface PixelRegion extends PixelSize {
  x: number;
  y: number;
}

/** Compare a top-left tile in bottom-up WebGL RGBA readbacks. Alpha is ignored. */
export function compareSourcePixels(
  actual: Uint8Array,
  expected: Uint8Array,
  frame: PixelSize,
  region: PixelRegion,
  background: readonly [number, number, number] = [48, 65, 53],
) {
  if (
    !Number.isSafeInteger(frame.width) ||
    !Number.isSafeInteger(frame.height) ||
    frame.width <= 0 ||
    frame.height <= 0 ||
    actual.length !== frame.width * frame.height * 4 ||
    expected.length !== actual.length
  )
    throw new RangeError('Pixel buffers must match the positive frame dimensions.');
  if (
    ![region.x, region.y, region.width, region.height].every(Number.isSafeInteger) ||
    region.x < 0 ||
    region.y < 0 ||
    region.width <= 0 ||
    region.height <= 0 ||
    region.x + region.width > frame.width ||
    region.y + region.height > frame.height
  )
    throw new RangeError('The comparison region must fit inside the frame.');

  const [br, bg, bb] = background;
  const largePixels: { x: number; y: number; actual: number[]; expected: number[] }[] = [];
  let colored = 0,
    total = 0,
    large = 0,
    maximum = 0;
  for (let y = region.y; y < region.y + region.height; y++) {
    let at = ((frame.height - 1 - y) * frame.width + region.x) * 4;
    for (let x = 0; x < region.width; x++, at += 4) {
      const ar = actual[at],
        ag = actual[at + 1],
        ab = actual[at + 2],
        er = expected[at],
        eg = expected[at + 1],
        eb = expected[at + 2];
      if (ar === br && ag === bg && ab === bb && er === br && eg === bg && eb === bb) continue;
      colored++;
      const error = Math.max(Math.abs(ar - er), Math.abs(ag - eg), Math.abs(ab - eb));
      total += error;
      maximum = Math.max(maximum, error);
      if (error > 16) {
        large++;
        if (largePixels.length < 32)
          largePixels.push({
            x,
            y: y - region.y,
            actual: [ar, ag, ab],
            expected: [er, eg, eb],
          });
      }
    }
  }
  return {
    colored,
    meanError: colored ? total / colored : 0,
    largeFraction: colored ? large / colored : 0,
    maximum,
    largePixels,
  };
}
