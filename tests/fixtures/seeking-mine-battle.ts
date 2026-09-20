import { emptySpells } from '../../src/game/army';
import { GameModel } from '../../src/game/model';
import { BUILDINGS, TROOP_KEYS, researchLevelForLab } from '../../src/game/data';
import { emptyArmy } from '../../src/game/army';
import { freshNativeCampaign } from '../../src/game/native-campaign';
import { developedSave } from './developed-village';

/** Legal 200-space TH8 air army; no changes to original campaign entities or levels. */
export function seekingMineVillage() {
  const save = developedSave();
  save.buildings.find((b) => b.kind === 'townhall')!.level = 8;
  save.buildings.find((b) => b.kind === 'barracks')!.level = 10;
  save.buildings.find((b) => b.kind === 'laboratory')!.level = 6;
  save.army = { ...emptyArmy(), balloon: 20, dragon: 5 };
  save.troopLevels = Object.fromEntries(TROOP_KEYS.map((kind) => [kind, 1])) as typeof save.army;
  for (const kind of ['balloon', 'dragon'] as const)
    save.troopLevels[kind] = researchLevelForLab(kind, 6);
  save.king = undefined;
  save.spells = {
    ...emptySpells(),
    lightning: 0,
    heal: 0,
    rage: 0,
    freeze: 0,
    invisibility: 0,
    jump: 0,
    clone: 0,
    recall: 0,
    revive: 0,
  };
  save.nativeCampaign = freshNativeCampaign();
  save.nativeCampaign.stars.fill(1, 0, 53);
  save.tutorial = true;
  return new GameModel(save).state;
}

export function seekingMineBattle(index = 51, save = seekingMineVillage()) {
  const m = new GameModel(save);
  m.startCampaign(index);
  if (!m.battle) throw Error('Seeking Mine fixture village did not open');
  const buildings = m.battle.buildings;
  const minX = Math.min(...buildings.map((b) => b.x)),
    minY = Math.min(...buildings.map((b) => b.y)),
    maxX = Math.max(...buildings.map((b) => b.x + BUILDINGS[b.kind].size)),
    maxY = Math.max(...buildings.map((b) => b.y + BUILDINGS[b.kind].size));
  const points = [
    [minX - 2, (minY + maxY) / 2],
    [(minX + maxX) / 2, minY - 2],
    [maxX + 2, (minY + maxY) / 2],
    [(minX + maxX) / 2, maxY + 2],
  ];
  let deployed = 0;
  for (const kind of ['balloon', 'dragon'] as const) {
    m.activeTroop = kind;
    while (m.battle.remaining[kind]) {
      const [x, y] = points[deployed++ % points.length];
      if (!m.deploy(Math.max(1, Math.min(47, x)), Math.max(1, Math.min(47, y))))
        throw Error('Seeking Mine fixture deployment failed');
    }
  }
  return m;
}
