import { expect, it } from 'vitest';
import { archerTowerProjectilePose } from '../src/game/archer-tower-projectile';
import { archerTowerProjectileRow } from '../src/game/archer-tower-stats';
import type { CombatProjectile } from '../src/game/projectiles';
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const shot = (level: number): CombatProjectile => ({
  id: '1:1',
  sourceId: 1,
  targetId: 2,
  targetBuilding: false,
  weapon: 'arrow',
  variant: level,
  fromX: 0,
  fromY: 0,
  x: 10,
  y: 0,
  launched: 1,
  impact: 2,
  damage: 1,
  flight: { x: 0, y: 0, at: 1 },
});
it('renders all source tier variants and preserves isolated blend groups', () => {
  const exports = new Set<string>();
  let groups = 0;
  for (let level = 1; level <= 21; level++) {
    const p = shot(level),
      row = archerTowerProjectileRow(level);
    const pose = archerTowerProjectilePose(p, 1.1, iso);
    expect(pose.export).toBe(row.ExportName);
    exports.add(pose.export);
    expect(pose.x).toBe(16); // 50 source units = half a map tile forward.
    expect(pose.y).toBe(8 - 190 * 0.6);
    const pending = [...pose.poses];
    expect(pending.length).toBeGreaterThan(0);
    while (pending.length) {
      const item = pending.pop()!;
      if ('group' in item) {
        groups++;
        expect(item.blend).toBe(8);
        pending.push(...item.group);
      } else expect([...item.matrix, ...item.vertices].every(Number.isFinite)).toBe(true);
    }
    expect(archerTowerProjectilePose(p, 0.9, iso).poses).toEqual([]);
  }
  expect(exports.size).toBe(4);
  expect(groups).toBeGreaterThan(0);
});
it('points the source +Y tip toward ground and airborne targets after turns', () => {
  for (const height of [16, 96])
    for (let i = 0; i < 8; i++) {
      const p = shot(11);
      p.x = Math.cos((i * Math.PI) / 4) * 10;
      p.y = Math.sin((i * Math.PI) / 4) * 10;
      p.flight = { x: p.x * 0.4, y: p.y * 0.4, at: 1.2 };
      const pose = archerTowerProjectilePose(p, 1.2, iso, height);
      const target = iso(p.x, p.y);
      expect(Math.atan2(target.y - height - pose.y, target.x - pose.x)).toBeCloseTo(
        pose.rotation + Math.PI / 2,
      );
      expect(pose.progress).toBeCloseTo(0.4);
      expect(archerTowerProjectilePose(JSON.parse(JSON.stringify(p)), 1.2, iso, height)).toEqual(
        pose,
      );
      p.flight.x = p.x;
      p.flight.y = p.y;
      const arrived = archerTowerProjectilePose(p, 2, iso, height);
      expect(arrived.x).toBeCloseTo(target.x);
      expect(arrived.y).toBeCloseTo(target.y - height);
    }
});
