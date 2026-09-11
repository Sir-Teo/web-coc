import { initialSave, makeBuilding } from '../../src/game/model';

/** Explicit veteran fixture for tests of combat, advanced armies and research. */
export function developedSave() {
  const save = initialSave();
  save.buildings.find((b) => b.kind === 'townhall')!.level = 7;
  save.buildings.find((b) => b.kind === 'barracks')!.level = 7;
  for (const [kind, x, y, level] of [
    ['mortar', 13, 16, 1], ['airdefense', 12, 2, 1],
    ['laboratory', 17, 20, 1], ['spellfactory', 21, 23, 3],
  ] as const) save.buildings.push(makeBuilding(save.nextId++, kind, x, y, level));
  save.army = { swordsman: 12, archer: 10, giant: 2, wizard: 2, balloon: 2, goblin: 2, wallbreaker: 1 };
  save.spells = { rage: 1, heal: 1, lightning: 0 };
  return save;
}
