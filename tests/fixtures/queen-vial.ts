import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { HeroItemSetup } from '../../src/game/native-heroes';
import { heroStatsFor } from '../../src/game/native-heroes';
import type { CombatProjectile } from '../../src/game/projectiles';

export function queenVialBattle(
  level = 1,
  recall = false,
  version = REPLAY_VERSION,
  extraItems: HeroItemSetup[] = [],
) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...(recall
      ? [makeBuilding(2, 'cannon', 12, 10, 21)]
      : [0, 1, 2].flatMap((x) =>
          [0, 1].map((y) => makeBuilding(2 + x * 2 + y, 'airdefense', 10 + x * 5, 5 + y * 5, 16)),
        )),
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
    { kind: 'queen', level: 1, items: [{ slug: 'invisibility-vial', level }, ...extraItems] },
  ];
  model.battle = replayBattle(recording.initial, version);
  if (!model.deployNativeHero('queen', recall ? 6.9 : 5, recall ? 11.5 : 6.5))
    throw Error('Vial Queen deployment failed');
  const battle = model.battle;
  const hero = battle.nativeHeroes![0];
  const unit = battle.units.find((u) => u.id === hero.unitId)!;
  return { model, battle, hero, unit, base: heroStatsFor(hero, 18, version >= 84) };
}

/** Actual Vial activation; shots retain their damage through expiry or Recall. */
export function queenVialRecording(level = 1, recall = false) {
  const { model, battle, unit, base } = queenVialBattle(level, recall);
  const shots: { projectile: CombatProjectile; bonus: number }[] = [];
  model.onEffect = (effect) => {
    if (effect.type !== 'projectile' || effect.sourceId !== unit.id) return;
    const p = battle.projectiles!.find((p) => p.id === effect.projectileId)!;
    shots.push({
      projectile: JSON.parse(JSON.stringify(p)),
      bonus:
        (unit.native?.effects?.extraDamage?.until ?? 0) > battle.elapsed + 1e-9
          ? unit.native!.effects!.extraDamage!.amount
          : 0,
    });
  };
  if (!model.activateNativeHeroAbility('queen')) throw Error('Vial Queen activation failed');
  const until = (at: number) => {
    for (let remaining = 500; battle.elapsed < at - 1e-9; remaining--) {
      if (!remaining || battle.finished) throw Error('Vial Queen checkpoint was not reached');
      model.step(0.05);
    }
  };
  const expiry = unit.native!.effects!.extraDamage!.until;
  let recallAt: number | undefined;
  if (recall) {
    model.activeSpell = 'recall';
    if (!model.castSpell(6.9, 11.5)) throw Error('Vial Queen Recall failed');
    recallAt = battle.nativeSpells!.find((s) => s.name === 'Recall')!.firstHit;
  }
  for (let remaining = 100; !shots.length; remaining--) {
    if (!remaining || battle.finished) throw Error('Vial Queen did not fire');
    model.step(0.05);
  }
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  until(shots[0].projectile.launched + 0.1);
  snapshot();
  const active = battle.elapsed;
  if (recall) {
    until(recallAt! + 0.05);
    snapshot();
    until(shots.at(-1)!.projectile.impact + 0.05);
    snapshot();
  } else {
    until(expiry + 0.1);
    snapshot();
    until(expiry + 2);
    snapshot();
  }
  const final = battle.elapsed;
  until(final + 0.1);
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    shots,
    active,
    final,
    expiry,
    recallAt,
    unitId: unit.id,
    baseDamage: base.damage,
  };
}
