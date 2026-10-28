import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { Battle } from '../../src/game/model';
import { makeBuilding } from '../../src/game/model';
import { isGarrisonDefender } from '../../src/game/defenders';
import { nativeDirectBattle } from './native-direct-attacks';

export function superWizardRecording(
  version = REPLAY_VERSION,
  level = 1,
  target: 'storage' | 'cannon' | 'golem' | 'dragon' = 'storage',
) {
  const guard = target === 'golem' || target === 'dragon',
    r = nativeDirectBattle(
      'superwizard',
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
              if (!model.castSpell(d.x, d.y)) throw Error('Super Wizard guard Freeze failed');
              const cast = battle.nativeSpells!.at(-1)!;
              while (battle.elapsed < cast.firstHit + 0.05 - 1e-9) step();
              if ((d.frozenUntil ?? 0) <= battle.elapsed)
                throw Error('Super Wizard guard Freeze missed');
              model.activeSpell = null;
            },
          }
        : { buildingLevel: target === 'cannon' && level >= 8 ? 14 : undefined },
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
  if (version >= 199) {
    r.until(engaged + 0.4);
    charged = snapshot();
  }
  r.untilAttacks(1);
  const first = snapshot(),
    defenderId = r.unit.defenderTarget,
    primary = structuredClone(
      r.battle.nativeSuperWizardZaps!.find((z) => z.sourceId === r.unit.id)!,
    );
  r.step();
  const visible = snapshot();
  r.until(first + 0.15);
  const branched = snapshot();
  r.until(first + 0.2);
  const recovery = snapshot();
  r.until(first + 0.55);
  const repeat = snapshot();
  r.until(first + 0.9);
  const nextCharge = snapshot();
  r.untilAttacks(2);
  const second = snapshot();
  r.until(second + 0.15);
  const secondBranched = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    defenderId,
    born,
    engaged,
    charged,
    first,
    visible,
    branched,
    recovery,
    repeat,
    nextCharge,
    second,
    secondBranched,
    primary,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}

/** The real spell arrives between the primary at 1.5 and the committed branches at 1.628. */
export function angrySuperWizardBranchesRecording(level = 1, version = 199) {
  const r = nativeDirectBattle(
      'superwizard',
      1,
      version,
      11.4,
      'storage',
      { angry: 1 },
      {
        spellLevels: { angry: level },
        extraBuildings: [
          makeBuilding(3, 'cannon', 22, 10, 1),
          makeBuilding(4, 'builder', 16, 10, 1),
        ],
      },
    ),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  snapshot();
  r.step();
  r.model.activeSpell = 'angry';
  if (!r.model.castSpell(r.unit.x, r.unit.y)) throw Error('Super Wizard Angry Spell failed');
  snapshot();
  const cast = r.battle.nativeSpells!.at(-1)!;
  r.untilAttacks(1);
  const first = snapshot();
  r.until(cast.firstHit);
  const impact = snapshot();
  r.until(first + 0.15);
  const branched = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    first,
    impact,
    branched,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
