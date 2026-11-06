import { nativeDirectBattle } from './native-direct-attacks';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { Battle } from '../../src/game/model';

/** A real level-21 Cannon kills the attacking Ice Golem; its source spell freezes the defense. */
export function iceGolemDeathRecording(version = REPLAY_VERSION) {
  const r = nativeDirectBattle('icegolem', 1, version, 11.4, 'cannon', {}, { buildingLevel: 21 });
  const snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (r.unit.hp > 500) r.step();
  r.model.activeTroop = 'archer';
  if (!r.model.deploy(2, 46)) throw Error('Ice Golem death witness Archer failed');
  while (r.unit.hp > 0) r.step();
  const until = (at: number) => {
    while (r.battle.elapsed < at - 1e-9) {
      if (r.battle.finished || r.battle.elapsed > 60) throw Error('Ice Golem frost tail missing');
      r.model.step(0.05);
    }
  };
  const death = snapshot();
  until(death + 0.4);
  const frost = snapshot();
  until(death + 0.8);
  const frozen = snapshot();
  until(death + 6);
  const after = snapshot();
  r.model.step(0.05);
  r.model.finishBattle();
  return {
    id: r.unit.id,
    born,
    death,
    frost,
    frozen,
    after,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
