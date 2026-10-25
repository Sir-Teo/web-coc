import { defenderPoisonTintRecording, type PoisonTintKind } from './defender-poison-tint';
import { seconds } from '../../src/game/native-data';
import { spellRow } from '../../src/game/native-spells';
import type { ReplayData } from '../../src/game/replay';

/** Reuse the four recorded defender setups with a Freeze input in place of Poison. */
export function defenderFreezeTintRecording(kind: PoisonTintKind) {
  const base = defenderPoisonTintRecording(kind);
  const data = JSON.parse(JSON.stringify(base.data)) as ReplayData;
  const cast = data.actions.find((action) => action.type === 'spell' && action.kind === 'poison');
  if (!cast || cast.type !== 'spell') throw Error('Missing recorded Poison input');
  cast.kind = 'freeze';
  data.initial.spells.poison--;
  data.initial.spells.freeze++;
  data.initial.spellLevels!.freeze = 1;
  const row = spellRow('Freeze', 1);
  const firstHit =
    data.steps.slice(0, cast.step).reduce((sum, step) => sum + step, 0) +
    seconds(row, 'DeployTimeMS') +
    seconds(row, 'ChargingTimeMS') +
    seconds(row, 'HitTimeMS');
  return {
    data,
    defenderId: base.defenderId,
    frozen: firstHit + 0.15,
    expired: firstHit + seconds(row, 'FreezeTimeMS') + 0.15,
  };
}
