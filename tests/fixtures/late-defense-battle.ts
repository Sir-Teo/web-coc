import { GameModel, makeBuilding, type Army, type Battle, type Building, type Unit } from '../../src/game/model';
import { nativeLayout, nativeScenery } from '../../src/game/native-campaign';
import { replayBattle, type ReplayAction, type ReplayData, type ReplaySetup } from '../../src/game/replay';
import { campaignResources } from '../../src/game/campaign-loot';
import { campaignStage } from '../../src/game/campaign-catalog';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { TROOP_KEYS, maxTroopLevel, type BuildingKind, type TroopKind } from '../../src/game/data';
import { stepLateCampaign, type SpellTowerWeapon } from '../../src/game/late-campaign';

const maxLevels = () => Object.fromEntries(TROOP_KEYS.map((k) => [k, maxTroopLevel(k)])) as Army;

/** Ungated inspection of a complete late village with explicit maximum-level research. */
export function lateSetup(index: number, army: Partial<Army>, buildings = nativeLayout(index)): ReplaySetup {
  const loot = campaignResources(campaignStage(index, 'goblin-v1'));
  return {
    catalog: 'goblin-v1',
    scenery: nativeScenery(index),
    index,
    practice: false,
    buildings,
    army: { ...emptyArmy(), ...army },
    spells: emptySpells(),
    troopLevels: maxLevels(),
    spellLevels: { lightning: 1, heal: 1, rage: 1 },
    nextId: 100000,
    availableLoot: loot,
    lootRoom: loot,
  };
}

/** A version-44 recording with explicit deployments, played by the real replay runner. */
export function lateReplay(
  setup: ReplaySetup,
  deployments: { step: number; kind: TroopKind; x: number; y: number }[],
  steps: number,
): ReplayData {
  const actions: ReplayAction[] = deployments.map((d) => ({ type: 'troop', ...d }));
  actions.push({ type: 'end', step: steps });
  return { version: 44, initial: setup, steps: Array(steps).fill(0.05), actions };
}

/** A live model on a version-44 late battle; deployments go through `deploy`. */
export function lateBattle(setup: ReplaySetup) {
  const model = new GameModel();
  model.state.army = { ...setup.army };
  model.state.troopLevels = { ...setup.troopLevels };
  model.state.nextId = setup.nextId;
  model.battle = replayBattle(setup, 44);
  return model;
}

/** Deployment spots outside the red boundary, nearest to a point first. */
export function deploySpots(model: GameModel, x: number, y: number, count: number) {
  const spots: { x: number; y: number; d: number }[] = [];
  for (let sx = 1.5; sx < 47; sx += 0.5)
    for (let sy = 1.5; sy < 47; sy += 0.5)
      if (!model.deployBlocked(sx, sy)) spots.push({ x: sx, y: sy, d: Math.hypot(sx - x, sy - y) });
  return spots.sort((a, b) => a.d - b.d || a.x - b.x || a.y - b.y).slice(0, count);
}

export const lateBuilding = (
  id: number,
  kind: BuildingKind,
  x: number,
  y: number,
  level: number,
  weapon?: SpellTowerWeapon,
): Building => ({
  ...makeBuilding(id, kind, x, y, level),
  ...(weapon ? { spellTowerWeapon: weapon } : {}),
});

/** Isolated version-44 campaign battle state for family-level stepping. */
export function isolatedBattle(buildings: Building[]): Battle {
  const battle = replayBattle(lateSetup(85, {}, buildings), 44);
  battle.started = true;
  return battle;
}
export const attacker = (
  id: number,
  kind: TroopKind,
  x: number,
  y: number,
  hp = 1e9,
  maxHp = 1000,
  extra: Partial<Unit> = {},
): Unit => ({
  id,
  kind,
  x,
  y,
  hp,
  maxHp,
  cooldown: 0,
  target: null,
  path: [],
  pathAt: 0,
  attacking: false,
  spawnedAt: 0,
  ...extra,
});
/** Advance only the late families through their four fixed phases. */
export function stepFamilies(battle: Battle, dt = 0.05) {
  battle.elapsed += dt;
  for (const phase of ['projectiles', 'auras', 'traps', 'defenses'] as const)
    stepLateCampaign({
      battle,
      dt,
      phase,
      effect: () => {},
      damageBuilding: (target, power) => {
        target.hp = Math.max(0, target.hp - power);
      },
    });
}
