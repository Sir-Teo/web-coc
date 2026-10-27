import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import source from '../reference/field-spells/effects.json';
import type { Battle } from '../src/game/model';
import type { NativeArtPack } from '../src/game/native-art-pack';
import type { NativeScenePose } from '../src/game/native-mesh';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import { capturedSpellEffectEvents } from '../src/game/native-spell-effects';
import {
  BattleSoundLog,
  troopSoundCues,
  effectCue,
  spellSoundEffect,
} from '../src/game/troop-sounds';
import { nativeFieldSpellRecording } from './fixtures/native-field-spells';
const pack = JSON.parse(
  readFileSync(
    new URL('../public/assets/field-spells-native/recall/graph.json', import.meta.url),
    'utf8',
  ),
) as NativeArtPack;
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const duration = (effect: string) => nativeEffectDuration(pack, effect, Infinity);
const leaves = (poses: readonly NativeScenePose[]): number =>
  poses.reduce((n, p) => n + ('group' in p ? leaves(p.group) : 1), 0);
function sample(battle: Battle, reduced = false) {
  const before = JSON.stringify(battle),
    events = capturedSpellEffectEvents(
      battle,
      'Recall',
      source.spells.Recall.levels,
      iso,
      reduced,
      duration,
    ),
    poses = events.flatMap((e) => nativeEffectPoses(pack, e, e.sampleAt, reduced));
  expect(JSON.stringify(battle)).toBe(before);
  return { events, poses };
}
it.each([1, 2, 3, 4, 5, 6, 7])(
  'Recall level %s preserves its original bottle, shrinking circles, sparks and audio',
  (level) => {
    const r = nativeFieldSpellRecording('Recall', level),
      at = (t: number) => r.snapshots.find((s) => s.at === t)!.battle as Battle;
    expect(
      sample(at(r.bottle)).poses.some(
        (p) => p.emitter === 'recall_bottleDrop' && leaves(p.poses) > 0,
      ),
    ).toBe(true);
    expect(sample(at(r.landing)).events.map((e) => [e.key, e.effect, e.at])).toEqual([
      ['spell:1:deploy', 'RecallDeployAuraGround', 0.8],
      ['spell:1:deploy2', 'RecallDeployAuraTop', 0.8],
    ]);
    const steady = sample(at(r.pulsing));
    expect(
      sample(at(r.landing)).poses.some(
        (p) => p.emitter === 'RecallCircleTwirl' && leaves(p.poses) > 0,
      ),
    ).toBe(true);
    for (const emitter of ['RecallCircleGround', 'RecallSpellSparks'])
      expect(
        steady.poses.some((p) => p.emitter === emitter && leaves(p.poses) > 0),
        emitter,
      ).toBe(true);
    expect(r.end).toBeCloseTo(0.9, 9);
    expect(at(r.afterLive).nativeSpells).toEqual([]);
    expect(sample(at(r.afterLive)).poses.length).toBeGreaterThan(0);
    expect(sample(at(r.fieldAfter)).poses).toEqual([]);
    expect(sample(at(r.pulsing), true).poses).toEqual([]);
    const cues = troopSoundCues(at(r.pulsing), new BattleSoundLog()).filter((c) =>
      c.key.startsWith('spell:1:'),
    );
    expect(cues).toEqual(
      ['preDeploy', 'deploy2'].map((event) =>
        effectCue(
          spellSoundEffect('Recall', level, event as 'preDeploy' | 'deploy2')!,
          `spell:1:${event}`,
          event === 'preDeploy' ? 0 : 0.8,
        ),
      ),
    );
    const legacy = structuredClone(at(r.pulsing));
    legacy.nativeSpellArt = ['Jump', 'Rage', 'Haste', 'Healing', 'Poison', 'Clone', 'Invisibility'];
    expect(sample(legacy).events).toEqual([]);
  },
);
it('Recall retains source spark tails after both shrinking circles retire', () => {
  const r = nativeFieldSpellRecording('Recall'),
    battle = r.snapshots.find((s) => s.at === r.afterLive)!.battle as Battle;
  expect(duration('RecallDeployAuraGround')).toBeCloseTo(2.001, 9);
  expect(duration('RecallDeployAuraTop')).toBeCloseTo(3.5, 9);
  const tail = sample({ ...battle, elapsed: 3.2 });
  expect(tail.events.map((e) => e.effect)).toEqual(['RecallDeployAuraTop']);
  expect(tail.poses.some((p) => p.emitter === 'RecallSpellSparks' && leaves(p.poses) > 0)).toBe(
    true,
  );
  expect(tail.poses.some((p) => p.emitter === 'RecallCircleTwirl')).toBe(false);
  expect(sample({ ...battle, elapsed: 4.35 }).poses).toEqual([]);
});
