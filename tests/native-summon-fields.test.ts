import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import source from '../reference/field-spells/effects.json';
import { GameModel, type Battle } from '../src/game/model';
import type { NativeArtPack } from '../src/game/native-art-pack';
import type { NativeScenePose } from '../src/game/native-mesh';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import { capturedSpellEffectEvents } from '../src/game/native-spell-effects';
import { fieldSpellHistoryUntil } from '../src/game/field-spell-effects';
import { spellRow, spellEndTime } from '../src/game/native-spells';
import { seconds, num } from '../src/game/native-data';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  BattleSoundLog,
  troopSoundCues,
  effectCue,
  spellSoundEffect,
} from '../src/game/troop-sounds';
import { nativeFieldSpellRecording } from './fixtures/native-field-spells';
const configs = [
  {
    name: 'Skeleton Spell',
    key: 'skeleton',
    bottle: 'Skeleton_bottleDrop',
    edge: 'skele_summon_area_edge',
    glow: 'skele_summon_red_glow',
  },
  {
    name: 'Bat Spell',
    key: 'bat',
    bottle: 'bat_bottleDrop',
    edge: 'bat_summon_area_edge',
    glow: 'bat_summon_purple_glow',
  },
] as const;
const packs = Object.fromEntries(
  configs.map((c) => [
    c.name,
    JSON.parse(
      readFileSync(new URL(`../public/${source.packs[c.key].path}`, import.meta.url), 'utf8'),
    ) as NativeArtPack,
  ]),
);
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const leaves = (poses: readonly NativeScenePose[]): number =>
  poses.reduce((sum, p) => sum + ('group' in p ? leaves(p.group) : 1), 0);
function sample(battle: Battle, name: (typeof configs)[number]['name'], reduced = false) {
  const pack = packs[name],
    before = JSON.stringify(battle),
    events = capturedSpellEffectEvents(
      battle,
      name,
      source.spells[name].levels,
      iso,
      reduced,
      (effect) => nativeEffectDuration(pack, effect, Infinity),
    ),
    poses = events.flatMap((e) => nativeEffectPoses(pack, e, e.sampleAt, reduced));
  expect(JSON.stringify(battle)).toBe(before);
  return { events, poses };
}
for (const { name, bottle, edge, glow } of configs) {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    `${name} level %s keeps its original bottle and field throughout spawning and the final visual tail`,
    (level) => {
      const r = nativeFieldSpellRecording(name, level),
        at = (time: number) => r.snapshots.find((s) => s.at === time)!.battle as Battle,
        profile = source.spells[name].levels[level - 1],
        row = spellRow(name, level),
        count = num(row, 'UnitsToSpawn'),
        first = num(row, 'SpawnFirstGroupSize');
      expect(
        sample(at(r.bottle), name).poses.some((p) => p.emitter === bottle && leaves(p.poses)),
      ).toBe(true);
      expect(sample(at(r.beforeHit), name).events.map((e) => e.key)).toEqual(['spell:1:preDeploy']);
      const landing = sample(at(r.landing), name);
      expect(landing.events.map((e) => [e.key, e.effect, e.at])).toEqual([
        ['spell:1:deploy', profile.DeployEffect, 0.8],
      ]);
      for (const emitter of [edge + level, glow + level])
        expect(
          landing.poses.some((p) => p.emitter === emitter && leaves(p.poses)),
          emitter,
        ).toBe(true);
      expect(at(r.landing).units).toHaveLength(first);
      expect(at(r.beforeEnd).nativeSpells?.[0].released).toBe(count - 1);
      const ended = at(r.afterLive),
        cast = ended.nativeSpellCastHistory![0];
      expect(ended.nativeSpells).toEqual([]);
      expect(cast).toMatchObject({ released: count, hits: 1, ended: true });
      expect(spellEndTime(cast)).toBeCloseTo(0.8, 9);
      expect(r.end).toBeCloseTo(0.8 + seconds(row, 'SpawnDuration'), 9);
      expect(profile.retainSeconds).toBeCloseTo(
        0.8 + nativeEffectDuration(packs[name], profile.DeployEffect, Infinity),
        9,
      );
      expect(fieldSpellHistoryUntil(cast)).toBeCloseTo(profile.retainSeconds, 9);
      const tail = sample(ended, name);
      expect(tail.events.map((e) => e.key)).toEqual(['spell:1:deploy']);
      expect(tail.poses.some((p) => p.emitter === edge + level && leaves(p.poses))).toBe(true);
      expect(tail.poses.some((p) => p.emitter === glow + level && leaves(p.poses))).toBe(true);
      expect(sample(ended, name, true).poses).toEqual([]);
      expect(sample(at(r.fieldAfter), name).poses).toEqual([]);
      expect(sample(JSON.parse(JSON.stringify(ended)), name)).toEqual(tail);
      expect(
        sample({ ...ended, nativeSpellArt: ended.nativeSpellArt!.filter((n) => n !== name) }, name)
          .events,
      ).toEqual([]);
    },
  );
  it(`${name} retains the long source field beyond the previous ten-second history and deduplicates original sounds`, () => {
    const r = nativeFieldSpellRecording(name, 8),
      battle = r.snapshots.find((s) => s.at === r.afterLive)!.battle as Battle,
      first = r.snapshots.find((s) => s.at === r.pulsing)!.battle as Battle,
      log = new BattleSoundLog();
    expect(battle.elapsed).toBeGreaterThan(10.8);
    expect(sample(battle, name).poses.some((p) => p.emitter === edge + 8 && leaves(p.poses))).toBe(
      true,
    );
    const cues = troopSoundCues(first, log).filter((c) => c.key.startsWith('spell:1:'));
    expect(cues).toEqual(
      (['preDeploy', 'deploy'] as const).map((phase) =>
        effectCue(
          spellSoundEffect(name, 8, phase)!,
          `spell:1:${phase}`,
          phase === 'preDeploy' ? 0 : 0.8,
        ),
      ),
    );
    expect(
      troopSoundCues(battle, new BattleSoundLog()).filter((c) => c.key.startsWith('spell:1:')),
    ).toEqual([]);
  });
  it.each([1, 8])(
    `${name} level %s preserves version-125 spawn times, bodies, shields and combat through portable reverse seeks`,
    (level) => {
      const r = nativeFieldSpellRecording(name, level, 126),
        model = new GameModel();
      for (const version of [r.data.version, 125]) {
        const data = structuredClone(r.data);
        data.version = version;
        expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
        for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          model.seekReplay(snapshot.at);
          while (model.replay!.seeking) model.step(0.05);
          const expected = JSON.parse(JSON.stringify(snapshot.battle)) as Battle,
            actual = JSON.parse(JSON.stringify(model.battle)) as Battle;
          if (version === 125) {
            expect(actual.nativeSpellArt).not.toContain(name);
            expected.nativeSpellArt = actual.nativeSpellArt;
            delete expected.nativeSpellCastHistory;
            delete actual.nativeSpellCastHistory;
          }
          expect(actual).toEqual(expected);
        }
      }
    },
  );
}
