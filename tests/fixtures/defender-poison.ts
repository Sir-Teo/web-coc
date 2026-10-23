import { GameModel, makeBuilding } from '../../src/game/model';
import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { maxTroopLevel } from '../../src/game/data';
import { replayBattle, type ReplayData } from '../../src/game/replay';

/** A custom validated garrison setup, then only recorded deployment and spell inputs. */
export function defenderPoisonRecording(poisonCasts = 1) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'clancastle', 20, 20, 8),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 2 };
  model.state.troopLevels = { ...model.state.troopLevels, giant: maxTroopLevel('giant') };
  model.state.spells = { ...emptySpells(), poison: poisonCasts };
  model.state.spellLevels = { ...defaultSpellLevels(), poison: 1 };
  model.state.king = undefined;
  model.startBattle(0, true);
  // Like the released-combat fixture, change the initial setup before the first recorded action.
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.initial.garrisons = [
    { castleId: 2, mode: 'guard', troops: [{ kind: 'dragon', level: 5, count: 1 }] },
  ];
  model.battle = replayBattle(recording.initial);
  const battle = model.battle;
  const until = (ready: () => boolean) => {
    for (let remaining = 400; !ready(); remaining--) {
      if (!remaining || battle.finished) throw Error('Garrison Poison checkpoint not reached');
      model.step(0.05);
    }
  };
  model.activeTroop = 'giant';
  if (!model.deploy(16, 21)) throw Error('Giant deployment failed');
  until(() => !!battle.defenders?.some((defender) => defender.kind === 'dragon'));
  const defender = battle.defenders!.find((defender) => defender.kind === 'dragon')!;
  model.activeSpell = 'poison';
  for (let cast = 0; cast < poisonCasts; cast++) {
    if (!model.castSpell(defender.x, defender.y)) throw Error('Poison cast failed');
    if (cast + 1 < poisonCasts) {
      const next = battle.elapsed + 0.2;
      until(() => battle.elapsed >= next);
    }
  }
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  snapshot();
  const before = battle.elapsed;
  const cast = battle.nativeSpells!.find((spell) => spell.name === 'Poison')!;
  until(() => battle.elapsed >= cast.firstHit + 0.1);
  snapshot();
  const poisoned = battle.elapsed;
  until(() => battle.elapsed >= cast.firstHit + (poisonCasts > 1 ? 6 : 3));
  snapshot();
  const later = battle.elapsed;
  for (let i = 0; i < 10; i++) model.step(0.05);
  model.finishBattle();
  const data = JSON.parse(JSON.stringify(model.state.raidLog![0].replay!));
  return { data, snapshots, before, poisoned, later, defenderId: defender.id };
}
