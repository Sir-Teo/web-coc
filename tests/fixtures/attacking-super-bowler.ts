import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { Battle } from '../../src/game/model';
import type { CombatProjectile } from '../../src/game/projectiles';
import { isGarrisonDefender } from '../../src/game/defenders';
import { nativeDirectBattle } from './native-direct-attacks';

/** Root packets identify historical defender arrows, which have no native attack counter. */
export function superBowlerRecording(
  version = REPLAY_VERSION,
  level = 1,
  target: 'storage' | 'cannon' | 'golem' = 'storage',
) {
  const guard = target === 'golem',
    r = nativeDirectBattle(
      'superbowler',
      level,
      version,
      guard ? 6.9 : 18.6,
      guard ? 'garrison' : target,
      guard ? { freeze: 1 } : {},
      guard
        ? {
            spellLevels: { freeze: 7 },
            beforeDeploy: ({ model, battle, step }) => {
              const d = battle.defenders!.find(isGarrisonDefender)!;
              model.activeSpell = 'freeze';
              if (!model.castSpell(d.x, d.y)) throw Error('Super Bowler guard Freeze failed');
              const cast = battle.nativeSpells!.at(-1)!;
              while (battle.elapsed < cast.firstHit + 0.05 - 1e-9) step();
              if ((d.frozenUntil ?? 0) <= battle.elapsed)
                throw Error('Super Bowler guard Freeze missed');
              model.activeSpell = null;
            },
          }
        : { buildingLevel: target === 'cannon' && level >= 8 ? 14 : undefined },
    ),
    snapshots: { at: number; battle: Battle }[] = [],
    packets = new Map<string, CombatProjectile>();
  const capture = () => {
    for (const p of r.battle.projectiles ?? [])
      if (p.sourceId === r.unit.id && !packets.has(p.id)) packets.set(p.id, structuredClone(p));
  };
  const step = () => {
    r.step();
    capture();
  };
  const until = (at: number) => {
    while (r.battle.elapsed < at - 1e-9) step();
  };
  const roots = () => [...packets.values()].filter((p) => !p.native?.bounce);
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (!r.unit.attacking) step();
  const engaged = snapshot();
  let charged: number | undefined;
  if (version >= 201) {
    until(engaged + 0.15);
    charged = snapshot();
  }
  while (!roots().length) step();
  const first = snapshot(),
    shot = structuredClone(roots()[0]),
    defenderId = r.unit.defenderTarget;
  step();
  const flight = snapshot();
  until(shot.impact);
  const impact = snapshot();
  while (r.battle.projectiles?.some((p) => p.sourceId === r.unit.id)) step();
  const landed = snapshot(),
    firstPackets = [...packets.values()].map((p) => structuredClone(p));
  while (roots().length < 2) step();
  const second = snapshot(),
    next = structuredClone(roots()[1]);
  until(next.impact);
  const secondImpact = snapshot();
  while (r.battle.projectiles?.some((p) => p.sourceId === r.unit.id)) step();
  const secondLanded = snapshot();
  step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    defenderId,
    born,
    engaged,
    charged,
    first,
    flight,
    impact,
    landed,
    second,
    secondImpact,
    secondLanded,
    shot,
    firstPackets,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
