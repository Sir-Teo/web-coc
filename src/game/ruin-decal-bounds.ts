import { BUILDINGS } from './data';
import { campArt } from './camp-art';
import type { Building } from './model';

interface World {
  left: number;
  ox: number;
  oy: number;
  width: number;
  height: number;
}
interface Ellipse {
  width: number;
  height: number;
  originX: number;
  originY: number;
  resolution: number;
}

/** Pixel bounds for every potential ruin, including intact buildings, on the original grid. */
export function ruinDecalBounds(
  buildings: readonly Building[],
  world: World,
  scale: number,
  ellipse: Ellipse,
) {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  const fx = ellipse.width / (64 * ellipse.resolution),
    fy = ellipse.height / (32 * ellipse.resolution);
  const include = (x: number, y: number, width: number, height: number) => {
    const w = width * fx,
      h = height * fy;
    left = Math.min(left, x - w * ellipse.originX);
    right = Math.max(right, x + w * (1 - ellipse.originX));
    top = Math.min(top, y - h * ellipse.originY);
    bottom = Math.max(bottom, y + h * (1 - ellipse.originY));
  };
  for (const b of buildings) {
    const definition = BUILDINGS[b.kind];
    const x = (world.ox + (b.x - b.y) * 32 - world.left) * scale,
      y = (world.oy + (b.x + b.y + definition.size) * 16) * scale,
      width = (b.kind === 'camp' ? campArt(b.level).width : definition.width) * 1.12 * scale;
    include(x, y + 4 * scale, width, width * 0.46);
    include(x, y, width * 0.76, width * 0.76 * 0.33);
  }
  if (!buildings.length) return { left: 0, top: 0, width: 2, height: 2 };
  // Match Phaser's even-sized original target and keep its clipping at the world edges.
  const fullWidth = Math.max(2, Math.ceil((world.width * scale) / 2) * 2),
    fullHeight = Math.max(2, Math.ceil((world.height * scale) / 2) * 2);
  left = Math.max(0, Math.min(fullWidth - 2, Math.floor(left) - 2));
  top = Math.max(0, Math.min(fullHeight - 2, Math.floor(top) - 2));
  right = Math.max(left + 2, Math.min(fullWidth, Math.ceil(right) + 2));
  bottom = Math.max(top + 2, Math.min(fullHeight, Math.ceil(bottom) + 2));
  if ((right - left) % 2) {
    if (right < fullWidth) right++;
    else left--;
  }
  if ((bottom - top) % 2) {
    if (bottom < fullHeight) bottom++;
    else top--;
  }
  // Phaser gives power-of-two drawing contexts REPEAT wrapping. Keep the old clamped
  // edge behavior, including when a ruin reaches the original world's clipped edge.
  const powerOfTwo = (n: number) => (n & (n - 1)) === 0;
  if (powerOfTwo(right - left) && powerOfTwo(bottom - top) && right - left < fullWidth) {
    if (right + 2 <= fullWidth) right += 2;
    else left -= 2;
  }
  return { left, top, width: right - left, height: bottom - top };
}
