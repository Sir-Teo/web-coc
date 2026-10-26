import { expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import source from '../reference/field-spells/effects.json';
import shared from '../reference/full-client/effect-art.json';
import manifest from '../reference/full-client/manifest.json';
import type { Battle } from '../src/game/model';
import type { NativeArtPack } from '../src/game/native-art-pack';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import { capturedSpellEffectEvents } from '../src/game/native-spell-effects';
import { nativeFieldSpellRecording } from './fixtures/native-field-spells';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  BattleSoundLog,
  troopSoundCues,
  effectCue,
  spellSoundEffect,
} from '../src/game/troop-sounds';
const root = new URL('../', import.meta.url),
  records = { ...source.packs, ...source.externalEffects },
  packs = Object.fromEntries(
    Object.entries(records).map(([key, r]) => [
      key,
      JSON.parse(readFileSync(new URL('public/' + r.path, root), 'utf8')) as NativeArtPack,
    ]),
  );
const packFor = (effect: string) =>
    packs[source.effects[effect as keyof typeof source.effects] ?? effect],
  duration = (name: string) => nativeEffectDuration(packFor(name), name, Infinity),
  iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
it('new and reused field packs match source pins, graph hashes and complete file sizes', () => {
  const pins = new Map(manifest.files.map((r) => [r.path, r.sha256]));
  for (const [path, pin] of Object.entries(source.sources)) expect(pins.get(path)).toBe(pin);
  for (const record of Object.values(records)) {
    const file = new URL('public/' + record.path, root);
    expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(record.sha256);
    const size = (dir: URL): number =>
      readdirSync(dir).reduce((sum, name) => {
        const p = new URL(name, dir);
        return (
          sum + (statSync(p).isDirectory() ? size(new URL(name + '/', dir)) : statSync(p).size)
        );
      }, 0);
    expect(size(new URL('./', file))).toBe(record.bytes);
  }
  expect(source.externalEffects['Rage deploy top']).toEqual(shared.packs['rage-deploy-top']);
  expect(source.effects).not.toHaveProperty('Rage deploy top');
});
for (const name of ['Rage', 'Haste'] as const)
  it.each([1, 2, 3, 4, 5, 6, 7])(
    `${name} level %s samples original bottle, ground and upper field art`,
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
        return { events, poses, battle };
      };
      expect(sample(r.bottle).events.map((e) => e.effect)).toEqual([profile.PreDeployEffect]);
      expect(sample(r.bottle).poses.length).toBeGreaterThan(0);
      expect(sample(r.landing).events.map((e) => [e.effect, e.at])).toEqual([
        [profile.DeployEffect, 0.8],
        [profile.DeployEffect2, 0.8],
      ]);
      const steady = sample(r.steady);
      expect(
        steady.poses.some(
          (p) =>
            p.emitter ===
            (name === 'Rage'
              ? 'rage_glowPurple'
              : packFor(profile.DeployEffect).effects[profile.DeployEffect][0].ParticleEmitter),
        ),
      ).toBe(true);
      expect(sample(r.fieldAfter).poses).toEqual([]);
      expect(sample(r.steady, true).poses).toEqual([]);
      const cues = troopSoundCues(sample(r.pulsing).battle, new BattleSoundLog()).filter((c) =>
        c.key.startsWith('spell:1:'),
      );
      expect(cues).toEqual(
        ['preDeploy', 'deploy'].map((event) =>
          effectCue(
            spellSoundEffect(name, level, event as 'preDeploy' | 'deploy')!,
            `spell:1:${event}`,
            event === 'preDeploy' ? 0 : 0.8,
          ),
        ),
      );
    },
  );
it('late Haste field particles remain drawable beyond the generic thirty-second cap', () => {
  const r = nativeFieldSpellRecording('Haste', 7),
    battle = structuredClone(r.snapshots.find((s) => s.at === r.nearEnd)!.battle) as Battle;
  expect(battle.elapsed).toBeCloseTo(30.9, 8);
  const poses = capturedSpellEffectEvents(
    battle,
    'Haste',
    source.spells.Haste.levels,
    iso,
    false,
    duration,
  ).flatMap((e) => nativeEffectPoses(packFor(e.effect), e, e.sampleAt, false));
  expect(poses.length).toBeGreaterThan(0);
  expect(source.spells.Haste.levels[5].DeployEffect).toBe(
    source.spells.Haste.levels[4].DeployEffect,
  );
  expect(packFor('Speedup_deploy_lvl6').effects['Speedup_deploy_lvl6'][0].Scale).toBe('125');
});
for (const name of ['Rage', 'Haste'] as const)
  it.each([1, 7])(
    `${name} level %s portable casts reconstruct exactly through forward and reverse seeks`,
    (level) => {
      const r = nativeFieldSpellRecording(name, level),
        model = new GameModel();
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(model.battle).toEqual(snapshot.battle);
      }
    },
  );
