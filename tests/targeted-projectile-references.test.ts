import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import combat from '../reference/full-client/combat.json';
import effectArt from '../reference/full-client/effect-art.json';
import type { NativeArtPack } from '../src/game/native-art-pack';
import { nativeTrailBirths, nativeTrailPoses } from '../src/game/native-effects';
import type { NativeScenePose, NativeMeshPose } from '../src/game/native-mesh';
import {
  airDefenseProjectileName,
  nativeProjectileFlight,
  nativeProjectilePack,
  nativeProjectilePoses,
  type NativeProjectilePack,
} from '../src/game/native-projectile-poses';

const read = <T>(path: string): T => JSON.parse(readFileSync('public/' + path, 'utf8'));
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const leaves = (poses: NativeScenePose[]): NativeMeshPose[] =>
  poses.flatMap((pose) => ('group' in pose ? leaves(pose.group) : [pose]));

describe('retained projectile references', () => {
  it('resolves drawable Firework art at all Air Defense levels without retiming impacts', () => {
    let source: string | undefined;
    for (const [index, level] of combat.buildings['Air Defense'].entries()) {
      source = level.Projectile ?? source;
      const name = airDefenseProjectileName(index + 1);
      expect(name).toBe(source);
      const pack = read<NativeProjectilePack>(nativeProjectilePack(name)!);
      const row = pack.projectiles[name];
      const shot = { fromX: 10, fromY: 10, x: 14, y: 12, launched: 2, impact: 2.2, toAir: true };
      const flight = nativeProjectileFlight(row, shot, 2.1, { iso, airLift: 46 });
      expect(flight.end).toBe(shot.impact);
      expect(leaves(nativeProjectilePoses(pack, row, flight, 2.1, 2).poses).length).toBeGreaterThan(0);
    }
  });

  it('closes every projectile reference across all compiled source tables', () => {
    const columns = new Set([
      'Projectile',
      'AltProjectile',
      'ProjectileOnActivation',
      'ReflectProjectile',
      'TargetedProjectile',
    ]);
    const missing: string[] = [];
    const visit = (value: unknown, path: string) => {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (columns.has(key) && typeof child === 'string') {
          for (const name of child
            .split(';')
            .map((s) => s.trim())
            .filter(Boolean))
            if (!Object.hasOwn(combat.projectiles, name)) missing.push(`${path}/${key}: ${name}`);
        } else visit(child, `${path}/${key}`);
      }
    };
    visit(combat, 'combat');
    expect(missing).toEqual([]);
  });

  const name = combat.spells.Revive[0].TargetedProjectile;
  const pack = read<NativeProjectilePack>(nativeProjectilePack(name)!);
  const row = pack.projectiles[name];
  // A synthetic launch tests the retained presentation in isolation. Live Revive launch timing
  // remains a separate source audit; this catalog change does not bind a gameplay projectile.
  const shot = { fromX: 10, fromY: 10, x: 14, y: 12, launched: 2, impact: 9 };
  const flight = (at: number) => nativeProjectileFlight(row, shot, at, { iso, airLift: 46 });

  it('loads the original targeted flight with its own travel clock and drawable geometry', () => {
    expect(row.ExportName).toBe('fx_spell_revive_potion_projectile');
    expect(row.FixedTravelTime).toBe(combat.projectiles[name][0].FixedTravelTime);
    expect(flight(2).height).toBe(200);
    expect(flight(2.4).end).toBeCloseTo(2.8, 10);
    expect(flight(2.4).t).toBeCloseTo(0.5, 10);
    expect(flight(2.8).height).toBeCloseTo(16, 10);
    const before = JSON.stringify(pack);
    for (const at of [2, 2.2, 2.4, 2.79]) {
      const poses = leaves(nativeProjectilePoses(pack, row, flight(at), at, 2).poses);
      expect(poses.length).toBeGreaterThan(0);
      for (const pose of poses)
        expect([...pose.vertices, ...pose.matrix].every(Number.isFinite)).toBe(true);
    }
    expect(JSON.stringify(pack)).toBe(before);
  });

  it('resolves its source sparkle trail, resamples deterministically and retires after flight', () => {
    const emitterName = row.ParticleEmitter!;
    const emitters = effectArt.emitters as Record<string, keyof typeof effectArt.packs>;
    const trail = read<NativeArtPack>(effectArt.packs[emitters[emitterName]].path);
    const emitter = trail.emitters[emitterName][0];
    const before = JSON.stringify(trail);
    const sample = (at: number, reduced = false) => {
      const births = nativeTrailBirths(emitter, shot.launched, flight(at).end, at).map((birth) => {
        const point = flight(birth.at);
        return { ...birth, ground: { x: point.x, y: point.y } };
      });
      return nativeTrailPoses(trail, emitterName, 'revive:catalog', births, at, reduced);
    };
    const original = sample(2.5);
    expect(leaves(original.flatMap((pose) => pose.poses)).length).toBeGreaterThan(0);
    sample(3.1);
    expect(sample(2.5)).toEqual(original);
    expect(sample(2.5, true)).toEqual([]);
    expect(sample(3.61)).toEqual([]);
    expect(JSON.stringify(trail)).toBe(before);
  });
});
