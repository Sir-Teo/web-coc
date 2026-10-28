import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import source from '../reference/field-spells/effects.json';
import { GameModel, type Battle } from '../src/game/model';
import type { NativeArtPack } from '../src/game/native-art-pack';
import type { NativeScenePose } from '../src/game/native-mesh';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import { capturedSpellEffectEvents } from '../src/game/native-spell-effects';
import { fieldSpellHistoryUntil, fieldSpellDeploy2Delay } from '../src/game/field-spell-effects';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { BattleSoundLog, troopSoundCues } from '../src/game/troop-sounds';
import { nativeFieldSpellRecording } from './fixtures/native-field-spells';
import { nativeTargetingSpellRecording } from './fixtures/native-targeting-spells';
const configs = [
  { name: 'Totem Spell', key: 'totem', bottle: 'e_spells_meteortotem_bottledrop' },
  { name: 'AngrySpell', key: 'angry', bottle: 'e_spell_angryspell_predeploy' },
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
for (const { name, bottle } of configs) {
  it.each([1, 2, 3, 4])(
    `${name} level %s samples its original source phases and finite lifetimes without moving combat`,
    (level) => {
      const r = nativeFieldSpellRecording(name, level),
        at = (t: number) => r.snapshots.find((s) => s.at === t)!.battle as Battle;
      expect(
        sample(at(r.bottle), name).poses.some((p) => p.emitter === bottle && leaves(p.poses)),
      ).toBe(true);
      const landing = sample(at(r.landing), name);
      if (name === 'Totem Spell') {
        expect(landing.events.map((e) => [e.key, e.at])).toEqual([['spell:1:deploy', 0.8]]);
        for (const emitter of [
          'e_spells_meteortotem_TotemGround',
          'e_spells_meteortotem_TotemSmoke',
          'e_spells_meteortotem_shockwave',
          'e_spells_meteortotem_ring',
        ])
          expect(
            landing.poses.some((p) => p.emitter === emitter && leaves(p.poses)),
            emitter,
          ).toBe(true);
        expect(at(r.afterLive).nativeSpells?.some((c) => c.name === 'Totem Spell')).toBe(false);
        expect(
          at(r.afterLive).nativeSpells?.find((c) => c.name === 'TotemSummon')?.firstHit,
        ).toBeCloseTo(1.4, 9);
        expect(at(r.fieldAfter).units.some((u) => u.kind === 'totem')).toBe(true);
        expect(sample(at(r.steady), name).poses.length).toBeGreaterThan(0);
        expect(sample(at(r.fieldAfter), name).poses).toEqual([]);
      } else {
        expect(landing.events.map((e) => [e.key, e.at])).toEqual([
          ['spell:1:deploy', 0.8],
          ['spell:1:deploy2', 1.1],
        ]);
        expect(
          landing.poses.some((p) => p.emitter === 'e_spell_angryspell_splash' && leaves(p.poses)),
        ).toBe(true);
        const late = at(r.steady),
          sampled = sample(late, name);
        expect(late.nativeSpells).toEqual([]);
        expect(late.nativeSpellCastHistory![0]).toMatchObject({ hits: 50, ended: true });
        expect(sampled.events.map((e) => [e.key, e.at])).toEqual([['spell:1:deploy2', 1.1]]);
        expect(sampled.poses).toHaveLength(2);
        expect(sampled.poses.every((p) => leaves(p.poses) > 0)).toBe(true);
        expect(fieldSpellHistoryUntil(late.nativeSpellCastHistory![0])).toBeCloseTo(201.2, 9);
        expect(sample({ ...late, elapsed: 201.201 }, name).poses).toEqual([]);
        expect(at(r.fieldAfter).finished).toBe(true);
      }
      expect(sample(at(r.steady), name, true).poses).toEqual([]);
      expect(
        sample(
          {
            ...at(r.steady),
            nativeSpellArt: at(r.steady).nativeSpellArt!.filter((n) => n !== name),
          },
          name,
        ).events,
      ).toEqual([]);
    },
  );
}
it('Angry upper art and audio share the source 300-ms delay while version 126 keeps its former landing sound', () => {
  const r = nativeFieldSpellRecording('AngrySpell'),
    battle = r.snapshots.find((s) => s.at === r.afterLive)!.battle as Battle,
    cues = (b: Battle) =>
      troopSoundCues(b, new BattleSoundLog()).filter((c) => c.key.startsWith('spell:1:'));
  expect(fieldSpellDeploy2Delay({ name: 'AngrySpell', level: 1 })).toBe(0.3);
  expect(sample({ ...battle, elapsed: 1.1 - 2e-9 }, 'AngrySpell').events.map((e) => e.key)).toEqual(
    ['spell:1:deploy'],
  );
  const exact = sample({ ...battle, elapsed: 1.1 - 5e-10 }, 'AngrySpell');
  expect(exact.events.find((e) => e.key.endsWith(':deploy2'))).toMatchObject({
    at: 1.1,
    sampleAt: 1.1,
  });
  expect(cues({ ...battle, elapsed: 1.1 - 2e-9 }).map((c) => c.key)).toEqual([
    'spell:1:preDeploy',
    'spell:1:deploy',
  ]);
  expect(cues({ ...battle, elapsed: 1.2 }).map((c) => [c.key, c.at])).toEqual([
    ['spell:1:preDeploy', 0],
    ['spell:1:deploy', 0.8],
    ['spell:1:deploy2', 1.1],
  ]);
  expect(new Set(cues({ ...battle, elapsed: 1.2 }).map((c) => c.key)).size).toBe(3);
  const model = new GameModel(),
    data = structuredClone(r.data);
  data.version = 126;
  expect(model.openReplay(data)).toBe(true);
  model.seekReplay(1.2);
  while (model.replay!.seeking) model.step(0.05);
  expect(cues(model.battle!).map((c) => [c.key, c.at])).toEqual([
    ['spell:1:preDeploy', 0],
    ['spell:1:deploy', 0.8],
    ['spell:1:deploy2', 0.8],
  ]);
});
for (const { name } of configs)
  it.each([1, 4])(
    `${name} level %s preserves version-126 target preference, stuns and Totem drain through portable seeks`,
    (level) => {
      const r = nativeTargetingSpellRecording(name, level, 127),
        model = new GameModel(),
        at = (t: number) => r.snapshots.find((s) => s.at === t)!.battle as Battle;
      expect(at(r.before).units.find((u) => u.id === r.unitId)!.target).toBe(2);
      if (name === 'AngrySpell') {
        expect(at(r.after).units.find((u) => u.id === r.unitId)!.target).toBe(3);
        expect(
          at(r.after).units.find((u) => u.id === r.unitId)!.native!.angryUntil,
        ).toBeGreaterThan(r.after);
      } else {
        const first = at(r.after).units.find((u) => u.kind === 'totem')!,
          second = at(r.draining).units.find((u) => u.id === first.id)!;
        expect(first.hp).toBeGreaterThan(0);
        expect(second.hp).toBeLessThan(first.hp);
        expect(at(r.impact).defenseStuns[3]).toBeGreaterThan(r.impact);
      }
      for (const version of [r.data.version, 126]) {
        const data = structuredClone(r.data);
        data.version = version;
        expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
        for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          model.seekReplay(snapshot.at);
          while (model.replay!.seeking) model.step(0.05);
          const actual = JSON.parse(JSON.stringify(model.battle)) as Battle,
            expected = JSON.parse(JSON.stringify(snapshot.battle)) as Battle;
          if (version === 126) {
            expect(actual.nativeSpellArt).not.toContain(name);
            expected.nativeSpellArt = actual.nativeSpellArt;
            delete actual.nativeSpellCastHistory;
            delete expected.nativeSpellCastHistory;
          }
          expect(actual).toEqual(expected);
        }
      }
    },
  );
