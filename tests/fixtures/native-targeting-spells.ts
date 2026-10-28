import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';
/** Actual troop deployment and a real spell input exercise targeting, stuns and Totem health drain. */
export function nativeTargetingSpellRecording(
  name: 'Totem Spell' | 'AngrySpell',
  level = 1,
  version = REPLAY_VERSION,
  kind: 'swordsman' | 'goblin' = 'swordsman',
) {
  const model = new GameModel(),
    key = name === 'Totem Spell' ? 'totem' : 'angry';
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 37, 37, 18),
    makeBuilding(2, 'goldmine', 6, 12, 12),
    makeBuilding(
      3,
      name === 'Totem Spell' ? 'airdefense' : 'cannon',
      20,
      12,
      name === 'Totem Spell' ? 5 : 1,
    ),
  ];
  model.state.army = { ...emptyArmy(), [kind]: 2 };
  model.state.troopLevels = { ...model.state.troopLevels, [kind]: 1 };
  model.state.spells = { ...emptySpells(), [key]: 1 };
  model.state.spellLevels = { ...model.state.spellLevels, [key]: level };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  const battle = (model.battle = replayBattle(data.initial, version)),
    snapshots: { at: number; battle: unknown }[] = [],
    until = (time: number) => {
      while (battle.elapsed < time - 1e-9) {
        if (battle.finished) throw Error('Targeting spell finished before its checkpoint');
        model.step(0.05);
      }
    },
    snapshot = () =>
      snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  model.activeTroop = kind;
  if (!model.deploy(3, 13)) throw Error('Targeting troop deployment failed');
  until(kind === 'goblin' ? 0.05 : 0.3);
  snapshot();
  const before = battle.elapsed,
    unitId = battle.units[0].id;
  model.step(0.05);
  model.activeSpell = key;
  const unit = battle.units[0];
  if (!model.castSpell(name === 'Totem Spell' ? 18 : unit.x, name === 'Totem Spell' ? 14 : unit.y))
    throw Error('Targeting spell cast failed');
  const cast = battle.nativeSpells![0];
  until(cast.firstHit - 0.05);
  snapshot();
  const pending = battle.elapsed;
  until(cast.firstHit + 0.1);
  snapshot();
  const impact = battle.elapsed;
  until(cast.firstHit + (name === 'Totem Spell' ? 0.8 : 0.2));
  snapshot();
  const after = battle.elapsed;
  until(cast.firstHit + (name === 'Totem Spell' ? 1.8 : 1.2));
  snapshot();
  const draining = battle.elapsed;
  until(Math.max(12, cast.firstHit + (cast.total - 1) * cast.interval + 0.2));
  snapshot();
  const ended = battle.elapsed;
  until(45);
  snapshot();
  const late = battle.elapsed;
  model.step(0.05);
  model.finishBattle();
  return {
    name,
    level,
    unitId,
    before,
    pending,
    after,
    impact,
    draining,
    ended,
    late,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
