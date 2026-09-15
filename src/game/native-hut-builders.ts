import { distance2D } from './distance';
import { BUILDINGS, isTrap } from './data';
import type { Defender, RepairDefender } from './defenders';
import { hutRepair, nativeWeapon } from './native-defense-stats';
import { buildingHidden, buildingImmune } from './native-status';
import type { NativeTroopContext } from './native-troops';
import { findPath, type Building } from './model';

/**
 * Builder's Hut repair (version 45+). Each weaponized hut (level 2+) releases its Defending
 * Builder (characters.csv, level = hut level - 1) when the hut's combat wakes. The builder walks
 * to damaged, visible, non-wall buildings within the hut's 7-tile area and restores
 * -DPS x AttackSpeed hitpoints every 0.75 s. It cannot be attacked, stops while frozen or
 * stunned, and hides once its hut is destroyed. Several builders on one building follow the
 * official wiki's diminishing returns (third and fourth 90%, fifth 70%).
 */
const STACK = [1, 1, 0.9, 0.9, 0.7];
const EPS = 1e-9;
export const isRepairer = (d: Defender): d is RepairDefender => d.kind === 'repairer';
const center = (b: Building) => ({
  x: b.x + BUILDINGS[b.kind].size / 2,
  y: b.y + BUILDINGS[b.kind].size / 2,
});
const footprintGap = (p: { x: number; y: number }, b: Building) => {
  const s = BUILDINGS[b.kind].size;
  return distance2D(Math.max(b.x - p.x, 0, p.x - b.x - s), Math.max(b.y - p.y, 0, p.y - b.y - s));
};

export function stepHutBuilders(ctx: NativeTroopContext, dt: number) {
  const battle = ctx.battle;
  if (!battle.nativeRoster) return;
  const at = battle.elapsed;
  for (const hut of battle.buildings) {
    if (hut.kind !== 'builder' || hut.npc || hut.constructing || hut.upgradeEnd) continue;
    const repair = hutRepair(hut.level);
    if (!repair || !nativeWeapon('builder', hut.level)) continue;
    const awake = battle.nativeDefenses?.[hut.id]?.awakeAt;
    if (awake === undefined || awake > at + EPS) continue;
    if ((battle.defenders ?? []).some((d) => isRepairer(d) && d.sourceId === hut.id)) continue;
    const c = center(hut);
    for (let i = 0; i < repair.count; i++)
      (battle.defenders ??= []).push({
        id: -2000 - hut.id * 8 - i,
        kind: 'repairer',
        sourceId: hut.id,
        level: hut.level,
        mode: 'ground',
        x: c.x,
        y: c.y,
        hp: 1,
        maxHp: 1,
        spawnedAt: at,
        cooldown: 0,
        target: null,
        path: [],
        pathAt: 0,
        attacking: false,
        clock: 0,
        readyAt: 0,
      });
  }
  const repairing = new Map<number, RepairDefender[]>();
  for (const d of battle.defenders ?? []) if (isRepairer(d)) stepRepairer(ctx, d, dt, repairing);
}

function stepRepairer(
  ctx: NativeTroopContext,
  d: RepairDefender,
  dt: number,
  repairing: Map<number, RepairDefender[]>,
) {
  const battle = ctx.battle;
  const at = battle.elapsed;
  d.attacking = false;
  const hut = battle.buildings.find((b) => b.id === d.sourceId);
  if (!hut || hut.hp <= 0) {
    // The builder hides in the ruined hut's bunker.
    d.hidden = true;
    return;
  }
  const repair = hutRepair(hut.level)!;
  const activeDt = Math.min(dt, Math.max(0, at - (d.stunnedUntil ?? 0)));
  if (activeDt <= 0) return;
  const home = center(hut);
  const poisoned = d.poison && d.poison.until > at ? d.poison : undefined;
  const speed = repair.speed * (poisoned ? Math.max(0, 1 + poisoned.speed) : 1);
  const tempo = poisoned ? Math.max(0.05, 1 + poisoned.attack) : 1;
  const damaged = (b: Building) =>
    b.hp > 0 &&
    b.hp < b.maxHp - EPS &&
    b.kind !== 'wall' &&
    !isTrap(b.kind) &&
    !buildingHidden(battle, b, at) &&
    !buildingImmune(battle, b, at) &&
    footprintGap(home, b) <= repair.area + EPS;
  let target = battle.buildings.find((b) => b.id === d.target && damaged(b));
  if (!target) {
    target = battle.buildings
      .filter(damaged)
      .sort(
        (a, b) =>
          a.hp / a.maxHp - b.hp / b.maxHp || footprintGap(d, a) - footprintGap(d, b) || a.id - b.id,
      )[0];
    d.target = target?.id ?? null;
    d.path = [];
    d.pathAt = 0;
  }
  d.pathAt -= activeDt;
  if (!target) {
    walk(ctx, d, home, speed, activeDt, 0.5);
    return;
  }
  if (footprintGap(d, target) > repair.reach + 0.5 + EPS) {
    walk(ctx, d, target, speed, activeDt, repair.reach);
    return;
  }
  d.attacking = true;
  const crew = repairing.get(target.id) ?? [];
  crew.push(d);
  repairing.set(target.id, crew);
  d.clock = (d.clock ?? 0) + activeDt * tempo;
  while (d.readyAt <= d.clock + EPS) {
    d.readyAt += repair.interval;
    const efficiency = STACK[Math.min(STACK.length - 1, crew.length - 1)];
    target.hp = Math.min(target.maxHp, target.hp + repair.heal * efficiency);
  }
}

function walk(
  ctx: NativeTroopContext,
  d: RepairDefender,
  goal: Building | { x: number; y: number },
  speed: number,
  dt: number,
  range: number,
) {
  if (!d.path.length || d.pathAt <= 0) {
    d.path = findPath(
      d,
      goal,
      ctx.battle.buildings.filter((b) => b.kind !== 'wall'),
      range,
    );
    d.pathAt = 0.4;
  }
  let travel = speed * dt;
  while (d.path.length && travel > 0) {
    const next = d.path[0],
      dx = next.x - d.x,
      dy = next.y - d.y,
      len = distance2D(dx, dy);
    if (len <= travel) {
      d.x = next.x;
      d.y = next.y;
      d.path.shift();
      travel -= len;
    } else {
      d.x += (dx / len) * travel;
      d.y += (dy / len) * travel;
      break;
    }
  }
}
