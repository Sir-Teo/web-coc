import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { maxTroopLevel } from '../../src/game/data';
import { GameModel, makeBuilding } from '../../src/game/model';

/** Two native Poison Spell Towers responding to a real recorded Giant deployment. */
export function attackerPoisonRecording(step = 1, actor: 'giant' | 'king' = 'giant') {
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
  if (actor === 'king') {
    model.state.buildings.push(makeBuilding(4, 'herohall', 30, 30, 12));
    model.state.king = { level: 50 };
    model.state.heroLineup = ['king'];
  }
  model.startBattle(0, true);
  const battle = model.battle!;
  model.activeTroop = 'giant';
  if (!(actor === 'king' ? model.deployNativeHero('king', 20, 21) : model.deploy(20, 21)))
    throw Error(`${actor} deployment failed`);
  const snapshots: { at: number; battle: unknown }[] = [];
  for (let i = 0; i < Math.round(10 / step); i++) {
    model.step(step);
    if (battle.elapsed + 1e-9 >= [4, 8, 10][snapshots.length])
      snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  }
  for (let i = 0; i < 2; i++) model.step(step);
  model.finishBattle();
  const data = JSON.parse(JSON.stringify(model.state.raidLog![0].replay!));
  return { data, snapshots };
}
