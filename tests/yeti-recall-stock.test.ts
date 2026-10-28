import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { healUnit, hurtUnit } from '../src/game/native-status';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import { emptyArmy } from '../src/game/army';
import { yetiRecallBattle, yetiRecallRecording } from './fixtures/yeti-recall';

it('retains partial damage progress across Recall and a wait in the troop bar', () => {
  const r = yetiRecallBattle();
  hurtUnit(r.battle, r.unit, 300);
  r.model.step(0.05);
  r.recall(r.unit);
  r.until(r.battle.elapsed + 5);
  expect(r.children()).toEqual([]);
  const unit = r.deploy(6.9, 20);
  hurtUnit(r.battle, unit, 300);
  r.model.step(0.05);
  expect(unit.native!.damageTaken).toBe(600);
  expect(unit.native!.damageSpawns).toBe(1);
  expect(r.children()).toHaveLength(1);
});

for (const [level, stock] of [
  [1, 8],
  [2, 9],
  [3, 10],
  [4, 11],
  [5, 12],
  [6, 13],
  [7, 13],
  [8, 14],
])
  it(`level ${level} retains its remaining source stock of ${stock} through Recall and death`, () => {
    const r = yetiRecallBattle(level);
    hurtUnit(r.battle, r.unit, 600);
    r.model.step(0.05);
    expect(r.children()).toHaveLength(1);
    r.recall(r.unit);
    const unit = r.deploy(6.9, 20);
    expect(unit.native!.damageSpawns).toBe(1);
    hurtUnit(r.battle, unit, unit.hp);
    r.model.step(0.05);
    expect(unit.native!.damageSpawns).toBe(stock);
    expect(r.children()).toHaveLength(stock);
    expect(r.children().every((child) => child.level === level)).toBe(true);
  });

it('a fully spent stock cannot refill on redeployment or death', () => {
  const r = yetiRecallBattle();
  for (let n = 0; n < 8; n++) {
    hurtUnit(r.battle, r.unit, 600);
    healUnit(r.battle, r.unit, 600);
    r.model.step(0.05);
  }
  expect(r.children()).toHaveLength(8);
  r.recall(r.unit);
  const unit = r.deploy(6.9, 20);
  hurtUnit(r.battle, unit, 600);
  r.model.step(0.05);
  expect(r.children()).toHaveLength(8);
  hurtUnit(r.battle, unit, unit.hp);
  r.model.step(0.05);
  expect(r.children()).toHaveLength(8);
});

it('two recalled Yetis retain distinct progress in the same FIFO order as their health', () => {
  const r = yetiRecallBattle(1, undefined, false, 2),
    second = r.deploy(6.9, 28);
  hurtUnit(r.battle, r.unit, 1800);
  hurtUnit(r.battle, second, 600);
  r.model.step(0.05);
  r.recall(r.unit);
  r.recall(second);
  const firstReturn = r.deploy(6.9, 11.5),
    secondReturn = r.deploy(6.9, 28);
  expect([firstReturn.hp, secondReturn.hp]).toEqual([1100, 2300]);
  expect([firstReturn.native!.damageTaken, secondReturn.native!.damageTaken]).toEqual([1800, 600]);
  expect([firstReturn.native!.damageSpawns, secondReturn.native!.damageSpawns]).toEqual([3, 1]);
  hurtUnit(r.battle, firstReturn, firstReturn.hp);
  hurtUnit(r.battle, secondReturn, secondReturn.hp);
  r.model.step(0.05);
  expect(r.children()).toHaveLength(16);
});

it.each([300, 600])('version 144 keeps the historical reset after %s damage', (damage) => {
  const r = yetiRecallBattle(1, 144);
  hurtUnit(r.battle, r.unit, damage);
  r.model.step(0.05);
  r.recall(r.unit);
  const unit = r.deploy(6.9, 20);
  hurtUnit(r.battle, unit, damage === 300 ? 300 : unit.hp);
  r.model.step(0.05);
  expect(r.children()).toHaveLength(damage === 300 ? 0 : 9);
});

for (let level = 1; level <= 8; level++)
  it(`Super Yeti ${level} keeps its source Electromite stock through Recall and death`, () => {
    const r = yetiRecallBattle(level, undefined, false, 1, 'superyeti');
    hurtUnit(r.battle, r.unit, 400);
    r.model.step(0.05);
    expect(r.children()).toHaveLength(1);
    r.recall(r.unit);
    const unit = r.deploy(6.9, 20);
    hurtUnit(r.battle, unit, unit.hp);
    r.model.step(0.05);
    expect(r.children()).toHaveLength(level + 6);
    expect(r.children().every((child) => child.level === level)).toBe(true);
  });

it('Super Yeti retains progress toward its pinned 400-damage threshold', () => {
  const r = yetiRecallBattle(1, undefined, false, 1, 'superyeti');
  hurtUnit(r.battle, r.unit, 200);
  r.model.step(0.05);
  r.recall(r.unit);
  const unit = r.deploy(6.9, 20);
  hurtUnit(r.battle, unit, 200);
  r.model.step(0.05);
  expect(unit.native!.damageTaken).toBe(400);
  expect(r.children()).toHaveLength(1);
});

it('normal and Super Yeti health queues retain separate stock when redeployed in reverse order', () => {
  const r = yetiRecallBattle();
  r.battle.remaining.superyeti = 1;
  const second = r.deploy(6.9, 28, 'superyeti');
  hurtUnit(r.battle, r.unit, 1800);
  hurtUnit(r.battle, second, 400);
  r.model.step(0.05);
  r.recall(r.unit);
  r.recall(second);
  const superReturn = r.deploy(6.9, 28, 'superyeti'),
    normalReturn = r.deploy(6.9, 11.5);
  expect([superReturn.hp, normalReturn.hp]).toEqual([4200, 1100]);
  expect([superReturn.native!.damageTaken, normalReturn.native!.damageTaken]).toEqual([400, 1800]);
  expect([superReturn.native!.damageSpawns, normalReturn.native!.damageSpawns]).toEqual([1, 3]);
  hurtUnit(r.battle, superReturn, superReturn.hp);
  hurtUnit(r.battle, normalReturn, normalReturn.hp);
  r.model.step(0.05);
  expect(r.battle.units.filter((unit) => unit.kind === 'yetimite')).toHaveLength(8);
  expect(r.battle.units.filter((unit) => unit.kind === 'electromite')).toHaveLength(7);
});

for (const kind of ['yeti', 'superyeti'] as const) {
  for (const level of [1, 8]) {
    for (const version of [144, 145])
      it(`${kind} level ${level} actual Recall inputs reconstruct full version-${version} portable snapshots`, () => {
        const r = yetiRecallRecording(kind, level, version),
          at = (time: number) =>
            r.snapshots.find((snapshot) => snapshot.at === time)!.battle as Battle;
        expect(r.damageBefore).toBe(256);
        expect(r.damageAfter).toBe(kind === 'yeti' ? 384 : 256);
        expect(r.childIds).toHaveLength(version === 145 ? 1 : 0);
        const unit = at(r.returned).units.find((unit) => unit.id === r.newId)!;
        expect(unit.hp).toBe(r.hp);
        expect(unit.native!.damageTaken).toBe(version === 145 ? 256 : undefined);
        expect(at(r.held).recalledYeti?.[kind]).toEqual(
          version === 145 ? [{ damageTaken: 256, damageSpawns: 0 }] : undefined,
        );
        expect(at(r.returned).recalledYeti?.[kind]).toEqual(version === 145 ? [] : undefined);
        if (version === 145)
          expect(at(r.spawned).units.find((unit) => unit.id === r.childIds[0])!.level).toBe(level);
        const model = new GameModel();
        expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          model.seekReplay(snapshot.at);
          while (model.replay!.seeking) model.step(0.05);
          expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
        }
      });
    it(`${kind} level ${level} retains exact version-144 combat without Recall`, () => {
      const current = yetiRecallBattle(level, 145, false, 1, kind),
        old = yetiRecallBattle(level, 144, false, 1, kind);
      for (let n = 0; n < 3; n++)
        for (const r of [current, old]) {
          hurtUnit(r.battle, r.unit, 700);
          healUnit(r.battle, r.unit, 700);
          r.model.step(0.05);
        }
      const actual = JSON.parse(JSON.stringify(current.battle));
      delete actual.nativeYetiRecall;
      expect(actual).toEqual(JSON.parse(JSON.stringify(old.battle)));
    });
  }
}

it('only carried normal or Super Yetis allocate the correction', () => {
  const setup = structuredClone(yetiRecallBattle().data.initial);
  expect(replayBattle(setup).nativeYetiRecall).toBe(true);
  expect(replayBattle(setup, 144).nativeYetiRecall).toBeUndefined();
  setup.army = { ...emptyArmy(), superyeti: 1 };
  expect(replayBattle(setup).nativeYetiRecall).toBe(true);
  setup.army = { ...emptyArmy(), giant: 1 };
  expect(replayBattle(setup).nativeYetiRecall).toBeUndefined();
});
