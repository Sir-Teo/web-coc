import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';
import { superLevelOffset } from '../../src/game/special-troops';
/** Actual Super Wizard inputs: a primary storage or Queen, with a compact ring of unarmed huts. */
export function nativeSuperWizardRecording(
  level = 1,
  mode: 'buildings' | 'defender' = 'buildings',
) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'goldstorage', 8, 8, 15),
    ...[
      [8, 5],
      [11, 6],
      [11, 8],
      [11, 10],
      [8, 11],
    ].map(([x, y], i) => makeBuilding(3 + i, 'builder', x, y, 1)),
  ];
  model.state.army = { ...emptyArmy(), superwizard: 1, giant: 1 };
  model.state.spells = emptySpells();
  model.state.troopLevels = {
    ...model.state.troopLevels,
    superwizard: level,
    wizard: level + superLevelOffset('superwizard'),
  };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  if (mode === 'defender')
    data.initial.defendingHeroes = [{ kind: 'queen', level: 1, x: 7.5, y: 9.5 }];
  const battle = (model.battle = replayBattle(data.initial)),
    snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  const step = () => {
    if (battle.finished || battle.elapsed > 5) throw Error('Super Wizard checkpoint missing');
    model.step(0.05);
  };
  model.activeTroop = 'superwizard';
  if (!model.deploy(5, 9.5)) throw Error('Super Wizard deployment failed');
  const actor = battle.units.at(-1)!,
    sourceId = actor.id;
  const zaps = () => battle.nativeSuperWizardZaps?.filter((z) => z.sourceId === sourceId) ?? [];
  while (!zaps().length) step();
  const first = battle.elapsed;
  snapshot();
  if (actor.native?.attacks !== 1 || battle.troopLevels!.superwizard !== level)
    throw Error('Wrong Super Wizard cast/tier');
  step();
  const visible = battle.elapsed;
  snapshot();
  while (battle.nativeSuperWizardBranches?.length) step();
  const last = battle.elapsed;
  snapshot();
  if (zaps().length < 2) throw Error('Super Wizard branches missing');
  const targets = zaps().map((z) => ({
      id: z.targetId,
      building: z.targetBuilding,
      at: z.at,
      key: z.key,
    })),
    primary = zaps()[0];
  if (mode === 'defender' && primary.targetBuilding)
    throw Error('Queen was not the primary target');
  step();
  const chainVisible = battle.elapsed;
  snapshot();
  step();
  model.finishBattle();
  return {
    level,
    mode,
    sourceId,
    first,
    visible,
    last,
    chainVisible,
    targets,
    anchor: { x: (primary.fromX + primary.x) / 2, y: (primary.fromY + primary.y) / 2 },
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
