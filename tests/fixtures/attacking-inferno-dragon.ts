import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { Battle } from '../../src/game/model';
import { isGarrisonDefender } from '../../src/game/defenders';
import { nativeDirectBattle } from './native-direct-attacks';

/** Real deployments and Freeze casts retain each beam stage in both target namespaces. */
export function infernoDragonRecording(
  version = REPLAY_VERSION,
  level = 1,
  target: 'storage' | 'golem' | 'dragon' = 'storage',
  deployX = 11.4,
) {
  const guard = target !== 'storage',
    r = nativeDirectBattle(
      'infernodragon',
      level,
      version,
      guard ? 6.9 : deployX,
      target === 'dragon' ? 'air-garrison' : guard ? 'garrison' : 'storage',
      guard ? { freeze: 1 } : {},
      guard
        ? {
            spellLevels: { freeze: 7 },
            beforeDeploy: ({ model, battle, step }) => {
              const lure = battle.units[0];
              while (battle.projectiles?.some((p) => p.sourceId === lure.id)) step();
              const d = battle.defenders!.find(isGarrisonDefender)!;
              model.activeSpell = 'freeze';
              if (!model.castSpell(d.x, d.y)) throw Error('Inferno Dragon guard Freeze failed');
              const cast = battle.nativeSpells!.at(-1)!;
              while (battle.elapsed < cast.firstHit + 0.05 - 1e-9) step();
              if ((d.frozenUntil ?? 0) <= battle.elapsed)
                throw Error('Inferno Dragon guard Freeze missed');
              model.activeSpell = null;
            },
          }
        : {},
    ),
    victim = guard
      ? r.battle.defenders!.find(isGarrisonDefender)!
      : r.battle.buildings.find((b) => b.id === 2)!,
    snapshots: { at: number; battle: Battle }[] = [],
    hits: { at: number; damage: number }[] = [];
  let previous = victim.hp;
  const step = () => {
    r.step();
    if (victim.hp < previous) hits.push({ at: r.battle.elapsed, damage: previous - victim.hp });
    previous = victim.hp;
  };
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (!hits.length) step();
  const first = snapshot();
  while (hits.length < 2) step();
  const second = snapshot();
  while (hits.at(-1)!.at - first < 1.7 - 1e-9) step();
  const middle = snapshot();
  while (hits.at(-1)!.at - first < 3.2 - 1e-9) step();
  const maximum = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    defenderId: guard ? victim.id : undefined,
    born,
    first,
    second,
    middle,
    maximum,
    hits,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
