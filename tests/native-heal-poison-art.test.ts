import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import source from '../reference/field-spells/effects.json';
import type { Battle } from '../src/game/model';
import type { NativeArtPack } from '../src/game/native-art-pack';
import { capturedSpellEffectEvents } from '../src/game/native-spell-effects';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import { nativeFieldSpellRecording } from './fixtures/native-field-spells';
import {
  BattleSoundLog,
  troopSoundCues,
  effectCue,
  spellSoundEffect,
  type SpellSoundEvent,
} from '../src/game/troop-sounds';
const root = new URL('../', import.meta.url),
  packs = Object.fromEntries(
    Object.entries(source.packs).map(([key, r]) => [
      key,
      JSON.parse(readFileSync(new URL('public/' + r.path, root), 'utf8')) as NativeArtPack,
    ]),
  ),
  packFor = (effect: string) => packs[source.effects[effect as keyof typeof source.effects]],
  duration = (effect: string) => nativeEffectDuration(packFor(effect), effect, Infinity),
  iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
for (const name of ['Healing', 'Poison'] as const)
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])(
    `${name} level %s samples its source bottle, field and final retirement`,
    (level) => {
      const r = nativeFieldSpellRecording(name, level),
        profile = source.spells[name].levels[level - 1];
      const sample = (at: number, reduced = false) => {
        const battle = r.snapshots.find((s) => s.at === at)!.battle as Battle,
          before = JSON.stringify(battle),
          events = capturedSpellEffectEvents(
            battle,
            name,
            source.spells[name].levels,
            iso,
            reduced,
            duration,
          ),
          poses = events.flatMap((e) =>
            nativeEffectPoses(packFor(e.effect), e, e.sampleAt, reduced),
          );
        expect(JSON.stringify(battle)).toBe(before);
        return { battle, events, poses };
      };
      expect(
        sample(r.bottle).poses.some(
          (p) => p.emitter === (name === 'Healing' ? 'heal_bottleDrop' : 'toxic_bottleDrop'),
        ),
      ).toBe(true);
      expect(sample(r.landing).events.map((e) => [e.effect, e.at])).toEqual([
        [profile.DeployEffect, 0.8],
        [profile.DeployEffect2, 0.8],
      ]);
      expect(
        sample(r.steady).poses.some(
          (p) => p.emitter === (name === 'Healing' ? 'heal_ring' : 'Toxic_glow'),
        ),
      ).toBe(true);
      expect(sample(r.afterLive).battle.nativeSpells).toEqual([]);
      if (name === 'Healing')
        expect(sample(r.afterLive).poses.some((p) => p.emitter === 'heal_ring')).toBe(true);
      expect(sample(r.fieldAfter).poses).toEqual([]);
      expect(sample(r.steady, true).poses).toEqual([]);
      const cues = troopSoundCues(sample(r.pulsing).battle, new BattleSoundLog()).filter((c) =>
        ['spell:1:preDeploy', 'spell:1:deploy', 'spell:1:deploy2'].includes(c.key),
      );
      const expected = ['preDeploy', 'deploy', 'deploy2'].flatMap((event) => {
        const effect = spellSoundEffect(name, level, event as SpellSoundEvent);
        return effect
          ? [effectCue(effect, `spell:1:${event}`, event === 'preDeploy' ? 0 : 0.8)]
          : [];
      });
      expect(cues).toEqual(expected);
    },
  );
it('Healing source field outlasts its actual healing pulses, and Poison keeps its pinned variant', () => {
  const r = nativeFieldSpellRecording('Healing');
  expect(r.end).toBeCloseTo(13.5, 8);
  expect(duration('Heal area')).toBeGreaterThan(20);
  expect(
    source.spells.Poison.levels.every(
      (p) =>
        p.DeployEffect === 'Toxic deploy ground halloween' &&
        p.DeployEffect2 === 'Toxic deploy halloween',
    ),
  ).toBe(true);
});
it('Poison scales a static cloud export through its animated child without changing the legacy sampler', () => {
  const pack = packFor('Toxic deploy halloween'),
    graph = pack.scenes.buildings,
    root = graph.clips[graph.exports.toxic_cloud_varA];
  expect(root.timeline).toHaveLength(1);
  expect(graph.clips[root.children[0]].timeline).toHaveLength(153);
  const event = {
    key: 'spell:1:deploy2',
    effect: 'Toxic deploy halloween',
    at: 0.8,
    ground: { x: 0, y: 0 },
  };
  const alpha = (nestedTimelines?: true) =>
    Math.max(
      0,
      ...nativeEffectPoses(pack, { ...event, nestedTimelines }, 0.9, false)
        .filter((p) => p.emitter === 'Toxic_cloud')
        .flatMap((p) => p.poses.map((p) => p.multiply[3])),
    );
  expect(alpha()).toBe(0);
  expect(alpha(true)).toBeGreaterThan(0);
  expect(alpha()).toBe(0);
});
