import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import source from '../reference/field-spells/effects.json';
import { GameModel, type Battle } from '../src/game/model';
import type { NativeArtPack } from '../src/game/native-art-pack';
import type { NativeScenePose } from '../src/game/native-mesh';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import { capturedSpellEffectEvents } from '../src/game/native-spell-effects';
import { fieldSpellHistoryUntil } from '../src/game/field-spell-effects';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  BattleSoundLog,
  troopSoundCues,
  effectCue,
  spellSoundEffect,
} from '../src/game/troop-sounds';
import { num, nativeRow } from '../src/game/native-data';
import { nativeFieldSpellRecording } from './fixtures/native-field-spells';
import { nativeEarthquakeRecording } from './fixtures/native-earthquake';
const pack = JSON.parse(
  readFileSync(
    new URL('../public/assets/field-spells-native/earthquake/graph.json', import.meta.url),
    'utf8',
  ),
) as NativeArtPack;
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const duration = (effect: string) => nativeEffectDuration(pack, effect, Infinity);
const leaves = (poses: readonly NativeScenePose[]): number =>
  poses.reduce((sum, p) => sum + ('group' in p ? leaves(p.group) : 1), 0);
function sample(battle: Battle, reduced = false) {
  const before = JSON.stringify(battle),
    events = capturedSpellEffectEvents(
      battle,
      'Earthquake',
      source.spells.Earthquake.levels,
      iso,
      reduced,
      duration,
    ),
    poses = events.flatMap((e) => nativeEffectPoses(pack, e, e.sampleAt, reduced));
  expect(JSON.stringify(battle)).toBe(before);
  return { events, poses };
}
it.each([1, 2, 3, 4, 5, 6, 7, 8])(
  'Earthquake level %s preserves its bottle, level-specific rings, debris and durable source scars',
  (level) => {
    const r = nativeFieldSpellRecording('Earthquake', level),
      at = (t: number) => r.snapshots.find((s) => s.at === t)!.battle as Battle,
      profile = source.spells.Earthquake.levels[level - 1];
    expect(
      sample(at(r.bottle)).poses.some(
        (p) => p.emitter === 'Earthquake_bottleDrop' && leaves(p.poses),
      ),
    ).toBe(true);
    const landing = sample(at(r.landing)),
      ring = `Earthquake_rangeRing${Math.min(level - 1, 4)}`;
    expect(landing.events.map((e) => [e.key, e.effect, e.at])).toEqual([
      ['spell:1:deploy', profile.DeployEffect, 0.8],
      ['spell:1:deploy2', profile.DeployEffect2, 0.8],
    ]);
    for (const emitter of [ring, ring + '_top', 'Earthquake_debris', 'Earthquake_crackCenter'])
      expect(
        landing.poses.some((p) => p.emitter === emitter && leaves(p.poses)),
        emitter,
      ).toBe(true);
    expect(r.end).toBeCloseTo(3.1, 9);
    const late = at(r.steady),
      scars = sample(late);
    expect(late.elapsed).toBeCloseTo(45, 9);
    expect(late.nativeSpells).toEqual([]);
    expect(late.nativeSpellCastHistory).toHaveLength(1);
    expect(late.nativeSpellCastHistory![0]).toMatchObject({ hits: 5, ended: true });
    expect(scars.events.map((e) => e.key)).toEqual(['spell:1:deploy']);
    expect(scars.poses).toHaveLength(66);
    expect(new Set(scars.poses.map((p) => p.emitter))).toEqual(
      new Set([
        'Earthquake_crack',
        'Earthquake_crackCenter',
        'Earthquake_crackDarken',
        'Earthquake_stoneStatic',
      ]),
    );
    expect(scars.poses.every((p) => leaves(p.poses) > 0)).toBe(true);
    expect(sample(late, true).poses).toEqual([]);
    expect(
      troopSoundCues(late, new BattleSoundLog()).filter((c) => c.key.startsWith('spell:1:')),
    ).toEqual([]);
    expect(at(r.fieldAfter).finished).toBe(true);
    expect(
      sample({ ...late, nativeSpellArt: late.nativeSpellArt!.filter((n) => n !== 'Earthquake') })
        .events,
    ).toEqual([]);
  },
);
it('Earthquake retains the complete source tail without changing shorter fields or source duration caches', () => {
  const r = nativeFieldSpellRecording('Earthquake'),
    battle = r.snapshots.find((s) => s.at === r.steady)!.battle as Battle,
    cast = battle.nativeSpellCastHistory![0],
    profile = source.spells.Earthquake.levels[0];
  expect(duration(profile.DeployEffect)).toBeCloseTo(302.5, 9);
  expect(profile.retainSeconds).toBeCloseTo(0.8 + duration(profile.DeployEffect), 9);
  expect(fieldSpellHistoryUntil(cast)).toBeCloseTo(303.3, 9);
  expect(fieldSpellHistoryUntil({ ...cast, name: 'Healing' })).toBe(cast.castAt);
  expect(nativeEffectDuration(pack, profile.DeployEffect)).toBe(30);
  const far = sample({ ...battle, elapsed: 179.95 });
  expect(far.poses).toHaveLength(66);
  expect(far.poses.map((p) => p.key)).toEqual(sample(battle).poses.map((p) => p.key));
  expect(far.poses.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  const earlyCenter = sample(battle).poses.find((p) => p.emitter === 'Earthquake_crackCenter')!,
    lateCenter = far.poses.find((p) => p.emitter === 'Earthquake_crackCenter')!;
  // Source speed 1 and inertia 22 keep the central crack anchored; other particles retain motion.
  expect(Math.hypot(lateCenter.x - earlyCenter.x, lateCenter.y - earlyCenter.y)).toBeLessThan(0.1);
  expect(sample({ ...battle, elapsed: 303.301 }).poses).toEqual([]);
  expect(sample(JSON.parse(JSON.stringify(battle)))).toEqual(sample(battle));
});
it('Earthquake keeps one original fall and landing cue, with no replay of sounds on a late cold view', () => {
  const r = nativeFieldSpellRecording('Earthquake'),
    battle = r.snapshots.find((s) => s.at === r.pulsing)!.battle as Battle,
    cues = troopSoundCues(battle, new BattleSoundLog()).filter((c) => c.key.startsWith('spell:1:'));
  expect(cues).toEqual(
    (['preDeploy', 'deploy2'] as const).map((phase) =>
      effectCue(
        spellSoundEffect('Earthquake', 1, phase)!,
        `spell:1:${phase}`,
        phase === 'preDeploy' ? 0 : 0.8,
      ),
    ),
  );
});
it.each([1, 8])(
  'four level-%s Earthquakes retain diminishing damage and fourth-cast wall destruction through version-124 portable seeks',
  (level) => {
    const r = nativeEarthquakeRecording(level),
      model = new GameModel(),
      at = (t: number) => r.snapshots.find((s) => s.at === t)!.battle as Battle,
      first = at(r.impacts[0]).buildings.find((b) => b.id === 2)!,
      second = at(r.impacts[1]).buildings.find((b) => b.id === 2)!,
      permil = num(nativeRow('spells', 'Earthquake', level), 'BuildingDamagePermil');
    expect(first.maxHp - first.hp).toBeCloseTo((first.maxHp * permil * 5) / 1000, 6);
    expect(first.hp - second.hp).toBeCloseTo((first.maxHp - first.hp) / 3, 6);
    expect(at(r.impacts[2]).buildings.find((b) => b.id === 3)!.hp).toBeGreaterThan(0);
    expect(at(r.impacts[3]).buildings.find((b) => b.id === 3)!.hp).toBe(0);
    expect(at(r.scars).nativeSpellCastHistory).toHaveLength(4);
    expect(sample(at(r.scars)).poses).toHaveLength(4 * 66);
    for (const version of [r.data.version, 124]) {
      const data = structuredClone(r.data);
      data.version = version;
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        const expected = JSON.parse(JSON.stringify(snapshot.battle)) as Battle,
          actual = JSON.parse(JSON.stringify(model.battle)) as Battle;
        if (version === 124) {
          expect(actual.nativeSpellArt).not.toContain('Earthquake');
          expected.nativeSpellArt = actual.nativeSpellArt;
          delete expected.nativeSpellCastHistory;
          delete actual.nativeSpellCastHistory;
        }
        expect(actual).toEqual(expected);
      }
    }
  },
);
