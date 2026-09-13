import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import combat from '../reference/spell-tower/combat.json';
import catalog from '../reference/spell-tower/catalog.json';
import { SPELL_TOWER_WEAPONS } from '../src/game/late-campaign';
import { NATIVE_COMBAT } from '../src/game/native-campaign';
import { SPELL_TOWER, SPELL_TOWER_HERO } from '../src/game/spell-tower-stats';
import { SPELL_TOWER_ART, spellTowerAsset } from '../src/game/spell-tower-art';
import {
  spellTowerDefenderBoost,
  spellTowerDefenderHidden,
  spellTowerDefenseBoost,
  spellTowerDestroyed,
  spellTowerHidden,
  spellTowerMoveScale,
  spellTowerTimeScale,
} from '../src/game/spell-tower';
import type { Battle } from '../src/game/model';
import {
  attacker,
  isolatedBattle,
  lateBuilding,
  stepFamilies,
} from './fixtures/late-defense-battle';

const destroy = (battle: Battle, id: number) => {
  const building = battle.buildings.find((b) => b.id === id)!;
  building.hp = 0;
  spellTowerDestroyed(
    { battle, dt: 0, phase: 'defenses', effect: () => {}, damageBuilding: () => {} },
    building,
    battle.elapsed,
  );
};

describe('Spell Tower source records', () => {
  it('retains the pinned building, weapon, bottle and spell rows', () => {
    expect(combat.levels.map((v) => v.hp)).toEqual([2500, 2800, 3100, 3200]);
    expect(combat.levels.map((v) => v.hp)).toEqual(NATIVE_COMBAT[1000072].hp);
    expect(combat.levels.map((v) => v.unlockWeapon)).toEqual([
      'SpellTowerRage',
      'SpellTowerPoison',
      'SpellTowerInvisibility',
      'SpellTowerEarthquake',
    ]);
    for (const [id, weapon] of Object.entries(SPELL_TOWER_WEAPONS))
      expect(SPELL_TOWER[weapon].globalId).toBe(Number(id));
    const { rage, poison, invisibility } = SPELL_TOWER;
    expect([rage.range, poison.range, invisibility.range]).toEqual([9, 9, 4.5]);
    expect([rage.windup, poison.windup, invisibility.windup].map((v) => Math.round(v * 1000))).toEqual([
      1200, 1200, 1200,
    ]);
    expect([rage.cooldown, poison.cooldown, invisibility.cooldown]).toEqual([68.8, 68.8, 48.8]);
    expect([rage.selfCentered, poison.selfCentered, invisibility.selfCentered]).toEqual([true, false, true]);
    expect([rage.hitBuildingTrigger, poison.hitBuildingTrigger, invisibility.hitBuildingTrigger]).toEqual([
      false,
      false,
      true,
    ]);
    expect([rage.castOnDeath, poison.castOnDeath, invisibility.castOnDeath]).toEqual([true, true, true]);
    expect(rage.exports[2]).toBe('spell_tower_lvl3_rage');
    expect([rage.projectile.travel, rage.projectile.ballisticHeight, poison.projectile.startHeight]).toEqual([
      0.8, 300, 146,
    ]);
    expect(rage.spell).toMatchObject({
      name: 'Spell Tower Rage',
      radius: 5,
      hits: 60,
      interval: 0.3,
      firstHit: 0.4,
      boostTime: 1,
      speedBoost: 30,
      speedBoost2: 15,
      damageBoost: 0.6,
      buildingDamageBoost: 0.6,
      attackSpeedBoost: 0,
    });
    expect(poison.spell).toMatchObject({
      name: 'Spell Tower Poison',
      radius: 5,
      hits: 30,
      interval: 0.4,
      firstHit: 0,
      boostTime: 0.5,
      speedBoost: -35,
      attackSpeedBoost: -0.25,
      poisonDps: 60,
      poisonIncreaseSlowly: false,
      poisonAffectAir: true,
      boostLinkedToPoison: true,
      boostDefenders: true,
      heroDamageMultiplier: 0.2,
    });
    expect(invisibility.spell).toMatchObject({
      name: 'Spell Tower Invisibility',
      radius: 4.5,
      hits: 18,
      interval: 0.25,
      firstHit: 0.4,
      invisibilityTime: 0.6,
      immuneWalls: true,
    });
    expect(SPELL_TOWER_HERO).toEqual({ rage: 0.5, speed: 0.5 });
    expect([rage.stateLabels.load_end, poison.stateLabels.load_end, invisibility.stateLabels.load_end]).toEqual([
      1235, 1473, 993,
    ]);
    expect(catalog.sources['sc/buildings_17.sctx']).toBe(
      'bce86a6857d43a6705833a6cb0a5ec269d8ff9990e8e15c5b9011422d59ab201',
    );
  });

  it('ships every registered weapon preview', () => {
    for (const level of [1, 2, 3, 4])
      for (const weapon of ['rage', 'poison', 'invisibility'])
        expect(existsSync(`public${spellTowerAsset(level, weapon)}`)).toBe(true);
    expect(catalog.previews).toHaveLength(12);
    expect(catalog.previews.every((p) => p.width === 280 && p.height === 320)).toBe(true);
    expect([SPELL_TOWER_ART.width, SPELL_TOWER_ART.height]).toEqual([140 * 1.2, 160 * 1.2]);
  });
});

describe('Spell Tower Rage', () => {
  it('casts after the windup, deploys after the bottle flight and boosts defenses in radius', () => {
    const battle = isolatedBattle([
      lateBuilding(1, 'spelltower', 20, 20, 3, 'rage'),
      lateBuilding(2, 'cannon', 22, 17, 10),
      lateBuilding(3, 'cannon', 28, 28, 10),
    ]);
    battle.units.push(attacker(7, 'giant', 21 + 8.5, 21, 1e9, 900));
    for (let i = 0; i < 45; i++) stepFamilies(battle);
    const family = battle.late!.spellTower!;
    expect(family.casts).toHaveLength(1);
    const cast = family.casts[0];
    expect(cast).toMatchObject({ weapon: 'rage', x: 21, y: 21, onDeath: false });
    expect(cast.at).toBeCloseTo(0.05 + 1.2, 9);
    expect(cast.deployAt).toBeCloseTo(cast.at + 0.8, 9);
    expect(family.towers[1].readyAt).toBeCloseTo(cast.at + 68.8, 9);
    const [tower, near, far] = battle.buildings;
    const first = cast.deployAt + 0.4,
      end = first + 59 * 0.3 + 1;
    expect(spellTowerDefenseBoost(battle, near, first - 0.01).damage).toBe(1);
    expect(spellTowerDefenseBoost(battle, near, first).damage).toBeCloseTo(1.6, 12);
    expect(spellTowerDefenseBoost(battle, tower, end - 0.01).damage).toBeCloseTo(1.6, 12);
    expect(spellTowerDefenseBoost(battle, near, end).damage).toBe(1);
    expect(spellTowerDefenseBoost(battle, far, first + 1).damage).toBe(1);
    expect(spellTowerDefenseBoost(battle, near, first + 1).rate).toBe(1);
  });

  it('enrages defending units at each pulse, with Balloons using the second speed row', () => {
    const battle = isolatedBattle([lateBuilding(1, 'spelltower', 20, 20, 3, 'rage')]);
    battle.units.push(attacker(7, 'giant', 29, 21, 1e9, 900));
    const defender = (id: number, kind: 'skeleton' | 'balloon', x: number) =>
      ({ id, kind, level: 1, sourceId: 1, mode: 'ground', x, y: 21, hp: 100, maxHp: 100, spawnedAt: 0,
        cooldown: 0, target: null, path: [], pathAt: 0, attacking: false, attacks: [] }) as never;
    battle.defenders = [defender(-1, 'skeleton', 22), defender(-2, 'balloon', 20), defender(-3, 'skeleton', 27)];
    for (let i = 0; i < 60; i++) stepFamilies(battle);
    expect(spellTowerDefenderBoost(battle, battle.defenders[0])).toEqual({ damage: 1.6, speed: 30 / 8 });
    expect(spellTowerDefenderBoost(battle, battle.defenders[1])).toEqual({ damage: 1.6, speed: 15 / 8 });
    expect(spellTowerDefenderBoost(battle, battle.defenders[2])).toEqual({ damage: 1, speed: 0 });
  });
});

describe('Spell Tower Poison', () => {
  it('throws at its target and slows movement and attack timers while poison remains', () => {
    const battle = isolatedBattle([lateBuilding(1, 'spelltower', 20, 20, 3, 'poison')]);
    const giant = attacker(7, 'giant', 21 + 6, 21, 1e9, 900);
    const king = attacker(8, 'swordsman', 21 + 6.5, 21.5, 1e9, 1500, { hero: 'king' });
    const dragon = attacker(9, 'dragon', 21 + 6, 22, 1e9, 3000);
    battle.units.push(giant, king, dragon);
    for (let i = 0; i < 40; i++) stepFamilies(battle);
    const cast = battle.late!.spellTower!.casts[0];
    expect(cast).toMatchObject({ weapon: 'poison', x: 27, y: 21, targetId: 7 });
    expect(cast.deployAt).toBeCloseTo(2.05, 9);
    expect(spellTowerTimeScale(battle, giant)).toBe(1);
    stepFamilies(battle);
    // The first pulse lands with the bottle; the slow lasts the complete remaining poison.
    expect(giant.late!.spellTower!.slowUntil).toBeCloseTo(cast.deployAt + 7.04, 9);
    expect(spellTowerTimeScale(battle, giant)).toBe(0.75);
    expect(spellTowerMoveScale(battle, giant)).toBeCloseTo(0.65, 12);
    expect(spellTowerMoveScale(battle, king)).toBeCloseTo(0.83, 12);
    expect(spellTowerTimeScale(battle, king)).toBe(0.75);
    expect(king.late!.spellTower!.poisonDps).toBe(12);
    expect(dragon.late!.spellTower!.poisonDps).toBe(60);
  });

  it('holds full damage for 640 ms after the last pulse, then decays over 100 source ticks', () => {
    const battle = isolatedBattle([lateBuilding(1, 'spelltower', 20, 20, 3, 'poison')]);
    const giant = attacker(7, 'giant', 27, 21, 1e9, 900);
    battle.units.push(giant);
    // The bottle lands at 2.05 s; the preceding source tick (2.048 s) precedes the first pulse.
    for (let i = 0; i < 41; i++) stepFamilies(battle);
    expect(giant.late!.spellTower).toMatchObject({ poisonDps: 60, poisonTime: 1000, poisonHold: 640 });
    // Leave the cloud after the first pulse; only its lingering poison remains.
    giant.x = 45;
    const hp = giant.hp;
    for (let i = 0; i < 200; i++) stepFamilies(battle);
    expect(hp - giant.hp).toBeCloseTo(10 * 3.84 + 0.00384 * 49500, 6);
    expect(giant.late!.spellTower).toMatchObject({ poisonDps: 0, poisonTime: 0 });
  });
});

describe('Spell Tower Invisibility', () => {
  it('triggers only from an attack on a damaged building inside its area and conceals non-walls', () => {
    const battle = isolatedBattle([
      lateBuilding(1, 'spelltower', 20, 20, 3, 'invisibility'),
      lateBuilding(2, 'goldstorage', 16, 20, 10),
      lateBuilding(3, 'wall', 22, 20, 10),
      lateBuilding(4, 'goldstorage', 30, 30, 10),
    ]);
    const wizard = attacker(7, 'wizard', 13, 21.5, 1e9, 75);
    battle.units.push(wizard);
    const storage = battle.buildings[1];
    for (let i = 0; i < 40; i++) {
      wizard.attacking = true;
      wizard.target = 2;
      stepFamilies(battle);
    }
    expect(battle.late!.spellTower!.casts).toHaveLength(0);
    storage.hp -= 100;
    for (let i = 0; i < 30; i++) {
      wizard.attacking = true;
      wizard.target = 2;
      stepFamilies(battle);
    }
    const cast = battle.late!.spellTower!.casts[0];
    expect(cast).toMatchObject({ weapon: 'invisibility', x: 21, y: 21 });
    const first = cast.deployAt + 0.4,
      end = first + 17 * 0.25 + 0.6;
    const [tower, inside, wall, outside] = battle.buildings;
    expect(spellTowerHidden(battle, inside, first - 0.01)).toBe(false);
    expect([tower, inside, wall, outside].map((b) => spellTowerHidden(battle, b, first))).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(spellTowerHidden(battle, inside, end - 0.01)).toBe(true);
    expect(spellTowerHidden(battle, inside, end)).toBe(false);
  });

  it('conceals defending units at its pulses', () => {
    const battle = isolatedBattle([
      lateBuilding(1, 'spelltower', 20, 20, 3, 'invisibility'),
      lateBuilding(2, 'goldstorage', 16, 20, 10),
    ]);
    battle.buildings[1].hp -= 1;
    const wizard = attacker(7, 'wizard', 13, 21.5, 1e9, 75);
    battle.units.push(wizard);
    battle.defenders = [
      { id: -1, kind: 'skeleton', sourceId: 1, mode: 'ground', x: 22, y: 22, hp: 50, maxHp: 50,
        spawnedAt: 0, cooldown: 0, target: null, path: [], pathAt: 0, attacking: false },
    ];
    for (let i = 0; i < 50; i++) {
      wizard.attacking = true;
      wizard.target = 2;
      stepFamilies(battle);
    }
    expect(spellTowerDefenderHidden(battle, battle.defenders[0])).toBe(true);
  });
});

describe('Spell Tower destruction', () => {
  it('releases a loaded spell when destroyed, but not while reloading', () => {
    const battle = isolatedBattle([
      lateBuilding(1, 'spelltower', 20, 20, 3, 'rage'),
      lateBuilding(2, 'spelltower', 30, 30, 3, 'rage'),
    ]);
    battle.units.push(attacker(7, 'giant', 28, 21, 1e9, 900));
    for (let i = 0; i < 40; i++) stepFamilies(battle);
    const family = battle.late!.spellTower!;
    expect(family.casts.map((c) => c.sourceId)).toEqual([1]);
    destroy(battle, 1);
    destroy(battle, 2);
    expect(family.casts.map((c) => [c.sourceId, c.onDeath])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(family.casts[1].at).toBe(battle.elapsed);
  });

  it('aims a Poison death cast at the nearest attacker in range, otherwise at the tower', () => {
    const battle = isolatedBattle([
      lateBuilding(1, 'spelltower', 20, 20, 3, 'poison'),
      lateBuilding(2, 'spelltower', 40, 40, 3, 'poison'),
    ]);
    battle.units.push(attacker(7, 'giant', 21 + 8, 21, 1e9, 900), attacker(8, 'giant', 21 + 3, 21, 1e9, 900));
    stepFamilies(battle);
    destroy(battle, 1);
    destroy(battle, 2);
    expect(battle.late!.spellTower!.casts.map((c) => [c.x, c.y, c.targetId])).toEqual([
      [24, 21, 8],
      [41, 41, null],
    ]);
  });
});
