import type { Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { CombatProjectile } from '../../src/game/projectiles';
import { nativeDirectBattle } from './native-direct-attacks';

export function troopLauncherBattle(level = 1, version = REPLAY_VERSION, x = 11.4, friendAt = 1) {
  const r = nativeDirectBattle('trooplauncher', level, version, x),
    packets: CombatProjectile[] = [],
    seen = new Set<string>(),
    seenUnits = new Set<number>(r.battle.units.map((u) => u.id)),
    spawns: { kind: string; level: number; at: number }[] = [];
  let friendsDeployed = false;
  const step = (dt = 0.05) => {
    if (r.battle.finished || r.battle.elapsed > 90)
      throw Error('Troop Launcher checkpoint expired');
    if (!friendsDeployed && r.battle.elapsed >= friendAt - 1e-9) {
      friendsDeployed = true;
      r.model.activeTroop = 'archer';
      if (!r.model.deploy(5, 12) || !r.model.deploy(5.2, 12))
        throw Error('Troop Launcher friendly group deployment failed');
    }
    r.model.step(dt);
    for (const unit of r.battle.units) {
      if (seenUnits.has(unit.id)) continue;
      seenUnits.add(unit.id);
      if (unit.level !== undefined)
        spawns.push({ kind: unit.kind, level: unit.level, at: r.battle.elapsed });
    }
    for (const packet of r.battle.projectiles ?? [])
      if (packet.sourceId === r.unit.id && !seen.has(packet.id)) {
        seen.add(packet.id);
        packets.push(JSON.parse(JSON.stringify(packet)));
      }
  };
  const until = (at: number) => {
    while (r.battle.elapsed < at - 1e-9) step();
  };
  const untilShots = (count: number) => {
    while (packets.length < count) step();
  };
  return { ...r, packets, spawns, step, until, untilShots };
}

/** The parent and its friendly recipients are deployed through recorded player inputs. */
export function troopLauncherRecording(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  friendAt = 1,
) {
  const r = troopLauncherBattle(level, version, x, friendAt),
    snapshots: { at: number; battle: Battle }[] = [];
  for (const at of [0.05, 0.8, 1.2, 2.3, 3.5, 6.3, 9]) {
    r.until(at);
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
  }
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    packets: r.packets,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
