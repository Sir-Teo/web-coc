import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { Battle } from '../../src/game/model';
import { nativeDirectBattle, nativeDirectRecording } from './native-direct-attacks';

export const goblinRecording = (version = REPLAY_VERSION, level = 1) =>
  nativeDirectRecording('goblin', 193, version, level, false, 0.35, 'storage', 18.6);

/** Real Overgrowth removes the last eligible resource; Freeze protects the fragile Goblin. */
export function frozenCannonGoblinRecording(level = 1, version = REPLAY_VERSION) {
  const r = nativeDirectBattle(
      'goblin',
      level,
      version,
      18.6,
      'cannon',
      { overgrowth: 1, freeze: 1 },
      {
        spellLevels: { overgrowth: 1, freeze: 7 },
        beforeDeploy: ({ model, battle, step }) => {
          model.activeSpell = 'overgrowth';
          if (!model.castSpell(38, 38)) throw Error('Goblin Overgrowth rejected');
          let cast = battle.nativeSpells!.at(-1)!;
          while (battle.elapsed < cast.firstHit + 0.05 - 1e-9) step();
          if (!(battle.buildingEffects?.[1]?.overgrownUntil! > battle.elapsed))
            throw Error('Goblin Town Hall not rooted');
          model.activeSpell = 'freeze';
          if (!model.castSpell(14.5, 11.5)) throw Error('Goblin Freeze rejected');
          cast = battle.nativeSpells!.at(-1)!;
          while (battle.elapsed < cast.firstHit + 0.05 - 1e-9) step();
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
  if (version >= 193) {
    r.until(engaged + 0.35);
    charged = snapshot();
    r.untilAttacks(1);
  }
  const first = snapshot(),
    target = r.battle.buildings.find((b) => b.id === 2)!,
    hp = target.hp;
  if (version >= 193) r.untilAttacks(2);
  else while (target.hp === hp) r.step();
  const second = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    defenderId: undefined,
    born,
    engaged,
    charged,
    first,
    second,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
