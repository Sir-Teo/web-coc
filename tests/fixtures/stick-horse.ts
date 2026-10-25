import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { heroStatsFor, type HeroItemSetup } from '../../src/game/native-heroes';

export function stickHorseBattle(
  level = 1,
  version = REPLAY_VERSION,
  walls = false,
  extraItems: HeroItemSetup[] = [],
  recall = false,
) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...[0, 1, 2, 3].flatMap((x) =>
      [0, 1, 2].map((y) =>
        makeBuilding(2 + x * 3 + y, 'airdefense', (walls ? 14 : 7) + x * 5, 5 + y * 5, 16),
      ),
    ),
    ...(walls ? Array.from({ length: 48 }, (_, y) => makeBuilding(100 + y, 'wall', 8, y, 18)) : []),
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
    { kind: 'king', level: 1, items: [{ slug: 'stick-horse', level }, ...extraItems] },
  ];
  model.battle = replayBattle(recording.initial, version);
  if (!model.deployNativeHero('king', 5, 6.5)) throw Error('Stick Horse King deployment failed');
  const battle = model.battle;
  const hero = battle.nativeHeroes![0];
  const unit = battle.units.find((u) => u.id === hero.unitId)!;
  return { model, battle, hero, unit, base: heroStatsFor(hero, 18) };
}

export function stickHorseRecording(level = 1) {
  const { model, battle, hero, unit, base } = stickHorseBattle(level);
  const hits: { at: number; interval: number; targetId: number; boosted: boolean }[] = [];
  model.onEffect = (effect) => {
    if (effect.type !== 'hit' || effect.sourceId !== unit.id || !effect.targetBuilding) return;
    hits.push({
      at: battle.elapsed,
      interval: unit.cooldown,
      targetId: effect.targetId!,
      boosted: (unit.native?.effects?.attackInterval?.until ?? 0) > battle.elapsed + 1e-9,
    });
  };
  const override = unit.native!.effects!.attackInterval!;
  const step = () => {
    if (battle.elapsed > 40 || battle.finished || unit.hp <= 0)
      throw Error('Stick Horse checkpoint was not reached');
    model.step(0.05);
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  while (!hits.length) step();
  while (battle.elapsed < hits[0].at + 0.2 - 1e-9) step();
  snapshot();
  const active = battle.elapsed;
  while (battle.elapsed < override.until + 0.1 - 1e-9) step();
  snapshot();
  const expired = battle.elapsed;
  while (!hits.some((h) => !h.boosted)) step();
  while (battle.elapsed < hits.find((h) => !h.boosted)!.at + 0.2 - 1e-9) step();
  snapshot();
  const ordinary = battle.elapsed;
  if (hero.abilityUsed) throw Error('Stick Horse spent the ability button');
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    hits,
    active,
    expired,
    ordinary,
    deadline: override.until,
    interval: override.seconds,
    baseInterval: base.rate,
    damage: base.damage,
    unitId: unit.id,
  };
}

export function stickHorseWallRecording(level = 1) {
  const { model, battle, unit, base } = stickHorseBattle(level, undefined, true);
  while (battle.elapsed < 1.75 - 1e-9) model.step(0.05);
  const crossed = battle.elapsed;
  const snapshot = JSON.parse(JSON.stringify(battle));
  model.step(0.05);
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    crossed,
    snapshot,
    unitId: unit.id,
    baseInterval: base.rate,
  };
}
