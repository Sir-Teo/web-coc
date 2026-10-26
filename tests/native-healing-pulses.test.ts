import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import source from '../reference/field-spells/effects.json';
import type { Battle } from '../src/game/model';
import type { NativeArtPack } from '../src/game/native-art-pack';
import { capturedSpellEffectEvents } from '../src/game/native-spell-effects';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import { spellRandom } from '../src/game/native-spells';
import { BattleSoundLog, troopSoundCues } from '../src/game/troop-sounds';
import { nativeFieldSpellRecording } from './fixtures/native-field-spells';
import { nativeHealingSpellRecording } from './fixtures/native-healing-spell';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
const pack = JSON.parse(
  readFileSync(
    new URL('../public/assets/field-spells-native/heal/graph.json', import.meta.url),
    'utf8',
  ),
) as NativeArtPack;
const duration = (effect: string) => nativeEffectDuration(pack, effect, Infinity);
const iso = (x: number, y: number) => ({ x, y });
const events = (battle: Battle, reduced = false) =>
  capturedSpellEffectEvents(
    battle,
    'Healing',
    source.spells.Healing.levels,
    iso,
    reduced,
    duration,
  );
const pulses = (battle: Battle) => events(battle).filter((e) => e.effect === 'Heal spell');
it.each(Array.from({ length: 12 }, (_, i) => i + 1))(
  'Healing level %s reconstructs resolved graphics-only scatter without mutating its cast',
  (level) => {
    const r = nativeFieldSpellRecording('Healing', level),
      battle = r.snapshots.find((s) => s.at === r.pulsing)!.battle as Battle,
      cast = battle.nativeSpellCastHistory![0],
      before = JSON.stringify(battle),
      actual = pulses(battle);
    expect(source.spells.Healing.levels[level - 1]).toMatchObject({
      HitEffect: 'Heal spell',
      hitRadiusTiles: 2,
      graphicsOnlyRadius: true,
    });
    expect(actual.map((e) => [e.key, e.at])).toEqual([
      ['spell:1:hit:0', 1.5],
      ['spell:1:hit:1', 1.8],
    ]);
    actual.forEach((event, index) => {
      const angle = spellRandom(cast.seed, index * 2) * Math.PI * 2,
        reach = Math.sqrt(spellRandom(cast.seed, index * 2 + 1)) * 2;
      expect(event.ground).toEqual({
        x: cast.x + Math.cos(angle) * reach,
        y: cast.y + Math.sin(angle) * reach,
      });
      expect(Math.hypot(event.ground.x - cast.x, event.ground.y - cast.y)).toBeLessThanOrEqual(2);
      expect(event.sampleAt).toBeGreaterThanOrEqual(event.at);
    });
    expect(
      actual
        .flatMap((e) => nativeEffectPoses(pack, e, e.sampleAt, false))
        .some((p) => p.emitter === 'heal_ring_effect'),
    ).toBe(true);
    const audio = troopSoundCues(battle, new BattleSoundLog()).filter((c) =>
      c.key.includes(':hit:'),
    );
    expect(actual.map((e) => e.key)).toEqual(audio.map((c) => c.key));
    expect(pulses(battle)).toEqual(actual);
    expect(events(battle, true)).toEqual([]);
    expect(JSON.stringify(battle)).toBe(before);
  },
);
it('Healing bounds pulse reconstruction to source tails and keeps version-118 fields intact', () => {
  const r = nativeFieldSpellRecording('Healing'),
    at = (t: number) => r.snapshots.find((s) => s.at === t)!.battle as Battle,
    battle = at(r.afterLive),
    legacy = structuredClone(at(r.pulsing));
  expect(duration('Heal spell')).toBeCloseTo(1.502, 9);
  expect(pulses(at(r.beforeHit))).toEqual([]);
  expect(pulses(battle).map((e) => e.key)).toEqual(
    [36, 37, 38, 39, 40].map((i) => `spell:1:hit:${i}`),
  );
  expect(pulses({ ...battle, elapsed: 15.05 })).toEqual([]);
  expect(events({ ...battle, elapsed: 15.05 }).some((e) => e.effect === 'Heal area')).toBe(true);
  delete legacy.nativeSpellPulsePresentation;
  expect(pulses(legacy)).toEqual([]);
  expect(events(legacy).some((e) => e.effect === 'Heal area')).toBe(true);
  const partial = structuredClone(at(r.pulsing));
  partial.nativeSpellCastHistory![0].hits = 1;
  expect(pulses(partial).map((e) => e.key)).toEqual(['spell:1:hit:0']);
  const boundary = at(r.pulsing);
  expect(pulses({ ...boundary, elapsed: 1.8 - 2e-9 }).map((e) => e.key)).toEqual(['spell:1:hit:0']);
  const normalized = pulses({ ...boundary, elapsed: 1.8 - 5e-10 });
  expect(normalized.at(-1)).toMatchObject({ key: 'spell:1:hit:1', at: 1.8, sampleAt: 1.8 });
});
it.each([1, 12])(
  'Healing level %s pulse presentation preserves version-118 wounded-unit physics and portable seeks',
  (level) => {
    const r = nativeHealingSpellRecording(level),
      model = new GameModel();
    for (const version of [r.data.version, 118]) {
      const data = structuredClone(r.data);
      data.version = version;
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        const actual = JSON.parse(JSON.stringify(model.battle)) as Battle,
          expected = JSON.parse(JSON.stringify(snapshot.battle)) as Battle;
        if (version === 118) {
          delete expected.nativeSpellPulsePresentation;
          expected.nativeSpellArt = ['Jump', 'Rage', 'Haste', 'Healing', 'Poison'];
        }
        expect(actual).toEqual(expected);
        expect(pulses(actual).length > 0).toBe(version !== 118 && snapshot.at >= r.healed);
      }
    }
  },
);
