import { GameModel } from '../../src/game/model';
import { BUILDINGS, TROOP_KEYS, researchLevelForLab } from '../../src/game/data';
import { shrinkTrapVillage } from './shrink-trap-battle';

/** Legal 200-space TH8 ground army against the untouched original High Pressure layout. */
export function highPressureVillage() {
  const save = shrinkTrapVillage();
  save.army.pekka = 8;
  save.army.dragon = 0;
  save.buildings.find((b) => b.kind === 'laboratory')!.level = 6;
  save.troopLevels = Object.fromEntries(TROOP_KEYS.map((kind) => [kind, 1])) as typeof save.army;
  for (const kind of ['pekka', 'dragon'] as const)
    save.troopLevels[kind] = researchLevelForLab(kind, 6);
  save.nativeCampaign!.stars[54] = 1;
  return new GameModel(save).state;
}
export function deployHighPressure(m: GameModel) {
  const buildings = m.battle!.buildings.filter((b) => !BUILDINGS[b.kind].trap);
  const x0 = Math.min(...buildings.map((b) => b.x)),
    x1 = Math.max(...buildings.map((b) => b.x + BUILDINGS[b.kind].size)),
    y0 = Math.min(...buildings.map((b) => b.y)),
    y1 = Math.max(...buildings.map((b) => b.y + BUILDINGS[b.kind].size));
  const points = [
    [x0 - 4, (y0 + y1) / 2],
    [(x0 + x1) / 2, y0 - 4],
    [x1 + 4, (y0 + y1) / 2],
    [(x0 + x1) / 2, y1 + 4],
  ];
  for (const kind of ['pekka', 'dragon'] as const) {
    if (!m.battle!.remaining[kind]) continue;
    m.activeTroop = kind;
    let i = 0;
    while (m.battle!.remaining[kind]) {
      const [x, y] = points[i++ % 4];
      if (!m.deploy(x, y)) throw Error('High Pressure deployment failed');
    }
  }
}
export function highPressureBattle(m = new GameModel(highPressureVillage())) {
  m.startCampaign(55);
  if (!m.battle) throw Error('High Pressure did not open');
  deployHighPressure(m);
  return m;
}
