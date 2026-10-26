import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';
/** Actual deployed dragon charges and chains five targets, starting on storage or a defending Queen. */
export function nativeElectroDragonRecording(
  level = 1,
  mode: 'buildings' | 'defender' = 'buildings',
) {
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
  model.state.spells = emptySpells();
  model.state.troopLevels = { ...model.state.troopLevels, electrodragon: level };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  if (mode === 'defender')
    data.initial.defendingHeroes = [{ kind: 'queen', level: 100, x: 8.5, y: 9.5 }];
  const battle = (model.battle = replayBattle(data.initial)),
    snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () => ({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  const step = () => {
    if (battle.finished || battle.elapsed > 25)
      throw Error(`Dragon chain checkpoint missing at ${battle.elapsed}`);
    model.step(0.05);
  };
  model.activeTroop = 'electrodragon';
  if (!model.deploy(5, 6.5)) throw Error('Electro Dragon deployment failed');
  const actor = battle.units.at(-1)!,
    sourceId = actor.id;
  step();
  const approach = battle.elapsed;
  snapshots.push(snapshot());
  while (!actor.native?.electroDragon?.charge) step();
  const charging = battle.elapsed;
  snapshots.push(snapshot());
  step();
  const chargeVisible = battle.elapsed;
  snapshots.push(snapshot());
  const zaps = () => battle.nativeElectroDragonZaps?.filter((z) => z.sourceId === sourceId) ?? [];
  let before = snapshot();
  while (!zaps().length) {
    before = snapshot();
    step();
  }
  const first = battle.elapsed;
  snapshots.push(before, snapshot());
  if (actor.hp <= 0 || actor.native?.attacks !== 1)
    throw Error('Dragon did not survive its first charged cast');
  step();
  const visible = battle.elapsed;
  snapshots.push(snapshot());
  while (zaps().length < 5) step();
  const last = battle.elapsed;
  snapshots.push(snapshot());
  const targets = zaps().map((z) => ({
      id: z.targetId,
      building: z.targetBuilding,
      at: z.at,
      key: z.key,
    })),
    primary = zaps()[0];
  if (mode === 'defender' && primary.targetBuilding)
    throw Error('Dragon did not charge the defending Queen');
  step();
  model.finishBattle();
  return {
    level,
    mode,
    sourceId,
    approach,
    charging,
    chargeVisible,
    before: before.at,
    first,
    visible,
    last,
    targets,
    anchor: { x: (primary.fromX + primary.x) / 2, y: (primary.fromY + primary.y) / 2 },
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
