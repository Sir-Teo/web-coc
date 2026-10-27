import { expect, it } from 'vitest';
import { hurtUnit } from '../src/game/native-status';
import { revengeDeckBattle } from './fixtures/revenge-deck';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';

for (const sameFrame of [false, true])
  it(`Revenge Deck retains both attackers with same-frame hits=${sameFrame}`, () => {
    const r = revengeDeckBattle(),
      hp = r.unit.hp;
    hurtUnit(r.battle, r.unit, 100, r.battle.elapsed, 2);
    if (!sameFrame) r.model.step(0.05);
    hurtUnit(r.battle, r.unit, 100, r.battle.elapsed, 3);
    r.model.step(0.05);
    expect(r.cards().map((shot) => shot.targetId)).toEqual([2, 3]);
    expect(new Set(r.cards().map((shot) => shot.id)).size).toBe(2);
    expect(r.unit.hp).toBe(hp - 140);
    expect(r.cards()[0].launched).toBe(0);
    const old = revengeDeckBattle(1, 142);
    hurtUnit(old.battle, old.unit, 100, 0, 2);
    if (!sameFrame) old.model.step(0.05);
    hurtUnit(old.battle, old.unit, 100, old.battle.elapsed, 3);
    old.model.step(0.05);
    expect(old.cards().map((shot) => shot.targetId)).toEqual([sameFrame ? 3 : 2]);
  });

it('uses the source 800 ms cooldown independently for every attacker', () => {
  const r = revengeDeckBattle();
  hurtUnit(r.battle, r.unit, 100, 0, 2);
  r.model.step(0.05);
  r.until(0.4);
  hurtUnit(r.battle, r.unit, 100, r.battle.elapsed, 2);
  hurtUnit(r.battle, r.unit, 100, r.battle.elapsed, 3);
  r.model.step(0.05);
  expect(r.cards().map((shot) => shot.targetId)).toEqual([2, 3]);
  r.until(0.8);
  hurtUnit(r.battle, r.unit, 100, r.battle.elapsed, 2);
  r.model.step(0.05);
  expect(r.cards().map((shot) => shot.targetId)).toEqual([2, 3, 2]);
});

it.each(['trap', 'secondary', 'no-source'] as const)(
  'does not counter %s damage or reuse a stale source',
  (kind) => {
    const r = revengeDeckBattle();
    r.unit.native!.lastDamageSource = 2;
    hurtUnit(
      r.battle,
      r.unit,
      100,
      0,
      kind === 'no-source' ? undefined : 2,
      kind === 'trap',
      kind === 'secondary',
    );
    r.model.step(0.05);
    expect(r.cards()).toEqual([]);
  },
);

it('blocked damage and a destroyed attacker produce neither a card nor a heal', () => {
  const r = revengeDeckBattle(),
    hp = r.unit.hp;
  r.unit.native!.effects!.immortalUntil = 100;
  hurtUnit(r.battle, r.unit, 100, 0, 2);
  r.model.step(0.05);
  expect(r.cards()).toEqual([]);
  expect(r.unit.hp).toBe(hp);
  delete r.unit.native!.effects!.immortalUntil;
  hurtUnit(r.battle, r.unit, 100, r.battle.elapsed, 2);
  r.battle.buildings[1].hp = 0;
  r.model.step(0.05);
  expect(r.cards()).toEqual([]);
  expect(r.unit.hp).toBe(hp - 100);
});

it('all 27 item levels retain their pinned flat counter damage and healing', () => {
  const tiers = [
    [1, 150, 30],
    [3, 155, 32],
    [6, 160, 35],
    [9, 165, 39],
    [12, 175, 43],
    [15, 185, 46],
    [18, 195, 49],
    [21, 205, 52],
    [24, 215, 55],
    [27, 225, 60],
  ];
  for (let level = 1; level <= 27; level++) {
    const [, damage, heal] = tiers.filter(([start]) => start <= level).at(-1)!,
      r = revengeDeckBattle(level),
      hp = r.unit.hp;
    hurtUnit(r.battle, r.unit, 100, 0, 2);
    r.model.step(0.05);
    expect(r.cards()[0].damage).toBe(damage);
    expect(r.unit.hp).toBe(hp - 100 + heal);
  }
});

it('counters a real garrison Dragon primary hit and lands the captured card on that defender', () => {
  const r = revengeDeckBattle();
  r.battle.nativeGarrisonDamage = true;
  const dragon = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 8, 11.5, 0),
    hp = dragon.hp;
  for (let n = 0; n < 100 && !r.cards().length; n++) r.model.step(0.05);
  expect(r.cards()).toHaveLength(1);
  const card = r.cards()[0];
  expect(card).toMatchObject({
    targetId: dragon.id,
    targetDefender: true,
    targetBuilding: false,
    damage: 150,
  });
  r.until(card.impact + 0.05);
  expect(dragon.hp).toBe(hp - 150);
});

it('Recall clears a hit awaiting upkeep before the Duke is redeployed', () => {
  const r = revengeDeckBattle(1, undefined, true, false, 'spells');
  r.model.activeSpell = 'recall';
  expect(r.model.castSpell(r.unit.x, r.unit.y)).toBe(true);
  r.until(0.85);
  hurtUnit(r.battle, r.unit, 100, r.battle.elapsed, 2);
  expect(r.unit.native!.revengeHits).toHaveLength(1);
  r.model.step(0.05);
  expect(r.hero.unitId).toBeNull();
  expect(r.unit.native!.revengeHits).toBeUndefined();
  expect(r.cards()).toEqual([]);
  r.model.activeSpell = null;
  expect(r.model.deployNativeHero('duke', 6.9, 20)).toBe(true);
  r.model.step(0.05);
  expect(r.cards()).toEqual([]);
});

it.each(['spells', 'phoenix'] as const)(
  '%s restoration clears a lethal hit without a stale counter',
  (recovery) => {
    const r = revengeDeckBattle(1, undefined, true, false, recovery);
    r.hero.abilityUsed = true;
    hurtUnit(r.battle, r.unit, r.unit.hp, 0, 2);
    r.model.step(0.05);
    expect(r.unit.native!.revengeHits).toHaveLength(1);
    if (recovery === 'spells') {
      expect(r.model.castReviveOnHero('duke')).toBe(true);
      r.until(1.6);
    } else {
      const shot = r.battle.projectiles!.find((p) => p.native?.phoenixRevive)!;
      expect(shot).toBeDefined();
      r.until(shot.impact);
    }
    expect(r.unit.hp).toBeGreaterThan(0);
    expect(r.unit.native!.revengeHits).toBeUndefined();
    expect(r.cards()).toEqual([]);
  },
);
