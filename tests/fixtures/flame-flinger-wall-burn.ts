import { makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { nativeDirectBattle } from './native-direct-attacks';

/** Both collateral structures sit outside the direct hit but within the ground burn. */
export function flameFlingerBurnBattle(level = 1, version = REPLAY_VERSION, x = 5) {
  return nativeDirectBattle(
    'flameflinger',
    level,
    version,
    x,
    'cannon',
    {},
    {
      buildingLevel: 21,
      extraBuildings: [
        makeBuilding(3, 'wall', 16, 11, 18),
        makeBuilding(4, 'goldstorage', 13, 14, 18),
      ],
    },
  );
}

export function flameFlingerBurnRecording(level = 1, version = REPLAY_VERSION, x = 5) {
  const r = flameFlingerBurnBattle(level, version, x),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  snapshot();
  while (!r.battle.projectiles?.some((p) => p.native?.kind === 'flameflinger')) r.step();
  const launched = snapshot();
  while (!r.battle.nativeSpells?.some((c) => c.name === 'FireSpiritExplosion')) r.step();
  const landed = snapshot();
  while (!r.battle.nativeSpells!.find((c) => c.name === 'FireSpiritExplosion')!.hits) r.step();
  const pulsed = snapshot();
  for (const delay of [0.4, 1.2, 2.4, 4.4]) {
    r.until(pulsed + delay);
    snapshot();
  }
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    launched,
    landed,
    pulsed,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
