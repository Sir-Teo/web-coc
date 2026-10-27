import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { applyGarrisonFrost } from '../../src/game/garrison-status';
import { garrisonStats } from '../../src/game/garrison-kinds';
import { castNativeSpell, stepNativeSpells } from '../../src/game/native-spells';
import type { Battle, Unit } from '../../src/game/model';

export type AttackerFrostSource = 'ghost' | 'townhall';

/** Isolated attackers far from the defending village, for inspecting partial-frost artwork. */
export function attackerFrostArena(hero: boolean, model = new GameModel()) {
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'herohall', 36, 30, 8),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = hero ? { level: 60 } : undefined;
  model.state.heroLineup = hero ? ['king'] : [];
  model.startBattle(0, true);
  model.activeTroop = 'giant';
  if (!(hero ? model.deployHero(8, 8) : model.deploy(8, 8)))
    throw Error('Frost attacker deployment failed');
  return { model, battle: model.battle!, unit: model.battle!.units[0] };
}

/** The same source frost payload as a Royal Ghost hit, or the real Town Hall spell pulse. */
export function applyAttackerFrost(battle: Battle, unit: Unit, source: AttackerFrostSource) {
  if (source === 'ghost') {
    applyGarrisonFrost(battle, unit, garrisonStats('royalghost', 7).frost!, -999, battle.elapsed);
    return unit.late!.garrison!.frost!.until;
  }
  const cast = castNativeSpell(battle, 'TH13 Frost', 1, 'defense', unit.x, unit.y);
  battle.elapsed = cast.firstHit + 0.01;
  stepNativeSpells({ battle, damageBuilding() {}, effect() {} });
  return unit.native!.effects!.chill!.until;
}
