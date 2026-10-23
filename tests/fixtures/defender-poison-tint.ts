import { GameModel, makeBuilding } from '../../src/game/model';
import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { idleDefenderAvoidanceRecording } from './idle-defender-avoidance';
import { poisonAvoidanceRecording } from './poison-avoidance';

export type PoisonTintKind = 'hero' | 'skeleton' | 'garrison' | 'guardian';

/** Native spell records for every defender renderer that carries Poison status. */
export function defenderPoisonTintRecording(kind: PoisonTintKind) {
  if (kind === 'hero' || kind === 'skeleton') {
    const recording = idleDefenderAvoidanceRecording(kind);
    return {
      data: recording.data,
      poisoned: recording.avoiding,
      expired: recording.recovered,
      defenderId: recording.defenderId,
    };
  }
  if (kind === 'garrison') {
    const recording = poisonAvoidanceRecording();
    const duration = (recording.data.steps as number[]).reduce((sum, step) => sum + step, 0);
    return {
      data: recording.data,
      poisoned: recording.avoiding,
      expired: duration - 0.05,
      defenderId: recording.defenderId,
    };
  }
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    { ...makeBuilding(1, 'townhall', 22, 22, 18), guardian: 'longshot', guardianLevel: 1 },
    makeBuilding(2, 'goldmine', 2, 44, 1),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), golem: 2 };
  model.state.spells = { ...emptySpells(), poison: 1 };
  model.state.spellLevels = { ...defaultSpellLevels(), poison: 1 };
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  const until = (ready: () => boolean) => {
    for (let remaining = 600; !ready(); remaining--) {
      if (!remaining || battle.finished) throw Error('Guardian Poison tint checkpoint not reached');
      model.step(0.05);
    }
  };
  model.activeTroop = 'golem';
  if (!model.deploy(34, 28)) throw Error('Golem deployment failed');
  until(
    () =>
      !!battle.defenders?.some(
        (defender) => defender.kind === 'guardian' && defender.spawnedAt <= battle.elapsed,
      ),
  );
  const defender = battle.defenders!.find((defender) => defender.kind === 'guardian')!;
  model.activeSpell = 'poison';
  if (!model.castSpell(defender.x, defender.y)) throw Error('Poison cast failed');
  const cast = battle.nativeSpells!.find((spell) => spell.name === 'Poison')!;
  until(() => battle.elapsed >= cast.firstHit + 0.1);
  const poisoned = battle.elapsed;
  until(() => battle.elapsed >= cast.firstHit + 18);
  const expired = battle.elapsed;
  for (let i = 0; i < 10; i++) model.step(0.05);
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)),
    poisoned,
    expired,
    defenderId: defender.id,
  };
}
