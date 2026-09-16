import { describe, expect, it } from 'vitest';
import { makeBuilding, type Battle, type Building, type Unit } from '../src/game/model';
import { replayBattle } from '../src/game/replay';
import { TROOP_KEYS } from '../src/game/data';
import { stepLateCampaign } from '../src/game/late-campaign';
import { NATIVE_COMBAT } from '../src/game/native-campaign';
import { SCATTERSHOT, SCATTERSHOT_LEVELS, scattershotDamage } from '../src/game/scattershot-stats';
import { scattershotPending } from '../src/game/scattershot';
import { isolatedSetup } from './fixtures/late-eagle-scattershot-battle';
import combat from '../reference/scattershot/combat.json';

const TILE = 512;
function scattershot(level = 1, x = 20, y = 20): Building {
  const hp = NATIVE_COMBAT[1000067].hp[level - 1];
  return { ...makeBuilding(600, 'scattershot', x, y, level), hp, maxHp: hp };
}
let nextUnit = 1;
function unit(kind: Unit['kind'], x: number, y: number, hp = 1e6): Unit {
  return {
    id: nextUnit++,
    kind,
    x,
    y,
    hp,
    maxHp: hp,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
}
function board(level = 1) {
  const battle = replayBattle(isolatedSetup(75, scattershot(level), { giant: 1 }), 44);
  battle.started = true;
  for (const kind of TROOP_KEYS) battle.remaining[kind] = 0;
  return battle;
}
function advance(battle: Battle, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) {
    battle.elapsed += 0.05;
    stepLateCampaign({
      battle,
      dt: 0.05,
      phase: 'defenses',
      effect: () => {},
      damageBuilding: () => {},
    });
  }
}
const tower = (battle: Battle) => battle.late!.scattershot!.towers[600];
const center = { x: 21.5, y: 21.5 };

describe('Scattershot source values', () => {
  it('keeps the pinned building, projectile, shard spell and mini-level rows', () => {
    expect(SCATTERSHOT_LEVELS.map((l) => [l.hp, l.dps, l.spellDamage, l.spellMinDamage])).toEqual([
      [3600, 125, 300, 100],
      [4200, 150, 360, 120],
      [4800, 170, 380, 130],
      [5100, 175, 400, 140],
      [5410, 180, 420, 150],
      [5600, 185, 440, 155],
      [5800, 190, 450, 160],
    ]);
    expect(NATIVE_COMBAT[1000067].hp).toEqual(SCATTERSHOT_LEVELS.map((l) => l.hp));
    expect([1, 2, 3].map(scattershotDamage)).toEqual([403.5, 484.2, 548.76]);
    expect(SCATTERSHOT).toMatchObject({
      size: 3,
      range: 10 * TILE,
      minRange: 3 * TILE,
      attackSpeedMs: 3228,
      chargeMs: 1728,
      cooldownMs: 1500,
      newTargetChargeMs: 1028,
      ammunition: 90,
      damageRadius: TILE,
      stepUnits: 98,
      coneRadius: 5 * TILE,
      coneMinRadius: TILE,
      coneAngle: 90,
    });
    expect(combat.projectile).toMatchObject({
      Speed: '1200',
      SmoothDamage: 'TRUE',
      HitSpellInheritAffectType: 'TRUE',
    });
    expect(combat.miniLevels.map((row) => row.Level)).toEqual(['1', '2']);
    expect(combat.levels.every((l) => l.animationActionFrame === 5)).toBe(true);
  });
});

describe('Scattershot targeting and timing', () => {
  it('keeps the three-tile blind spot and retained half-tile range allowance', () => {
    const battle = board();
    battle.units.push(
      unit('giant', center.x + 2.9, center.y),
      unit('balloon', center.x, center.y + 10.6),
    );
    advance(battle, 5);
    expect(tower(battle).fired).toBe(0);
    const edge = board();
    const air = unit('balloon', center.x + 10.45, center.y);
    edge.units.push(air);
    advance(edge, 1);
    expect(tower(edge).targetId).toBe(air.id);
    expect(edge.late!.scattershot!.projectiles[0]).toMatchObject({ targetId: air.id, air: true });
  });
  it('acquires the nearest attacker, releases after 640 ms and repeats every 3.2 s', () => {
    const battle = board();
    const near = unit('swordsman', center.x + 5, center.y);
    const farther = unit('giant', center.x - 7, center.y);
    battle.units.push(farther, near);
    advance(battle, 7.5);
    const s = tower(battle);
    expect(s.targetId).toBe(near.id);
    // Target found on the first tick; NewTargetAttackDelay presets 1,028 of 1,728 ms.
    expect(s.shots.map((shot) => +shot.at.toFixed(3))).toEqual([0.64, 3.84, 7.04]);
    near.hp = 0;
    advance(battle, 0.2);
    expect(tower(battle).targetId).toBe(farther.id);
  });
  it('fires ninety throws, then empties', () => {
    const battle = board();
    battle.units.push(unit('giant', center.x + 5, center.y));
    advance(battle, 91 * 3.2);
    expect(tower(battle)).toMatchObject({ fired: 90, ammunition: 0 });
    expect(tower(battle).emptyAt).toBe(tower(battle).shots.at(-1)!.at);
  });
});

describe('Scattershot impact', () => {
  it('splashes the target layer within one tile and shards behind it inside a 90-degree cone', () => {
    const battle = board(2);
    // The nearest attacker outside the blind spot is the target; every other unit is farther away.
    const target = unit('giant', center.x + 6, center.y, 10000);
    const beside = unit('swordsman', center.x + 6, center.y + 0.8, 1000);
    const airAbove = unit('balloon', center.x + 6, center.y + 0.2, 1000);
    const behind = unit('swordsman', center.x + 9, center.y, 1000);
    const behindAngled = unit('archer', center.x + 9, center.y + 2.7, 1000);
    const outsideCone = unit('archer', center.x + 7, center.y + 3.5, 1000);
    const frontSide = unit('wizard', center.x + 5.2, center.y + 3.3, 1000);
    const front = unit('wizard', center.x + 2.5, center.y, 1000);
    const beyond = unit('swordsman', center.x + 11.3, center.y, 1000);
    battle.units.push(
      target,
      beside,
      airAbove,
      behind,
      behindAngled,
      outsideCone,
      frontSide,
      front,
      beyond,
    );
    advance(battle, 1.3);
    expect(tower(battle).targetId).toBe(target.id);
    const impact = battle.late!.scattershot!.impacts[0];
    expect(impact).toMatchObject({ air: false, primaryHits: 2, shardHits: 2 });
    expect(impact.dirX).toBeGreaterThan(0.99);
    // Level 2: 484.2 per hit to the ground layer within one tile of the tracked target.
    expect(target.hp).toBeCloseTo(10000 - 484.2, 6);
    expect(beside.hp).toBeCloseTo(1000 - 484.2, 6);
    expect(airAbove.hp).toBe(1000);
    // Shards start at the projectile's last position; 360 at one tile falls to 120 at five.
    const apex = impact.x;
    const falloff = (d: number) => 360 + (120 - 360) * ((d - 1) / 4);
    expect(behind.hp).toBeCloseTo(1000 - falloff(center.x + 9 - apex), 0);
    const angled = Math.hypot(center.x + 9 - apex, 2.7);
    expect(Math.atan2(2.7, center.x + 9 - apex)).toBeLessThan(Math.PI / 4);
    expect(behindAngled.hp).toBeCloseTo(1000 - falloff(angled), 0);
    expect(outsideCone.hp).toBe(1000);
    expect(frontSide.hp).toBe(1000);
    expect(front.hp).toBe(1000);
    expect(beyond.hp).toBe(1000);
    expect(scattershotPending(battle)).toBe(false);
  });
});
