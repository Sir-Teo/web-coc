import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { Battle } from '../../src/game/model';
import { nativeDirectBattle } from './native-direct-attacks';

export function superHogRecallBattle(level = 1, version = REPLAY_VERSION, armed = false) {
  return nativeDirectBattle('superhogrider', level, version, 11.4, armed ? 'monolith' : 'storage', {
    recall: 3,
    freeze: 1,
  });
}

/** A Monolith defeats the parent. Recall returns the halves; a real Freeze protects redeployment. */
export function superHogRecallRecording(level = 1, version = REPLAY_VERSION) {
  const r = superHogRecallBattle(level, version, true),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  while (r.unit.hp > 0) r.step();
  const died = snapshot(),
    shot = r.battle.projectiles!.find((p) => p.native?.superHogSplit)!;
  r.until(shot.impact);
  const landed = snapshot(),
    hog = r.battle.units.find((u) => u.kind === 'superhog')!,
    rider = r.battle.units.find((u) => u.kind === 'superrider')!;
  r.step();
  r.model.activeSpell = 'recall';
  if (!r.model.castSpell((hog.x + rider.x) / 2, (hog.y + rider.y) / 2))
    throw Error('Split Recall cast failed');
  let recalled: number | undefined,
    waiting: number | undefined,
    returned: number | undefined,
    first: number | undefined,
    hogId: number | undefined,
    riderId: number | undefined;
  if (version >= 179) {
    while (r.battle.units.some((u) => u.id === hog.id || u.id === rider.id)) r.step();
    recalled = snapshot();
    r.until(r.battle.elapsed + 1);
    waiting = snapshot();
    r.step();
    r.model.activeSpell = 'freeze';
    if (!r.model.castSpell(14.5, 11.5)) throw Error('Split redeploy Freeze failed');
    const freeze = r.battle.nativeSpells!.find((c) => c.name === 'Freeze')!;
    r.until(freeze.firstHit + 0.05);
    r.model.activeSpell = null;
    r.model.activeTroop = 'superhog';
    if (!r.model.deploy(11.4, 11.5)) throw Error('Recalled Hog deployment failed');
    hogId = r.battle.units.at(-1)!.id;
    r.model.activeTroop = 'superrider';
    if (!r.model.deploy(11.4, 12)) throw Error('Recalled Rider deployment failed');
    riderId = r.battle.units.at(-1)!.id;
    returned = snapshot();
    while (
      !r.battle.units
        .filter((u) => u.id === hogId || u.id === riderId)
        .every((u) => (u.native?.attacks ?? 0) > 0)
    )
      r.step();
    first = snapshot();
  } else {
    r.until(r.battle.elapsed + 1.2);
    snapshot();
  }
  if (!r.battle.finished) {
    r.step();
    r.model.finishBattle();
  }
  return {
    id: r.unit.id,
    oldHogId: hog.id,
    oldRiderId: rider.id,
    hogId,
    riderId,
    died,
    landed,
    recalled,
    waiting,
    returned,
    first,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
