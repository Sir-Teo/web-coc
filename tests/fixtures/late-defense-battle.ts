import { GameModel, makeBuilding, type Army, type Building, type SpellBook } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignResources } from '../../src/game/campaign-loot';
import { campaignStage } from '../../src/game/campaign-catalog';
import { nativeLayout, nativeScenery } from '../../src/game/native-campaign';
import { REPLAY_VERSION, replayBattle, type ReplayAction, type ReplayData, type ReplaySetup } from '../../src/game/replay';
import { TROOP_KEYS } from '../../src/game/data';

export const troopLevels = () => Object.fromEntries(TROOP_KEYS.map((k) => [k, 1])) as Army;

/** Version-44 native campaign setup, bypassing only the unlock/playability gate. */
export function lateSetup(
  index: number,
  army: Partial<Army>,
  spells: Partial<SpellBook> = {},
  buildings: Building[] = nativeLayout(index),
): ReplaySetup {
  const loot = campaignResources(campaignStage(index, 'goblin-v1'));
  return {
    catalog: 'goblin-v1',
    scenery: nativeScenery(index),
    index,
    practice: false,
    buildings,
    army: { ...emptyArmy(), ...army },
    spells: { ...emptySpells(), ...spells },
    troopLevels: troopLevels(),
    spellLevels: { rage: 1, heal: 1, lightning: 1 },
    nextId: 100000,
    availableLoot: loot,
    lootRoom: loot,
  };
}

/** A minimal version-44 campaign board with one late defense and optional neighbors. */
export function isolatedSetup(index: number, defense: Building, army: Partial<Army>, spells: Partial<SpellBook> = {}) {
  const hall = makeBuilding(defense.id + 1, 'townhall', 2, 2, 1);
  return lateSetup(index, army, spells, [defense, hall]);
}

export type Deployment = Omit<Extract<ReplayAction, { type: 'troop' | 'spell' | 'hero' }>, 'step'> & {
  step: number;
};

/** Live model that applies deployments before the recorded fixed step, like the replay runner. */
export function liveBattle(setup: ReplaySetup) {
  const model = new GameModel();
  model.recordBattles = false;
  model.state.army = { ...setup.army };
  model.state.spells = { ...setup.spells };
  model.state.troopLevels = { ...setup.troopLevels };
  model.state.nextId = setup.nextId;
  model.battle = replayBattle(setup, REPLAY_VERSION);
  return model;
}
export function applyDeployments(model: GameModel, deployments: Deployment[], step: number) {
  for (const a of deployments)
    if (a.step === step) {
      if (a.type === 'troop') {
        model.activeTroop = a.kind;
        model.deploy(a.x, a.y);
      } else if (a.type === 'spell') {
        model.activeSpell = a.kind;
        model.castSpell(a.x, a.y);
      } else model.deployHero(a.x, a.y);
    }
}
export function replayData(setup: ReplaySetup, deployments: Deployment[], steps: number): ReplayData {
  return {
    version: REPLAY_VERSION,
    initial: structuredClone(setup),
    steps: Array.from({ length: steps }, () => 0.05),
    actions: [...deployments.map((a) => ({ ...a }) as ReplayAction), { type: 'end', step: steps }],
  };
}
export function troopLine(kind: keyof Army, count: number, x: number, y: number, dy = 0.4, step = 0): Deployment[] {
  return Array.from({ length: count }, (_, i) => ({ step, type: 'troop' as const, kind, x, y: y + i * dy }));
}
