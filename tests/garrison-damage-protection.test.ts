import { expect, it } from 'vitest';
import { GameModel, type Unit } from '../src/game/model';
import { hurtDefender, stepDefenders } from '../src/game/defenders';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { garrisonPoisonOnHit, garrisonStats } from '../src/game/garrison-kinds';
import { applyGarrisonPoison, stepGarrisonStatus } from '../src/game/garrison-status';
import { startChain, stepChain, stepAura, stepDeathBolts } from '../src/game/garrison-abilities';
import type { UnitEffects } from '../src/game/native-status';

function arena(effects: UnitEffects = {}, enabled = true) {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  (battle as typeof battle & { nativeGarrisonDamage?: true }).nativeGarrisonDamage = enabled
    ? true
    : undefined;
  battle.units = [];
  battle.buildings = [];
  const add = (id = 100, x = 10, y = 10): Unit => {
    const unit: Unit = {
      id,
      kind: 'giant',
      x,
      y,
      hp: 5000,
      maxHp: 5000,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
      native: { effects: structuredClone(effects) },
    };
    battle.units.push(unit);
    return unit;
  };
  const unit = add();
  const advance = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 20); i++) {
      battle.elapsed += 0.05;
      stepDefenders(battle, 0.05, () => {});
    }
  };
  return { model, battle, unit, add, advance };
}

it.each([
  ['invulnerability', { immortalUntil: 100 }, 5000],
  ['half shield', { shield: { until: 100, percent: 0.5 } }, 4806.25],
  ['extra health', { extraHp: { until: 100, amount: 100 } }, 4712.5],
] as const)(
  'a real Dragon hit respects %s without changing its attack schedule',
  (name, effects, expected) => {
    const r = arena(effects),
      dragon = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 8, 10, 0);
    r.advance(1.25);
    expect(dragon.attackCount).toBe(1);
    expect(r.unit.hp).toBe(expected);
    expect(r.unit.native!.damageTaken ?? 0).toBe(5000 - expected);
    if (name === 'extra health') expect(r.unit.native!.effects!.extraHp!.amount).toBe(0);
  },
);

it('historical garrison damage retains its earlier raw-HP behavior', () => {
  const r = arena({ immortalUntil: 100 }, false);
  spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 8, 10, 0);
  r.advance(1.25);
  expect(r.unit.hp).toBe(4612.5);
  expect(r.unit.native!.damageTaken).toBeUndefined();
});

it.each(['pekka', 'valkyrie'] as const)(
  '%s melee/area damage respects shared invulnerability',
  (kind) => {
    const r = arena({ immortalUntil: 100 }),
      defender = spawnGarrisonDefender(r.battle, kind, kind === 'pekka' ? 8 : 7, 1, 10, 10, 0);
    r.advance(2);
    expect(defender.attackCount).toBeGreaterThan(0);
    expect(r.unit.hp).toBe(5000);
  },
);

it('consumes a Balloon death explosion without bypassing protection', () => {
  const r = arena({ immortalUntil: 100 }),
    balloon = spawnGarrisonDefender(r.battle, 'balloon', 8, 1, 10, 10, 0);
  hurtDefender(r.battle, balloon, balloon.maxHp);
  r.advance(0.45);
  expect(balloon.deathResolved).toBe(true);
  expect(r.unit.hp).toBe(5000);
});

it('Electro Dragon secondary chain hits use the same damage protections', () => {
  const r = arena({ immortalUntil: 100 }),
    second = r.add(101, 10.5, 10),
    dragon = spawnGarrisonDefender(r.battle, 'electrodragon', 3, 1, 10, 10, 0),
    stats = garrisonStats('electrodragon', 3);
  startChain(dragon, stats, 0, r.unit, stats.damage, 0);
  r.battle.elapsed = 0.5;
  expect(stepChain(r.battle, dragon, stats).length).toBeGreaterThan(0);
  expect(second.hp).toBe(5000);
});

it('Electro Dragon death bolts consume their own schedule without bypassing protection', () => {
  const r = arena({ immortalUntil: 100 }),
    dragon = spawnGarrisonDefender(r.battle, 'electrodragon', 3, 1, 10, 10, 0),
    stats = garrisonStats('electrodragon', 3);
  dragon.bolts = [{ at: 0.2, x: 10, y: 10, done: false }];
  r.battle.elapsed = 0.3;
  expect(stepDeathBolts(r.battle, dragon, stats)).toHaveLength(1);
  expect(r.unit.hp).toBe(5000);
});

it('Electro Titan aura pulses respect invulnerability even outside its ordinary attack', () => {
  const r = arena({ immortalUntil: 100 }),
    titan = spawnGarrisonDefender(r.battle, 'electrotitan', 2, 1, 10, 10, 0),
    stats = garrisonStats('electrotitan', 2);
  r.battle.elapsed = 1;
  expect(stepAura(r.battle, titan, stats)).toBeGreaterThan(0);
  expect(r.unit.hp).toBe(5000);
});

it('suppressed Headhunter poison advances without becoming damage debt after protection ends', () => {
  const r = arena({ immortalUntil: 100 }),
    poison = garrisonPoisonOnHit(garrisonStats('headhunter', 3))!;
  applyGarrisonPoison(r.battle, r.unit, poison, -1, 0);
  r.battle.elapsed = 1;
  stepGarrisonStatus(r.battle);
  expect(r.unit.hp).toBe(5000);
  expect(r.unit.late!.garrison!.poison!.ticked).toBe(1);
  delete r.unit.native!.effects!.immortalUntil;
  r.battle.elapsed = 1.05;
  stepGarrisonStatus(r.battle);
  expect(r.unit.hp).toBeCloseTo(5000 - poison.dps * 0.05, 10);
});
