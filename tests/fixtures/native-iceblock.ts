import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import type { ReplayData } from '../../src/game/replay';
/** A Cannon outside the spell area keeps firing at a real Giant protected inside it. */
export function nativeIceBlockRecording(level = 1) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 37, 37, 18),
    makeBuilding(2, 'cannon', 20, 12, 1),
  ];
  model.state.army = { ...emptyArmy(), giant: 2 };
  model.state.troopLevels = { ...model.state.troopLevels, giant: 1 };
  model.state.spells = { ...emptySpells(), iceblock: 1 };
  model.state.spellLevels = { ...model.state.spellLevels, iceblock: level };
  model.startBattle(0, true);
  const battle = model.battle!,
    snapshots: { at: number; battle: unknown }[] = [],
    until = (time: number) => {
      while (battle.elapsed < time - 1e-9) {
        if (battle.finished) throw Error('Ice Block checkpoint not reached');
        model.step(0.05);
      }
    },
    snapshot = () =>
      snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  model.activeTroop = 'giant';
  if (!model.deploy(13, 14)) throw Error('Ice Block Giant failed');
  until(0.3);
  snapshot();
  const before = battle.elapsed,
    unitId = battle.units[0].id;
  model.step(0.05);
  model.activeSpell = 'iceblock';
  if (!model.castSpell(13, 14)) throw Error('Ice Block cast failed');
  const cast = battle.nativeSpells![0];
  until(cast.firstHit + 0.5);
  snapshot();
  const protectedAt = battle.elapsed;
  until(cast.firstHit + 4);
  snapshot();
  const takingFire = battle.elapsed;
  until(cast.castAt + 7.9);
  snapshot();
  const melting = battle.elapsed;
  until(cast.firstHit + 7);
  snapshot();
  const expiry = battle.elapsed;
  until(cast.firstHit + 7.25);
  snapshot();
  const moving = battle.elapsed;
  until(14);
  snapshot();
  const retired = battle.elapsed;
  model.step(0.05);
  model.finishBattle();
  return {
    level,
    unitId,
    before,
    protectedAt,
    takingFire,
    melting,
    expiry,
    moving,
    retired,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
