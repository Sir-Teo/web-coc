import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';
import { nativeDirectRecording, nativeDirectBattle } from './native-direct-attacks';
import { isGarrisonDefender } from '../../src/game/defenders';
import { makeBuilding, type Battle } from '../../src/game/model';
import { heroPuppetBattle } from './hero-puppet';

export const barbarianRecording = (version = REPLAY_VERSION, level = 1) =>
  nativeDirectRecording('swordsman', 192, version, level, false, 0.35, 'storage', 18.6);

/** A real Archer lure and Freeze keep the melee Barbarian alive against the Castle Golem. */
export function frozenGolemBarbarianRecording(level = 1, version = REPLAY_VERSION) {
  const r = nativeDirectBattle(
      'swordsman',
      level,
      version,
      6.9,
      'garrison',
      { freeze: 1 },
      {
        spellLevels: { freeze: 7 },
        beforeDeploy: ({ model, battle, step }) => {
          const guard = battle.defenders!.find(isGarrisonDefender)!;
          model.activeSpell = 'freeze';
          if (!model.castSpell(guard.x, guard.y)) throw Error('Barbarian Golem Freeze failed');
          const cast = battle.nativeSpells!.at(-1)!;
          while (battle.elapsed < cast.firstHit + 0.05 - 1e-9) step();
          if ((guard.frozenUntil ?? 0) <= battle.elapsed)
            throw Error('Barbarian Golem Freeze missed');
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
  if (version >= 192) {
    r.until(engaged + 0.35);
    charged = snapshot();
    r.untilAttacks(1);
  }
  const first = snapshot(),
    guard = r.battle.defenders!.find((d) => d.id === r.unit.defenderTarget)!,
    hp = guard.hp;
  if (version >= 192) r.untilAttacks(2);
  else while (guard.hp === hp) r.step();
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
    second,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}

/** Manual King activation, source waves and given boosts; no trained Barbarian is carried. */
export function barbarianPuppetBattle(item = 1, level = 1, version = REPLAY_VERSION) {
  const r = heroPuppetBattle(
    { kind: 'king', level: 1, items: [{ slug: 'barbarian-puppet', level: item }] },
    { swordsman: level },
    undefined,
    version,
  );
  r.data.initial.buildings.push(
    makeBuilding(3, 'goldstorage', 20, 10, 18),
    makeBuilding(4, 'goldstorage', 28, 10, 18),
  );
  r.battle = r.model.battle = replayBattle(r.data.initial, version);
  if (!r.model.deployNativeHero('king', 11.4, 11.5) || !r.model.activateNativeHeroAbility('king'))
    throw Error('Barbarian Puppet activation failed');
  const unit = r.battle.units.find((u) => u.kind === 'swordsman')!;
  return { ...r, unit };
}

export function barbarianPuppetRecording(item = 1, level = 1, version = REPLAY_VERSION) {
  const r = barbarianPuppetBattle(item, level, version),
    snapshots: { at: number; battle: Battle }[] = [];
  const releases = new Map<number, { at: number; damage: number; targetId: number }>();
  const bornIds = new Set(r.battle.units.filter((u) => u.kind === 'swordsman').map((u) => u.id));
  let lastDamage: { damage: number; targetId: number } | undefined;
  const damage = r.model.damage.bind(r.model);
  r.model.damage = (target, amount, ...rest) => {
    lastDamage = { damage: amount, targetId: target.id };
    return damage(target, amount, ...rest);
  };
  r.model.onEffect = (e) => {
    if (
      e.type === 'hit' &&
      e.sourceId !== undefined &&
      bornIds.has(e.sourceId) &&
      !releases.has(e.sourceId) &&
      e.targetId === lastDamage?.targetId
    )
      releases.set(e.sourceId!, { at: r.battle.elapsed, ...lastDamage! });
  };
  const snapshot = () => {
      if (snapshots.at(-1)?.at !== r.battle.elapsed)
        snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
      return r.battle.elapsed;
    },
    step = () => {
      if (r.battle.finished || r.battle.elapsed > 15)
        throw Error('Barbarian Puppet checkpoint missing');
      r.model.step(0.05);
    },
    until = (at: number) => {
      while (r.battle.elapsed < at - 1e-9) step();
    };
  const born = snapshot();
  while (!r.battle.units.some((u) => bornIds.has(u.id) && u.attacking)) step();
  r.unit = r.battle.units.find((u) => bornIds.has(u.id) && u.attacking)!;
  const engaged = snapshot();
  let charged: number | undefined;
  if (version >= 192) {
    until(engaged + 0.35);
    charged = snapshot();
  }
  while (!releases.has(r.unit.id)) step();
  const first = snapshot();
  until(Math.max(4.05, first));
  const fullStock = snapshot();
  step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    defenderId: undefined,
    born,
    engaged,
    charged,
    first,
    fullStock,
    release: releases.get(r.unit.id)!,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
