import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { Battle } from '../../src/game/model';
import { isGarrisonDefender } from '../../src/game/defenders';
import { nativeDirectBattle } from './native-direct-attacks';

/** Actual deployments; release, physical crossings and repeat remain separate checkpoints. */
export function superArcherRecording(
  version = REPLAY_VERSION,
  level = 1,
  target: 'storage' | 'cannon' | 'golem' | 'dragon' = 'storage',
) {
  const guard = target === 'golem' || target === 'dragon',
    r = nativeDirectBattle(
      'superarcher',
      level,
      version,
      guard ? 6.9 : 18.6,
      guard ? (target === 'dragon' ? 'air-garrison' : 'garrison') : target,
      guard ? { freeze: 1 } : {},
      guard
        ? {
            spellLevels: { freeze: 7 },
            beforeDeploy: ({ model, battle, step }) => {
              const d = battle.defenders!.find(isGarrisonDefender)!;
              model.activeSpell = 'freeze';
              if (!model.castSpell(d.x, d.y)) throw Error('Super Archer guard Freeze failed');
              const cast = battle.nativeSpells!.at(-1)!;
              while (battle.elapsed < cast.firstHit + 0.05 - 1e-9) step();
              if ((d.frozenUntil ?? 0) <= battle.elapsed)
                throw Error('Super Archer guard Freeze missed');
              model.activeSpell = null;
            },
          }
        : {},
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
  if (version >= 198) {
    r.until(engaged + 0.4);
    charged = snapshot();
  }
  r.untilAttacks(1);
  const first = snapshot(),
    shot = r.battle.nativeArcherShots!.find((s) => s.sourceId === r.unit.id)!,
    shotAtRelease = structuredClone(shot),
    defenderId = r.unit.defenderTarget;
  r.step();
  const flight = snapshot();
  while (!shot.hit.length) r.step();
  const hit = snapshot();
  while (shot.travelled < shot.length - 1e-9) r.step();
  const landed = snapshot();
  r.untilAttacks(2);
  const second = snapshot(),
    next = r.battle.nativeArcherShots!.find(
      (s) => s.sourceId === r.unit.id && s.launched > first + 0.1,
    )!;
  while (!next.hit.length) r.step();
  const secondHit = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    defenderId,
    born,
    engaged,
    charged,
    first,
    flight,
    hit,
    landed,
    second,
    secondHit,
    shot: shotAtRelease,
    hits: structuredClone(shot.hit),
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
