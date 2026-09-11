import { initialSave, makeBuilding } from '../../src/game/model';

/** A valid format-3 village whose expanding camp and hall touch occupied ground. */
export function legacyArmyVillage() {
  const save = initialSave();
  (save as unknown as { version: number }).version = 3;
  save.tutorial = true;
  save.buildings = [
    makeBuilding(1, 'townhall', 2, 2, 7),
    makeBuilding(2, 'builder', 8, 2),
    makeBuilding(3, 'builder', 8, 4),
    makeBuilding(4, 'camp', 10, 10, 3),
    makeBuilding(5, 'goldstorage', 13, 10, 3),
    makeBuilding(6, 'herohall', 20, 20),
  ];
  save.obstacles = [{ id: 1, kind: 'rocks', x: 23, y: 20 }];
  delete save.obstacleGrowth;
  save.nextId = 7;
  save.gold = 87654;
  save.king = { level: 1 };
  for (const b of save.buildings.filter((b) => b.kind === 'camp' || b.kind === 'herohall')) {
    b.hp = b.maxHp * 0.4;
    b.upgradeStart = save.lastTick - 1000;
    b.upgradeEnd = save.lastTick + 600000;
  }
  return save;
}

/** More 3×3 camps than can physically fit as 4×4, possible only in an old custom import. */
export function overfullArmyVillage() {
  const save = legacyArmyVillage();
  save.buildings = [makeBuilding(1, 'townhall', 0, 0), makeBuilding(2, 'builder', 46, 46)];
  save.obstacles = [];
  delete save.king;
  save.nextId = 3;
  for (let y = 0; y < 48; y += 3)
    for (let x = 0; x < 48; x += 3) {
      if ((x < 4 && y < 4) || (x === 45 && y === 45)) continue;
      save.buildings.push(makeBuilding(save.nextId++, 'camp', x, y));
    }
  return save;
}
