import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { healUnit, hurtUnit } from '../src/game/native-status';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import {
  SNAKE_DAMAGE_KEY,
  snakeBraceletBattle,
  snakeBraceletRecallRecording,
} from './fixtures/snake-bracelet';

it('retains damage below one summon threshold across Recall without summoning during the hold', () => {
  const r = snakeBraceletBattle();
  hurtUnit(r.battle, r.unit, 150);
  r.model.step(0.05);
  r.recall();
  r.until(r.battle.elapsed + 5);
  expect(r.battle.units.filter((unit) => unit.kind === 'snake')).toEqual([]);
  const unit = r.redeploy();
  expect(unit.native!.damageTaken).toBe(150);
  hurtUnit(r.battle, unit, 150);
  r.model.step(0.05);
  r.model.step(0.05);
  expect(unit.native!.damageTaken).toBe(300);
  expect(r.hero.charges![SNAKE_DAMAGE_KEY]).toBe(1);
  expect(r.battle.units.filter((unit) => unit.kind === 'snake')).toHaveLength(1);
  const old = snakeBraceletBattle(1, 143);
  hurtUnit(old.battle, old.unit, 150);
  old.model.step(0.05);
  old.recall();
  const previous = old.redeploy();
  hurtUnit(old.battle, previous, 150);
  old.model.step(0.05);
  old.model.step(0.05);
  expect(old.hero.charges![SNAKE_DAMAGE_KEY]).toBe(0);
  expect(old.battle.units.filter((unit) => unit.kind === 'snake')).toEqual([]);
});

it('retains partial progress through two Recall body replacements', () => {
  const r = snakeBraceletBattle();
  let unit = r.unit;
  for (let n = 0; n < 3; n++) {
    hurtUnit(r.battle, unit, 100);
    r.model.step(0.05);
    if (n < 2) {
      r.recall();
      unit = r.redeploy();
    }
  }
  r.model.step(0.05);
  expect(unit.native!.damageTaken).toBe(300);
  expect(r.hero.charges![SNAKE_DAMAGE_KEY]).toBe(1);
  expect(r.battle.units.filter((unit) => unit.kind === 'snake')).toHaveLength(1);
});

it('all 27 source item levels retain their per-battle summon cap across Recall', () => {
  const tiers = [
    [1, 11],
    [3, 14],
    [6, 17],
    [9, 20],
    [12, 24],
    [15, 32],
    [18, 40],
    [21, 46],
    [24, 50],
    [27, 54],
  ];
  for (let level = 1; level <= 27; level++) {
    const [, cap] = tiers.filter(([start]) => start <= level).at(-1)!,
      r = snakeBraceletBattle(level);
    for (let n = 0; n < cap; n++) {
      hurtUnit(r.battle, r.unit, 300);
      healUnit(r.battle, r.unit, 300);
      r.model.step(0.05);
    }
    r.model.step(0.05);
    expect(r.battle.units.filter((unit) => unit.kind === 'snake')).toHaveLength(cap);
    r.recall();
    const unit = r.redeploy();
    r.model.step(0.05);
    hurtUnit(r.battle, unit, 300);
    r.model.step(0.05);
    r.model.step(0.05);
    expect(r.hero.charges![SNAKE_DAMAGE_KEY]).toBe(cap);
    expect(r.battle.units.filter((unit) => unit.kind === 'snake')).toHaveLength(cap);
  }
});

it('historical version 143 retains its previous cap reset after Recall', () => {
  const r = snakeBraceletBattle(1, 143);
  hurtUnit(r.battle, r.unit, 3300);
  r.model.step(0.05);
  r.model.step(0.05);
  expect(r.battle.units.filter((unit) => unit.kind === 'snake')).toHaveLength(11);
  r.recall();
  const unit = r.redeploy();
  r.model.step(0.05);
  hurtUnit(r.battle, unit, 300);
  r.model.step(0.05);
  r.model.step(0.05);
  expect(r.battle.units.filter((unit) => unit.kind === 'snake')).toHaveLength(12);
});

it('only actual HP removed advances the carried damage progress', () => {
  const r = snakeBraceletBattle();
  r.unit.native!.effects!.shield = { until: 100, percent: 0.5 };
  r.unit.native!.effects!.extraHp = { until: 100, amount: 100 };
  hurtUnit(r.battle, r.unit, 400);
  expect(r.unit.native!.damageTaken).toBe(100);
  r.model.step(0.05);
  r.recall();
  const unit = r.redeploy();
  hurtUnit(r.battle, unit, 200);
  r.model.step(0.05);
  r.model.step(0.05);
  expect(unit.native!.damageTaken).toBe(300);
  expect(r.battle.units.filter((unit) => unit.kind === 'snake')).toHaveLength(1);
});

it('allocates the correction only for a King carrying Snake Bracelet', () => {
  const r = snakeBraceletBattle(),
    setup = structuredClone(r.data.initial);
  expect(replayBattle(setup).nativeSnakeBraceletRecall).toBe(true);
  expect(replayBattle(setup, 143).nativeSnakeBraceletRecall).toBeUndefined();
  setup.heroes![0].items = [{ slug: 'rage-vial', level: 1 }];
  expect(replayBattle(setup).nativeSnakeBraceletRecall).toBeUndefined();
  setup.heroes![0].items = [];
  expect(replayBattle(setup).nativeSnakeBraceletRecall).toBeUndefined();
});

for (const level of [1, 27])
  for (const version of [143, 144])
    it(`actual level-${level} Cannon/Recall inputs reconstruct complete version-${version} snapshots`, () => {
      const r = snakeBraceletRecallRecording(level, version),
        at = (time: number) =>
          r.snapshots.find((snapshot) => snapshot.at === time)!.battle as Battle,
        returned = at(r.returned).units.find((unit) => unit.id === r.newId)!;
      expect(r.damageBefore).toBe(256);
      expect(r.damageAfter).toBe(128);
      expect(returned.hp).toBe(r.recalledHp);
      expect(returned.native!.damageTaken).toBe(version === 144 ? 256 : undefined);
      expect(at(r.held).nativeHeroes![0].recalledDamageTaken).toBe(
        version === 144 ? 256 : undefined,
      );
      expect(at(r.returned).nativeHeroes![0].recalledDamageTaken).toBeUndefined();
      expect(r.snakeIds).toHaveLength(version === 144 ? 1 : 0);
      if (version === 144) {
        const snake = at(r.spawned).units.find((unit) => unit.id === r.snakeIds[0])!;
        expect(snake.level).toBe(level === 1 ? 1 : 10);
      }
      const model = new GameModel();
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
      }
    });

it.each([1, 27])('level %s retains exact version-143 normal combat without Recall', (level) => {
  const current = snakeBraceletBattle(level),
    old = snakeBraceletBattle(level, 143);
  for (let n = 0; n < 5; n++) {
    for (const r of [current, old]) {
      hurtUnit(r.battle, r.unit, 300);
      r.model.step(0.05);
    }
  }
  const actual = JSON.parse(JSON.stringify(current.battle));
  delete actual.nativeSnakeBraceletRecall;
  expect(actual).toEqual(JSON.parse(JSON.stringify(old.battle)));
});
