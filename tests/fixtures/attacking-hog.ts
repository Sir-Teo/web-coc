import { emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';
import { hurtUnit } from '../../src/game/native-status';
import { hogPuppetLevel, type HogAttackKind } from '../../src/game/native-hog-attacks';
import { nativeDirectBattle, nativeDirectRecording } from './native-direct-attacks';
import { superHogSplitBattle } from './super-hog-split';

/** Controlled isolated melee bodies; split halves originate in the real death/arrival paths. */
export function attackingHogBattle(
  kind: HogAttackKind = 'hogrider',
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
) {
  const r = nativeDirectBattle(kind === 'hogrider' ? kind : 'superhogrider', level, version, x);
  let unit = r.unit;
  if (kind === 'superhog' || kind === 'superrider') {
    r.step();
    hurtUnit(r.battle, r.unit, r.unit.maxHp);
    r.step();
    const hog = r.battle.units.find((u) => u.kind === 'superhog')!;
    hog.native!.effects = { frozenUntil: 100 };
    const impact = r.battle.projectiles!.find((p) => p.native?.superHogSplit)!.impact;
    r.until(impact);
    const halves = r.battle.units.filter((u) => u.kind === 'superhog' || u.kind === 'superrider');
    unit = halves.find((u) => u.kind === kind)!;
    for (const child of halves) child.native!.effects = { frozenUntil: child === unit ? 0 : 100 };
    // Start each approach at the same point after both actual arrivals have completed.
    Object.assign(unit, {
      x,
      y: 11.5,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
    });
    delete unit.native!.attackWindup;
    unit.native!.attacks = 0;
    delete unit.native!.lastAttackAt;
  }
  const untilAttacks = (count: number) => {
    while ((unit.native?.attacks ?? 0) < count) r.step();
  };
  return { ...r, unit, untilAttacks };
}

export const attackingHogRecording = (
  kind: 'hogrider' | 'superhogrider',
  level = 1,
  version = REPLAY_VERSION,
) => nativeDirectRecording(kind, 177, version, level);

/** Actual Monolith defeat followed by both source halves' first independent attack. */
export function attackingHogHalvesRecording(level = 1, version = REPLAY_VERSION) {
  const r = superHogSplitBattle(level, version, true),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  while (r.unit.hp > 0) r.step();
  const died = snapshot();
  const shot = r.battle.projectiles!.find((p) => p.native?.superHogSplit)!;
  r.until(shot.impact);
  const landed = snapshot(),
    hog = r.battle.units.find((u) => u.kind === 'superhog')!,
    rider = r.battle.units.find((u) => u.kind === 'superrider')!;
  const first = new Map<number, number>();
  for (const unit of [hog, rider]) if (unit.native?.attacks) first.set(unit.id, r.battle.elapsed);
  while (first.size < 2) {
    r.step();
    for (const unit of [hog, rider])
      if (unit.native?.attacks && !first.has(unit.id)) {
        first.set(unit.id, snapshot());
      }
  }
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    hogId: hog.id,
    riderId: rider.id,
    died,
    landed,
    first: Object.fromEntries(first),
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}

/** A Champion carries only the Puppet; every Hog comes from recorded manual activation. */
export function hogPuppetRecording(itemLevel = 1, version = REPLAY_VERSION, carriedHog = false) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'goldstorage', 13, 10, 18),
  ];
  model.state.army = { ...emptyArmy(), archer: 1, ...(carriedHog ? { hogrider: 1 } : {}) };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [
    { kind: 'champion', level: 1, items: [{ slug: 'hog-rider-puppet', level: itemLevel }] },
  ];
  const battle = (model.battle = replayBattle(data.initial, version));
  if (
    !model.deployNativeHero('champion', 11.4, 11.5) ||
    !model.activateNativeHeroAbility('champion')
  )
    throw Error('Hog Puppet manual deployment/activation failed');
  const heroId = battle.nativeHeroes![0].unitId!,
    snapshots: { at: number; battle: Battle }[] = [],
    spawns: { id: number; at: number; level: number }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== battle.elapsed)
      snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  const step = () => {
    if (battle.finished || battle.elapsed > 15) throw Error('Hog Puppet checkpoint missing');
    model.step(0.05);
    for (const u of battle.units)
      if (u.kind === 'hogrider' && !spawns.some((s) => s.id === u.id)) {
        spawns.push({ id: u.id, at: u.spawnedAt!, level: u.level! });
        snapshot();
      }
  };
  const born = snapshot();
  const unit = battle.units.find((u) => u.kind === 'hogrider')!;
  while (!unit.attacking) step();
  const engaged = snapshot();
  let charged: number | undefined;
  if (version >= 177) {
    while (battle.elapsed < engaged + 0.45 - 1e-9) step();
    charged = snapshot();
    while (!unit.native?.attacks) step();
  }
  const first = snapshot(),
    hp = battle.buildings.find((b) => b.id === 2)!.hp;
  if (version >= 177) while ((unit.native?.attacks ?? 0) < 2) step();
  else while (battle.elapsed < first + 1 - 1e-9) step();
  const second = snapshot();
  step();
  model.finishBattle();
  return {
    id: unit.id,
    heroId,
    born,
    engaged,
    charged,
    first,
    second,
    hp,
    spawns,
    level: hogPuppetLevel(data.initial.heroes!),
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
