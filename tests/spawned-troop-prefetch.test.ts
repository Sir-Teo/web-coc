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
