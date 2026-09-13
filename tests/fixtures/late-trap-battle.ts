import { GameModel, makeBuilding, type Army, type Building, type Unit } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { TROOP_KEYS, maxTroopLevel } from '../../src/game/data';
import { replayBattle, type ReplayData, type ReplaySetup } from '../../src/game/replay';
import { campaignResources } from '../../src/game/campaign-loot';
import { campaignStage } from '../../src/game/campaign-catalog';
import { freshNativeCampaign, nativeLayout, nativeScenery } from '../../src/game/native-campaign';
import { developedSave } from './developed-village';

export const maxTroopLevels = () =>
  Object.fromEntries(TROOP_KEYS.map((k) => [k, maxTroopLevel(k)])) as Army;

/** A version-44 Goblin Map battle holding only the given entities, started for direct stepping. */
export function lateTrapArena(buildings: Building[], index = 66) {
  const m = new GameModel();
  const loot = campaignResources(campaignStage(index, 'goblin-v1'));
  m.battle = replayBattle(
    {
      catalog: 'goblin-v1',
      index,
      practice: false,
      buildings: [...buildings, makeBuilding(9999, 'townhall', 40, 40)],
      army: emptyArmy(),
      spells: emptySpells(),
      troopLevels: maxTroopLevels(),
      nextId: 100000,
      availableLoot: loot,
      lootRoom: loot,
    },
    44,
  );
  const b = m.battle;
  b.started = true;
  const unit = (kind: Unit['kind'], x: number, y: number, extra: Partial<Unit> = {}) => {
    const stats = m.troopStats(kind);
    const u: Unit = {
      id: 10000 + b.units.length,
      kind,
      x,
      y,
      hp: stats.hp,
      maxHp: stats.hp,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
      ...extra,
    };
    b.units.push(u);
    return u;
  };
  return { m, b, unit };
}

/** A legal campaign attack on an ungated native village, through the normal start flow. */
export function lateTrapVillage(index: number, army: Partial<Army>) {
  const save = developedSave();
  save.nativeCampaign = freshNativeCampaign();
  save.nativeCampaign.stars.fill(1);
  save.army = { ...emptyArmy(), ...army };
  save.spells = { lightning: 0, heal: 0, rage: 0 };
  save.king = undefined;
  save.troopLevels = maxTroopLevels();
  const m = new GameModel(save);
  m.startCampaign(index);
  if (!m.battle) throw Error(`Village ${index} did not open`);
  return m;
}

/** Closest legal deployment point on a half-tile grid, stable under ties. */
export function nearestDeploy(m: GameModel, x: number, y: number) {
  let best: [number, number, number] | undefined;
  for (let px = 1; px < 47; px += 0.5)
    for (let py = 1; py < 47; py += 0.5) {
      if (m.deployBlocked(px, py)) continue;
      const d = Math.hypot(px - x, py - y);
      if (!best || d < best[2] - 1e-9) best = [px, py, d];
    }
  if (!best) throw Error('No legal deployment point');
  return best;
}

/** Version-44 setup for a native village that other late families still gate. */
export function nativeSetup(index: number, army: Partial<Army>): ReplaySetup {
  const loot = campaignResources(campaignStage(index, 'goblin-v1'));
  return {
    catalog: 'goblin-v1',
    scenery: nativeScenery(index),
    index,
    practice: false,
    buildings: nativeLayout(index),
    army: { ...emptyArmy(), ...army },
    spells: emptySpells(),
    spellLevels: { lightning: 1, heal: 1, rage: 1 },
    troopLevels: maxTroopLevels(),
    nextId: 100000,
    availableLoot: loot,
    lootRoom: loot,
  };
}

/** Deterministic input recording for `nativeSetup`: deployments at step zero, then fixed steps. */
export function nativeReplay(
  setup: ReplaySetup,
  deployments: [kind: keyof Army, x: number, y: number][],
  steps: number,
): ReplayData {
  return {
    version: 44,
    initial: setup,
    steps: Array(steps).fill(0.05),
    actions: [
      ...deployments.map(([kind, x, y]) => ({ type: 'troop' as const, kind, x, y, step: 0 })),
      { type: 'end' as const, step: steps },
    ],
  };
}
