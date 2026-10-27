/** Canonical binary64 values for the existing index/6 * PI * 2 local release rule.
 * All 22 source releases are pinned so host libm differences cannot enter battle state.
 * These retain the former Node results; they are not a claim about native client angles.
 */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0.5000000000000001, 0.8660254037844386],
  [-0.4999999999999998, 0.8660254037844387],
  [-1, 1.2246467991473532e-16],
  [-0.5000000000000004, -0.8660254037844385],
  [0.5000000000000001, -0.8660254037844386],
  [1, -2.4492935982947064e-16],
  [0.4999999999999997, 0.8660254037844388],
  [-0.4999999999999992, 0.8660254037844392],
  [-1, 3.6739403974420594e-16],
  [-0.49999999999999983, -0.8660254037844387],
  [0.4999999999999991, -0.8660254037844392],
  [1, -4.898587196589413e-16],
  [0.5000000000000014, 0.8660254037844378],
  [-0.5000000000000006, 0.8660254037844384],
  [-1, 6.123233995736766e-16],
  [-0.5000000000000016, -0.8660254037844377],
  [0.5000000000000004, -0.8660254037844384],
  [1, -7.347880794884119e-16],
  [0.5000000000000017, 0.8660254037844377],
  [-0.5000000000000003, 0.8660254037844385],
  [-1, 8.572527594031472e-16],
];

export function furnaceReleasePoint(
  source: { x: number; y: number },
  index: number,
  distance: number,
) {
  const [x, y] = DIRECTIONS[index] ?? DIRECTIONS[index % 6];
  return { x: source.x + x * distance, y: source.y + y * distance };
}
