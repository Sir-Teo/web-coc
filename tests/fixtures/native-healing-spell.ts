import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';
/** Recorded Cannon wounds, a Freeze to hold incoming damage, then actual Healing pulses. */
export function nativeHealingSpellRecording(level = 1) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'cannon', 10, 10, 1),
  ];
  model.state.army = { ...emptyArmy(), giant: 2 };
  model.state.spells = { ...emptySpells(), freeze: 1, heal: 1 };
  model.state.spellLevels = { ...model.state.spellLevels, heal: level, freeze: 8 };
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.initial.heroes = [];
  const battle = (model.battle = replayBattle(recording.initial)),
    snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  const until = (ready: () => boolean) => {
    for (let remaining = 500; !ready(); remaining--) {
      if (!remaining || battle.finished) throw Error('Healing Spell checkpoint missing');
      model.step(0.05);
    }
  };
  model.activeTroop = 'giant';
  if (!model.deploy(5, 10)) throw Error('Healing ally deployment failed');
  const unit = battle.units[0];
  until(() => unit.hp < unit.maxHp);
  snapshot();
  const wounded = battle.elapsed;
  model.step(0.05);
  model.activeSpell = 'freeze';
  if (!model.castSpell(11.5, 11.5)) throw Error('Cannon Freeze failed');
  const freeze = battle.nativeSpells!.find((c) => c.name === 'Freeze')!;
  until(() => battle.elapsed >= freeze.firstHit + 0.3 - 1e-9);
  model.activeSpell = 'heal';
  if (!model.castSpell(unit.x, unit.y)) throw Error('Healing Spell cast failed');
  const cast = battle.nativeSpells!.find((c) => c.name === 'Healing')!;
  until(() => battle.elapsed >= cast.firstHit - 0.05 - 1e-9);
  snapshot();
  const before = battle.elapsed,
    beforeHp = unit.hp;
  until(() => battle.elapsed >= cast.firstHit - 1e-9);
  snapshot();
  const healed = battle.elapsed;
  if (unit.hp <= beforeHp)
    throw Error(`Healing did not recover actual wounds: ${beforeHp} -> ${unit.hp}`);
  until(() => battle.elapsed >= cast.firstHit + 0.6 - 1e-9);
  snapshot();
  const later = battle.elapsed;
  model.step(0.05);
  model.finishBattle();
  return {
    level,
    wounded,
    before,
    healed,
    later,
    beforeHp,
    unitId: unit.id,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
