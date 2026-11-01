import type { Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { CombatProjectile } from '../../src/game/projectiles';
import { nativeDirectBattle, type NativeDirectTarget } from './native-direct-attacks';

export function flameFlingerBurstBattle(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  target: NativeDirectTarget = 'storage',
) {
  const r = nativeDirectBattle('flameflinger', level, version, x, target),
    packets: CombatProjectile[] = [],
    seen = new Set<string>(),
    deployed = r.battle.elapsed;
  const step = (dt = 0.05) => {
    if (r.battle.finished || r.battle.elapsed > deployed + 50)
      throw Error('Flame Flinger checkpoint expired');
    r.model.step(dt);
    for (const packet of r.battle.projectiles) {
      if (packet.sourceId !== r.unit.id || seen.has(packet.id)) continue;
      seen.add(packet.id);
      packets.push(JSON.parse(JSON.stringify(packet)));
    }
  };
  const until = (at: number) => {
    while (r.battle.elapsed < at - 1e-9) step();
  };
  const untilShots = (count: number) => {
    while ((r.unit.native?.attacks ?? 0) < count) step();
  };
  return { ...r, deployed, packets, step, until, untilShots };
}

/** Real troop deployments and, optionally, an actual Archer-lured Castle release. */
export function flameFlingerBurstRecording(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  target: NativeDirectTarget = 'storage',
) {
  const r = flameFlingerBurstBattle(level, version, x, target),
    snapshots: { at: number; battle: Battle }[] = [];
  for (const offset of [0.05, 0.75, 2.5, 4.5, 4.7, 4.85, 6, 9.85, 10.2, 12]) {
    r.until(r.deployed + offset);
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
  }
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    deployed: r.deployed,
    packets: r.packets,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
