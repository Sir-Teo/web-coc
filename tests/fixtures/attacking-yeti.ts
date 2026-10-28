import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { Battle } from '../../src/game/model';
import {
  nativeDirectBattle,
  nativeDirectRecording,
  type NativeDirectTarget,
} from './native-direct-attacks';

export function attackingYetiBattle(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  superTroop = false,
  target: NativeDirectTarget = 'storage',
) {
  return nativeDirectBattle(superTroop ? 'superyeti' : 'yeti', level, version, x, target);
}
export function attackingYetiRecording(
  version = REPLAY_VERSION,
  level = 1,
  superTroop = false,
  garrison = false,
) {
  return nativeDirectRecording(superTroop ? 'superyeti' : 'yeti', 175, version, level, garrison);
}

/** Recall cancels an actual charge and redeployment creates a fresh body near the Cannon. */
export function attackingYetiRecallRecording(
  superTroop = false,
  level = 1,
  version = REPLAY_VERSION,
) {
  const r = attackingYetiBattle(level, version, 11.4, superTroop, 'cannon'),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  while (!r.unit.attacking) r.step();
  const engaged = snapshot();
  r.step();
  r.model.activeSpell = 'recall';
  if (!r.model.castSpell(r.unit.x, r.unit.y)) throw Error('Yeti charge Recall failed');
  while (!r.unit.native?.recalled) r.step();
  const recalled = snapshot(),
    oldAttacks = r.unit.native!.attacks ?? 0,
    damage = r.unit.native!.damageTaken ?? 0,
    released = r.unit.native!.damageSpawns ?? 0;
  r.step();
  r.model.activeSpell = null;
  if (!r.model.deploy(11.4, 11.5)) throw Error('Yeti charge redeployment failed');
  const unit = r.battle.units.at(-1)!;
  const restored = {
    damage: unit.native?.damageTaken ?? 0,
    released: unit.native?.damageSpawns ?? 0,
  };
  const returned = snapshot();
  while (!unit.attacking) r.step();
  const fresh = snapshot();
  let charged: number | undefined;
  if (version >= 175) {
    r.until(fresh + 0.45);
    charged = snapshot();
    while ((unit.native?.attacks ?? 0) < 1) r.step();
  }
  const first = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    oldId: r.unit.id,
    id: unit.id,
    engaged,
    recalled,
    oldAttacks,
    returned,
    fresh,
    charged,
    first,
    damage,
    released,
    restored,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
