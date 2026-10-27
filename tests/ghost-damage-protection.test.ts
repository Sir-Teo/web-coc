import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { ghostDefenseRecording } from './fixtures/ghost-defense';

it('a trap-only Ghost obeys actual Eternal Tome protection and damage resumes after expiry', () => {
  const r = ghostDefenseRecording(),
    at = (time: number) => r.snapshots.find((s) => s.at === time)!.battle as Battle,
    first = at(r.first),
    ally = first.units.find((u) => u.id === r.allyId)!,
    protectedBattle = at(r.protectedAt!);
  expect(first.garrisons).toBeUndefined();
  expect(first.nativeGarrisonDamage).toBe(true);
  expect(ally.native!.effects!.shield!.until).toBeGreaterThan(first.elapsed);
  expect(ally.hp).toBe(ally.maxHp);
  expect(protectedBattle.units.find((u) => u.id === r.allyId)!.hp).toBe(ally.maxHp);
  expect(at(r.expired!).units.find((u) => u.id === r.allyId)!.hp).toBeLessThan(ally.maxHp);
  const old = ghostDefenseRecording('tome', 146),
    previous = (old.snapshots.find((s) => s.at === old.first)!.battle as Battle).units.find(
      (u) => u.id === old.allyId,
    )!;
  expect(previous.hp).toBe(previous.maxHp - 720);
});

it('a real Ghost hit supplies Snake Bracelet damage accounting without a Clan Castle', () => {
  const r = ghostDefenseRecording('snake'),
    b = r.snapshots.find((s) => s.at === r.spawned)!.battle as Battle,
    king = b.units.find((u) => u.id === r.heroId)!;
  expect(king.native!.damageTaken).toBe(720);
  expect(b.units.filter((u) => u.kind === 'snake')).toHaveLength(2);
  const old = ghostDefenseRecording('snake', 146),
    previous = old.snapshots.find((s) => s.at === old.spawned)!.battle as Battle;
  expect(previous.units.filter((u) => u.kind === 'snake')).toEqual([]);
});

it('enables trap damage protections only at the new version boundary', () => {
  const setup = ghostDefenseRecording().data.initial;
  expect(replayBattle(setup).nativeGarrisonDamage).toBe(true);
  expect(replayBattle(setup, 146).nativeGarrisonDamage).toBeUndefined();
  const ordinary = structuredClone(setup);
  for (const b of ordinary.buildings) delete b.npc;
  expect(replayBattle(ordinary).nativeGarrisonDamage).toBeUndefined();
});

for (const mode of ['tome', 'snake'] as const)
  for (const version of [146, 147])
    it(`${mode} trap-only inputs reconstruct complete version-${version} portable snapshots`, () => {
      const r = ghostDefenseRecording(mode, version),
        model = new GameModel();
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
      }
    });
