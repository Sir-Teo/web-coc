import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import source from '../reference/field-spells/effects.json';
import { GameModel, type Battle } from '../src/game/model';
import type { NativeArtPack } from '../src/game/native-art-pack';
import type { NativeScenePose } from '../src/game/native-mesh';
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
import { nativeIceBlockRecording } from './fixtures/native-iceblock';
const pack = JSON.parse(
  readFileSync(
    new URL('../public/assets/field-spells-native/iceblock/graph.json', import.meta.url),
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
      'Ice Block',
      source.spells['Ice Block'].levels,
      iso,
      reduced,
      duration,
    ),
    poses = events.flatMap((e) => nativeEffectPoses(pack, e, e.sampleAt, reduced));
  expect(JSON.stringify(battle)).toBe(before);
  return { events, poses };
}
it.each([1, 2, 3, 4, 5, 6])(
  'Ice Block level %s preserves its bottle, delayed platform, resolved end burst and later source melt',
  (level) => {
    const r = nativeFieldSpellRecording('Ice Block', level),
      at = (t: number) => r.snapshots.find((s) => s.at === t)!.battle as Battle;
    expect(
      sample(at(r.bottle)).poses.some(
        (p) => p.emitter === 'IceBlock_bottleDrop' && leaves(p.poses),
      ),
    ).toBe(true);
    const landing = sample(at(r.landing));
    expect(landing.events.map((e) => [e.key, e.at])).toEqual([
      ['spell:1:deploy', 0.8],
      ['spell:1:deploy2', 0.9],
    ]);
    for (const emitter of [
      'e_spells_iceblock_Surface',
      'e_spells_iceblock_FloatingRocks',
      'e_spells_iceblock_Snow',
    ])
      expect(
        landing.poses.some((p) => p.emitter === emitter && leaves(p.poses)),
        emitter,
      ).toBe(true);
    const pulse = sample(at(r.pulsing));
    expect(pulse.events.find((e) => e.key === 'spell:1:end')).toMatchObject({
      at: 1.5,
      effect: 'ps_spells_iceblock_Despawn',
    });
    expect(
      pulse.poses.some((p) => p.emitter === 'e_spells_iceblock_Snowburst' && leaves(p.poses)),
    ).toBe(true);
    const steady = at(r.steady);
    expect(steady.nativeSpells).toEqual([]);
    expect(steady.nativeSpellCastHistory![0]).toMatchObject({ ended: true, hits: 1 });
    expect(
      sample(steady).poses.some(
        (p) => p.emitter === 'e_spells_iceblock_FloatingRocks' && leaves(p.poses),
      ),
    ).toBe(true);
    const melt = sample(at(r.nearEnd));
    expect(r.nearEnd).toBeCloseTo(7.9, 9);
    expect(melt.poses.some((p) => p.emitter === 'e_spells_iceblock_Melt' && leaves(p.poses))).toBe(
      true,
    );
    expect(
      sample({ ...steady, elapsed: 7.75 }).poses.some(
        (p) => p.emitter === 'e_spells_iceblock_Melt',
      ),
    ).toBe(false);
    expect(sample(at(r.afterLive)).poses).toEqual([]);
    expect(sample(at(r.fieldAfter)).poses).toEqual([]);
    expect(sample(steady, true).poses).toEqual([]);
    expect(
      sample({ ...steady, nativeSpellArt: steady.nativeSpellArt!.filter((n) => n !== 'Ice Block') })
        .events,
    ).toEqual([]);
    expect(sample(JSON.parse(JSON.stringify(steady)))).toEqual(sample(steady));
  },
);
it('Ice Block end effects require a resolved last pulse and preserve source emitter delays and audio keys', () => {
  const r = nativeFieldSpellRecording('Ice Block'),
    battle = r.snapshots.find((s) => s.at === r.pulsing)!.battle as Battle;
  expect(duration('ps_spells_iceblock_Despawn')).toBeCloseTo(6.501, 9);
  expect(duration('ps_spells_iceblock_Area')).toBeCloseTo(7.501, 9);
  const unresolved = structuredClone(battle);
  unresolved.nativeSpellCastHistory![0].hits = 0;
  expect(sample(unresolved).events.some((e) => e.key.endsWith(':end'))).toBe(false);
  expect(
    sample({ ...battle, elapsed: 1.5 - 2e-9 }).events.some((e) => e.key.endsWith(':end')),
  ).toBe(false);
  expect(
    sample({ ...battle, elapsed: 1.5 - 5e-10 }).events.find((e) => e.key.endsWith(':end'))
      ?.sampleAt,
  ).toBe(1.5);
  expect(sample({ ...battle, elapsed: 8.402 }).poses).toEqual([]);
  const cues = troopSoundCues(battle, new BattleSoundLog()).filter((c) =>
    c.key.startsWith('spell:1:'),
  );
  expect(cues).toEqual(
    (['preDeploy', 'deploy'] as const).map((phase) =>
      effectCue(
        spellSoundEffect('Ice Block', 1, phase)!,
        `spell:1:${phase}`,
        phase === 'preDeploy' ? 0 : 0.8,
      ),
    ),
  );
});
it.each([1, 6])(
  'Ice Block level %s preserves real Cannon damage reduction, stationary protection and expiry against version 127',
  (level) => {
    const r = nativeIceBlockRecording(level),
      at = (t: number) => r.snapshots.find((s) => s.at === t)!.battle as Battle,
      protectedUnit = at(r.protectedAt).units.find((u) => u.id === r.unitId)!,
      later = at(r.takingFire).units.find((u) => u.id === r.unitId)!;
    expect(protectedUnit.native!.effects!.shield!.percent).toBeCloseTo((84 + level * 2) / 100, 9);
    expect(protectedUnit.native!.effects!.shield!.until).toBeCloseTo(r.expiry, 9);
    expect([later.x, later.y]).toEqual([protectedUnit.x, protectedUnit.y]);
    expect(later.hp).toBeLessThan(protectedUnit.hp);
    expect(later.hp).toBeGreaterThan(0);
    expect(at(r.takingFire).defenseStuns[2] ?? 0).toBeLessThan(r.protectedAt);
    expect(at(r.moving).units.find((u) => u.id === r.unitId)!.x).toBeGreaterThan(later.x);
    expect(at(r.retired).nativeSpellCastHistory).toEqual([]);
    const model = new GameModel();
    for (const version of [r.data.version, 127]) {
      const data = structuredClone(r.data);
      data.version = version;
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(s.at);
        while (model.replay!.seeking) model.step(0.05);
        const actual = JSON.parse(JSON.stringify(model.battle)) as Battle,
          expected = JSON.parse(JSON.stringify(s.battle)) as Battle;
        if (version === 127) {
          expect(actual.nativeSpellArt).not.toContain('Ice Block');
          expected.nativeSpellArt = actual.nativeSpellArt;
          delete expected.nativeSpellCastHistory;
          delete actual.nativeSpellCastHistory;
        }
        expect(actual).toEqual(expected);
      }
    }
  },
);
