import type { Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { isGarrisonDefender } from '../../src/game/defenders';
import { nativeDirectBattle, nativeDirectRecording } from './native-direct-attacks';
import { heroPuppetBattle } from './hero-puppet';

export const archerRecording = (version = REPLAY_VERSION, level = 1, guard = false) =>
  nativeDirectRecording('archer', 191, version, level, guard, 0.35, 'airdefense');

/** A real Queen activation creates all Archers; no trained Archer is carried. */
export function archerPuppetRecording(item = 1, level = 1, version = REPLAY_VERSION) {
  const r = heroPuppetBattle(
      { kind: 'queen', level: 1, items: [{ slug: 'archer-puppet', level: item }] },
      { archer: level },
      undefined,
      version,
    ),
    snapshots: { at: number; battle: Battle }[] = [];
  if (!r.model.deployNativeHero('queen', 11.4, 11.5) || !r.model.activateNativeHeroAbility('queen'))
    throw Error('Archer Puppet activation failed');
  const unit = r.battle.units.find((u) => u.kind === 'archer')!;
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const step = () => {
    if (r.battle.finished || r.battle.elapsed > 15) throw Error('Archer Puppet checkpoint missing');
    r.model.step(0.05);
  };
  const until = (at: number) => {
    while (r.battle.elapsed < at - 1e-9) step();
  };
  const born = snapshot();
  while (!unit.attacking) step();
  const engaged = snapshot();
  let charged: number | undefined;
  if (version >= 191) {
    until(engaged + 0.35);
    charged = snapshot();
    while (!unit.native?.attacks) step();
  }
  const first = snapshot(),
    shot = structuredClone(r.battle.projectiles!.find((p) => p.sourceId === unit.id)!);
  until(shot.impact);
  const hit = snapshot();
  if (version >= 191) while ((unit.native?.attacks ?? 0) < 2) step();
  else until(first + 1.05);
  const second = snapshot();
  step();
  r.model.finishBattle();
  return {
    id: unit.id,
    defenderId: undefined,
    born,
    engaged,
    charged,
    first,
    hit,
    second,
    shot,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}

/** An Archer lures a real Dragon; actual Freeze lands before the fragile Archer is deployed. */
export function frozenDragonArcherRecording(level = 1, version = REPLAY_VERSION) {
  const r = nativeDirectBattle(
      'archer',
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
          if (!model.castSpell(guard.x, guard.y)) throw Error('Archer Dragon Freeze failed');
          const cast = battle.nativeSpells!.at(-1)!;
          while (battle.elapsed < cast.firstHit + 0.05 - 1e-9) step();
          if ((guard.frozenUntil ?? 0) <= battle.elapsed)
            throw Error('Archer Dragon Freeze missed its target');
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
  if (version >= 191) {
    r.until(engaged + 0.35);
    charged = snapshot();
    r.untilAttacks(1);
  }
  const first = snapshot(),
    guard = r.battle.defenders!.find((d) => d.id === r.unit.defenderTarget)!,
    shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
  r.until(shot.impact);
  const hit = snapshot();
  if (version >= 191) r.untilAttacks(2);
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
