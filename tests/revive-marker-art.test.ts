import { expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import source from '../reference/revive/effects.json';
import manifest from '../reference/full-client/manifest.json';
import type { NativeArtPack } from '../src/game/native-art-pack';
import type { NativeScenePose } from '../src/game/native-mesh';
import { nativeEffectPoses } from '../src/game/native-effects';
import { reviveIndicatorEvents, reviveIndicatorBounds } from '../src/game/revive-target-effects';
import { prepareReviveTargeting, reviveTargetingRecording } from './fixtures/revive-targeting';
import type { Battle } from '../src/game/model';
const root = new URL('../', import.meta.url),
  record = source.packs.target,
  pack = JSON.parse(readFileSync(new URL('public/' + record.path, root), 'utf8')) as NativeArtPack,
  iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 }),
  leaves = (poses: readonly NativeScenePose[]): NativeScenePose[] =>
    poses.flatMap((p) => ('group' in p ? leaves(p.group) : [p]));
it('Revive marker bytes, graph and long-lived source emitter reproduce source pins', () => {
  const pins = new Map(manifest.files.map((r) => [r.path, r.sha256]));
  for (const [path, pin] of Object.entries(source.sources)) expect(pins.get(path)).toBe(pin);
  const file = new URL('public/' + record.path, root);
  expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(record.sha256);
  const size = (dir: URL): number =>
    readdirSync(dir).reduce((sum, name) => {
      const p = new URL(name, dir);
      return sum + (statSync(p).isDirectory() ? size(new URL(name + '/', dir)) : statSync(p).size);
    }, 0);
  expect(size(new URL('./', file))).toBe(record.bytes);
  expect(pack.emitters.hero_revivable[0]).toMatchObject({
    ParticleCount: '1',
    MinLife: '200000',
    MaxLife: '200000',
    StartScale: '80',
    EndScale: '80',
  });
});
it('the original marker is read-only and its hit bounds contain every rendered source vertex', () => {
  const { battle } = prepareReviveTargeting(),
    before = JSON.stringify(battle),
    events = reviveIndicatorEvents(battle, iso, false);
  expect(events).toHaveLength(1);
  const event = events[0],
    bounds = reviveIndicatorBounds(pack, event)!;
  const poses = nativeEffectPoses(pack, event, event.sampleAt, false);
  expect(poses.length).toBeGreaterThan(0);
  for (const particle of poses)
    for (const leaf of leaves(particle.poses)) {
      if ('group' in leaf) continue;
      const m = leaf.matrix;
      for (let i = 0; i < leaf.vertices.length; i += 4) {
        const x = particle.x + m[0] * leaf.vertices[i] + m[1] * leaf.vertices[i + 1] + m[2],
          y = particle.y + m[3] * leaf.vertices[i] + m[4] * leaf.vertices[i + 1] + m[5];
        expect(x).toBeGreaterThanOrEqual(bounds.left - 1e-6);
        expect(x).toBeLessThanOrEqual(bounds.right + 1e-6);
        expect(y).toBeGreaterThanOrEqual(bounds.top - 1e-6);
        expect(y).toBeLessThanOrEqual(bounds.bottom + 1e-6);
      }
    }
  expect(JSON.stringify(battle)).toBe(before);
});
it('reduced motion retains one stable full-opacity source pose', () => {
  const { battle } = prepareReviveTargeting(),
    one = reviveIndicatorEvents(battle, iso, true)[0],
    later = reviveIndicatorEvents({ ...battle, elapsed: battle.elapsed + 2 }, iso, true)[0];
  expect(later).toEqual(one);
  const poses = nativeEffectPoses(pack, one, one.sampleAt, false);
  expect(poses.flatMap((p) => leaves(p.poses)).some((p) => p.multiply[3] > 0.9)).toBe(true);
});
it('markers disappear when queued, revived, exhausted, ejected, or playing an older version', () => {
  const r = reviveTargetingRecording(),
    at = (t: number) => r.snapshots.find((s) => s.at === t)!.battle as Battle;
  expect(reviveIndicatorEvents(at(r.waiting), iso, false)).toEqual([]);
  expect(reviveIndicatorEvents(at(r.revived), iso, false)).toEqual([]);
  const battle = structuredClone(at(r.knocked));
  battle.spells.revive = 0;
  expect(reviveIndicatorEvents(battle, iso, false)).toEqual([]);
  battle.spells.revive = 1;
  battle.units.find((u) => u.id === r.queenId)!.ejected = true;
  expect(reviveIndicatorEvents(battle, iso, false)).toEqual([]);
  delete battle.units.find((u) => u.id === r.queenId)!.ejected;
  delete battle.nativeReviveTargets;
  expect(reviveIndicatorEvents(battle, iso, false)).toEqual([]);
});
