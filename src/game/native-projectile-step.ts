import { nativeRow, num } from './native-data';

/** Original d8b308 advances motion and the stop counter in16/1000-second steps. */
export const NATIVE_PROJECTILE_STEP = 0.016;

/**
 * Original collision is tested before StopToTargetTime. A target reachable in one
 * native step gets no hold. Longer equipment ricochets consume the stop counter
 * without moving; this returns that hold for the browser's continuous flight model.
 */
export function nativeProjectileBouncePause(
  name: string,
  fromX: number,
  fromY: number,
  x: number,
  y: number,
) {
  const row = nativeRow('projectiles', name);
  const stop = num(row, 'StopToTargetTime');
  if (stop <= 0 || num(row, 'FixedTravelTime') > 0) return 0;
  const nativeSpeed = Math.trunc((num(row, 'Speed') * 512) / 100);
  const step = Math.trunc((nativeSpeed * 16) / 1000) * 8;
  const dx = Math.trunc((x - fromX) * 4096),
    dy = Math.trunc((y - fromY) * 4096);
  if (dx * dx + dy * dy <= step * step) return 0;
  return Math.ceil(stop / 16) * NATIVE_PROJECTILE_STEP;
}
