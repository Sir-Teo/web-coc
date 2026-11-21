import { expect, it } from 'vitest';
import home from '../reference/full-client/combat.json';
import campaign from '../reference/late-goblin-buildings/native.json';
import { makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { REPLAY_VERSION } from '../src/game/replay';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';

it('distinguishes the Resource-class Clan Castle from the NPC bunker in the pinned rows', () => {
  expect(home.buildings['Clan Castle'][0].SecondaryTargetingClass).toBe('Resource');
  const bunker = campaign.buildings['Goblin Castle'][0];
  expect(bunker).toMatchObject({ BuildingClass: 'Npc', Bunker: 'TRUE' });
  expect(bunker).not.toHaveProperty('SecondaryTargetingClass');
});

for (const { version, npc, expected } of [
  { version: 286, npc: 'goblin-castle', expected: 2 },
  { version: REPLAY_VERSION, npc: 'goblin-castle', expected: 3 },
  { version: REPLAY_VERSION, npc: undefined, expected: 2 },
] as const) {
  it(`chooses the right first target for ${npc ?? 'Clan Castle'} in recording ${version}`, () => {
    const r = nativeDirectBattle(
      'sneakygoblin',
      1,
      version,
      11.4,
      'storage',
      {},
      {
        layout: [
          makeBuilding(1, 'townhall', 36, 36, 1),
          { ...makeBuilding(2, 'clancastle', 13, 10, 1), npc },
          makeBuilding(3, 'goldstorage', 18, 10, 1),
        ],
      },
    );
    r.step();
    expect(r.unit.target).toBe(expected);
    r.untilAttacks(1);
    const target = r.battle.buildings.find(({ id }) => id === expected)!;
    const snapshot = structuredClone(r.battle);
    expect(target.hp).toBeLessThan(target.maxHp);

    r.step();
    r.model.finishBattle();
    const data = r.model.state.raidLog![0].replay!;
    r.model.returnHome();
    expect(r.model.openReplay(data)).toBe(true);
    r.model.seekReplay(snapshot.elapsed);
    while (r.model.replay!.seeking) r.model.step(0.05);
    expect(r.model.battle).toEqual(snapshot);
  });
}

for (const kind of ['goblin', 'sneakygoblin'] as const)
  for (const [version, bonus] of [
    [286, 2],
    [REPLAY_VERSION, 1],
  ] as const) {
    it(`keeps the ${kind} bunker attack multiplier at ${bonus} in recording ${version}`, () => {
      const r = nativeDirectBattle(
        kind,
        1,
        version,
        11.4,
        'storage',
        {},
        {
          layout: [{ ...makeBuilding(2, 'clancastle', 13, 10, 1), npc: 'goblin-castle' }],
        },
      );
      r.untilAttacks(1);
      const target = r.battle.buildings[0];
      const stats = nativeUnitStats(kind, 1);
      expect(target.maxHp - target.hp).toBeCloseTo(stats.dps * stats.rate * bonus);
    });
  }
