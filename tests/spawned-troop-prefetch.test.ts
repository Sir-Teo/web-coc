import { expect, it } from 'vitest';
import { spawnedTroopArtLevels } from '../src/game/spawned-troop-prefetch';
import { heroSummonLevels } from '../src/game/hero-summon-prefetch';
import { hurtUnit } from '../src/game/native-status';
import { attackingWitchBattle } from './fixtures/attacking-witch';
import { attackingGolemBattle } from './fixtures/attacking-golem';
import { attackingHoundBattle } from './fixtures/attacking-hound';
import { deploymentLifecycleBattle } from './fixtures/deployment-lifecycle';
import { heroPuppetBattle } from './fixtures/hero-puppet';

for (const superTroop of [false, true])
  for (const level of [1, 8])
    it(`${superTroop ? 'Super Witch' : 'Witch'} ${level} preloads its actual summon tier`, () => {
      const r = attackingWitchBattle(level, undefined, 11.4, superTroop),
        kind = superTroop ? 'bigboy' : 'skeleton',
        expected = !superTroop && level === 8 ? 2 : 1,
        demand = spawnedTroopArtLevels(new Map([[r.unit.kind, [level]]]));
      while (!r.battle.units.some((u) => u.kind === kind)) r.step();
      const children = r.battle.units.filter((u) => u.kind === kind);
      expect(demand.get(kind)).toEqual([expected]);
      expect(new Set(children.map((u) => u.level))).toEqual(new Set([expected]));
    });

for (const level of [1, 15])
  it(`Golem ${level} preloads the Golemite tier released by a real Monolith defeat`, () => {
    const r = attackingGolemBattle(level, undefined, 17.6, false, 'monolith'),
      demand = spawnedTroopArtLevels(new Map([['golem', [level]]]));
    while (r.unit.hp > 0) r.step();
    const children = r.battle.units.filter((u) => u.kind === 'golemite');
    expect(children.length).toBeGreaterThan(0);
    expect(demand.get('golemite')).toEqual([level]);
    expect(new Set(children.map((u) => u.level))).toEqual(new Set([level]));
  });

for (const ice of [false, true])
  for (const level of [1, 8])
    it(`${ice ? 'Ice' : 'Lava'} Hound ${level} uses the clamped source Pup tier`, () => {
      const r = attackingHoundBattle(level, undefined, 17.6, ice, 'monolith'),
        kind = ice ? 'icehoundpup' : 'lavapup',
        demand = spawnedTroopArtLevels(new Map([[r.unit.kind, [level]]]));
      while (r.unit.hp > 0) r.step();
      const children = r.battle.units.filter((u) => u.kind === kind);
      expect(children.length).toBeGreaterThan(0);
      expect(demand.get(kind)).toEqual([1]);
      expect(new Set(children.map((u) => u.level))).toEqual(new Set([1]));
    });

for (const level of [1, 6])
  it(`Druid ${level} warms its actual Bear body before the timed transformation`, () => {
    const r = deploymentLifecycleBattle('druid', level, undefined, 0),
      demand = spawnedTroopArtLevels(new Map([['druid', [level]]]));
    r.until(r.deployed + 30.05);
    expect(r.unit.kind).toBe('bear');
    expect(r.unit.level).toBe(level);
    expect(demand.get('bear')).toEqual([level]);
  });

for (const [item, level] of [
  [1, 1],
  [27, 11],
])
  it(`Lavaloon Puppet ${item} preloads both generations at their actual fixed tiers`, () => {
    const r = heroPuppetBattle({
        kind: 'warden',
        level: 1,
        items: [{ slug: 'lavaloon-puppet', level: item }],
      }),
      seeds = heroSummonLevels(r.battle.nativeHeroes!),
      before = JSON.stringify(r.battle),
      demand = spawnedTroopArtLevels(seeds);
    expect(JSON.stringify(r.battle)).toBe(before);
    expect(demand.get('gwlavaloon')).toEqual([level]);
    expect(demand.get('gwlavaloonpup')).toEqual([level]);
    expect(r.model.deployNativeHero('warden', 11.4, 11.5)).toBe(true);
    expect(r.model.activateNativeHeroAbility('warden')).toBe(true);
    const parent = r.battle.units.find((u) => u.kind === 'gwlavaloon')!;
    hurtUnit(r.battle, parent, parent.maxHp);
    r.model.step(0.05);
    const pups = r.battle.units.filter((u) => u.kind === 'gwlavaloonpup');
    expect(pups.length).toBeGreaterThan(0);
    expect(new Set(pups.map((u) => u.level))).toEqual(new Set([level]));
  });

it('retains both Skeleton tiers from mixed parent levels without changing the input map', () => {
  const seeds = new Map([
      ['witch', [8, 1, 8]],
      ['superwitch', [8]],
    ]),
    before = JSON.stringify([...seeds]);
  const demand = spawnedTroopArtLevels(seeds);
  expect(demand.get('witch')).toEqual([1, 8]);
  expect(demand.get('skeleton')).toEqual([1, 2]);
  expect(demand.get('bigboy')).toEqual([1]);
  expect(JSON.stringify([...seeds])).toBe(before);
});

it.each([278, 279])('uses the Lavaloon bomb Pup rule for recording %i', (version) => {
  const r = heroPuppetBattle(
    {
      kind: 'warden',
      level: 1,
      items: [{ slug: 'lavaloon-puppet', level: 3 }],
    },
    {},
    undefined,
    version,
  );
  expect(r.model.deployNativeHero('warden', 11.4, 11.5)).toBe(true);
  expect(r.model.activateNativeHeroAbility('warden')).toBe(true);
  const parent = r.battle.units.find((u) => u.kind === 'gwlavaloon')!;
  for (let bomb = 1; bomb <= 2; bomb++) {
    for (let i = 0; i < 100 && (parent.native?.attacks ?? 0) < bomb; i++) r.model.step(0.05);
    expect(parent.native?.attacks).toBe(bomb);
    r.model.step(0.05);
    const pups = r.battle.units.filter((u) => u.kind === 'gwlavaloonpup');
    expect(parent.hp).toBeGreaterThan(0);
    expect(pups.map((u) => u.level)).toEqual(version === 278 ? [] : Array(bomb).fill(2));
  }
});

it.each([1, 27])('Action Figure %i summons its pinned Giant Giant tier', (level) => {
  const r = heroPuppetBattle({
    kind: 'queen',
    level: 20,
    items: [{ slug: 'action-figure', level }],
  });
  expect(r.model.deployNativeHero('queen', 11.4, 11.5)).toBe(true);
  expect(r.model.activateNativeHeroAbility('queen')).toBe(true);
  const giants = r.battle.units.filter((u) => u.kind === 'giantgiant');
  expect(giants.map((u) => [u.level, u.maxHp])).toEqual(level === 1 ? [[1, 800]] : [[10, 18500]]);
});

it('keeps the version 279 Action Figure activation without its new summon', () => {
  const r = heroPuppetBattle(
    { kind: 'queen', level: 20, items: [{ slug: 'action-figure', level: 1 }] },
    {},
    undefined,
    279,
  );
  expect(r.model.deployNativeHero('queen', 11.4, 11.5)).toBe(true);
  expect(r.model.activateNativeHeroAbility('queen')).toBe(true);
  r.model.step(0.05);
  expect(r.battle.units.some((u) => u.kind === 'giantgiant')).toBe(false);
});

it.each([281, 282])('uses the Healer Puppet rear formation in version %i', (version) => {
  const r = heroPuppetBattle(
    { kind: 'queen', level: 20, items: [{ slug: 'healer-puppet', level: 18 }] },
    {},
    undefined,
    version,
  );
  expect(r.model.deployNativeHero('queen', 11.4, 11.5)).toBe(true);
  r.model.step(0.05);
  const queen = r.battle.units.find(({ kind }) => kind === 'archerqueen')!;
  const target = r.battle.buildings.find(({ id }) => id === queen.target)!;
  const targetX = target.x + 1.5;
  const targetY = target.y + 1.5;
  expect(r.model.activateNativeHeroAbility('queen')).toBe(true);
  const healers = r.battle.units.filter(({ kind }) => kind === 'healer');
  expect(healers.map(({ level }) => level)).toEqual([8, 8, 8]);
  if (version === 281) {
    expect(healers.every(({ x, y }) => x === queen.x && y === queen.y)).toBe(true);
  } else {
    expect(new Set(healers.map(({ x, y }) => `${x},${y}`)).size).toBe(3);
    expect(
      healers.every(
        ({ x, y }) => (x - queen.x) * (targetX - queen.x) + (y - queen.y) * (targetY - queen.y) < 0,
      ),
    ).toBe(true);
  }
});

it.each([
  ['queen', 'magic-mirror', 'archerqueen', -1],
  ['prince', 'henchmen-puppet', 'henchman', 1],
] as const)('%s summons its two %s bodies in the pinned half-plane', (kind, slug, summon, sign) => {
  const r = heroPuppetBattle({ kind, level: 20, items: [{ slug, level: 18 }] });
  expect(r.model.deployNativeHero(kind, 11.4, 11.5)).toBe(true);
  r.model.step(0.05);
  const hero = r.battle.units.find((u) => u.hero === kind)!;
  expect(r.model.activateNativeHeroAbility(kind)).toBe(true);
  const bodies = r.battle.units.filter((u) => u.kind === summon && u.native?.owner === hero.id);
  expect(bodies).toHaveLength(2);
  const target = r.battle.buildings.find(({ id }) => id === hero.target)!;
  for (const body of bodies)
    expect(
      sign *
        ((body.x - hero.x) * (target.x + 1.5 - hero.x) +
          (body.y - hero.y) * (target.y + 1.5 - hero.y)),
    ).toBeGreaterThan(0);
});

it.each([
  ['queen', 'archer-puppet', 'archer', 5, 5],
  ['king', 'barbarian-puppet', 'swordsman', 5, 8],
] as const)('%s preserves %s wave counts', (kind, slug, summon, first, total) => {
  const r = heroPuppetBattle({ kind, level: 20, items: [{ slug, level: 1 }] }, { [summon]: 4 });
  expect(r.model.deployNativeHero(kind, 11.4, 11.5)).toBe(true);
  expect(r.model.activateNativeHeroAbility(kind)).toBe(true);
  const bodies = () => r.battle.units.filter((u) => u.kind === summon);
  expect(bodies()).toHaveLength(first);
  for (let i = 0; i < 22; i++) r.model.step(0.05);
  expect(bodies()).toHaveLength(total);
  expect(bodies().every(({ level }) => level === 4)).toBe(true);
});
