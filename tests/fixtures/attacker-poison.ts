import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { maxTroopLevel } from '../../src/game/data';
import { GameModel, makeBuilding } from '../../src/game/model';

/** Two native Poison Spell Towers responding to a real recorded Giant deployment. */
export function attackerPoisonRecording(step = 1) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    { ...makeBuilding(2, 'spelltower', 15, 15, 2), spellMode: 'poison' as const },
    { ...makeBuilding(3, 'spelltower', 22, 15, 2), spellMode: 'poison' as const },
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 2 };
  model.state.spells = emptySpells();
  model.state.spellLevels = defaultSpellLevels();
  model.state.troopLevels = { ...model.state.troopLevels, giant: maxTroopLevel('giant') };
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  model.activeTroop = 'giant';
  if (!model.deploy(20, 21)) throw Error('Giant deployment failed');
  const snapshots: { at: number; battle: unknown }[] = [];
  for (let i = 0; i < 10; i++) {
    model.step(step);
    if (i === 3 || i === 7 || i === 9)
      snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  }
  for (let i = 0; i < 2; i++) model.step(step);
  model.finishBattle();
  const data = JSON.parse(JSON.stringify(model.state.raidLog![0].replay!));
  return { data, snapshots };
}
