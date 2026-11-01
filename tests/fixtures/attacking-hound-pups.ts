import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { Battle } from '../../src/game/model';
import { attackingHoundBattle } from './attacking-hound';

/** The parent actually dies to a Monolith, releasing its normal seeded wave. */
export function attackingHoundPupBattle(
  level = 1,
  version = REPLAY_VERSION,
  ice = false,
  controlled = true,
) {
  const r = attackingHoundBattle(level, version, 17.6, ice, 'monolith');
  while (r.unit.hp > 0) r.step();
  const unit = r.battle.units.filter((u) => u.native?.owner === r.unit.id).at(-1)!;
  if (!unit) throw Error('Hound did not release Pups');
  if (controlled) {
    r.battle.projectiles = r.battle.projectiles?.filter((p) => p.sourceId === unit.id);
    // Isolate this child's damage and prevent the Monolith from killing it mid-charge.
    for (const other of r.battle.units)
      if (other !== unit) (other.native!.effects ??= {}).frozenUntil = 100;
    const defense = r.battle.buildings.find((b) => b.id === 2)!;
    r.battle.buildingEffects ??= {};
    r.battle.buildingEffects[defense.id] = { frozenUntil: 100 };
  }
  const untilAttacks = (count: number) => {
    while ((unit.native?.attacks ?? 0) < count) r.step();
  };
  return { ...r, parent: r.unit, unit, untilAttacks };
}

/** Replay fixture contains only ordinary deployment, death, flight and combat inputs. */
export function attackingHoundPupRecording(level = 1, version = REPLAY_VERSION, ice = false) {
  const r = attackingHoundPupBattle(level, version, ice, false),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (!r.unit.attacking) r.step();
  const engaged = snapshot();
  r.untilAttacks(1);
  const first = snapshot(),
    shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
  if (!shot) throw Error('Pup projectile missing');
  r.until(shot.launched + (shot.impact - shot.launched) / 2);
  const flying = snapshot();
  while (r.battle.projectiles?.some((p) => p.id === shot.id)) r.step();
  const hit = snapshot();
  r.untilAttacks(2);
  const second = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    parentId: r.parent.id,
    kind: r.unit.kind,
    sourceLevel: r.unit.level!,
    born,
    engaged,
    first,
    flying,
    hit,
    second,
    shotId: shot.id,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
