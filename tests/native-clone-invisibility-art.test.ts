import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import source from '../reference/field-spells/effects.json';
import type { Battle } from '../src/game/model';
import type { NativeArtPack } from '../src/game/native-art-pack';
import type { NativeScenePose } from '../src/game/native-mesh';
import { capturedSpellEffectEvents } from '../src/game/native-spell-effects';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import { nativeFieldSpellRecording } from './fixtures/native-field-spells';
import {
  BattleSoundLog,
  troopSoundCues,
  spellSoundEffect,
  effectCue,
} from '../src/game/troop-sounds';
const packs = Object.fromEntries(
  ['clone', 'invisibility'].map((key) => [
    key,
    JSON.parse(
      readFileSync(
        new URL(`../public/assets/field-spells-native/${key}/graph.json`, import.meta.url),
        'utf8',
      ),
    ) as NativeArtPack,
  ]),
);
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
it('Clone preserves the empty source twirl placeholder and its separate visible mist', () => {
  const graph = packs.clone.scenes.buildings,
    clip = graph.clips[graph.exports.clone_twirl01];
  expect(clip.children).toEqual([]);
  expect(clip.frames).toEqual([[]]);
  const r = nativeFieldSpellRecording('Clone'),
    battle = r.snapshots.find((s) => s.at === r.landing)!.battle as Battle,
    events = capturedSpellEffectEvents(
      battle,
      'Clone',
      source.spells.Clone.levels,
      iso,
      false,
      (e) => nativeEffectDuration(packs.clone, e, Infinity),
    ),
    poses = events.flatMap((e) => nativeEffectPoses(packs.clone, e, e.sampleAt, false));
  // Additive emitters can retain an empty group around an empty source export.
  const leaves = (poses: readonly NativeScenePose[]): number =>
    poses.reduce((n, pose) => n + ('group' in pose ? leaves(pose.group) : 1), 0);
  expect(poses.some((p) => p.emitter === 'clone_black_mist_lvl1' && leaves(p.poses) > 0)).toBe(
    true,
  );
  expect(poses.some((p) => p.emitter === 'clone_twirl01_lvl1' && leaves(p.poses) > 0)).toBe(false);
});
for (const [name, max] of [
  ['Clone', 9],
  ['Invisibility', 4],
] as const)
  it.each(Array.from({ length: max }, (_, i) => i + 1))(
    `${name} level %s draws only declared source phases through retirement`,
    (level) => {
      const r = nativeFieldSpellRecording(name, level),
        pack = packs[r.key],
        profiles = source.spells[name].levels,
        duration = (e: string) => nativeEffectDuration(pack, e, Infinity);
      const sample = (at: number, reduced = false) => {
        const battle = r.snapshots.find((s) => s.at === at)!.battle as Battle,
          before = JSON.stringify(battle),
          events = capturedSpellEffectEvents(battle, name, profiles, iso, reduced, duration),
          poses = events.flatMap((e) => nativeEffectPoses(pack, e, e.sampleAt, reduced));
        expect(JSON.stringify(battle)).toBe(before);
        return { battle, events, poses };
      };
      expect(sample(r.bottle).events.map((e) => e.effect)).toEqual([
        profiles[level - 1].PreDeployEffect,
      ]);
      expect(sample(r.bottle).poses.some((p) => p.emitter === `${r.key}_bottleDrop`)).toBe(true);
      const phase =
        name === 'Clone' ? ['Clone deploy', 'Clone deploy top'] : [`Invisibility area lvl${level}`];
      expect(sample(r.landing).events.map((e) => [e.effect, e.at])).toEqual(
        phase.map((e) => [e, 0.8]),
      );
      const emitter =
        name === 'Clone' ? 'clone_deploy_range_lvl1' : `invisibility_lvl${level}_ring`;
      expect(sample(r.steady).poses.some((p) => p.emitter === emitter)).toBe(true);
      expect(sample(r.afterLive).battle.nativeSpells).toEqual([]);
      expect(sample(r.afterLive).poses.length).toBeGreaterThan(0);
      expect(sample(r.fieldAfter).poses).toEqual([]);
      expect(sample(r.steady, true).poses).toEqual([]);
      expect(
        troopSoundCues(sample(r.pulsing).battle, new BattleSoundLog()).filter((c) =>
          c.key.startsWith('spell:1:'),
        ),
      ).toEqual(
        ['preDeploy', 'deploy'].map((event) =>
          effectCue(
            spellSoundEffect(name, level, event as 'preDeploy' | 'deploy')!,
            `spell:1:${event}`,
            event === 'preDeploy' ? 0 : 0.8,
          ),
        ),
      );
      const legacy = structuredClone(sample(r.steady).battle);
      legacy.nativeSpellArt = ['Jump', 'Rage', 'Haste', 'Healing', 'Poison'];
      expect(capturedSpellEffectEvents(legacy, name, profiles, iso, false, duration)).toEqual([]);
    },
  );
