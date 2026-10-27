import { expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import source from '../reference/electro-dragon/effects.json';
import manifest from '../reference/full-client/manifest.json';
import { splitTiming } from '../src/game/garrison-kinds';
import { nativeUnitRow } from '../src/game/native-units';
import { nativeEffectPoses } from '../src/game/native-effects';
import type { NativeArtPack } from '../src/game/native-art-pack';
import type { Battle } from '../src/game/model';
import { electroDragonEffectEvents } from '../src/game/electro-dragon-effects';
import {
  BattleSoundLog,
  troopSoundCues,
  troopSoundEffect,
  effectCue,
} from '../src/game/troop-sounds';
import { nativeElectroDragonRecording } from './fixtures/native-electro-dragon';

const root = new URL('../', import.meta.url);
it('the original ElectroDragon packs match source pins, graph bytes and complete pack sizes', () => {
  const pins = new Map(manifest.files.map((f) => [f.path, f.sha256]));
  for (const [path, pin] of Object.entries(source.sources)) expect(pins.get(path), path).toBe(pin);
  for (const pack of Object.values({ ...source.packs, ...source.externalEffects })) {
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
  const r = nativeElectroDragonRecording(),
    battle = r.snapshots.find((s) => s.at === r.visible)!.battle as Battle;
  const before = JSON.stringify(battle),
    events = electroDragonEffectEvents(
      battle,
      (x, y) => ({ x: (x - y) * 32, y: (x + y) * 16 }),
      46,
    );
  expect(events.some((e) => e.effect === 'Electro Dragon Attack')).toBe(true);
  expect(events.some((e) => e.effect === 'Mega Tesla Hit')).toBe(true);
  for (const event of events) {
    const id = source.effects[event.effect as keyof typeof source.effects],
      record =
        source.packs[id as keyof typeof source.packs] ??
        source.externalEffects[event.effect as keyof typeof source.externalEffects],
      pack = JSON.parse(
        readFileSync(new URL('public/' + record.path, root), 'utf8'),
      ) as NativeArtPack;
    const poses = nativeEffectPoses(pack, event, battle.elapsed, false);
    expect(poses.length).toBeGreaterThan(0);
    expect(nativeEffectPoses(pack, event, battle.elapsed, false)).toEqual(poses);
  }
  expect(JSON.stringify(battle)).toBe(before);
});
it('one cast and each reached target retain original sound parameters after the caster disappears', () => {
  const r = nativeElectroDragonRecording(9),
    battle = r.snapshots.find((s) => s.at === r.last)!.battle as Battle;
  battle.units = [];
  const before = JSON.stringify(battle),
    cues = troopSoundCues(battle, new BattleSoundLog()),
    owned = cues.filter((c) => c.key.startsWith(`electrodragon:${r.sourceId}:`));
  expect(owned.filter((c) => c.key.endsWith(':attack'))).toHaveLength(1);
  expect(owned.filter((c) => c.key.endsWith(':hit'))).toHaveLength(5);
  for (const [i, target] of r.targets.entries())
    for (const event of (i === 0 ? ['attack', 'hit'] : ['chain', 'hit']) as (
      'attack' | 'chain' | 'hit'
    )[]) {
      const key = `${target.key}:${event}`;
      expect(owned.find((c) => c.key === key)).toEqual(
        effectCue(troopSoundEffect('electrodragon', 9, event)!, key, target.at),
      );
    }
  expect(JSON.stringify(battle)).toBe(before);
});

it('attachment positions and each original effect lifetime are respected independently', () => {
  const r = nativeElectroDragonRecording(),
    battle = r.snapshots.find((s) => s.at === r.visible)!.battle as Battle;
  const iso = (x: number, y: number) => ({ x, y });
  const events = electroDragonEffectEvents(battle, iso, 46, () => ({ x: 123, y: 456 }));
  expect(events.find((e) => e.key.endsWith(':bolt'))).toMatchObject({
    ground: { x: 123, y: 456 },
    lift: 0,
  });
  battle.elapsed = r.first + 3;
  const later = electroDragonEffectEvents(battle, iso, 46, undefined, (effect) =>
    effect === 'Mega Tesla Hit' ? 1 : 4,
  );
  expect(later.map((e) => e.effect)).toEqual(['Electro Dragon Attack']);
  battle.elapsed = r.first + 5;
  expect(electroDragonEffectEvents(battle, iso, 46, undefined, () => 4)).toEqual([]);
});

it('every original Electro Dragon attack clip agrees with the captured split-timer action', () => {
  const pack = JSON.parse(
    readFileSync(new URL('public/assets/troops-native/electrodragon/graph.json', root), 'utf8'),
  );
  expect(pack.levels).toHaveLength(9);
  for (const row of pack.levels) {
    const timing = splitTiming(nativeUnitRow('electrodragon', row.level));
    const state = row.states.attack,
      graph = pack.scenes[state.scene];
    expect(timing.firstHit).toBe(2.875);
    expect(timing.recovery).toBe(0.625);
    for (const name of state.exports)
      expect(state.actionFrame / graph.clips[graph.exports[name]].fps).toBe(timing.firstHit);
  }
});
