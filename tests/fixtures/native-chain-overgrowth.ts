import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';
/** Actual Overgrowth cast lands after the primary hit and before its first committed hop. */
export function nativeChainOvergrowthRecording(level = 1) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    ...Array.from({ length: 5 }, (_, i) =>
      makeBuilding(2 + i, i % 2 ? 'elixirstorage' : 'goldstorage', 7 + 4 * i, 5, 15),
    ),
  ];
  model.state.army = { ...emptyArmy(), electrodragon: 1, giant: 1 };
  model.state.spells = { ...emptySpells(), overgrowth: 1 };
  model.state.troopLevels = { ...model.state.troopLevels, electrodragon: level };
  model.state.spellLevels = { ...model.state.spellLevels, overgrowth: 1 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial)),
    snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  const step = () => {
    if (battle.finished || battle.elapsed > 5) throw Error('Rooted chain checkpoint missing');
    model.step(0.05);
  };
  model.activeTroop = 'electrodragon';
  if (!model.deploy(5, 6.5)) throw Error('Dragon deployment failed');
  const sourceId = battle.units.at(-1)!.id;
  step();
  const charging = battle.elapsed;
  snapshot();
  while (battle.elapsed < 1.5 - 1e-9) step();
  const castAt = battle.elapsed;
  model.activeSpell = 'overgrowth';
  if (!model.castSpell(17, 6.5)) throw Error('Overgrowth cast failed');
  step();
  const falling = battle.elapsed;
  snapshot();
  while (!battle.nativeElectroDragonZaps?.length) step();
  const primary = battle.elapsed;
  snapshot();
  while (!battle.buildingEffects?.[3]?.overgrownUntil) step();
  const rooted = battle.elapsed;
  snapshot();
  if (battle.buildingEffects?.[2]?.overgrownUntil)
    throw Error('Primary rooted by incorrect footprint');
  const hp = battle.buildings.find((b) => b.id === 3)!.hp;
  while (battle.nativeElectroDragonZaps!.length < 2) step();
  const hop = battle.elapsed;
  snapshot();
  if (
    battle.nativeElectroDragonZaps![1].targetId !== 3 ||
    battle.buildings.find((b) => b.id === 3)!.hp !== hp
  )
    throw Error('Root did not absorb first hop');
  while (battle.nativeElectroDragonZaps!.length < 5) step();
  const last = battle.elapsed;
  snapshot();
  const targets = battle.nativeElectroDragonZaps!.map((z) => ({
    id: z.targetId,
    at: z.at,
    key: z.key,
  }));
  step();
  const visible = battle.elapsed;
  snapshot();
  step();
  model.finishBattle();
  return {
    level,
    sourceId,
    charging,
    castAt,
    falling,
    primary,
    rooted,
    hop,
    last,
    visible,
    hp,
    targets,
    anchor: { x: 10.5, y: 6.5 },
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
