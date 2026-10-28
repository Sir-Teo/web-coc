import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { Battle } from '../../src/game/model';
import { isGarrisonDefender } from '../../src/game/defenders';
import { nativeDirectBattle } from './native-direct-attacks';
import { deploymentLifecycleBattle } from './deployment-lifecycle';

/** Separate release and arrival checkpoints, including slow historical fireballs. */
function recordWizard(
  r: Pick<
    ReturnType<typeof nativeDirectBattle>,
    'model' | 'battle' | 'data' | 'unit' | 'step' | 'until' | 'untilAttacks'
  >,
  version: number,
) {
  const snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (!r.unit.attacking) r.step();
  const engaged = snapshot();
  let charged: number | undefined;
  if (version >= 194) {
    r.until(engaged + 0.4);
    charged = snapshot();
    r.untilAttacks(1);
  }
  const first = snapshot(),
    shot = structuredClone(r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!);
  r.until(shot.impact);
  const hit = snapshot();
  if (version >= 194) r.untilAttacks(2);
  else
    while (!r.battle.projectiles?.some((p) => p.sourceId === r.unit.id && p.launched > first + 0.1))
      r.step();
  const second = snapshot(),
    next = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id && p.launched > first + 0.1)!;
  r.until(next.impact);
  const secondHit = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    defenderId: r.unit.defenderTarget,
    born,
    engaged,
    charged,
    first,
    hit,
    second,
    secondHit,
    shot,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}

export const wizardRecording = (version = REPLAY_VERSION, level = 1) =>
  recordWizard(nativeDirectBattle('wizard', level, version, 18.6), version);

/** An actual Archer lure and Freeze protect the Wizard against either Castle layer. */
export function frozenGuardWizardRecording(level = 1, version = REPLAY_VERSION, air = false) {
  return recordWizard(
    nativeDirectBattle(
      'wizard',
      level,
      version,
      6.9,
      air ? 'air-garrison' : 'garrison',
      { freeze: 1 },
      {
        spellLevels: { freeze: 7 },
        beforeDeploy: ({ model, battle, step }) => {
          const guard = battle.defenders!.find(isGarrisonDefender)!;
          model.activeSpell = 'freeze';
          if (!model.castSpell(guard.x, guard.y)) throw Error('Wizard guard Freeze failed');
          const cast = battle.nativeSpells!.at(-1)!;
          while (battle.elapsed < cast.firstHit + 0.05 - 1e-9) step();
          if ((guard.frozenUntil ?? 0) <= battle.elapsed) throw Error('Wizard guard Freeze missed');
          model.activeSpell = null;
        },
      },
    ),
    version,
  );
}

/** The real Siege Barracks releases its own researched Wizard; none is carried. */
export function siegeWizardRecording(barracksLevel = 1, level = 1, version = REPLAY_VERSION) {
  const r = deploymentLifecycleBattle('siegebarracks', barracksLevel, version, 10, {
    wizard: level,
    pekka: 1,
  });
  while (!r.children().some((u) => u.kind === 'wizard')) r.step();
  const unit = r.children().find((u) => u.kind === 'wizard')!;
  return recordWizard(
    {
      ...r,
      unit,
      untilAttacks: (count: number) => {
        while ((unit.native?.attacks ?? 0) < count) r.step();
      },
    },
    version,
  );
}
