import { emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { HeroItemSetup } from '../../src/game/native-heroes';

export function gauntletBattle(
  level = 1,
  version = REPLAY_VERSION,
  extraItems: HeroItemSetup[] = [],
) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'clancastle', 7, 5, 14),
    makeBuilding(3, 'clancastle', 10, 5, 14),
    makeBuilding(4, 'clancastle', 14, 5, 14),
  ];
  model.state.nextId = 1000;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.version = version;
  recording.initial.heroes = [
    { kind: 'king', level: 1, items: [{ slug: 'giant-gauntlet', level }, ...extraItems] },
  ];
  model.battle = replayBattle(recording.initial, version);
  if (!model.deployNativeHero('king', 5, 6.5)) throw Error('Gauntlet King deployment failed');
  const battle = model.battle;
  const hero = battle.nativeHeroes![0];
  const unit = battle.units.find((u) => u.id === hero.unitId)!;
  return { model, battle, hero, unit };
}

export function gauntletRecording(level = 1) {
  const { model, battle, unit } = gauntletBattle(level);
  const hits: { at: number; primary: number; secondary: number; active: boolean }[] = [];
  model.onEffect = (effect) => {
    if (effect.type !== 'hit' || effect.sourceId !== unit.id || !effect.targetBuilding) return;
    hits.push({
      at: battle.elapsed,
      primary: battle.buildings[1].hp,
      secondary: battle.buildings[2].hp,
      active: (unit.native?.effects?.splash?.until ?? 0) > battle.elapsed + 1e-9,
    });
  };
  if (!model.activateNativeHeroAbility('king')) throw Error('Gauntlet activation failed');
  const deadline = unit.native!.effects!.splash!.until;
  const step = () => {
    if (battle.elapsed > 25 || battle.finished || unit.hp <= 0)
      throw Error('Gauntlet checkpoint was not reached');
    model.step(0.05);
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  while (!hits.length) step();
  while (battle.elapsed < hits[0].at + 0.1 - 1e-9) step();
  snapshot();
  const active = battle.elapsed;
  while (battle.elapsed < deadline + 0.05 - 1e-9) step();
  snapshot();
  const expired = battle.elapsed;
  while (!hits.some((h) => !h.active)) step();
  while (battle.elapsed < hits.find((h) => !h.active)!.at + 0.1 - 1e-9) step();
  snapshot();
  const ordinary = battle.elapsed;
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    hits,
    active,
    expired,
    ordinary,
    deadline,
    unitId: unit.id,
  };
}
