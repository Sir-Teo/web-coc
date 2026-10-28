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
import { nativeReviveCastRecording } from './fixtures/native-revive-cast';
import { nativeFieldSpellRecording } from './fixtures/native-field-spells';
import { prepareReviveTargeting } from './fixtures/revive-targeting';
const pack = JSON.parse(
  readFileSync(
    new URL('../public/assets/field-spells-native/revive/graph.json', import.meta.url),
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
      'Revive',
      source.spells.Revive.levels,
      iso,
      reduced,
      duration,
    ),
    poses = events.flatMap((e) => nativeEffectPoses(pack, e, e.sampleAt, reduced));
  expect(JSON.stringify(battle)).toBe(before);
  return { events, poses };
}
it.each([1, 2, 3, 4, 5])(
  'Revive level %s keeps its source bottle at the cast point and success art at the Hero that actually returns',
  (level) => {
    const r = nativeReviveCastRecording(level),
      at = (t: number) => r.snapshots.find((s) => s.at === t)!.battle as Battle;
    expect(r.caster).not.toEqual(r.anchor);
    const bottle = sample(at(r.bottle));
    expect(bottle.events.map((e) => e.ground)).toEqual([iso(r.caster.x, r.caster.y)]);
    expect(
      bottle.poses.some((p) => p.emitter === 'e_spell_revive_bottledrop' && leaves(p.poses)),
    ).toBe(true);
    expect(sample(at(r.beforeHit)).events.map((e) => e.key)).toEqual([
      `spell:${r.castId}:preDeploy`,
    ]);
    const restored = at(r.landing),
      cast = restored.nativeSpellCastHistory!.find((c) => c.id === r.castId)!;
    expect(cast.revivePresentation).toEqual({
      targetId: r.queenId,
      x: r.anchor.x,
      y: r.anchor.y,
      at: r.resolvedAt,
    });
    expect(cast).toMatchObject({ hits: 1, ended: true });
    expect(restored.units.find((u) => u.id === r.queenId)!.hp).toBeCloseTo(
      (restored.units.find((u) => u.id === r.queenId)!.maxHp * (55 + 5 * level)) / 100,
      7,
    );
    const success = sample(restored);
    expect(success.events.map((e) => [e.key, e.at, e.ground])).toEqual([
      [`spell:${r.castId}:deploy`, r.resolvedAt, iso(r.anchor.x, r.anchor.y)],
      [`spell:${r.castId}:deploy2`, r.resolvedAt, iso(r.anchor.x, r.anchor.y)],
    ]);
    for (const emitter of [
      'e_spell_revive_wings',
      'e_spell_revive_ground_symbol',
      'e_spell_revive_hero_lightrays',
      'e_spell_revive_startup_lightaura',
    ])
      expect(
        success.poses.some((p) => p.emitter === emitter && leaves(p.poses)),
        emitter,
      ).toBe(true);
    expect(
      success.poses
        .filter((p) =>
          ['e_spell_revive_ground_symbol', 'e_spell_revive_hero_lightrays'].includes(p.emitter),
        )
        .every((p) => p.depth === -870),
    ).toBe(true);
    const later = sample(at(r.steady));
    expect(
      later.events.every(
        (e) =>
          e.ground.x === iso(r.anchor.x, r.anchor.y).x &&
          e.ground.y === iso(r.anchor.x, r.anchor.y).y,
      ),
    ).toBe(true);
    expect(later.poses.some((p) => p.emitter === 'e_spell_revive_wings' && leaves(p.poses))).toBe(
      true,
    );
    expect(sample(at(r.fieldAfter)).poses).toEqual([]);
    expect(sample(restored, true).poses).toEqual([]);
    expect(
      sample({
        ...restored,
        nativeSpellArt: restored.nativeSpellArt!.filter((n) => n !== 'Revive'),
      }).events,
    ).toEqual([]);
    const cues = troopSoundCues(restored, new BattleSoundLog()).filter((c) =>
      c.key.startsWith(`spell:${r.castId}:`),
    );
    expect(cues).toEqual(
      (['preDeploy', 'deploy2'] as const).map((phase) =>
        effectCue(
          spellSoundEffect('Revive', level, phase)!,
          `spell:${r.castId}:${phase}`,
          phase === 'preDeploy' ? r.castAt : r.resolvedAt,
        ),
      ),
    );
  },
);
it.each([false, true])(
  'Revive direct=%s reconstructs actual Queen restoration and source metadata with version-128 physical equivalence',
  (direct) => {
    const r = nativeReviveCastRecording(5, direct, 129),
      model = new GameModel();
    for (const version of [r.data.version, 128]) {
      const data = structuredClone(r.data);
      data.version = version;
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(s.at);
        while (model.replay!.seeking) model.step(0.05);
        const actual = JSON.parse(JSON.stringify(model.battle)) as Battle,
          expected = JSON.parse(JSON.stringify(s.battle)) as Battle;
        if (version === 128) {
          expect(actual.nativeSpellArt).not.toContain('Revive');
          expected.nativeSpellArt = actual.nativeSpellArt;
          delete actual.nativeSpellCastHistory;
          delete expected.nativeSpellCastHistory;
        }
        expect(actual).toEqual(expected);
      }
    }
  },
);
it('a wasted Revive shows only its source bottle and never creates success effects or activation audio', () => {
  const r = nativeFieldSpellRecording('Revive'),
    at = (t: number) => r.snapshots.find((s) => s.at === t)!.battle as Battle;
  expect(sample(at(r.bottle)).poses.some((p) => p.emitter === 'e_spell_revive_bottledrop')).toBe(
    true,
  );
  expect(at(r.afterLive).nativeSpellCastHistory![0].revivePresentation).toBeUndefined();
  expect(sample(at(r.afterLive)).events).toEqual([]);
  expect(
    troopSoundCues(at(r.pulsing), new BattleSoundLog())
      .filter((c) => c.key.startsWith('spell:1:'))
      .map((c) => c.key),
  ).toEqual(['spell:1:preDeploy']);
});
it('an earlier successful cast prevents a later queued cast from emitting a second success event or sound', () => {
  const { model, battle, queenId } = prepareReviveTargeting();
  const queen = battle.units.find((u) => u.id === queenId)!;
  model.activeSpell = 'revive';
  expect(model.castSpell(queen.x + 2, queen.y)).toBe(true);
  const first = battle.nativeSpells!.find((c) => c.name === 'Revive')!;
  model.step(0.2);
  expect(model.castReviveOnHero('queen')).toBe(true);
  const second = battle.nativeSpells!.filter((c) => c.name === 'Revive').at(-1)!;
  while (battle.elapsed < second.firstHit + 0.1 - 1e-9) model.step(0.05);
  const captures = battle.nativeSpellCastHistory!.filter((c) => c.name === 'Revive');
  expect(captures.filter((c) => c.revivePresentation).map((c) => c.id)).toEqual([first.id]);
  expect(
    sample(battle)
      .events.filter((e) => e.key.endsWith(':deploy2'))
      .map((e) => e.key),
  ).toEqual([`spell:${first.id}:deploy2`]);
  expect(
    troopSoundCues(battle, new BattleSoundLog())
      .filter((c) => c.key.endsWith(':deploy2') && c.key.startsWith('spell:'))
      .map((c) => c.key),
  ).toContain(`spell:${first.id}:deploy2`);
  expect(
    troopSoundCues(battle, new BattleSoundLog()).some(
      (c) => c.key === `spell:${second.id}:deploy2`,
    ),
  ).toBe(false);
});
it('Revive activation waits for its captured successful result while old playback keeps its former cast-clock audio', () => {
  const r = nativeReviveCastRecording(),
    before = r.snapshots.find((s) => s.at === r.beforeHit)!.battle as Battle;
  expect(
    troopSoundCues(before, new BattleSoundLog()).some((c) => c.key === `spell:${r.castId}:deploy2`),
  ).toBe(false);
  const model = new GameModel(),
    data = structuredClone(r.data);
  data.version = 128;
  expect(model.openReplay(data)).toBe(true);
  model.seekReplay(r.beforeHit);
  while (model.replay!.seeking) model.step(0.05);
  expect(
    troopSoundCues(model.battle!, new BattleSoundLog()).find(
      (c) => c.key === `spell:${r.castId}:deploy2`,
    )?.at,
  ).toBeCloseTo(r.castAt + 0.8, 9);
});
