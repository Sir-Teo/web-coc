import { characterLevel, defenceTroopLevel, sourceFlag, sourceNumber } from './character-catalog';
import { characterArt } from './character-art';
import {
  animationStates,
  characterFacing,
  rowExport,
  rowScale,
  type CharacterPose,
} from './character-poses';
import { BUILDINGS, isDefense, isTrap } from './data';
import { distance2D } from './distance';
import { splitTiming } from './garrison-kinds';
import { findPath, distanceTo, type Battle, type Building } from './model';
import { nativeScenePoses, type NativeScenePose } from './native-mesh';

/**
 * Defending Builder: the character an armed Builder's Hut (source levels 2+) sends out to repair.
 * This module is standalone; the Builder's Hut family wires spawning into its hut logic.
 *
 * Source (pinned rows): `Builders Hut` levels 2–4 name `DefenceTroopCharacter=Defending Builder`,
 * `DefenceTroopCount=1` and `DefenceTroopLevel` 1–3 (1-based, as the older
 * LogicDefenceUnitProductionComponent's `SetUpgradeLevel(level - 1)`). The character rows give
 * Speed 250, AttackRange 50, AttackSpeed 750, a negative DPS (-50/-60/-70: HP restored per
 * second), IsJumper, HP 100,000+ and `DeathShowTimeMS=1` with an empty death export.
 *
 * Behavior (public documentation, local where marked):
 * - [Supercell, Battle Builders](https://supercell.com/en/games/clashofclans/blog/game-updates/battle-builders-2/):
 *   the Builder "will attempt to repair nearby Defenses", cannot be damaged or targeted by
 *   attacking troops, and stops once his own Builder's Hut is destroyed.
 * - [House of Clashers, Battle Builder](https://houseofclashers.com/home-village/defenses/battle-builder):
 *   repairs only within 4 tiles of his hut; when the hut collapses he runs back and hides.
 * - [Fandom, Builder's Hut](https://clashofclans.fandom.com/wiki/Builder's_Hut) (search excerpt):
 *   keeps repairing one building until it is fully repaired or destroyed.
 * - Local: the target is the most damaged (lowest hit point fraction) Defense within the radius,
 *   ties by distance to the Builder then building ID; he spawns at the older Guard Post exit
 *   (hut left edge, vertical middle); repairs use the split attack timer (200 ms windup, 550 ms
 *   recovery for healing rows) and never exceed maximum hit points.
 */
export const DEFENDING_BUILDER_REPAIR_RADIUS = 4;
export const DEFENDING_BUILDER_HISTORY = 8;

export function defendingBuilderStats(level: number) {
  const row = characterLevel('Defending Builder', level);
  if (!row) throw Error(`Unsupported Defending Builder level ${level}`);
  const timing = splitTiming(row);
  return {
    level,
    animation: String(row.Animation),
    hp: sourceNumber(row, 'Hitpoints'),
    speed: sourceNumber(row, 'Speed') / 100,
    range: sourceNumber(row, 'AttackRange') / 100,
    rate: timing.period,
    firstRepair: timing.firstHit,
    recovery: timing.recovery,
    /** HP restored per repair: -DPS * AttackSpeed. */
    repair: (-sourceNumber(row, 'DPS') * sourceNumber(row, 'AttackSpeed')) / 1000,
    repairPerSecond: -sourceNumber(row, 'DPS'),
    jumper: sourceFlag(row, 'IsJumper'),
    deathShowTime: sourceNumber(row, 'DeathShowTimeMS') / 1000,
  };
}
/** The Defending Builder level an armed Builder's Hut level sends out, or undefined when unarmed. */
export function hutBuilderLevel(hutLevel: number) {
  try {
    const row = defenceTroopLevel('Builders Hut', hutLevel);
    return row.DefenceTroopCharacter === 'Defending Builder'
      ? Number(row.DefenceTroopLevel)
      : undefined;
  } catch {
    return undefined;
  }
}

export interface DefendingBuilderRepair {
  n: number;
  at: number;
  targetId: number;
  amount: number;
}
export interface DefendingBuilder {
  id: number;
  hutId: number;
  level: number;
  x: number;
  y: number;
  spawnedAt: number;
  target: number | null;
  path: { x: number; y: number }[];
  pathAt: number;
  cooldown: number;
  recovery: number;
  engaged?: boolean;
  repairing: boolean;
  repairCount: number;
  repairs: DefendingBuilderRepair[];
  /** The hut was destroyed: he walks back and hides at `hiddenAt`. */
  retreating?: boolean;
  hiddenAt?: number;
}

const EPSILON = 1e-9;
const hutCenter = (hut: Building) => {
  const size = BUILDINGS[hut.kind].size;
  return { x: hut.x + size / 2, y: hut.y + size / 2 };
};

/** Spawn one Defending Builder for `hut` at battle time `at` (needs version-44 late state). */
export function spawnDefendingBuilder(battle: Battle, hut: Building, at: number): DefendingBuilder {
  const level = hutBuilderLevel(hut.level);
  if (hut.kind !== 'builder' || hut.npc || level === undefined)
    throw Error("Defending Builders come only from armed Builder's Huts");
  if (!battle.late) throw Error('Defending Builders need version-44 late campaign state');
  const list = (battle.late.defendingBuilders ??= []);
  const size = BUILDINGS[hut.kind].size;
  const builder: DefendingBuilder = {
    id: list.length + 1,
    hutId: hut.id,
    level,
    x: hut.x,
    y: hut.y + size / 2,
    spawnedAt: at,
    target: null,
    path: [],
    pathAt: 0,
    cooldown: 0,
    recovery: 0,
    repairing: false,
    repairCount: 0,
    repairs: [],
  };
  list.push(builder);
  return builder;
}

/** Damaged Defenses (and armed huts) within the repair radius of the hut, most damaged first. */
export function defendingBuilderCandidates(battle: Battle, builder: DefendingBuilder) {
  const hut = battle.buildings.find((b) => b.id === builder.hutId);
  if (!hut) return [];
  const center = hutCenter(hut);
  const maxHp = (b: Building) => b.maxHp || 1;
  return battle.buildings
    .filter(
      (b) =>
        b.hp > 0 &&
        b.hp < b.maxHp &&
        b.kind !== 'wall' &&
        !isTrap(b.kind) &&
        (isDefense(b.kind) ||
          (b.kind === 'builder' && !b.npc && hutBuilderLevel(b.level) !== undefined)) &&
        distanceTo(center, b) <= DEFENDING_BUILDER_REPAIR_RADIUS + EPSILON,
    )
    .sort(
      (a, b) =>
        a.hp / maxHp(a) - b.hp / maxHp(b) ||
        distanceTo(builder, a) - distanceTo(builder, b) ||
        a.id - b.id,
    );
}

function walk(
  builder: DefendingBuilder,
  battle: Battle,
  goal: Building | { x: number; y: number },
  range: number,
  speed: number,
  dt: number,
) {
  if (!builder.path.length || builder.pathAt <= 0) {
    // IsJumper: walls never block him; other buildings do.
    builder.path = findPath(
      builder,
      goal,
      battle.buildings.filter((b) => b.kind !== 'wall'),
      range,
      !!battle.nativeSubtiles,
    );
    builder.pathAt = 0.3;
  }
  let travel = speed * dt;
  while (builder.path.length && travel > 0) {
    const next = builder.path[0];
    const dx = next.x - builder.x,
      dy = next.y - builder.y,
      length = distance2D(dx, dy);
    if (length <= travel) {
      builder.x = next.x;
      builder.y = next.y;
      builder.path.shift();
      travel -= length;
    } else {
      builder.x += (dx / length) * travel;
      builder.y += (dy / length) * travel;
      break;
    }
  }
}

export function stepDefendingBuilders(battle: Battle, dt: number) {
  for (const builder of battle.late?.defendingBuilders ?? []) stepBuilder(battle, builder, dt);
}

function stepBuilder(battle: Battle, builder: DefendingBuilder, dt: number) {
  if (builder.hiddenAt !== undefined) return;
  const activeDt = Math.min(dt, Math.max(0, battle.elapsed - builder.spawnedAt));
  if (activeDt <= 0) return;
  const stats = defendingBuilderStats(builder.level);
  builder.repairing = false;
  builder.pathAt -= activeDt;
  builder.cooldown = Math.max(0, builder.cooldown - activeDt);
  builder.recovery = Math.max(0, builder.recovery - activeDt);
  const hut = battle.buildings.find((b) => b.id === builder.hutId);
  if (!hut || hut.hp <= 0) {
    // His hut is gone: he stops repairing, returns to it and hides.
    builder.target = null;
    delete builder.engaged;
    if (!builder.retreating) {
      builder.retreating = true;
      builder.path = [];
      builder.pathAt = 0;
    }
    // The destroyed hut no longer blocks paths; he walks to its footprint and disappears there.
    if (!hut || distanceTo(builder, hut) <= stats.range + EPSILON) {
      builder.hiddenAt = battle.elapsed;
      return;
    }
    walk(builder, battle, hut, stats.range, stats.speed, activeDt);
    if (distanceTo(builder, hut) <= stats.range + EPSILON || !builder.path.length)
      builder.hiddenAt = battle.elapsed;
    return;
  }
  let target = battle.buildings.find((b) => b.id === builder.target);
  // Keep one target until it is fully repaired or destroyed.
  if (!target || target.hp <= 0 || target.hp >= target.maxHp) {
    target = defendingBuilderCandidates(battle, builder)[0];
    if (builder.target !== (target?.id ?? null)) {
      builder.target = target?.id ?? null;
      delete builder.engaged;
      builder.path = [];
      builder.pathAt = 0;
    }
  }
  if (!target) return;
  if (distanceTo(builder, target) > stats.range + 1e-6) {
    delete builder.engaged;
    walk(builder, battle, target, stats.range, stats.speed, activeDt);
    return;
  }
  builder.path = [];
  builder.repairing = true;
  if (!builder.engaged) {
    builder.engaged = true;
    builder.cooldown = Math.max(0, builder.recovery + stats.firstRepair - activeDt);
  }
  if (builder.cooldown > EPSILON) return;
  builder.cooldown = stats.rate;
  builder.recovery = stats.recovery;
  const amount = Math.min(stats.repair, target.maxHp - target.hp);
  target.hp += amount;
  builder.repairs.push({
    n: builder.repairCount++,
    at: battle.elapsed,
    targetId: target.id,
    amount,
  });
  if (builder.repairs.length > DEFENDING_BUILDER_HISTORY) builder.repairs.shift();
}

/** State-driven original poses: walk to a target, the looping `attack` (build) row, idle otherwise. */
export function defendingBuilderPose(
  builder: DefendingBuilder,
  battle: Battle,
  reduced = false,
): CharacterPose | null {
  if (battle.elapsed < builder.spawnedAt || builder.hiddenAt !== undefined) return null;
  const stats = defendingBuilderStats(builder.level);
  const states = animationStates(stats.animation);
  const art = characterArt(stats.animation);
  const target = battle.buildings.find((b) => b.id === builder.target);
  const aim =
    builder.path[0] ??
    (target
      ? {
          x: target.x + BUILDINGS[target.kind].size / 2,
          y: target.y + BUILDINGS[target.kind].size / 2,
        }
      : undefined);
  const facing = characterFacing(aim ? aim.x - builder.x : 1, aim ? aim.y - builder.y : 0);
  const moving = builder.path.length > 0;
  const row = (builder.repairing ? states.attack : moving ? states.walk : states.idle)[0];
  const time = reduced ? 0 : Math.max(0, battle.elapsed - builder.spawnedAt);
  const scale = rowScale(row);
  const mirror = row.HasDirections === 'TRUE' ? facing.mirror : 1;
  return {
    prefix: art.prefix,
    shadows: art.shadows,
    poses: nativeScenePoses(art.graph, rowExport(row, facing.view), time, {}, [
      scale * mirror,
      0,
      0,
      0,
      scale,
      0,
    ]),
  };
}

/** Original body and ground-shadow commands, separated like the garrison character layers. */
export function defendingBuilderLayers(builder: DefendingBuilder, battle: Battle, reduced = false) {
  const pose = defendingBuilderPose(builder, battle, reduced);
  if (!pose) return null;
  const graph = characterArt(defendingBuilderStats(builder.level).animation).graph;
  const shadowVertices = new Set(pose.shadows.flatMap((id) => graph.shapes[id].map(([, v]) => v)));
  const split = (
    items: NativeScenePose[],
  ): { body: NativeScenePose[]; shadow: NativeScenePose[] } => {
    const body: NativeScenePose[] = [],
      shadow: NativeScenePose[] = [];
    for (const item of items) {
      if ('group' in item) {
        const nested = split(item.group);
        if (nested.body.length) body.push({ ...item, group: nested.body });
        if (nested.shadow.length) shadow.push({ ...item, group: nested.shadow });
      } else (shadowVertices.has(item.vertices) ? shadow : body).push(item);
    }
    return { body, shadow };
  };
  return { prefix: pose.prefix, ...split(pose.poses) };
}
