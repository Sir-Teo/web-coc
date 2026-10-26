import { expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import source from '../reference/electromite/effects.json';
import manifest from '../reference/full-client/manifest.json';
import { nativeEffectPoses } from '../src/game/native-effects';
import type { NativeArtPack } from '../src/game/native-art-pack';
import type { Battle } from '../src/game/model';
import { electromiteEffectEvents } from '../src/game/electromite-effects';
import {
  BattleSoundLog,
  troopSoundCues,
  troopSoundEffect,
  effectCue,
} from '../src/game/troop-sounds';
import { nativeElectromiteRecording } from './fixtures/native-electromite';

const root = new URL('../', import.meta.url);
it('the original Electromite packs match source pins, graph bytes and complete pack sizes', () => {
  const pins = new Map(manifest.files.map((f) => [f.path, f.sha256]));
  for (const [path, pin] of Object.entries(source.sources)) expect(pins.get(path), path).toBe(pin);
  for (const pack of Object.values(source.packs)) {
    const file = new URL('public/' + pack.path, root),
      data = readFileSync(file);
    expect(createHash('sha256').update(data).digest('hex')).toBe(pack.sha256);
    const folder = new URL('./', file),
      size = (dir: URL): number =>
        readdirSync(dir).reduce((sum, name) => {
          const p = new URL(name, dir);
          return (
            sum + (statSync(p).isDirectory() ? size(new URL(name + '/', dir)) : statSync(p).size)
          );
        }, 0);
    expect(size(folder)).toBe(pack.bytes);
    const graph = JSON.parse(data.toString()) as NativeArtPack;
    expect(graph.skipped).toBeUndefined();
  }
});
it('source targeted lightning and impact particles sample deterministically without changing combat', () => {
  const r = nativeElectromiteRecording(),
    battle = r.snapshots.find((s) => s.at === r.visible)!.battle as Battle;
  const before = JSON.stringify(battle),
    events = electromiteEffectEvents(battle, (x, y) => ({ x: (x - y) * 32, y: (x + y) * 16 }), 46);
  expect(events.some((e) => e.effect === 'Zappies Attack')).toBe(true);
  expect(events.some((e) => e.effect === 'SuperYetimite Hit')).toBe(true);
  for (const event of events) {
    const id = source.effects[event.effect as keyof typeof source.effects],
      pack = JSON.parse(
        readFileSync(
          new URL('public/' + source.packs[id as keyof typeof source.packs].path, root),
          'utf8',
        ),
      ) as NativeArtPack;
    const poses = nativeEffectPoses(pack, event, battle.elapsed, false);
    expect(poses.length).toBeGreaterThan(0);
    expect(nativeEffectPoses(pack, event, battle.elapsed, false)).toEqual(poses);
  }
  expect(JSON.stringify(battle)).toBe(before);
});
it('one cast and each reached target retain original sound parameters after the caster disappears', () => {
  const r = nativeElectromiteRecording(8),
    battle = r.snapshots.find((s) => s.at === r.third)!.battle as Battle;
  battle.units = [];
  const before = JSON.stringify(battle),
    cues = troopSoundCues(battle, new BattleSoundLog()),
    owned = cues.filter((c) => c.key.startsWith(`electromite:${r.childId}:`));
  expect(owned.filter((c) => c.key.endsWith(':attack'))).toHaveLength(1);
  expect(owned.filter((c) => c.key.endsWith(':hit'))).toHaveLength(3);
  for (const [i, target] of r.targets.entries())
    for (const event of (i === 0 ? ['attack', 'hit'] : ['hit']) as ('attack' | 'hit')[]) {
      const key = `${target.key}:${event}`;
      expect(owned.find((c) => c.key === key)).toEqual(
        effectCue(troopSoundEffect('electromite', 8, event)!, key, target.at),
      );
    }
  expect(JSON.stringify(battle)).toBe(before);
});
