import type { Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { flameFlingerBurnBattle } from './flame-flinger-wall-burn';

export function flameFlingerOverlapRecording(level = 1, version = REPLAY_VERSION, x = 5) {
  const r = flameFlingerBurnBattle(level, version, x),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  snapshot();
  const pools = () => r.battle.nativeSpells?.filter((c) => c.name === 'FireSpiritExplosion') ?? [];
  while (!pools().length) r.step();
  const first = snapshot();
  while (pools().length < 2) r.step();
  const second = snapshot();
  while (!pools()[1].hits) r.step();
  const overlap = snapshot();
  for (const delay of [0.4, 1.2, 3.2, 5.2, 6.4]) {
    r.until(overlap + delay);
    snapshot();
  }
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    first,
    second,
    overlap,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
