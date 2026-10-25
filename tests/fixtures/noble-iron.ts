import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { heroStatsFor } from '../../src/game/native-heroes';
import type { CombatProjectile } from '../../src/game/projectiles';
import { rocketSpearBattle } from './rocket-spear';

export function nobleIronBattle(level = 1, version = REPLAY_VERSION, recall = false) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...[0, 1, 2, 3].flatMap((x) =>
      [0, 1].map((y) => makeBuilding(2 + x * 2 + y, 'cannon', 14 + x * 5, 5 + y * 5, 21)),
    ),
  ];
  model.state.nextId = 1000;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), ...(recall ? { recall: 1 } : {}) };
  model.state.spellLevels = defaultSpellLevels();
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.version = version;
  recording.initial.heroes = [{ kind: 'prince', level: 1, items: [{ slug: 'noble-iron', level }] }];
  model.battle = replayBattle(recording.initial, version);
  if (!model.deployNativeHero('prince', 5, 6.5)) throw Error('Noble Iron Prince deployment failed');
  const battle = model.battle;
  const hero = battle.nativeHeroes![0];
  const unit = battle.units.find((u) => u.id === hero.unitId)!;
  return { model, battle, hero, unit, base: heroStatsFor(hero, 18) };
}

export function nobleIronRecording(level = 1) {
  const { model, battle, hero, unit, base } = nobleIronBattle(level);
  const shots: CombatProjectile[] = [];
  model.onEffect = (effect) => {
    if (effect.type === 'projectile' && effect.sourceId === unit.id)
      shots.push(
        JSON.parse(JSON.stringify(battle.projectiles!.find((p) => p.id === effect.projectileId)!)),
      );
  };
  const count = unit.native!.effects!.extraDamage!.hits!;
  const bonus = unit.native!.effects!.extraDamage!.amount;
  const step = () => {
    if (battle.elapsed > 40 || battle.finished || unit.hp <= 0)
      throw Error('Noble Iron checkpoint was not reached');
    model.step(0.05);
  };
  while (!shots.length) step();
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  while (battle.elapsed < shots[0].launched + 0.1 - 1e-9) step();
  snapshot();
  const flight = battle.elapsed;
  while (shots.length < count) step();
  while (battle.elapsed < shots[count - 1].launched + 0.05 - 1e-9) step();
  snapshot();
  const last = battle.elapsed;
  while (shots.length <= count) step();
  while (battle.elapsed < shots[count].launched + 0.05 - 1e-9) step();
  snapshot();
  const ordinary = battle.elapsed;
  if (hero.abilityUsed) throw Error('Noble Iron spent the ability button');
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    shots,
    flight,
    last,
    ordinary,
    count,
    bonus,
    baseDamage: base.damage,
    unitId: unit.id,
  };
}

/** A real Recall and redeployment preserves the remaining charged attack effect. */
export function chargedHeroRecallRecording(kind: 'prince' | 'champion') {
  const result =
    kind === 'prince'
      ? nobleIronBattle(1, REPLAY_VERSION, true)
      : rocketSpearBattle(1, REPLAY_VERSION, [], true);
  const { model, battle, hero, unit, base } = result;
  if (kind === 'champion' && !model.activateNativeHeroAbility(kind))
    throw Error('Rocket Recall activation failed');
  const shots: CombatProjectile[] = [];
  model.onEffect = (effect) => {
    if (effect.type === 'projectile' && effect.sourceId === hero.unitId)
      shots.push(
        JSON.parse(JSON.stringify(battle.projectiles!.find((p) => p.id === effect.projectileId)!)),
      );
  };
  const step = () => {
    if (battle.elapsed > 20 || battle.finished)
      throw Error('Charged Recall checkpoint was not reached');
    model.step(0.05);
  };
  while (!shots.length) step();
  model.activeSpell = 'recall';
  if (!model.castSpell(unit.x, unit.y)) throw Error('Charged Hero Recall failed');
  while (hero.unitId !== null) step();
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  snapshot();
  const recalled = battle.elapsed;
  const remaining = hero.recalledAttackExtra!.hits!;
  const bonus = hero.recalledAttackExtra!.amount;
  const oldId = unit.id;
  // Keep the pre-deployment snapshot before the timestamp of the next recorded input.
  step();
  if (!model.deployNativeHero(kind, 5, 6.5)) throw Error('Charged Hero redeployment failed');
  const newId = hero.unitId!;
  const deployed = battle.units.find((u) => u.id === newId)!;
  if (deployed.native?.effects?.extraDamage?.hits !== remaining)
    throw Error('Charged Hero ammunition was not restored');
  step();
  snapshot();
  const redeployed = battle.elapsed;
  while (!shots.some((p) => p.sourceId === newId)) step();
  while (battle.elapsed < shots.find((p) => p.sourceId === newId)!.launched + 0.05 - 1e-9) step();
  snapshot();
  const fired = battle.elapsed;
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    shots,
    recalled,
    redeployed,
    fired,
    remaining,
    bonus,
    oldId,
    newId,
    baseDamage: base.damage,
  };
}
