/** Deterministic binary64 direction for the existing local Hound spawn turn.
 * Quarter-turn reduction and fixed Horner operations replace host libm sin/cos.
 * This preserves the local seeded disk rule, not a claim of native client geometry.
 */
const SIN = [
  1.0, -0.16666666666666666, 0.008333333333333333, -0.0001984126984126984, 2.7557319223985893e-6,
  -2.505210838544172e-8, 1.6059043836821613e-10, -7.647163731819816e-13, 2.8114572543455206e-15,
  -8.22063524662433e-18, 1.9572941063391263e-20, -3.868170170630684e-23, 6.446950284384474e-26,
] as const;
const COS = [
  1.0, -0.5, 0.041666666666666664, -0.001388888888888889, 2.48015873015873e-5,
  -2.755731922398589e-7, 2.08767569878681e-9, -1.1470745597729725e-11, 4.779477332387385e-14,
  -1.5619206968586225e-16, 4.110317623312165e-19, -8.896791392450574e-22, 1.6117375710961184e-24,
] as const;
function polynomial(coefficients: readonly number[], xx: number) {
  let value = coefficients[coefficients.length - 1];
  for (let i = coefficients.length - 2; i >= 0; i--) value = coefficients[i] + xx * value;
  return value;
}
/** Input is the source hash's normalized turn, 0 <= turn < 1. */
export function houndUnitDirection(turn: number) {
  const quarter = turn * 4,
    quadrant = Math.floor(quarter),
    x = (quarter - quadrant) * 1.5707963267948966,
    xx = x * x,
    sin = x * polynomial(SIN, xx),
    cos = polynomial(COS, xx);
  switch (quadrant) {
    case 0:
      return { x: cos, y: sin };
    case 1:
      return { x: -sin, y: cos };
    case 2:
      return { x: -cos, y: -sin };
    default:
      return { x: sin, y: -cos };
  }
}
