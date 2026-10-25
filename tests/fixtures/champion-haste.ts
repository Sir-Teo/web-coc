import { emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { heroStatsFor } from '../../src/game/native-heroes';
import type { CombatProjectile } from '../../src/game/projectiles';

export function championHasteBattle(level = 18, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...[0, 1, 2].flatMap((x) =>
      [0, 1].map((y) => makeBuilding(2 + x * 2 + y, 'airdefense', 8 + x * 5, 5 + y * 5, 16)),
    ),
  ];
  model.state.nextId = 1000;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.version = version;
  recording.initial.heroes = [
    { kind: 'champion', level: 1, items: [{ slug: 'haste-vial', level }] },
  ];
  model.battle = replayBattle(recording.initial, version);
  if (!model.deployNativeHero('champion', 5, 6.5)) throw Error('Haste Champion deployment failed');
  const battle = model.battle;
  const hero = battle.nativeHeroes![0];
  const unit = battle.units.find((u) => u.id === hero.unitId)!;
  return { model, battle, hero, unit, base: heroStatsFor(hero, 18) };
}

/** Real Haste input and attacks across activation and expiry, with harmless ground targets. */
export function championHasteRecording(level = 18) {
  const { model, battle, hero, unit, base } = championHasteBattle(level);
  const shots: { projectile: CombatProjectile; cooldown: number; boosted: boolean }[] = [];
  model.onEffect = (effect) => {
    if (effect.type !== 'projectile' || effect.sourceId !== unit.id) return;
    const shot = battle.projectiles!.find((p) => p.id === effect.projectileId)!;
    shots.push({
      projectile: JSON.parse(JSON.stringify(shot)),
      cooldown: unit.cooldown,
      boosted: (unit.native?.effects?.attackInterval?.until ?? 0) > battle.elapsed + 1e-9,
    });
  };
  if (!model.activateNativeHeroAbility('champion')) throw Error('Haste activation failed');
  const override = unit.native!.effects!.attackInterval!;
  const until = (at: number) => {
    for (let remaining = 400; battle.elapsed < at - 1e-9; remaining--) {
      if (!remaining || battle.finished || unit.hp <= 0)
        throw Error('Haste checkpoint was not reached');
      model.step(0.05);
    }
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  for (let remaining = 100; !shots.length; remaining--) {
    if (!remaining || battle.finished) throw Error('Haste Champion did not fire');
    model.step(0.05);
  }
  until(shots[0].projectile.launched + 0.15);
  snapshot();
  const active = battle.elapsed;
  until(2);
  snapshot();
  until(override.until + 0.1);
  snapshot();
  const expired = battle.elapsed;
  until(override.until + 2);
  snapshot();
  const normal = battle.elapsed;
  until(normal + 0.1);
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    shots,
    active,
    expired,
    normal,
    deadline: override.until,
    interval: override.seconds,
    baseInterval: base.rate,
    damage: base.damage,
    unitId: hero.unitId!,
  };
}
