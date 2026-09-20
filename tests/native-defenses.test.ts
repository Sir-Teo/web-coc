import { describe, expect, it } from 'vitest';
import {
  SPELL_KEYS,
  TROOP_KEYS,
  maxTroopLevel,
  type BuildingKind,
  type SpellKind,
  type TroopKind,
} from '../src/game/data';
import { GameModel, makeBuilding, type Building } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { nativeRow, num, tiles } from '../src/game/native-data';
import { maxSpellLevel } from '../src/game/spell-progression';
import {
  BURST_STEP,
  monolithProjectile,
  nativeWeapon,
  revengeTier,
  spellTowerModes,
} from '../src/game/native-defense-stats';
import { validateReplay } from '../src/game/replay';
import { validateSave } from '../src/game/save';

type Placement = [BuildingKind, number, number, number?, Partial<Building>?];
function arena(
  layout: Placement[],
  army: Partial<Record<TroopKind, number>>,
  options: {
    townhall?: number;
    spells?: Partial<Record<SpellKind, number>>;
    troopLevel?: number;
  } = {},
) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 44, 44, options.townhall ?? 11),
    ...layout.map(([kind, x, y, level, extra], i) => ({
      ...makeBuilding(10 + i, kind, x, y, level ?? 1),
      ...extra,
    })),
  ];
  m.state.nextId = 5000;
  m.state.army = { ...emptyArmy(), ...army };
  m.state.spells = { ...emptySpells(), ...options.spells };
  m.state.troopLevels = Object.fromEntries(
    TROOP_KEYS.map((k) => [k, Math.min(options.troopLevel ?? 1, maxTroopLevel(k))]),
  ) as Record<TroopKind, number>;
  m.state.spellLevels = Object.fromEntries(SPELL_KEYS.map((k) => [k, maxSpellLevel(k)])) as Record<
    SpellKind,
    number
  >;
  m.startBattle(0, true);
  return m;
}
const run = (m: GameModel, seconds: number, step = 0.05) => {
  for (let t = 0; t < seconds - 1e-9 && !m.battle!.finished; t += step) m.step(step);
};
const deploy = (m: GameModel, kind: TroopKind, x: number, y: number, count = 1) => {
  m.activeTroop = kind;
  for (let i = 0; i < count; i++) expect(m.deploy(x, y), `${kind} deploy`).toBe(true);
  return m.battle!.units.filter((u) => u.kind === kind).slice(-count);
};
const lost = (u: { hp: number; maxHp: number }) => u.maxHp - u.hp;

describe('Town Hall 11-18 defense weapons from the client tables', () => {
  it('matches the official per-hit values and timings', () => {
    // Eagle Artillery: 3 shells 0.75 s apart, 10 s cooldown, 7-50 tiles, wakes at 200 housing.
    const eagle = nativeWeapon('eagleartillery', 7)!;
    expect([eagle.burst, eagle.burstDelay, eagle.minRange, eagle.range, eagle.wakeSpace]).toEqual([
      3, 0.75, 7, 50, 200,
    ]);
    expect(num(nativeRow('spells', 'Eagle Artillery Hit Spell', 7), 'Damage')).toBe(525);
    expect(eagle.damage).toBe(50); // shockwave
    // Firespitter: 20-ball bursts, 2.24 s cycle, 46.03 per ball at level 1 (wiki).
    const spitter = nativeWeapon('firespitter', 1)!;
    expect(spitter.interval).toBeCloseTo(1.024 + 19 * BURST_STEP, 9);
    expect(spitter.damage).toBeCloseTo(46.03, 2);
    expect(spitter.cone).toBe(150);
    expect(spitter.pierce).toMatchObject({ hits: 2, radius: 0.5, extra: 1 });
    // Multi-Gear Tower: Long Range 350 per hit; Fast Attack 4 balls, 156 per ball at level 1.
    expect(nativeWeapon('multigeartower', 1, { mode: 'long' })).toMatchObject({
      damage: 350,
      range: 12,
    });
    const fast = nativeWeapon('multigeartower', 1, { mode: 'fast' })!;
    expect([fast.burst, fast.range]).toEqual([4, 8]);
    expect(fast.damage).toBeCloseTo(156, 6);
    // Ricochet Cannon: 288 per shot, one ricochet within 3.5 tiles for 70%.
    const ricochet = nativeWeapon('ricochetcannon', 1)!;
    expect(ricochet.damage).toBeCloseTo(288, 6);
    expect(ricochet.bounces).toBe(1);
    expect(tiles(nativeRow('projectiles', ricochet.projectile), 'MaxBounceDistance')).toBe(3.5);
    // Multi-Archer Tower: three arrows of 60 every 0.6 s.
    expect(nativeWeapon('multiarchertower', 1)).toMatchObject({
      damage: 60,
      interval: 0.6,
      targets: 3,
    });
    // Super Wizard Tower: 416 primary at level 2, 15 chained units within 4 tiles at 40%.
    const swt = nativeWeapon('superwizardtower', 2)!;
    expect(swt.damage).toBeCloseTo(416, 6);
    expect(swt.chain).toMatchObject({ targets: 15, distance: 4 });
    expect(swt.chain!.factor).toBeCloseTo(0.4, 9);
    // Monolith: 225 base + 11% of the target's maximum hitpoints at level 1.
    expect(nativeWeapon('monolith', 1)).toMatchObject({ damage: 225, hpPermil: 110 });
    expect(monolithProjectile(1, 500)).toBe('MonolithProjectileMin');
    expect(monolithProjectile(1, 5000)).toBe('MonolithProjectileMax');
    // Scattershot: 3-10 tiles, 2.2 s before firing at a replacement target.
    expect(nativeWeapon('scattershot', 7)).toMatchObject({ minRange: 3, range: 10, retarget: 2.2 });
    // Revenge Tower stages by destroyed buildings (5 / 25 / 50).
    expect(revengeTier(2, 4).disabled).toBe(true);
    expect(revengeTier(2, 5)).toMatchObject({ damage: 500, interval: 1.2, bounces: 0 });
    expect(revengeTier(2, 25)).toMatchObject({ damage: 250, interval: 0.6, bounces: 1 });
    expect(revengeTier(2, 50)).toMatchObject({ damage: 250, interval: 0.35, bounces: 2 });
    // Spell Tower modes unlock one per level.
    expect(spellTowerModes(1)).toEqual(['rage']);
    expect(spellTowerModes(4)).toEqual(['rage', 'poison', 'invisibility', 'earthquake']);
    expect(nativeWeapon('spelltower', 1, { mode: 'rage' })!.windup).toBeCloseTo(1.2, 9);
    // Town Hall weapons: TH12 zaps 70 x 4 targets; TH13-16 beams; TH17 fireballs; TH11/18 none.
    expect(nativeWeapon('townhall', 11)).toBeNull();
    expect(nativeWeapon('townhall', 18)).toBeNull();
    expect(nativeWeapon('townhall', 12)).toMatchObject({ damage: 70, targets: 4, range: 10 });
    expect(nativeWeapon('townhall', 12)!.death).toMatchObject({
      damage: 500,
      radius: 4,
      delay: 1.6,
    });
    expect(nativeWeapon('townhall', 13)!.death!.spell).toBe('TH13 Frost');
    const th17 = nativeWeapon('townhall', 17, { weaponLevel: 5 })!;
    expect(th17.damage).toBeCloseTo(210, 6);
    expect(th17).toMatchObject({ targets: 4, sharedTargets: true, range: 12 });
    // Builder's Hut turret from level 2.
    expect(nativeWeapon('builder', 1)).toBeNull();
    expect(nativeWeapon('builder', 2)!.damage).toBeCloseTo(32, 9);
  });
});

describe('native defense combat', () => {
  it('keeps the Eagle Artillery dormant until 200 housing is deployed, then fires 3-shell volleys', () => {
    const m = arena([['eagleartillery', 20, 20, 7]], { giant: 45 });
    // 39 Giants = 195 housing: still dormant.
    deploy(m, 'giant', 2, 2, 39);
    run(m, 6);
    expect(m.battle!.nativeDefenses?.[10]?.awakeAt).toBeUndefined();
    expect(m.battle!.projectiles?.some((p) => p.sourceId === 10) ?? false).toBe(false);
    deploy(m, 'giant', 2, 3, 1);
    const wake = m.battle!.nativeDefenses?.[10]?.awakeAt;
    run(m, 0.1);
    expect(m.battle!.nativeDefenses![10].awakeAt).toBeGreaterThan(m.battle!.elapsed - 0.2);
    void wake;
    run(m, 6);
    const shells = (m.battle!.projectiles ?? []).filter((p) => p.sourceId === 10);
    expect(shells).toHaveLength(3);
    expect(shells.map((p) => +(p.launched - shells[0].launched).toFixed(3))).toEqual([
      0, 0.75, 1.5,
    ]);
    expect(shells[0].impact - shells[0].launched).toBeCloseTo(5.58, 6);
  });

  it('lands Eagle shells for the hit-spell damage plus a shockwave that pushes small troops', () => {
    const m = arena(
      [['eagleartillery', 30, 30, 7]],
      { golem: 20, swordsman: 1 },
      { troopLevel: 10 },
    );
    const golems = deploy(m, 'golem', 6, 6, 20);
    const barbarian = deploy(m, 'swordsman', 6, 7.5)[0];
    // Hold every attacker in place so the volley lands on known positions.
    for (const u of m.battle!.units) u.springUntil = 1e9;
    run(m, 12);
    const shellDamage = num(nativeRow('spells', 'Eagle Artillery Hit Spell', 7), 'Damage');
    const shock = nativeWeapon('eagleartillery', 7)!.damage;
    const target = m.battle!.units.find((u) => u.id === m.battle!.nativeDefenses![10].target)!;
    expect(golems).toContain(target);
    expect(lost(target)).toBeCloseTo(3 * shellDamage, 6);
    // The barbarian stands between 0.75 and 3 tiles from the landing point: shockwave only.
    expect(lost(barbarian) % shock).toBeCloseTo(0, 6);
    expect(lost(barbarian)).toBeGreaterThanOrEqual(shock - 1e-6);
    expect(lost(barbarian)).toBeLessThan(shellDamage);
  });

  it('adds the Monolith bonus from the target maximum hitpoints', () => {
    const m = arena([['monolith', 20, 20, 1]], { giant: 1 });
    const giant = deploy(m, 'giant', 21.5, 13)[0];
    run(m, 1.6);
    const hits = (m.battle!.projectiles ?? []).filter((p) => p.sourceId === 10);
    run(m, 1);
    expect(hits.length + lost(giant)).toBeGreaterThan(0);
    const expected = 225 + giant.maxHp * 0.11;
    expect(lost(giant) % expected).toBeLessThan(1e-6);
    expect(lost(giant)).toBeGreaterThanOrEqual(expected - 1e-6);
  });

  it('ricochets a Ricochet Cannon shot to a second ground unit for 70%', () => {
    const m = arena([['ricochetcannon', 20, 20, 1]], { giant: 2 });
    const [a] = deploy(m, 'giant', 21.5, 14);
    const [b] = deploy(m, 'giant', 21.5, 12);
    run(m, 1.2);
    const primary = 288;
    const hitA = lost(a),
      hitB = lost(b);
    expect([hitA, hitB].sort((x, y) => x - y)).toEqual(
      [primary * 0.7, primary].map((v) => expect.closeTo(v, 6)),
    );
  });

  it('splits Multi-Archer Tower arrows across up to three units and doubles up on fewer', () => {
    const one = arena([['multiarchertower', 20, 20, 1]], { giant: 1 });
    const giant = deploy(one, 'giant', 21.5, 13)[0];
    run(one, 1.5);
    expect(lost(giant) % 180).toBeLessThan(1e-6);
    expect(lost(giant)).toBeGreaterThanOrEqual(180 - 1e-6);
    const three = arena([['multiarchertower', 20, 20, 1]], { giant: 3 });
    const giants = [
      deploy(three, 'giant', 21.5, 13)[0],
      deploy(three, 'giant', 13, 21.5)[0],
      deploy(three, 'giant', 30, 21.5)[0],
    ];
    run(three, 1.5);
    for (const g of giants) expect(lost(g)).toBeGreaterThan(0);
  });

  it('chains the Super Wizard Tower bolt to nearby units for 40%', () => {
    const m = arena([['superwizardtower', 20, 20, 2]], { swordsman: 3 });
    const units = deploy(m, 'swordsman', 21.5, 15, 3);
    run(m, 1.2);
    const damages = units.map(lost).sort((x, y) => y - x);
    expect(damages[0]).toBeCloseTo(416, 6);
    expect(damages[1]).toBeCloseTo(416 * 0.4, 6);
  });

  it('keeps the Revenge Tower silent until five buildings are destroyed', () => {
    const m = arena(
      [
        ['revengetower', 20, 20, 1],
        ...([0, 1, 2, 3, 4].map((i) => ['goldmine', 2 + i * 4, 40, 1]) as Placement[]),
      ],
      { golem: 1 },
      { troopLevel: 10 },
    );
    const golem = deploy(m, 'golem', 21.5, 14)[0];
    golem.springUntil = 1e9;
    run(m, 4);
    expect(lost(golem)).toBe(0);
    for (const b of m.battle!.buildings.filter((v) => v.kind === 'goldmine')) b.hp = 0;
    run(m, 1.6);
    expect(lost(golem) % revengeTier(1, 5).damage).toBeCloseTo(0, 6);
    expect(lost(golem)).toBeGreaterThanOrEqual(revengeTier(1, 5).damage - 1e-6);
  });

  it('stops Firespitter targeting outside its facing arc and pierces two units per ball', () => {
    const behind = arena([['firespitter', 20, 20, 1, { direction: 0 }]], { giant: 1 });
    const back = deploy(behind, 'giant', 12, 21.5)[0];
    run(behind, 3);
    expect(lost(back)).toBe(0);
    const front = arena([['firespitter', 20, 20, 1, { direction: 0 }]], { giant: 2 });
    const [near, far] = [deploy(front, 'giant', 26, 21.5)[0], deploy(front, 'giant', 27, 21.5)[0]];
    run(front, 2.5);
    expect(lost(near)).toBeGreaterThan(0);
    expect(lost(far)).toBeGreaterThan(0);
  });

  it('wakes a Town Hall 12 Giga Tesla on damage, zaps up to four units and explodes on death', () => {
    const m = arena([['goldmine', 2, 2, 1]], { swordsman: 6 }, { townhall: 12, troopLevel: 12 });
    const th = m.battle!.buildings.find((b) => b.kind === 'townhall')!;
    const units = deploy(m, 'swordsman', 41, 46, 6);
    expect(m.battle!.nativeDefenses?.[th.id]?.awakeAt).toBeUndefined();
    // Version 54 caps crowd separation, so the stacked drop reaches the hall a step later.
    run(m, 1.25);
    const awake = m.battle!.nativeDefenses?.[th.id]?.awakeAt;
    expect(awake).toBeDefined();
    run(m, 1.6);
    const hurt = units.filter((u) => u.hp < u.maxHp);
    expect(hurt).toHaveLength(4);
    for (const u of hurt) expect(lost(u) % 70).toBeCloseTo(0, 6);
    for (const u of units) u.springUntil = 1e9;
    th.hp = 0;
    run(m, 0.05);
    const destroyedAt = m.battle!.elapsed;
    const before = units.map((u) => u.hp);
    expect(m.battle!.nativeDefenses![th.id].deathAt).toBeCloseTo(destroyedAt + 1.6, 6);
    run(m, 1.5);
    expect(units.map((u) => u.hp)).toEqual(before);
    run(m, 0.2);
    for (const [i, u] of units.entries()) expect(before[i] - u.hp).toBeCloseTo(500, 6);
  });

  it('arms the Town Hall 17 Inferno Artillery one second into the battle', () => {
    const m = arena([], { golem: 1 }, { townhall: 17, troopLevel: 10 });
    const th = m.battle!.buildings.find((b) => b.kind === 'townhall')!;
    const golem = deploy(m, 'golem', 45.5, 37)[0];
    run(m, 1.2);
    expect(m.battle!.projectiles?.some((p) => p.sourceId === th.id) ?? false).toBe(false);
    run(m, 0.5);
    const fireballs = (m.battle!.projectiles ?? []).filter((p) => p.sourceId === th.id);
    expect(fireballs).toHaveLength(4);
    run(m, 1.5);
    // Four impacts of 140 each plus fire pools that never stack on one unit.
    expect(lost(golem)).toBeGreaterThanOrEqual(4 * 140 - 1e-6);
    const pools = (m.battle!.nativeSpells ?? []).filter((c) => c.name === 'TH17WeaponAreaDamage');
    expect(pools.length).toBeGreaterThan(0);
    const beforePool = lost(golem);
    run(m, 1);
    const poolDps = num(nativeRow('spells', 'TH17WeaponAreaDamage', 1), 'PoisonDPS');
    expect(lost(golem) - beforePool).toBeLessThanOrEqual(poolDps * 1.05 + 1e-6);
  });

  it('boosts defenses inside a Spell Tower Rage and releases a loaded spell when destroyed', () => {
    const m = arena(
      [
        ['spelltower', 20, 20, 1],
        ['monolith', 17, 17, 1],
      ],
      { giant: 1 },
    );
    deploy(m, 'giant', 21, 14);
    run(m, 3);
    expect(m.battle!.buildingEffects?.[11]?.boost?.damage).toBeCloseTo(0.6, 9);
  });

  // The Builder's Hut turret belongs to the released late family in every battle that has one,
  // so tests/builder-hut.test.ts covers its pop-up delay and its fire.

  it('scatters Scattershot fragments only into the cone behind the struck unit', () => {
    const m = arena([['scattershot', 20, 20, 7]], { golem: 1, swordsman: 2 }, { troopLevel: 10 });
    const golem = deploy(m, 'golem', 21.5, 14)[0];
    // One barbarian directly behind the golem (away from the tower), one in front of it inside the
    // blind spot, so the golem is the only unit the Scattershot can choose.
    const behind = deploy(m, 'swordsman', 21.5, 12)[0];
    const front = deploy(m, 'swordsman', 2, 2)[0];
    Object.assign(front, { x: 21.5, y: 19 });
    for (const u of m.battle!.units) u.springUntil = 1e9;
    const weapon = nativeWeapon('scattershot', 7)!;
    run(m, weapon.retarget + 1.2);
    expect(lost(golem)).toBeCloseTo(weapon.damage, 6);
    const spell = nativeRow('spells', 'Scattershot Hit Spell', 7);
    const d = 2;
    const fragment =
      num(spell, 'Damage') + ((num(spell, 'MinDamage') - num(spell, 'Damage')) * (d - 1)) / 4;
    expect(lost(behind)).toBeCloseTo(fragment, 6);
    expect(lost(front)).toBe(0);
  });

  it('fires Multi-Gear Fast Attack bursts of four balls 0.192 s apart', () => {
    const m = arena(
      [['multigeartower', 20, 20, 1, { gearMode: 'fast' }]],
      { golem: 1 },
      { troopLevel: 10 },
    );
    const golem = deploy(m, 'golem', 21.5, 16)[0];
    golem.springUntil = 1e9;
    run(m, 0.05);
    run(m, 0.6);
    const shots = (m.battle!.projectiles ?? []).filter((p) => p.sourceId === 10);
    const launched = [...new Set([...shots.map((p) => p.launched)])];
    expect(launched.length + lost(golem) / 156).toBeGreaterThanOrEqual(4 - 1e-6);
  });

  it('casts Spell Tower Poison on the unit that stays in range and releases a loaded spell on death', () => {
    const m = arena(
      [
        ['spelltower', 20, 20, 2, { spellMode: 'poison' }],
        ['goldmine', 2, 40, 1],
      ],
      { golem: 1 },
      { troopLevel: 10 },
    );
    const golem = deploy(m, 'golem', 21, 14)[0];
    golem.springUntil = 1e9;
    run(m, 1.1);
    expect(m.battle!.nativeSpells?.some((c) => c.name === 'Spell Tower Poison') ?? false).toBe(
      false,
    );
    run(m, 1.5);
    const poison = m.battle!.nativeSpells!.find((c) => c.name === 'Spell Tower Poison')!;
    expect(poison.x).toBeCloseTo(golem.x, 6);
    run(m, 3);
    expect(golem.native?.effects?.poison?.speed).toBeCloseTo(-0.35, 9);
    // A reloading tower has nothing to release; a second tower still loaded casts on death.
    const second = arena(
      [
        ['spelltower', 20, 20, 1],
        ['goldmine', 2, 40, 1],
      ],
      { swordsman: 1 },
    );
    deploy(second, 'swordsman', 2, 2);
    second.battle!.buildings.find((b) => b.id === 10)!.hp = 0;
    run(second, 0.1);
    expect(second.battle!.nativeSpells?.some((c) => c.name === 'Spell Tower Rage')).toBe(true);
  });

  it('weakens repeated Spell Tower earthquakes on the same unit', () => {
    const m = arena(
      [
        ['spelltower', 20, 20, 4, { spellMode: 'earthquake' }],
        ['goldmine', 2, 40, 1],
      ],
      { golem: 1 },
      { troopLevel: 10 },
    );
    const golem = deploy(m, 'golem', 21, 14)[0];
    golem.springUntil = 1e9;
    run(m, 5);
    const quake = nativeRow('spells', 'Spell Tower Earthquake', 1);
    const once =
      (golem.maxHp * num(quake, 'TroopDamagePermil') * num(quake, 'NumberOfHits')) / 1000;
    expect(lost(golem)).toBeCloseTo(once, 6);
  });

  it('turns buildings near a Spell Tower invisible after an attacker hits one of them', () => {
    const m = arena(
      [
        ['spelltower', 20, 20, 3, { spellMode: 'invisibility' }],
        ['goldmine', 22, 20, 1],
      ],
      { swordsman: 1 },
    );
    deploy(m, 'swordsman', 26.5, 21);
    run(m, 8);
    expect(m.battle!.buildingEffects?.[11]?.invisibleUntil).toBeGreaterThan(0);
  });

  it('slows attackers with the Town Hall 13 frost after the death bomb', () => {
    const m = arena([['goldmine', 2, 2, 1]], { golem: 1 }, { townhall: 13, troopLevel: 10 });
    const golem = deploy(m, 'golem', 42, 46)[0];
    golem.springUntil = 1e9;
    m.battle!.buildings.find((b) => b.kind === 'townhall')!.hp = 0;
    run(m, 3);
    expect(golem.native?.effects?.chill?.percent).toBeCloseTo(0.5, 9);
  });

  it('uses client trap values at Town Hall 9-18 levels in version 45 battles', () => {
    const m = arena([['bomb', 20, 20, 14]], { golem: 1 }, { troopLevel: 10 });
    const golem = deploy(m, 'golem', 21, 16)[0];
    run(m, 5);
    expect(lost(golem)).toBeCloseTo(200, 6);
    const skeletons = arena(
      [
        ['skeletontrap', 20, 20, 5],
        ['goldmine', 2, 40, 1],
      ],
      { swordsman: 1 },
    );
    deploy(skeletons, 'swordsman', 20.5, 17);
    run(skeletons, 3);
    expect(skeletons.battle!.defenders?.filter((d) => d.kind === 'skeleton')).toHaveLength(5);
  });

  it('drags troops toward a Tornado Trap and detonates a Giga Bomb only at 18 housing', () => {
    const tornado = arena(
      [
        ['tornadotrap', 20, 20, 3],
        ['goldmine', 2, 40, 1],
      ],
      { swordsman: 1 },
    );
    const barbarian = deploy(tornado, 'swordsman', 23, 20.5)[0];
    barbarian.springUntil = 1e9;
    run(tornado, 1.5);
    expect(Math.hypot(barbarian.x - 20.5, barbarian.y - 20.5)).toBeLessThan(1.5);
    const bomb = arena(
      [
        ['gigabomb', 20, 20, 4],
        ['goldmine', 2, 40, 1],
      ],
      { giant: 4 },
      { troopLevel: 10 },
    );
    const giants = deploy(bomb, 'giant', 23.5, 21, 3);
    for (const g of giants) g.springUntil = 1e9;
    run(bomb, 3);
    expect(giants.every((g) => g.hp === g.maxHp)).toBe(true);
    const fourth = deploy(bomb, 'giant', 23.5, 21.2)[0];
    fourth.springUntil = 1e9;
    run(bomb, 3);
    expect(lost(fourth)).toBeCloseTo(1400, 6);
  });

  it('replays a version 45 attack against the new defenses deterministically', () => {
    const layout: Placement[] = [
      ['eagleartillery', 8, 30, 7],
      ['scattershot', 20, 20, 7],
      ['firespitter', 28, 12, 3, { direction: 4 }],
      ['superwizardtower', 34, 26, 2],
      ['spelltower', 16, 12, 4, { spellMode: 'poison' }],
      ['tornadotrap', 25, 25, 3],
    ];
    const m = arena(
      layout,
      { giant: 30, wizard: 20, swordsman: 20 },
      { townhall: 17, troopLevel: 8 },
    );
    deploy(m, 'giant', 2, 2, 30);
    deploy(m, 'wizard', 45, 3, 20);
    deploy(m, 'swordsman', 3, 45, 20);
    run(m, 40);
    m.finishBattle();
    const record = m.state.raidLog![0].replay!;
    expect(validateReplay(record)).toBe(true);
    const replay = new GameModel();
    replay.openReplay(structuredClone(record));
    for (let i = 0; i < 4000 && !replay.replay?.complete; i++) replay.step(0.05);
    expect(replay.battle?.destruction).toBe(m.state.raidLog![0].result.destruction);
  });

  it('validates owner choices in saves and version 45 replays', () => {
    const m = new GameModel();
    const tower = m.state.buildings[0];
    expect(validateSave(m.state)).toBe(true);
    (tower as Building).spellMode = 'rage';
    expect(validateSave(m.state)).toBe(false);
    delete (tower as Building).spellMode;
    void validateReplay;
  });
});
