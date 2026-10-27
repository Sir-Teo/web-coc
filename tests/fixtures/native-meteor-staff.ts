import { seconds } from '../../src/game/native-data';
import { heroAbilities } from '../../src/game/native-heroes';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { meteorStaffBattle } from './meteor-staff';

/** A moving Prince casts while the nearest Cannon is invisible; optional Recall lands during his aura. */
export function nativeMeteorStaffRecording(level = 1, recall = false, version = REPLAY_VERSION) {
  const r = meteorStaffBattle(level, version, false, recall),
    { model, battle, unit, until } = r;
  const ability = heroAbilities(r.hero).find((ability) => ability.name === 'MPMeteorStaff')!;
  const cooldown = seconds(ability.row, 'ActivationCooldown');
  until(cooldown - 1.75);
  model.activeSpell = 'invisibility';
  if (!model.castSpell(14.5, 11.5)) throw Error('Meteor Staff presentation Invisibility failed');
  if (recall) {
    until(cooldown - 0.75);
    model.activeSpell = 'recall';
    if (!model.castSpell(unit.x, unit.y)) throw Error('Meteor Staff presentation Recall failed');
  }
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () => {
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  until(cooldown - 0.05);
  const before = snapshot();
  until(cooldown + 0.05);
  const cast = battle.nativeSpells!.find((cast) => cast.name === 'MPMeteorStaffSpell')!;
  if (!cast) throw Error('Meteor Staff did not cast');
  until(cast.castAt + 0.05);
  const activation = snapshot();
  const times = {
    attached: cast.castAt + 0.25,
    fall: cast.castAt + 0.45,
    impact: cast.castAt + 0.95,
    damage: cast.castAt + 1.15,
    tail: cast.castAt + 3,
    after: cast.castAt + 3.8,
  };
  for (const key of Object.keys(times) as (keyof typeof times)[]) {
    until(times[key]);
    times[key] = snapshot();
  }
  model.step(0.05);
  model.finishBattle();
  return {
    level,
    recall,
    unitId: unit.id,
    castId: cast.id,
    castAt: cast.castAt,
    firstHit: cast.firstHit,
    visualImpact: cast.castAt + 0.8,
    before,
    activation,
    ...times,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
