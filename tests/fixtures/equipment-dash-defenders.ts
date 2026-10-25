import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, type ReplayData } from '../../src/game/replay';

/** A portable setup with two frozen Heroes at one point, crossed by an actual Duke dash. */
export function equipmentDashDefenderRecording() {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), freeze: 1 };
  model.state.spellLevels = { ...defaultSpellLevels(), freeze: 8 };
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.initial.heroes = [
    { kind: 'duke', level: 25, items: [{ slug: 'rocket-backpack', level: 1 }] },
  ];
  recording.initial.defendingHeroes = [
    { kind: 'king', level: 110, x: 15, y: 15 },
    { kind: 'queen', level: 110, x: 15, y: 15 },
  ];
  model.battle = replayBattle(recording.initial);
  const battle = model.battle;
  model.activeSpell = 'freeze';
  if (!model.castSpell(15, 15)) throw Error('Dash defender Freeze cast failed');
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) model.step(0.05);
  };
  until(1.55);
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  snapshot();
  const before = battle.elapsed;
  until(1.6);
  if (!model.deployNativeHero('duke', 8, 8)) throw Error('Duke deployment failed');
  if (!model.activateNativeHeroAbility('duke')) throw Error('Rocket Backpack activation failed');
  const damage = battle.units[0].native!.dash!.damage;
  until(2.4);
  snapshot();
  const crossed = battle.elapsed;
  until(3);
  snapshot();
  const later = battle.elapsed;
  until(3.5);
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    before,
    crossed,
    later,
    damage,
    defenderIds: battle
      .defenders!.filter((defender) => defender.kind === 'hero')
      .map((defender) => defender.id),
  };
}
