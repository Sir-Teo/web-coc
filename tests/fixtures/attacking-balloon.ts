import { makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { nativeDirectBattle, nativeDirectRecording } from './native-direct-attacks';

export const balloonRecording = (version = REPLAY_VERSION, level = 1, guard = false) =>
  nativeDirectRecording('balloon', 190, version, level, guard, 0.3);

/** Real Ice Block holds the first charge or recovery without changing the blast clock. */
export function balloonIceBlockRecording(level = 1, version = REPLAY_VERSION) {
  const r = nativeDirectBattle('balloon', level, version, 11.4, 'cannon', { iceblock: 1 }),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  r.model.activeSpell = 'iceblock';
  if (!r.model.castSpell(r.unit.x, r.unit.y)) throw Error('Balloon Ice Block failed');
  const cast = r.battle.nativeSpells![0],
    born = snapshot();
  r.until(cast.firstHit - 0.05);
  const before = snapshot();
  r.until(cast.firstHit + 0.3);
  const frozen = snapshot();
  r.until(4.05);
  const held = snapshot();
  r.until(cast.firstHit + 7.05);
  const thawed = snapshot();
  r.until(cast.firstHit + 10.2);
  const after = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    born,
    before,
    frozen,
    held,
    thawed,
    after,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}

/** Real Monolith fire defeats the Balloon; its delayed blast needs no attack timer. */
export function balloonDeathRecording(level = 1, version = REPLAY_VERSION) {
  const r = nativeDirectBattle(
      'balloon',
      level,
      version,
      11.4,
      'monolith',
      {},
      {
        extraBuildings: [makeBuilding(3, 'monolith', 18, 10, 1)],
      },
    ),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (r.unit.hp > 0) r.step();
  const died = snapshot(),
    blast = r.battle.nativeDeaths?.find((b) => b.sourceId === r.unit.id);
  if (version >= 190 && !blast) throw Error('Balloon did not queue death damage');
  if (blast) r.until(blast.at - 0.05);
  const before = snapshot();
  if (blast) r.until(blast.at);
  const exploded = snapshot();
  r.until((blast?.at ?? died) + 0.5);
  const after = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    born,
    died,
    before,
    exploded,
    after,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
