import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import source from '../reference/field-spells/effects.json';
import { GameModel } from '../src/game/model';
import { replayBattle, REPLAY_VERSION, validateReplay } from '../src/game/replay';
import { castNativeSpell } from '../src/game/native-spells';
import { capturedSpellEffectEvents } from '../src/game/native-spell-effects';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import type { NativeArtPack } from '../src/game/native-art-pack';
import { iceGolemGarrisonRecording } from './fixtures/ice-golem-garrison';
const names = ['IceGolemFreeze', 'IceGolemFreeze_DEF'] as const;
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
for (const name of names) {
  const config = source.spells[name];
  const pack = JSON.parse(
    readFileSync(new URL('../public/' + source.packs[config.key].path, import.meta.url), 'utf8'),
  ) as NativeArtPack;
  const duration = (effect: string) => nativeEffectDuration(pack, effect, Infinity);
  it.each(config.levels)(
    `${name} level $level draws both original finite ground effects without mutating combat`,
    (profile) => {
      const model = new GameModel();
      model.startBattle(0, true);
      const battle = model.battle!;
      // Source-only sampling includes tiers beyond the playable defender roster.
      battle.nativeSpellArt = [...(battle.nativeSpellArt ?? []), name];
      castNativeSpell(
        battle,
        name,
        profile.level,
        name.endsWith('_DEF') ? 'defense' : 'attack',
        10,
        10,
      );
      battle.elapsed = 0.4;
      const before = JSON.stringify(battle);
      const events = capturedSpellEffectEvents(battle, name, config.levels, iso, false, duration);
      expect(events.map((event) => event.effect)).toEqual([
        profile.DeployEffect,
        profile.DeployEffect2,
      ]);
      expect(events.every((event) => event.at === 0)).toBe(true);
      expect(
        events.flatMap((event) => nativeEffectPoses(pack, event, event.sampleAt, false)).length,
      ).toBeGreaterThan(0);
      expect(capturedSpellEffectEvents(battle, name, config.levels, iso, true, duration)).toEqual(
        [],
      );
      expect(JSON.stringify(battle)).toBe(before);
      battle.elapsed = profile.retainSeconds + 0.05;
      expect(capturedSpellEffectEvents(battle, name, config.levels, iso, false, duration)).toEqual(
        [],
      );
    },
  );
}
it('gates new cast history at version 236 and retains version 235 portable recordings', () => {
  expect(REPLAY_VERSION).toBeGreaterThanOrEqual(236);
  const r = iceGolemGarrisonRecording();
  const current = r.snapshots.find((s) => s.at === r.frozen)!.battle;
  expect(current.nativeSpellCastHistory?.map((cast) => cast.name)).toEqual(['IceGolemFreeze_DEF']);
  const old = replayBattle(r.data.initial, 235);
  expect(old.nativeSpellArt).not.toContain('IceGolemFreeze_DEF');
  expect(validateReplay({ ...r.data, version: 235 })).toBe(true);
  castNativeSpell(old, 'IceGolemFreeze_DEF', 5, 'defense', 10, 10);
  expect(old.nativeSpellCastHistory).toBeUndefined();
  const player = new GameModel();
  expect(player.openReplay({ ...r.data, version: 235 })).toBe(true);
  player.seekReplay(r.frozen);
  while (player.replay!.seeking) player.step(0.05);
  const now = structuredClone(current),
    then = structuredClone(player.battle!);
  delete now.nativeSpellArt;
  delete then.nativeSpellArt;
  delete now.nativeSpellCastHistory;
  delete then.nativeSpellCastHistory;
  expect(now).toEqual(then);
});

it('retains identical attacking death and defensive freeze rules across the presentation boundary', async () => {
  const { iceGolemDeathRecording } = await import('./fixtures/ice-golem-death');
  const current = iceGolemDeathRecording();
  const old = iceGolemDeathRecording(235);
  expect(current.frozen).toBe(old.frozen);
  for (let i = 0; i < current.snapshots.length; i++) {
    const a = structuredClone(current.snapshots[i].battle);
    const b = structuredClone(old.snapshots[i].battle);
    delete a.nativeSpellArt;
    delete b.nativeSpellArt;
    delete a.nativeSpellCastHistory;
    delete b.nativeSpellCastHistory;
    expect(a).toEqual(b);
  }
  expect(
    current.snapshots
      .find((s) => s.at === current.frozen)!
      .battle.buildings.some(
        (b) =>
          (current.snapshots.find((s) => s.at === current.frozen)!.battle.buildingEffects?.[b.id]
            ?.frozenUntil ?? 0) > current.frozen,
      ),
  ).toBe(true);
});

it('leaves unrelated current battles byte-identical to version 235', () => {
  const model = new GameModel();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: import('../src/game/replay').ReplayData })
    .recording;
  const current = replayBattle(data.initial);
  expect(current.nativeSpellArt).not.toContain('IceGolemFreeze');
  expect(current.nativeSpellArt).not.toContain('IceGolemFreeze_DEF');
  expect(current).toEqual(replayBattle(data.initial, 235));
});
