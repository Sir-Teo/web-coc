import type { Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { isGarrisonDefender } from '../../src/game/defenders';
import { nativeDirectBattle, nativeDirectRecording } from './native-direct-attacks';

export const minionRecording = (version = REPLAY_VERSION, level = 1, guard = false) =>
  nativeDirectRecording('minion', 188, version, level, guard, 0.35);

/** An Archer lures a real Dragon; actual Freeze lands before the fragile Minion is deployed. */
export function frozenDragonMinionRecording(level = 1, version = REPLAY_VERSION) {
  const r = nativeDirectBattle(
      'minion',
      level,
      version,
      6.9,
      'air-garrison',
      { freeze: 1 },
      {
        spellLevels: { freeze: 7 },
        beforeDeploy: ({ model, battle, step }) => {
          const guard = battle.defenders!.find(isGarrisonDefender)!;
          model.activeSpell = 'freeze';
          if (!model.castSpell(guard.x, guard.y)) throw Error('Minion Dragon Freeze failed');
          const cast = battle.nativeSpells!.at(-1)!;
          while (battle.elapsed < cast.firstHit + 0.05 - 1e-9) step();
          if ((guard.frozenUntil ?? 0) <= battle.elapsed)
            throw Error('Minion Dragon Freeze missed its target');
          model.activeSpell = null;
        },
      },
    ),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (!r.unit.attacking) r.step();
  const engaged = snapshot();
  let charged: number | undefined;
  if (version >= 188) {
    r.until(engaged + 0.35);
    charged = snapshot();
    r.untilAttacks(1);
  }
  const first = snapshot(),
    guard = r.battle.defenders!.find((d) => d.id === r.unit.defenderTarget)!,
    shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
  r.until(shot.impact);
  const hit = snapshot();
  if (version >= 188) r.untilAttacks(2);
  else r.until(first + 1.05);
  const second = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    defenderId: guard.id,
    born,
    engaged,
    charged,
    first,
    hit,
    second,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
