import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { HERO_KINDS, heroDefaultItems, type HeroKind } from '../src/game/native-hero-data';
import { hurtUnit, unitDamageScale, unitAttackIntervalScale } from '../src/game/native-status';
import { castNativeSpell } from '../src/game/native-spells';
import { heroStatsFor } from '../src/game/native-heroes';
import { stepHeroAbilities } from '../src/game/native-hero-abilities';

function arena(kind: HeroKind, items = heroDefaultItems(kind)) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 30, 30, 18),
    makeBuilding(2, 'herohall', 35, 30, 12),
  ];
  m.state.king = { level: 1 };
  m.state.heroes = Object.fromEntries(
    HERO_KINDS.filter((k) => k !== 'king').map((k) => [k, { level: 1 }]),
  );
  m.state.heroLineup = [kind];
  m.state.gear = {
    levels: Object.fromEntries(items.map((s) => [s, 1])),
    loadouts: { [kind]: items },
  };
  m.state.army = { ...emptyArmy(), dragon: 1, giant: 1 };
  m.state.spells = emptySpells();
  m.state.nextId = 1000;
  m.startBattle(0, true);
  expect(m.deployNativeHero(kind, 5, 5)).toBe(true);
  const b = m.battle!;
  b.defenders = [];
  b.buildings = [makeBuilding(20, 'goldstorage', 12, 12, 10)];
  const hero = b.nativeHeroes!.find((h) => h.kind === kind)!;
  const unit = b.units.find((u) => u.id === hero.unitId)!;
  const refresh = () =>
    stepHeroAbilities(
      {
        battle: b,
        effect: () => {},
        damageBuilding: () => {},
        buildings: b.buildings,
        buildingsById: new Map(b.buildings.map((v) => [v.id, v])),
        passableWalls: new Set<number>(),
        nextId: () => m.state.nextId++,
        troopLevel: () => 1,
      },
      hero,
      unit,
      18,
    );
  return { m, b, hero, unit, refresh };
}
const run = (m: GameModel, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / 0.05); i++) m.step(0.05);
};

describe('complete hero combat', () => {
  for (const kind of HERO_KINDS)
    it(`${kind} deploys, activates once and damages the village`, () => {
      const { m, b, hero, unit } = arena(kind);
      expect(unit.hero).toBe(kind);
      unit.hp /= 2;
      expect(m.activateNativeHeroAbility(kind)).toBe(true);
      expect(hero.abilityUsed).toBe(true);
      expect(m.activateNativeHeroAbility(kind)).toBe(false);
      run(m, 60);
      expect(b.buildings.some((target) => target.hp < target.maxHp)).toBe(true);
      expect(Number.isFinite(unit.hp)).toBe(true);
    });

  for (const [kind, item, spell] of [
    ['warden', 'life-gem', 'Life Gem Aura'],
    ['warden', 'rage-gem', 'Rage Gem Aura'],
    ['champion', 'electro-boots', 'Electro Boots Aura'],
  ] as const)
    it(`${item} starts on deployment and does not spend the ability`, () => {
      const { b, hero, unit, refresh } = arena(kind, [item]);
      expect(b.nativeSpells?.filter((c) => c.name === spell)).toHaveLength(1);
      expect(b.nativeSpells?.find((c) => c.name === spell)?.follow).toBe(unit.id);
      refresh();
      refresh();
      expect(b.nativeSpells?.filter((c) => c.name === spell)).toHaveLength(1);
      expect(hero.abilityUsed).toBeFalsy();
    });

  it('Life Gem does not heal away damage on every aura pulse', () => {
    const { m, b, unit } = arena('warden', ['life-gem']);
    m.activeTroop = 'giant';
    m.deploy(5, 5);
    const giant = b.units.find((u) => u.kind === 'giant')!;
    run(m, 0.35);
    const granted = giant.native!.effects!.extraHp!.amount;
    expect(granted).toBeGreaterThan(0);
    hurtUnit(b, giant, 100);
    expect(giant.native!.effects!.extraHp!.amount).toBe(granted - 100);
    run(m, 0.3);
    expect(giant.native!.effects!.extraHp!.amount).toBe(granted - 100);
    unit.native!.recalled = true;
    run(m, 0.65);
    expect(b.nativeSpells?.some((c) => c.name === 'Life Gem Aura')).toBe(false);
    expect(giant.native!.effects!.extraHp!.until).toBeLessThan(b.elapsed);
  });

  it('overlapping life auras keep the strongest grant without stacking or refilling', () => {
    const { m, b, unit } = arena('warden', ['life-gem']);
    m.activeTroop = 'giant';
    m.deploy(5, 5);
    const giant = b.units.find((u) => u.kind === 'giant')!;
    castNativeSpell(b, 'Life Gem Aura', 18, 'attack', 5, 5, {
      follow: unit.id,
      owner: unit.id,
      immediate: true,
    });
    run(m, 0.35);
    const capacity = giant.native!.effects!.extraHp!.capacity!;
    expect(capacity).toBeCloseTo(giant.maxHp * 1.2);
    hurtUnit(b, giant, 100);
    run(m, 0.3);
    expect(giant.native!.effects!.extraHp!.capacity).toBe(capacity);
    expect(giant.native!.effects!.extraHp!.amount).toBe(capacity - 100);
  });

  it('Royal Rampage responds to nearby air allies, ignores ground allies and its own pet', () => {
    const { m, b, hero, unit, refresh } = arena('duke', []);
    expect(unitDamageScale(unit, b.elapsed)).toBe(2);
    expect(unitAttackIntervalScale(unit, b.elapsed)).toBeCloseTo(2 / 3);
    m.activeTroop = 'giant';
    m.deploy(5, 5);
    refresh();
    expect(unitDamageScale(unit, b.elapsed)).toBe(2);
    m.activeTroop = 'dragon';
    m.deploy(5, 5);
    refresh();
    const dragon = b.units.find((u) => u.kind === 'dragon')!;
    expect(unitDamageScale(unit, b.elapsed)).toBe(1);
    hero.petId = dragon.id;
    refresh();
    expect(unitDamageScale(unit, b.elapsed)).toBe(2);
    delete hero.petId;
    dragon.x = unit.x + 6.1;
    refresh();
    expect(unitDamageScale(unit, b.elapsed)).toBe(2);
    dragon.x = unit.x + 6;
    refresh();
    expect(unitDamageScale(unit, b.elapsed)).toBe(1);
    (dragon.native ??= {}).recalled = true;
    refresh();
    expect(unitDamageScale(unit, b.elapsed)).toBe(2);
    const hp = unit.hp;
    hurtUnit(b, unit, 100, b.elapsed, undefined, true);
    expect(unit.hp).toBe(hp - 80);
    hurtUnit(b, unit, 100);
    expect(unit.hp).toBe(hp - 180);
  });

  it('Royal Rampage doubles a real hit exactly once and sets the faster attack interval', () => {
    const { m, b, hero, unit } = arena('duke', []);
    unit.x = 11.5;
    unit.y = 12.5;
    const target = b.buildings[0];
    const hp = target.hp;
    const stats = heroStatsFor(hero, 18);
    m.step(0.05);
    expect(hp - target.hp).toBeCloseTo(stats.damage * 2);
    expect(unit.cooldown).toBeCloseTo(stats.rate / 1.5);
  });

  for (const kind of HERO_KINDS)
    it(`${kind} reproduces abilities and passives in a saved replay`, () => {
      const { m } = arena(kind);
      m.finishBattle();
      m.returnHome();
      m.startBattle(0, true);
      expect(m.deployNativeHero(kind, 5, 5)).toBe(true);
      run(m, 1);
      m.activateNativeHeroAbility(kind);
      run(m, 2);
      m.finishBattle();
      const expected = structuredClone({
        units: m.battle!.units,
        heroes: m.battle!.nativeHeroes,
        spells: m.battle!.nativeSpells,
      });
      const loaded = new GameModel(JSON.parse(JSON.stringify(m.state)));
      expect(loaded.startReplay(loaded.state.raidLog![0].id)).toBe(true);
      for (let i = 0; i < 200 && !loaded.replay!.complete; i++) loaded.step(0.05);
      expect(loaded.replay!.complete).toBe(true);
      expect({
        units: loaded.battle!.units,
        heroes: loaded.battle!.nativeHeroes,
        spells: loaded.battle!.nativeSpells,
      }).toEqual(expected);
    });

  it('version 52 recordings retain their original passive behavior', () => {
    const { b, unit, refresh } = arena('duke', []);
    delete b.nativeHeroPassives;
    delete unit.native!.effects!.rampage;
    refresh();
    expect(unitDamageScale(unit, b.elapsed)).toBe(1);
  });
});
