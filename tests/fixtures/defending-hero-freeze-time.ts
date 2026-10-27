import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { maxTroopLevel } from '../../src/game/data';
import { GameModel, makeBuilding } from '../../src/game/model';
import type { ReplayData } from '../../src/game/replay';

/** Real deployment/Freeze inputs, with one-second steps landing exactly on the thaw boundary. */
export function defendingHeroFreezeRecording() {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'herohall', 10, 10, 1),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 2 };
  model.state.troopLevels = { ...model.state.troopLevels, giant: maxTroopLevel('giant') };
  model.state.spells = { ...emptySpells(), freeze: 1 };
  model.state.spellLevels = { ...defaultSpellLevels(), freeze: 1 };
  model.state.king = { level: 1 };
  model.state.heroLineup = ['king'];
  model.startBattle(0, true);
  const battle = model.battle!;
  const defender = battle.defenders!.find((defender) => defender.kind === 'hero')!;
  model.activeTroop = 'giant';
  if (!model.deploy(6, 12)) throw Error('Freeze timing Giant deployment failed');
  model.activeSpell = 'freeze';
  if (!model.castSpell(14, 14)) throw Error('Hero Freeze cast failed');
  const snapshots: { at: number; battle: unknown }[] = [];
  for (let i = 0; i < 6; i++) {
    model.step(1);
    if (i === 2 || i === 3 || i === 5)
      snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  }
  const until = defender.stunnedUntil!;
  if (until === undefined) throw Error('Hero Freeze timing checkpoint was not reached');
  for (let i = 0; i < 2; i++) model.step(1);
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    frozen: snapshots[0].at,
    thaw: until,
    later: snapshots.at(-1)!.at,
    defenderId: defender.id,
  };
}
