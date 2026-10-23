import { GameModel, makeBuilding } from '../../src/game/model';
import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';

/** A real Giant deployment and Poison cast capture defending hero movement, hits and damage. */
export function defendingHeroPoisonRecording() {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 30, 30, 18),
    makeBuilding(2, 'herohall', 10, 10, 1),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 2 };
  model.state.spells = { ...emptySpells(), poison: 1 };
  model.state.spellLevels = { ...defaultSpellLevels(), poison: 1 };
  model.state.king = { level: 1 };
  model.state.heroLineup = ['king'];
  model.startBattle(0, true);
  const battle = model.battle!;
  const defender = battle.defenders!.find((defender) => defender.kind === 'hero')!;
  const until = (ready: () => boolean) => {
    for (let remaining = 400; !ready(); remaining--) {
      if (!remaining || battle.finished)
        throw Error('Defending hero Poison checkpoint not reached');
      model.step(0.05);
    }
  };
  model.activeTroop = 'giant';
  if (!model.deploy(6, 12)) throw Error('Giant deployment failed');
  until(() => battle.elapsed >= 2);
  model.activeSpell = 'poison';
  if (!model.castSpell(defender.x, defender.y)) throw Error('Poison cast failed');
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  snapshot();
  const before = battle.elapsed;
  const cast = battle.nativeSpells!.find((spell) => spell.name === 'Poison')!;
  until(() => battle.elapsed >= cast.firstHit + 0.1);
  snapshot();
  const poisoned = battle.elapsed;
  until(() => battle.elapsed >= cast.firstHit + 3);
  snapshot();
  const later = battle.elapsed;
  for (let i = 0; i < 10; i++) model.step(0.05);
  model.finishBattle();
  const data = JSON.parse(JSON.stringify(model.state.raidLog![0].replay!));
  return { data, snapshots, before, poisoned, later, defenderId: defender.id };
}
