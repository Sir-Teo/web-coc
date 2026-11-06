import { makeBuilding, type Unit, type separateUnits } from '../../src/game/model';

export function separationCrowd(count: number, spread = 0.01, mixed = false): Unit[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    kind: mixed && i % 4 === 0 ? 'minion' : i % 3 === 0 ? 'giant' : 'swordsman',
    x: 20 + (i % 8) * spread,
    y: 20 + Math.floor(i / 8) * spread,
    hp: 100,
    maxHp: 100,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  }));
}

/** Captures full unit states, including historical uncapped separation and collision lanes. */
export function crowdSeparationWitness(
  separate: typeof separateUnits,
  capture: (value: string) => void,
) {
  for (const subtiles of [false, true])
    for (const cap of [undefined, 0, 0.001, 0.1, 1])
      for (const spread of [0, 0.01, 0.4]) {
        const units = separationCrowd(96, spread, true);
        units[0].hp = 0;
        units[1].native = { phoenixWaiting: true };
        units[2].native = { phoenixEgg: true };
        units[3].x = -1;
        units[4].x = 48;
        const buildings = [makeBuilding(1, 'goldstorage', 21, 20), makeBuilding(2, 'wall', 19, 20)];
        for (let tick = 0; tick < 8; tick++) {
          separate(units, buildings, subtiles, cap);
          capture(JSON.stringify(units));
        }
      }
}
