import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { Battle } from '../../src/game/model';
import { nativeDirectBattle } from './native-direct-attacks';

/** Actual inputs continue past deployment invisibility expiry, with no injected statuses. */
function recordSneaky(r: ReturnType<typeof nativeDirectBattle>, version: number) {
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
  if (version >= 196) {
    r.until(engaged + 0.35);
    charged = snapshot();
    r.untilAttacks(1);
  }
  const first = snapshot(),
    target = r.battle.buildings.find((b) => b.id === 2)!,
    hp = target.hp,
    invisibleUntil = r.unit.native!.effects!.invisibleUntil!;
  if (version >= 196) r.untilAttacks(2);
  else while (target.hp === hp) r.step();
  const second = snapshot();
  r.until(invisibleUntil + 0.05);
  const expired = snapshot();
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
    expired,
    invisibleUntil,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
export const sneakyGoblinRecording = (version = REPLAY_VERSION, level = 1) =>
  recordSneaky(nativeDirectBattle('sneakygoblin', level, version, 18.6), version);

/** Root the last resource and Freeze the Cannon past the actual invisibility deadline. */
export function frozenCannonSneakyGoblinRecording(level = 1, version = REPLAY_VERSION) {
  return recordSneaky(
    nativeDirectBattle(
      'sneakygoblin',
      level,
      version,
      18.6,
      'cannon',
      { overgrowth: 1, freeze: 1 },
      {
        spellLevels: { overgrowth: 1, freeze: 7 },
        beforeDeploy: ({ model, battle, step }) => {
          model.activeSpell = 'overgrowth';
          if (!model.castSpell(38, 38)) throw Error('Sneaky Goblin Overgrowth rejected');
          let cast = battle.nativeSpells!.at(-1)!;
          while (battle.elapsed < cast.firstHit + 0.05 - 1e-9) step();
          if (!(battle.buildingEffects?.[1]?.overgrownUntil! > battle.elapsed))
            throw Error('Sneaky Goblin resource not rooted');
          model.activeSpell = 'freeze';
          if (!model.castSpell(14.5, 11.5)) throw Error('Sneaky Goblin Freeze rejected');
          cast = battle.nativeSpells!.at(-1)!;
          while (battle.elapsed < cast.firstHit + 0.05 - 1e-9) step();
          model.activeSpell = null;
        },
      },
    ),
    version,
  );
}
