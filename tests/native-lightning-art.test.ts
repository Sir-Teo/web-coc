import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import source from '../reference/field-spells/effects.json';
import { GameModel, type Battle } from '../src/game/model';
import type { NativeArtPack } from '../src/game/native-art-pack';
import type { NativeMeshPose, NativeScenePose } from '../src/game/native-mesh';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import { capturedSpellEffectEvents } from '../src/game/native-spell-effects';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  BattleSoundLog,
  troopSoundCues,
  effectCue,
  spellSoundEffect,
} from '../src/game/troop-sounds';
import { nativeFieldSpellRecording } from './fixtures/native-field-spells';
import { defendingBuilderLightningRecording } from './fixtures/defending-builder-lightning';
const pack = JSON.parse(
  readFileSync(
    new URL('../public/assets/field-spells-native/lightning/graph.json', import.meta.url),
    'utf8',
  ),
) as NativeArtPack;
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const duration = (effect: string) => nativeEffectDuration(pack, effect, Infinity);
const leaves = (poses: readonly NativeScenePose[]): NativeMeshPose[] =>
  poses.flatMap((p) => ('group' in p ? leaves(p.group) : [p]));
function sample(battle: Battle, reduced = false) {
  const before = JSON.stringify(battle),
    events = capturedSpellEffectEvents(
      battle,
      'Lightning',
      source.spells.Lightning.levels,
      iso,
      reduced,
      duration,
    ),
    poses = events.flatMap((e) => nativeEffectPoses(pack, e, e.sampleAt, reduced));
  expect(JSON.stringify(battle)).toBe(before);
  return { events, poses };
}
it.each(Array.from({ length: 13 }, (_, i) => i + 1))(
  'Lightning level %s retains the bottle, source sky bolts, impact and crater after the physical pulse',
  (level) => {
    const r = nativeFieldSpellRecording('Lightning', level),
      at = (t: number) => r.snapshots.find((s) => s.at === t)!.battle as Battle;
    expect(
      sample(at(r.bottle)).poses.some(
        (p) => p.emitter === 'lightning_bottleDrop' && leaves(p.poses).length,
      ),
    ).toBe(true);
    const beforeHit = sample(at(r.beforeHit));
    expect(beforeHit.events.map((e) => [e.key, e.effect, e.at])).toEqual([
      ['spell:1:deploy', 'Lightning area small', 0.8],
      ['spell:1:charging', 'Lightning Spell', 0.8],
    ]);
    expect(beforeHit.poses.filter((p) => p.emitter === 'LightningSky')).toHaveLength(3);
    const impact = sample(at(r.pulsing));
    expect(impact.events.map((e) => e.key)).toEqual([
      'spell:1:deploy',
      'spell:1:charging',
      'spell:1:hit:0',
    ]);
    expect(impact.events.at(-1)).toMatchObject({ at: 0.9, ground: iso(11.5, 11.5) });
    for (const emitter of [
      'LightningSky',
      'Lightning_area_ring_small',
      'bomb_crater_small',
      'Stone',
    ])
      expect(
        impact.poses.some((p) => p.emitter === emitter && leaves(p.poses).length),
        emitter,
      ).toBe(true);
    expect(r.end).toBeCloseTo(0.9, 9);
    expect(at(r.afterLive).nativeSpells).toEqual([]);
    expect(
      sample(at(r.afterLive)).poses.some(
        (p) => p.emitter === 'bomb_crater_small' && leaves(p.poses).length,
      ),
    ).toBe(true);
    expect(sample(at(r.fieldAfter)).poses).toEqual([]);
    expect(sample(at(r.pulsing), true).events).toEqual([]);
  },
);
it('three scattered sky origins still stretch the original bolt art all the way to ground', () => {
  const r = nativeFieldSpellRecording('Lightning'),
    battle = r.snapshots.find((s) => s.at === r.beforeHit)!.battle as Battle,
    event = sample(battle).events.find((e) => e.key.endsWith(':charging'))!,
    bolts = nativeEffectPoses(pack, event, event.sampleAt, false);
  expect(event).toMatchObject({ target: iso(11.5, 11.5), targetedOrigins: true });
  expect(new Set(bolts.map((p) => p.x + ':' + p.y)).size).toBe(3);
  for (const bolt of bolts) {
    // Invert the isometric origin projection: every source spawn lies on the radius-80 circle.
    const dx = (bolt.x - event.ground.x) / 0.32,
      dy = (bolt.y - event.ground.y + 3200) / 0.16;
    expect(Math.hypot((dx + dy) / 2, (dy - dx) / 2)).toBeCloseTo(80, 8);
    const tx = event.target!.x - bolt.x,
      ty = event.target!.y - bolt.y,
      length = Math.hypot(tx, ty),
      positions = leaves(bolt.poses).flatMap((p) => {
        const [a, b, c, d, e, f] = p.matrix,
          result: number[] = [];
        for (let i = 0; i < p.vertices.length; i += 4) {
          const x = a * p.vertices[i] + b * p.vertices[i + 1] + c,
            y = d * p.vertices[i] + e * p.vertices[i + 1] + f;
          result.push((x * tx + y * ty) / length);
        }
        return result;
      });
    expect(positions.length).toBeGreaterThan(0);
    expect(Math.max(...positions)).toBeCloseTo(length, 5);
    expect(Math.min(...positions)).toBeCloseTo(0, 5);
  }
  // The opt-in leaves every legacy targeted caller unchanged, even after sharing the graph cache.
  const { targetedOrigins: _source, ...legacy } = event;
  const old = nativeEffectPoses(pack, legacy, event.sampleAt, false);
  expect(new Set(old.map((p) => p.x + ':' + p.y)).size).toBe(1);
  expect(nativeEffectPoses(pack, event, event.sampleAt, false)).toEqual(bolts);
  expect(nativeEffectPoses(pack, legacy, event.sampleAt, false)).toEqual(old);
});
it('resolved hit boundaries and the 6.501-second source crater tail remain deterministic', () => {
  const r = nativeFieldSpellRecording('Lightning'),
    battle = r.snapshots.find((s) => s.at === r.afterLive)!.battle as Battle;
  expect(duration('Lightning Spell Hit')).toBeCloseTo(6.501, 9);
  expect(
    sample({ ...battle, elapsed: 0.9 - 2e-9 }).events.some((e) => e.key.endsWith(':hit:0')),
  ).toBe(false);
  const exact = sample({ ...battle, elapsed: 0.9 - 5e-10 });
  expect(exact.events.find((e) => e.key.endsWith(':hit:0'))?.sampleAt).toBe(0.9);
  const tail = sample({ ...battle, elapsed: 7.2 });
  expect(tail.events.map((e) => e.key)).toEqual(['spell:1:hit:0']);
  expect(tail.poses.some((p) => p.emitter === 'bomb_crater_small' && leaves(p.poses).length)).toBe(
    true,
  );
  expect(sample({ ...battle, elapsed: 7.402 }).poses).toEqual([]);
  expect(
    sample({ ...battle, nativeSpellArt: battle.nativeSpellArt!.filter((n) => n !== 'Lightning') })
      .events,
  ).toEqual([]);
  expect(sample(JSON.parse(JSON.stringify(battle)))).toEqual(sample(battle));
});
it('live and retained Lightning phases share exactly four original sound keys', () => {
  const r = nativeFieldSpellRecording('Lightning'),
    log = new BattleSoundLog(),
    at = (t: number) => r.snapshots.find((s) => s.at === t)!.battle as Battle;
  troopSoundCues(at(r.bottle), log);
  const cues = troopSoundCues(at(r.afterLive), log).filter((c) => c.key.startsWith('spell:1:'));
  expect(cues).toEqual(
    (['preDeploy', 'deploy', 'charging', 'hit'] as const).map((phase) =>
      effectCue(
        spellSoundEffect('Lightning', 1, phase)!,
        `spell:1:${phase === 'hit' ? 'hit:0' : phase}`,
        phase === 'preDeploy' ? 0 : phase === 'hit' ? 0.9 : 0.8,
      ),
    ),
  );
  expect(new Set(cues.map((c) => c.key)).size).toBe(4);
});
it('portable forward and reverse seeks preserve version-123 damage, stun and Builder repair retargeting', () => {
  for (const r of [
    nativeFieldSpellRecording('Lightning', 1),
    nativeFieldSpellRecording('Lightning', 13),
    defendingBuilderLightningRecording(),
  ]) {
    const model = new GameModel();
    for (const version of [r.data.version, 123]) {
      const data = structuredClone(r.data);
      data.version = version;
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        const expected = JSON.parse(JSON.stringify(snapshot.battle)) as Battle,
          actual = JSON.parse(JSON.stringify(model.battle)) as Battle;
        if (version === 123) {
          expect(actual.nativeSpellArt).not.toContain('Lightning');
          expected.nativeSpellArt = actual.nativeSpellArt;
          delete expected.nativeSpellCastHistory;
          delete actual.nativeSpellCastHistory;
        }
        expect(actual).toEqual(expected);
      }
    }
  }
});
