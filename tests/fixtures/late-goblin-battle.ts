import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import { BUILDINGS, TROOP_KEYS, maxTroopLevel, type TroopKind } from '../../src/game/data';
import { GameModel, type Building } from '../../src/game/model';
import { nativeLayout, nativeScenery } from '../../src/game/native-campaign';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export interface LateDeploy {
  step: number;
  kind: TroopKind | 'lightning';
  x: number;
  y: number;
}
const troopLevels = () =>
  Object.fromEntries(TROOP_KEYS.map((k) => [k, maxTroopLevel(k)])) as ReturnType<typeof emptyArmy>;

/** Explicit version-44 goblin-v1 recording of a late layout; gated villages open without the UI gate. */
export function lateGoblinReplay(
  index: number,
  deploys: LateDeploy[],
  options: { buildings?: Building[]; steps?: number; version?: number; scenery?: boolean } = {},
): ReplayData {
  const army = emptyArmy(),
    spells = emptySpells();
  for (const d of deploys)
    if (d.kind === 'lightning') spells.lightning++;
    else army[d.kind]++;
  const loot = campaignResources(campaignStage(index, 'goblin-v1'));
  const steps = options.steps ?? 2400;
  return {
    version: options.version ?? REPLAY_VERSION,
    initial: {
      catalog: 'goblin-v1',
      ...(options.scenery === false ? {} : { scenery: nativeScenery(index) }),
      index,
      practice: false,
      buildings: options.buildings ?? nativeLayout(index),
      army,
      spells,
      troopLevels: troopLevels(),
      spellLevels: { lightning: 1, heal: 1, rage: 1 },
      nextId: 100000,
      availableLoot: loot,
      lootRoom: loot,
    },
    steps: Array(steps).fill(0.05),
    actions: [
      ...[...deploys]
        .sort((a, b) => a.step - b.step)
        .map((d) =>
          d.kind === 'lightning'
            ? { step: d.step, type: 'spell' as const, kind: 'lightning' as const, x: d.x, y: d.y }
            : { step: d.step, type: 'troop' as const, kind: d.kind, x: d.x, y: d.y },
        ),
      { step: steps, type: 'end' as const },
    ],
  };
}

/** Nearest legal deployment point (half-tile grid) to the first building matching `near`. */
export function deployNear(index: number, near: string, nth = 0) {
  const model = new GameModel();
  model.battle = replayBattle(lateGoblinReplay(index, [], { steps: 1 }).initial);
  const target = model.battle.buildings.filter((b) => (b.npc ?? b.kind) === near)[nth];
  if (!target) throw Error(`No ${near} in village ${index}`);
  const size = BUILDINGS[target.kind].size,
    cx = target.x + size / 2,
    cy = target.y + size / 2;
  let best: [number, number, number] | undefined;
  for (let x = 1.5; x < 47; x += 0.5)
    for (let y = 1.5; y < 47; y += 0.5)
      if (!model.deployBlocked(x, y)) {
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (!best || d < best[2]) best = [x, y, d];
      }
  return { x: best![0], y: best![1] };
}

/** Drives the live model with the same inputs as `data`, without the recording or UI gate. */
export function lateGoblinLive(data: ReplayData, stop = data.steps.length) {
  const model = new GameModel();
  model.state.army = { ...data.initial.army };
  model.state.spells = { ...data.initial.spells };
  model.state.troopLevels = { ...data.initial.troopLevels };
  model.state.nextId = data.initial.nextId;
  model.battle = replayBattle(data.initial, data.version);
  let action = 0;
  const apply = (step: number) => {
    for (; action < data.actions.length && data.actions[action].step === step; action++) {
      const a = data.actions[action];
      if (a.type === 'troop') {
        model.activeTroop = a.kind;
        model.activeSpell = null;
        if (!model.deploy(a.x, a.y)) throw Error(`Fixture deployment failed at ${a.x},${a.y}`);
      } else if (a.type === 'spell') {
        model.activeSpell = a.kind;
        if (!model.castSpell(a.x, a.y)) throw Error('Fixture spell failed');
      }
    }
  };
  apply(0);
  for (let step = 0; step < stop && !model.battle.finished; step++) {
    model.step(data.steps[step]);
    apply(step + 1);
  }
  return model;
}
