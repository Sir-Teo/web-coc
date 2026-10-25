import { expect, it } from 'vitest';
import { defenderAnimations } from '../src/game/defender-art-demand';
import { GARRISON_KINDS, garrisonStats, type GarrisonKind } from '../src/game/garrison-kinds';
import { initializeGarrison } from '../src/game/garrison-release';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { makeBuilding } from '../src/game/model';
import { ghostTrapSource } from '../src/game/ghost-trap';
import { defendingBuilderStats, hutBuilderLevel } from '../src/game/defending-builder';
import { lateTrapArena } from './fixtures/late-trap-battle';
import { characterProjectileGroups, PROJECTILE_GROUPS } from '../src/game/character-catalog';

it('needs no character bodies for a late defense without defenders', () => {
  const { b } = lateTrapArena([makeBuilding(1, 'monolith', 20, 20)]);
  expect([...defenderAnimations(b)]).toEqual([]);
});
it('includes unspawned Golemites, Lava Pups and Witch summons from the reserve', () => {
  const { b } = lateTrapArena([]);
  b.garrisons = [
    initializeGarrison({
      castleId: 9999,
      mode: 'guard',
      troops: [
        { kind: 'witch', level: 4, count: 1 },
        { kind: 'golem', level: 8, count: 1 },
        { kind: 'lavahound', level: 6, count: 1 },
      ],
    }),
  ];
  expect([...defenderAnimations(b)].sort()).toEqual(
    [
      'Necromancer_lvl2',
      'Skeleton',
      'Golem_lvl6',
      'GolemSmall_lvl6',
      'ADSeeker_lvl6',
      'TinyBaby_lvl1',
    ].sort(),
  );
});
it('includes already spawned defenders when a recording has no reserve', () => {
  const { b } = lateTrapArena([]);
  spawnGarrisonDefender(b, 'royalghost', 7, 9999, 20, 20, 0);
  expect([...defenderAnimations(b)]).toEqual([garrisonStats('royalghost', 7).animation]);
});
it('prepares concealed Ghost Trap characters and every armed hut worker level', () => {
  const ghost = makeBuilding(1, 'bomb', 20, 20);
  ghost.npc = 'ghost-trap';
  const huts = Array.from({ length: 7 }, (_, i) => makeBuilding(i + 2, 'builder', 24, 24, i + 2));
  const { b } = lateTrapArena([ghost, ...huts]);
  const wanted = defenderAnimations(b),
    source = ghostTrapSource();
  expect(wanted.has(garrisonStats(source.kind!, source.level).animation)).toBe(true);
  for (const hut of huts)
    expect(wanted.has(defendingBuilderStats(hutBuilderLevel(hut.level)!).animation)).toBe(true);
});
it('resolves every supported defender level and all of its descendants', () => {
  for (const [kind, definition] of Object.entries(GARRISON_KINDS))
    for (const level of Object.keys(definition.levels).map(Number)) {
      const { b } = lateTrapArena([]);
      spawnGarrisonDefender(b, kind as GarrisonKind, level, 9999, 20, 20, 0);
      expect(defenderAnimations(b).has(garrisonStats(kind as GarrisonKind, level).animation)).toBe(
        true,
      );
    }
});
it('deduplicates repeated defenders without changing combat state', () => {
  const { b } = lateTrapArena([]);
  for (let i = 0; i < 3; i++) spawnGarrisonDefender(b, 'witch', 4, 9999, 20, 20, 0);
  const before = JSON.stringify(b);
  expect([...defenderAnimations(b)].sort()).toEqual(['Necromancer_lvl2', 'Skeleton'].sort());
  expect(JSON.stringify(b)).toBe(before);
});

it('covers every captured later projectile group for each supported defender animation', () => {
  for (const [kind, definition] of Object.entries(GARRISON_KINDS))
    for (const level of Object.keys(definition.levels).map(Number)) {
      const stats = garrisonStats(kind as GarrisonKind, level);
      const expected = Object.entries(PROJECTILE_GROUPS)
        .filter(([, names]) => stats.projectile && names.includes(stats.projectile))
        .map(([group]) => group);
      expect([...characterProjectileGroups(stats.animation)]).toEqual(expected);
    }
  expect([...characterProjectileGroups('Archer9')]).toEqual([]);
  expect([...characterProjectileGroups('Defending Builder')]).toEqual([]);
});
