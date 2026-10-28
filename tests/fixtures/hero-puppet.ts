import { emptyArmy, emptySpells } from '../../src/game/army';
import type { TroopKind } from '../../src/game/data';
import { GameModel, makeBuilding } from '../../src/game/model';
import type { HeroSetup } from '../../src/game/native-heroes';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

/** A Puppet-only lineup with no defenders: summons originate in real manual activation. */
export function heroPuppetBattle(
  hero: HeroSetup,
  research: Partial<Record<TroopKind, number>> = {},
  carried?: TroopKind,
  version = REPLAY_VERSION,
) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'goldstorage', 13, 10, 18),
  ];
  model.state.army = { ...emptyArmy(), giant: 1, ...(carried ? { [carried]: 1 } : {}) };
  model.state.spells = emptySpells();
  model.state.troopLevels = { ...model.state.troopLevels, ...research };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [hero];
  const battle = (model.battle = replayBattle(data.initial, version));
  return { model, battle, data };
}
