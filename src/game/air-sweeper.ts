import { BUILDINGS, TROOPS } from './data';
import { MAP_SIZE } from './grid';
import { SWEEPER, sweeperAngle, sweeperStats } from './air-control-stats';
import type { Battle, Building, FX, Unit } from './model';

export interface AirPush {
  x: number;
  y: number;
  remaining: number;
}
export interface AirGust {
  sourceId: number;
  x: number;
  y: number;
  angle: number;
  radius: number;
  push: number;
  hit: number[];
  launched: number;
}
export interface SweeperState {
  targetId: number;
  prepare: number;
  angle: number;
  firedAt?: number;
}

export function angleDifference(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

export function inSweeperRange(tower: Building, u: Pick<Unit, 'x' | 'y'>) {
  const x = u.x - tower.x - 1,
    y = u.y - tower.y - 1;
  const distance = Math.hypot(x, y);
  return (
    distance >= SWEEPER.minRange &&
    distance <= SWEEPER.range &&
    Math.abs(angleDifference(Math.atan2(y, x), sweeperAngle(tower.direction))) <=
      SWEEPER.cone / 2 + 1e-9
  );
}

/** One traveling front can affect a flyer only once, including after replay seeking. */
export function stepSweepers(b: Battle, dt: number, effect: (fx: FX) => void) {
  const gusts = (b.gusts ??= []);
  for (const gust of gusts) {
    const previous = gust.radius;
    gust.radius = Math.min(SWEEPER.range, previous + SWEEPER.speed * dt);
    for (const u of b.units) {
      if (u.hp <= 0 || !TROOPS[u.kind].flying || gust.hit.includes(u.id)) continue;
      const x = u.x - gust.x,
        y = u.y - gust.y,
        distance = Math.hypot(x, y);
      const angle = angleDifference(Math.atan2(y, x), gust.angle);
      if (
        distance < Math.max(SWEEPER.minRange, previous - 0.3) ||
        distance > gust.radius + 0.3 ||
        Math.abs(angle) > SWEEPER.waveCone / 2 ||
        Math.abs(Math.sin(angle) * distance) > SWEEPER.halfWidth
      )
        continue;
      gust.hit.push(u.id);
      const old = u.airPush;
      const remainingX = old ? old.x * old.remaining : 0;
      const remainingY = old ? old.y * old.remaining : 0;
      u.airPush = {
        x: (remainingX + (x / distance) * gust.push) / SWEEPER.pushSeconds,
        y: (remainingY + (y / distance) * gust.push) / SWEEPER.pushSeconds,
        remaining: SWEEPER.pushSeconds,
      };
      u.attacking = false;
      u.path = [];
      u.pathAt = 0;
    }
  }
  b.gusts = gusts.filter((g) => g.radius < SWEEPER.range);
  for (const tower of b.buildings) {
    if (tower.kind !== 'airsweeper') continue;
    const states = (b.sweepers ??= {});
    if (tower.hp <= 0 || tower.constructing || tower.upgradeEnd) {
      delete states[tower.id];
      continue;
    }
    const activeDt = Math.min(dt, Math.max(0, b.elapsed - (b.defenseStuns[tower.id] ?? 0)));
    if (activeDt < dt) {
      delete states[tower.id];
      delete b.defenseTargets[tower.id];
    }
    if (activeDt <= 0) continue;
    const preparationDt = Math.max(0, activeDt - tower.cooldown);
    tower.cooldown = Math.max(0, tower.cooldown - activeDt);
    let state: SweeperState | undefined = states[tower.id];
    const eligible = (u: Unit) => u.hp > 0 && !!TROOPS[u.kind].flying && inSweeperRange(tower, u);
    let target = b.units.find((u) => u.id === state?.targetId && eligible(u));
    if (!target) {
      delete states[tower.id];
      delete b.defenseTargets[tower.id];
      state = undefined;
    }
    if (tower.cooldown > 0) continue;
    if (!state) {
      target = b.units
        .filter(eligible)
        .sort(
          (a, c) =>
            Math.hypot(a.x - tower.x - 1, a.y - tower.y - 1) -
              Math.hypot(c.x - tower.x - 1, c.y - tower.y - 1) || a.id - c.id,
        )[0];
      if (!target) continue;
      state = states[tower.id] = {
        targetId: target.id,
        prepare: SWEEPER.prepare,
        angle: sweeperAngle(tower.direction),
      };
      b.defenseTargets[tower.id] = target.id;
      continue;
    }
    state.angle = Math.atan2(target!.y - tower.y - 1, target!.x - tower.x - 1);
    state.prepare -= preparationDt;
    if (state.prepare > 1e-9) continue;
    const x = tower.x + BUILDINGS[tower.kind].size / 2,
      y = tower.y + BUILDINGS[tower.kind].size / 2;
    (b.gusts ??= []).push({
      sourceId: tower.id,
      x,
      y,
      angle: state.angle,
      radius: SWEEPER.minRange,
      push: sweeperStats(tower.level).push,
      hit: [],
      launched: b.elapsed,
    });
    state.firedAt = b.elapsed;
    const overshoot = Math.min(0, state.prepare);
    state.prepare = SWEEPER.prepare;
    // Preparation is part of the five-second cycle.
    tower.cooldown = SWEEPER.rate - SWEEPER.prepare + overshoot;
    effect({
      type: 'gust',
      sourceId: tower.id,
      x,
      y,
      toX: x + Math.cos(state.angle),
      toY: y + Math.sin(state.angle),
    });
  }
}

/** Displacement is independent of Rage and cancels attacks until the push ends. */
export function stepAirPush(u: Unit, dt: number) {
  const push = u.airPush;
  if (!push) return false;
  const travel = Math.min(dt, push.remaining);
  u.x = Math.max(0, Math.min(MAP_SIZE, u.x + push.x * travel));
  u.y = Math.max(0, Math.min(MAP_SIZE, u.y + push.y * travel));
  u.attacking = false;
  u.cooldown = Math.max(0, u.cooldown - travel);
  push.remaining -= travel;
  if (push.remaining <= 1e-9) delete u.airPush;
  return true;
}
