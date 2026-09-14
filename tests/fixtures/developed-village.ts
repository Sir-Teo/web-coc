import { initialSave, makeBuilding } from '../../src/game/model';
import { maxLevelFor, storageCapacity, townHallCapacity } from '../../src/game/data';

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
  save.spells = { rage: 1, heal: 1, lightning: 0 };
  // A veteran village has raised its stores and filled them; storage now holds the original
  // allowance, which a starter's two small stores would exhaust long before Town Hall 7.
  for (const b of save.buildings)
    if (b.kind === 'goldstorage' || b.kind === 'elixirstorage') b.level = maxLevelFor(b.kind, 7);
  const cap = (kind: 'gold' | 'elixir') =>
    townHallCapacity(7, kind) +
    save.buildings
      .filter((b) => b.kind === (kind === 'gold' ? 'goldstorage' : 'elixirstorage'))
      .reduce((n, b) => n + storageCapacity(b.level), 0);
  save.gold = cap('gold');
  save.elixir = cap('elixir');
  return save;
}
