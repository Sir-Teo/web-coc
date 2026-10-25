import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { heroStatsFor, type HeroItemSetup } from '../../src/game/native-heroes';
import type { CombatProjectile } from '../../src/game/projectiles';

export function rocketSpearBattle(
  level = 1,
  version = REPLAY_VERSION,
  extraItems: HeroItemSetup[] = [],
  recall = false,
) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...[0, 1, 2, 3].flatMap((x) =>
      [0, 1].map((y) => makeBuilding(2 + x * 2 + y, 'airdefense', 14 + x * 5, 5 + y * 5, 16)),
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
  recording.initial.heroes = [
    { kind: 'champion', level: 1, items: [{ slug: 'rocket-spear', level }, ...extraItems] },
  ];
  model.battle = replayBattle(recording.initial, version);
  if (!model.deployNativeHero('champion', 5, 6.5))
    throw Error('Rocket Spear Champion deployment failed');
  const battle = model.battle;
  const hero = battle.nativeHeroes![0];
  const unit = battle.units.find((u) => u.id === hero.unitId)!;
  return { model, battle, hero, unit, base: heroStatsFor(hero, 18) };
}

/** Actual charged and ordinary throws, with a portable snapshot on the final charged flight. */
export function rocketSpearRecording(level = 1) {
  const { model, battle, unit, base } = rocketSpearBattle(level);
  const shots: { projectile: CombatProjectile; remaining?: number }[] = [];
  model.onEffect = (effect) => {
    if (effect.type !== 'projectile' || effect.sourceId !== unit.id) return;
    const p = battle.projectiles!.find((p) => p.id === effect.projectileId)!;
    shots.push({
      projectile: JSON.parse(JSON.stringify(p)),
      remaining: unit.native?.effects?.extraDamage?.hits,
    });
  };
  if (!model.activateNativeHeroAbility('champion')) throw Error('Rocket Spear activation failed');
  const initial = unit.native!.effects!.extraDamage!;
  const count = initial.hits!;
  const bonus = initial.amount;
  const step = () => {
    if (battle.elapsed > 40 || battle.finished || unit.hp <= 0)
      throw Error('Rocket Spear checkpoint was not reached');
    model.step(0.05);
  };
  while (!shots.length) step();
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  while (battle.elapsed < shots[0].projectile.launched + 0.1 - 1e-9) step();
  snapshot();
  const flight = battle.elapsed;
  while (shots.length < count) step();
  while (battle.elapsed < shots[count - 1].projectile.launched + 0.05 - 1e-9) step();
  snapshot();
  const last = battle.elapsed;
  while (shots.length <= count) step();
  while (battle.elapsed < shots[count].projectile.launched + 0.05 - 1e-9) step();
  snapshot();
  const ordinary = battle.elapsed;
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    shots,
    snapshots,
    flight,
    last,
    ordinary,
    count,
    bonus,
    baseDamage: base.damage,
    unitId: unit.id,
  };
}
