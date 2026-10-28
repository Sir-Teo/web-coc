import type { Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { headhunterHeroBattle } from './headhunter-hero-rules';
import { nativeDirectRecording } from './native-direct-attacks';

export const attackingHeadhunterRecording = (
  version = REPLAY_VERSION,
  level = 1,
  guard: boolean | 'air' = false,
) => nativeDirectRecording('headhunter', 181, version, level, guard, 0.25);

/** Actual Freeze, deployment and native card impacts against a defending King or Prince. */
export function chargingHeadhunterHeroRecording(level = 1, air = false, version = REPLAY_VERSION) {
  const { model, battle } = headhunterHeroBattle(level, air, version),
    snapshots: { at: number; battle: Battle }[] = [];
  const step = () => {
    if (battle.finished || battle.elapsed > 8) throw Error('Headhunter Hero checkpoint missing');
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== battle.elapsed)
      snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  model.activeSpell = 'freeze';
  if (!model.castSpell(7.5, 5)) throw Error('Headhunter Hero Freeze failed');
  until(1.6);
  model.activeTroop = 'headhunter';
  if (!model.deploy(5, 5)) throw Error('Headhunter Hero deployment failed');
  const unit = battle.units[0],
    defender = battle.defenders!.find((d) => d.kind === 'hero')!,
    born = snapshot();
  while (!unit.attacking) step();
  const engaged = snapshot();
  let charged: number | undefined;
  if (version >= 181) {
    until(engaged + 0.25);
    charged = snapshot();
  }
  let shot = battle.projectiles?.find((p) => p.sourceId === unit.id);
  while (!shot) {
    step();
    shot = battle.projectiles?.find((p) => p.sourceId === unit.id);
  }
  const first = snapshot(),
    shotId = shot.id;
  until(shot.impact + 0.05);
  const hit = snapshot();
  until(first + 0.65);
  const repeated = snapshot();
  step();
  model.finishBattle();
  return {
    id: unit.id,
    defenderId: defender.id,
    born,
    engaged,
    charged,
    first,
    hit,
    repeated,
    shotId,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
