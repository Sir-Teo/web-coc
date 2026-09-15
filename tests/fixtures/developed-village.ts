import { initialSave, makeBuilding } from '../../src/game/model';

/** Explicit veteran fixture for tests of combat, advanced armies and research. */
export function developedSave() {
  const save = initialSave();
  save.obstacles = []; // Developed test villages have already cleared their ground.
  save.buildings.find((b) => b.kind === 'townhall')!.level = 7;
  save.buildings.find((b) => b.kind === 'barracks')!.level = 7;
  for (const [kind, x, y, level] of [
    ['mortar', 19, 15, 1],
    ['airdefense', 12, 2, 1],
    ['laboratory', 17, 20, 1],
    ['spellfactory', 21, 23, 3],
    ['camp', 21, 11, 6],
    ['camp', 28, 8, 6],
    ['camp', 28, 20, 6],
  ] as const)
    save.buildings.push(makeBuilding(save.nextId++, kind, x, y, level));
  save.buildings.find((b) => b.kind === 'camp')!.level = 6;
  save.army = {
    swordsman: 12,
    archer: 10,
    giant: 2,
    wizard: 2,
    balloon: 2,
    goblin: 2,
    wallbreaker: 1,
    healer: 0,
    dragon: 0,
    pekka: 0,
  };
  save.spells = { rage: 1, heal: 1, lightning: 0, freeze: 0 };
  // A veteran village has been collecting for a while. Storage caps income, never a balance
  // already held, so this purse is spendable without moving a single building.
  save.gold = 205000;
  save.elixir = 165000;
  return save;
}
