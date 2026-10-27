import { expect, it } from 'vitest';
import { nativeUnitStats } from '../src/game/native-units';
import { maxTroopLevel } from '../src/game/data';
import { witchRecallBattle } from './fixtures/witch-recall';
import { hurtUnit } from '../src/game/native-status';

it('a recalled Super Witch cannot raise a second living Big Boy', () => {
  const r = witchRecallBattle();
  while (!r.children().length) r.step();
  r.until(r.children()[0].spawnedAt! + 0.1);
  const child = r.children()[0],
    next = r.unit.native!.summonAt!;
  r.recall(r.unit);
  const unit = r.deploy(6.9, 20);
  r.until(r.battle.elapsed + 1.2);
  expect(r.children()).toHaveLength(1);
  expect(r.children()[0].id).toBe(child.id);
  r.until(next + r.stats.summonTime + 0.1);
  expect(r.children()).toHaveLength(1);
  expect(unit.native!.summonAt).toBeGreaterThan(next);
});

for (const kind of ['witch', 'superwitch'] as const)
  for (let level = 1; level <= maxTroopLevel(kind); level++)
    it(`${kind} ${level} retains its source living-child limit through Recall`, () => {
      const r = witchRecallBattle(kind, level),
        s = nativeUnitStats(kind, level);
      while (r.children().length < s.summonLimit) r.step();
      r.until(Math.max(...r.children().map((u) => u.spawnedAt!)) + 0.05);
      const next = r.unit.native!.summonAt!;
      r.recall(r.unit);
      r.deploy(6.9, 20);
      r.until(next + s.summonTime + 0.1);
      expect(r.children()).toHaveLength(s.summonLimit);
      expect(r.children().every((u) => u.native!.owner === r.unit.id)).toBe(true);
    });

it('a vacant limit after a long Recall starts one fresh summon without historical debt', () => {
  const r = witchRecallBattle('witch');
  while (!r.children().length) r.step();
  r.until(Math.max(...r.children().map((u) => u.spawnedAt!)) + 0.1);
  for (const child of r.children()) {
    child.hp = 0;
    child.spent = true;
  }
  r.recall(r.unit);
  r.until(r.battle.elapsed + 40);
  const returnedAt = r.battle.elapsed,
    unit = r.deploy(6.9, 20);
  r.step();
  expect(r.children()).toHaveLength(r.stats.summonCount);
  expect(r.children().every((u) => u.spawnedAt! >= returnedAt + r.stats.summonTime - 1e-9)).toBe(
    true,
  );
  expect(unit.native!.summoned).toBe(r.stats.summonCount * 2);
});

it('same-kind Recall queues retain separate summoner identities and cooldown phases', () => {
  const r = witchRecallBattle('witch', 1, undefined, 2);
  r.until(1.1);
  const second = r.deploy(6.9, 28);
  r.until(2.2);
  const firstAt = r.unit.native!.summonAt!,
    secondAt = second.native!.summonAt!;
  r.recall(r.unit);
  r.recall(second);
  const firstReturn = r.deploy(6.9, 11.5),
    secondReturn = r.deploy(6.9, 28);
  expect([firstReturn.native!.summonAt, secondReturn.native!.summonAt]).toEqual([
    firstAt,
    secondAt,
  ]);
  r.until(secondAt + r.stats.summonTime + 0.1);
  expect(r.children().filter((u) => u.native!.owner === r.unit.id)).toHaveLength(6);
  expect(r.children().filter((u) => u.native!.owner === second.id)).toHaveLength(6);
});

it('version 147 preserves the former duplicate Big Boy behavior', () => {
  const r = witchRecallBattle('superwitch', 1, 147);
  while (!r.children().length) r.step();
  r.until(r.children()[0].spawnedAt! + 0.1);
  r.recall(r.unit);
  r.deploy(6.9, 20);
  r.until(r.battle.elapsed + 1.2);
  expect(r.children()).toHaveLength(2);
});

it('a second Recall preserves the first summoner identity', () => {
  const r = witchRecallBattle();
  while (!r.children().length) r.step();
  r.until(r.children()[0].spawnedAt! + 0.1);
  const firstChild = r.children()[0],
    next = r.unit.native!.summonAt!;
  r.recall(r.unit);
  const intermediate = r.deploy(6.9, 20);
  r.step();
  r.recall(intermediate);
  const unit = r.deploy(6.9, 20);
  r.until(next + r.stats.summonTime + 0.1);
  expect(unit.native!.summonerId).toBe(r.unit.id);
  expect(r.children().map((u) => u.id)).toEqual([firstChild.id]);
});

it('a returning Super Witch can replace its original Big Boy after that child falls', () => {
  const r = witchRecallBattle();
  while (!r.children().length) r.step();
  r.until(r.children()[0].spawnedAt! + 0.1);
  const child = r.children()[0],
    next = r.unit.native!.summonAt!;
  r.recall(r.unit);
  r.deploy(6.9, 20);
  hurtUnit(r.battle, child, child.hp);
  r.until(next + r.stats.summonTime + 0.1);
  expect(r.children()).toHaveLength(1);
  expect(r.children()[0].id).not.toBe(child.id);
  expect(r.children()[0].native!.owner).toBe(r.unit.id);
});
