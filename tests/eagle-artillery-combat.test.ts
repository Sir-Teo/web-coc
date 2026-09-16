import { describe, expect, it } from 'vitest';
import { makeBuilding, type Battle, type Building, type Unit } from '../src/game/model';
import { replayBattle } from '../src/game/replay';
import { SPELLS, TROOPS, TROOP_KEYS, SPELL_KEYS } from '../src/game/data';
import { stepLateCampaign } from '../src/game/late-campaign';
import { NATIVE_COMBAT } from '../src/game/native-campaign';
import {
  EAGLE_ARTILLERY,
  EAGLE_ARTILLERY_HOUSING,
  EAGLE_ARTILLERY_LEVELS,
  eagleArtilleryDeployedHousing,
} from '../src/game/eagle-artillery-stats';
import { eagleArtilleryPending } from '../src/game/eagle-artillery';
import { isolatedSetup } from './fixtures/late-eagle-scattershot-battle';
import combat from '../reference/eagle-artillery/combat.json';

const TILE = 512;
function artillery(level = 1, x = 20, y = 20): Building {
  const hp = NATIVE_COMBAT[1000031].hp[level - 1];
  return { ...makeBuilding(500, 'eagleartillery', x, y, level), hp, maxHp: hp };
}
let nextUnit = 1;
function unit(kind: Unit['kind'], x: number, y: number, extra: Partial<Unit> = {}): Unit {
  return { id: nextUnit++, kind, x, y, hp: 1e6, maxHp: 1e6, cooldown: 0, target: null, path: [], pathAt: 0, attacking: false, ...extra };
}
/** Family-only harness: attackers stay where the test puts them; deployments are accounted. */
function board(level = 1, deployed: Partial<Record<Unit['kind'], number>> = { giant: 40 }) {
  const battle = replayBattle(isolatedSetup(65, artillery(level), deployed), 44);
  battle.started = true;
  for (const kind of TROOP_KEYS) battle.remaining[kind] = 0;
  return battle;
}
function advance(battle: Battle, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) {
    battle.elapsed += 0.05;
    stepLateCampaign({ battle, dt: 0.05, phase: 'defenses', effect: () => {}, damageBuilding: () => {} });
  }
}
const tower = (battle: Battle) => battle.late!.eagleArtillery!.towers[500];
const center = { x: 22, y: 22 };

describe('Eagle Artillery source values', () => {
  it('keeps the pinned 18.400.21 building, projectile and hit spell rows', () => {
    expect(EAGLE_ARTILLERY_LEVELS.map((l) => [l.hp, l.damage, l.spellDamage])).toEqual([
      [4000, 20, 225],
      [4400, 25, 250],
      [4800, 30, 275],
      [5200, 35, 350],
      [5600, 40, 425],
      [5900, 45, 475],
      [6200, 50, 525],
    ]);
    expect(NATIVE_COMBAT[1000031].hp).toEqual(EAGLE_ARTILLERY_LEVELS.map((l) => l.hp));
    expect(EAGLE_ARTILLERY).toMatchObject({
      size: 4,
      range: 50 * TILE,
      minRange: 7 * TILE,
      chargeMs: 3008,
      cooldownMs: 6992,
      burstCount: 3,
      burstDelayMs: 750,
      ammunition: 30,
      wakeUpMs: 1125,
      wakeUpSpace: 200,
      groupRadius: 5 * TILE,
      damageRadius: 3 * TILE,
      spellRadius: 0.75 * TILE,
      pushback: 50,
      pushbackHousingLimit: 3,
      travelMs: 5000,
      damageDelayMs: 580,
    });
    expect(combat.projectile).toMatchObject({ IsBallistic: 'TRUE', BallisticHeight: '5000', FixedTravelTime: '5000', DamageDelay: '580' });
    expect(combat.hitSpell).toMatchObject({ radius: 75, numberOfHits: 1, hitEffect: 'Artillery Hit' });
  });
  it('weighs deployed housing with the source multipliers and housing spaces', () => {
    const housing = EAGLE_ARTILLERY_HOUSING;
    expect(housing.globals).toMatchObject({
      UNIT_HOUSING_COST_MULTIPLIER: 100,
      SPELL_HOUSING_COST_MULTIPLIER: 500,
      HERO_HOUSING_COST_MULTIPLIER: 100,
      ALLIANCE_UNIT_HOUSING_COST_MULTIPLIER: 0,
      PET_HOUSING_COST_MULTIPLIER: 0,
    });
    for (const kind of TROOP_KEYS) expect(housing.troops[kind].housingSpace).toBe(TROOPS[kind].space);
    for (const kind of SPELL_KEYS) expect(housing.spells[kind].housingSpace).toBe(SPELLS[kind].space);
    expect(housing.hero).toEqual({ source: 'Barbarian King', housingSpace: 25, enemyGroupWeight: 2500 });
    const battle = board(1, { giant: 35 });
    battle.carried.lightning = battle.spells.lightning = 1;
    expect(eagleArtilleryDeployedHousing(battle)).toBe(175);
    battle.spells.lightning = 0;
    expect(eagleArtilleryDeployedHousing(battle)).toBe(180);
    battle.hero = { level: 1, townhall: 8, unitId: 7, abilityUsed: false, rageUntil: 0 };
    expect(eagleArtilleryDeployedHousing(battle)).toBe(205);
  });
});

describe('Eagle Artillery activation and bursts', () => {
  it('stays dormant below 200 deployed housing and wakes 1,088 ms after reaching it', () => {
    const dormant = board(1, { giant: 39, swordsman: 4 });
    dormant.units.push(unit('giant', center.x + 12, center.y));
    advance(dormant, 30);
    expect(eagleArtilleryDeployedHousing(dormant)).toBe(199);
    expect(tower(dormant)).toMatchObject({ stages: [0, 0, 0], fired: 0 });
    expect(tower(dormant).awakeAt).toBeUndefined();
    const battle = board(1, { giant: 40 });
    battle.units.push(unit('giant', center.x + 12, center.y));
    advance(battle, 20);
    const s = tower(battle);
    expect(s.stages).toEqual([0, 0, 0, 0]);
    // The qualifying tick plus 17 more 64-ms ticks exhaust WakeUpSpeed 1,125 ms.
    expect(s.awakeAt).toBeCloseTo(17 * 0.064, 9);
    // 47 charge ticks from the first active tick, then 11- and 12-tick burst gaps.
    const first = s.awakeAt! + 46 * 0.064;
    expect(s.volleys[0].launches.map((t) => +t.toFixed(3))).toEqual([first, first + 0.704, first + 1.472].map((t) => +t.toFixed(3)));
    // 110 cooldown ticks, a new group search, then a full 47-tick charge: 180 ticks per cycle.
    expect(s.volleys[1].launches[0] - s.volleys[0].launches[0]).toBeCloseTo(180 * 0.064, 9);
  });
  it('ignores attackers inside the seven-tile blind spot and reaches ground and air beyond it', () => {
    const battle = board();
    battle.units.push(unit('giant', center.x + 6.9, center.y), unit('balloon', center.x, center.y + 6.5));
    advance(battle, 12);
    expect(tower(battle).fired).toBe(0);
    const reach = board();
    const balloon = unit('balloon', center.x + 7.2, center.y);
    reach.units.push(balloon);
    advance(reach, 5);
    const shell = reach.late!.eagleArtillery!.shells[0];
    expect(shell).toMatchObject({ targetId: balloon.id, air: true });
  });
  it('prefers the weighted group over a nearer light attacker', () => {
    const battle = board();
    const lone = unit('swordsman', center.x + 8, center.y);
    const giants = Array.from({ length: 6 }, (_, i) => unit('giant', center.x - 14 + (i % 3) * 0.8, center.y + 10 + Math.floor(i / 3) * 0.8));
    battle.units.push(lone, ...giants);
    advance(battle, 4.5);
    const s = tower(battle);
    expect(s.group).toEqual(giants.map((g) => g.id));
    expect(battle.late!.eagleArtillery!.shells.every((shell) => giants.some((g) => g.id === shell.targetId))).toBe(true);
  });
});

describe('Eagle Artillery shells', () => {
  it('lands the hit spell on both layers, then the delayed target-layer shockwave with pushback', () => {
    const battle = board(2);
    // The heaviest group member (P.E.K.K.A, EnemyGroupWeight 2,000) is the tracked target.
    const target = unit('pekka', center.x + 12, center.y, { hp: 10000, maxHp: 10000 });
    const archer = unit('archer', center.x + 12.5, center.y, { hp: 1000, maxHp: 1000 });
    const flyer = unit('balloon', center.x + 12.3, center.y, { hp: 1000, maxHp: 1000 });
    const giant = unit('giant', center.x + 14, center.y, { hp: 1000, maxHp: 1000 });
    const far = unit('swordsman', center.x + 15.1, center.y, { hp: 1000, maxHp: 1000 });
    battle.units.push(target, archer, flyer, giant, far);
    advance(battle, 2.2);
    const s = tower(battle);
    expect(s.targetId).toBe(target.id);
    const launch = s.awakeAt! + 46 * 0.064;
    advance(battle, launch + 5 - battle.elapsed + 0.01);
    const state = battle.late!.eagleArtillery!;
    const impact = state.impacts[0];
    expect(impact.at).toBeCloseTo(Math.ceil((launch + 5) / 0.016 - 1e-9) * 0.016, 9);
    expect(impact.spellAt - impact.at).toBeCloseTo(0.016, 9);
    expect(impact.shockAt - impact.at).toBeCloseTo(0.576, 9);
    advance(battle, 0.06);
    // Level 2 hit spell: 250 within 0.75 tiles on ground and air.
    expect(target.hp).toBe(10000 - 250);
    expect(archer.hp).toBe(1000 - 250);
    expect(flyer.hp).toBe(1000 - 250);
    expect(giant.hp).toBe(1000);
    const archerBefore = { x: archer.x, y: archer.y };
    advance(battle, 0.55);
    // Shockwave: 25 within three tiles on the targeted ground layer only.
    expect(target.hp).toBe(10000 - 275);
    expect(archer.hp).toBe(1000 - 275);
    expect(giant.hp).toBe(1000 - 25);
    expect(flyer.hp).toBe(1000 - 250);
    expect(far.hp).toBe(1000);
    expect(archer.late?.eagleArtillery?.push).toBeDefined();
    expect(target.late?.eagleArtillery?.push).toBeUndefined();
    expect(giant.late?.eagleArtillery?.push).toBeUndefined();
    advance(battle, 0.5);
    expect(Math.hypot(archer.x - archerBefore.x, archer.y - archerBefore.y)).toBeGreaterThan(0.2);
    expect(archer.x).toBeGreaterThan(archerBefore.x);
    expect(archer.late?.eagleArtillery?.push).toBeUndefined();
    expect(eagleArtilleryPending(battle)).toBe(true);
  });
  it('stops tracking a target that enters the blind spot and still resolves after destruction', () => {
    const battle = board();
    const runner = unit('giant', center.x + 12, center.y);
    battle.units.push(runner);
    advance(battle, 4.3);
    const shell = battle.late!.eagleArtillery!.shells[0];
    expect(shell.targetId).toBe(runner.id);
    runner.x = center.x + 9;
    advance(battle, 0.1);
    expect(shell.x).toBeCloseTo(center.x + 9, 2);
    runner.x = center.x + 3;
    advance(battle, 0.1);
    expect(shell.targetId).toBeNull();
    expect(shell.x).toBeCloseTo(center.x + 9, 2);
    battle.buildings[0].hp = 0;
    advance(battle, 8);
    expect(battle.late!.eagleArtillery!.impacts.some((i) => i.id === shell.id && Math.abs(i.x - (center.x + 9)) < 0.01)).toBe(true);
  });
  it('fires exactly thirty shells, then empties', () => {
    const battle = board();
    battle.units.push(unit('giant', center.x + 12, center.y));
    advance(battle, 11 * 11.52);
    const s = tower(battle);
    expect(s.fired).toBe(30);
    expect(s.ammunition).toBe(0);
    expect(s.emptyAt).toBe(s.volleys.at(-1)!.launches.at(-1));
    expect(s.group).toEqual([]);
  });
});
