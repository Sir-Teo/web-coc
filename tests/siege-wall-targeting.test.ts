import { expect, it } from 'vitest';
import { makeBuilding } from '../src/game/model';
import { nativeRow } from '../src/game/native-data';
import { REPLAY_VERSION } from '../src/game/replay';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';

const wallLayout = () => [
  makeBuilding(2, 'goldstorage', 17, 13, 1),
  ...Array.from({ length: 45 }, (_, i) => makeBuilding(10 + i, 'wall', 12, 2 + i, 12)),
];

it('keeps damage-only preferences separate from the Wall Breaker target class', () => {
  for (const [name, bonus] of [
    ['Wall Wrecker', '10'],
    ['Log Launcher', '4'],
  ] as const) {
    expect(nativeRow('characters', name, 1)).toMatchObject({
      PreferedTargetBuildingClass: 'Wall',
      PreferredTargetNoTargeting: 'TRUE',
      PreferedTargetDamageMod: bonus,
    });
  }
  expect(nativeRow('characters', 'Wall Breaker', 1).PreferredTargetNoTargeting).not.toBe('TRUE');
});

for (const side of [8, 15]) {
  it(`keeps Wall Breaker and Balloon target distinctions on side ${side}`, () => {
    for (const kind of ['wallbreaker', 'balloon'] as const) {
      const r = nativeDirectBattle(
        kind,
        1,
        REPLAY_VERSION,
        side,
        'storage',
        {},
        {
          layout: wallLayout(),
          deployY: 14.5,
        },
      );
      r.step();
      const target = r.battle.buildings.find(({ id }) => id === r.unit.target);
      expect(target?.kind).toBe(kind === 'wallbreaker' && side === 8 ? 'wall' : 'goldstorage');
      if (kind === 'balloon' && side === 8) {
        r.until(3.5);
        expect(r.unit.x).toBeGreaterThan(12);
        expect(
          r.battle.buildings.filter((b) => b.kind === 'wall').every((b) => b.hp === b.maxHp),
        ).toBe(true);
      }
    }
  });
}

for (const kind of ['wallwrecker', 'loglauncher'] as const)
  for (const version of [289, REPLAY_VERSION]) {
    it(`preserves ${kind} wall damage and applies targeting for recording ${version}`, () => {
      const r = nativeDirectBattle(
        kind,
        1,
        version,
        8,
        'storage',
        {},
        {
          layout: wallLayout(),
          deployY: 14.5,
        },
      );
      r.step();
      const target = r.battle.buildings.find(({ id }) => id === r.unit.target);
      expect(target?.kind).toBe(version === 289 ? 'wall' : 'goldstorage');
      const wallDamaged = () => r.battle.buildings.some((b) => b.kind === 'wall' && b.hp < b.maxHp);
      while (!wallDamaged() && !r.battle.finished && r.battle.elapsed < 6) r.step();
      expect(wallDamaged()).toBe(true);
      const state = structuredClone(r.battle);

      r.step();
      r.model.finishBattle();
      const data = r.model.state.raidLog![0].replay!;
      r.model.returnHome();
      expect(r.model.openReplay(data)).toBe(true);
      r.model.seekReplay(state.elapsed);
      while (r.model.replay!.seeking) r.model.step(0.05);
      expect(r.model.battle).toEqual(state);
    });
  }
