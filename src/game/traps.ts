import { BUILDINGS, TROOPS, springCapacity, trapStats } from './data';
import type { Battle, Building, FX, Unit } from './model';
import { PUMPKIN_BOMB } from './pumpkin-bomb';
import { NPC_BUILDINGS } from './npc-buildings';
import { SPRING_AIRTIME } from './trap-stats';
import { SKELETON_TRAP, skeletonCount } from './skeleton-stats';
import { spawnSkeleton } from './defenders';
import { SANTA_TRAP, makeSantaState, stepSanta, type SantaState } from './santa-trap';

/** Battle-only state. A home trap is always armed when a fresh attack starts. */
export interface TrapState {
  activatedAt: number;
  resolved: boolean;
  targetId: number;
  x: number;
  y: number;
  spawned?: number;
  santa?: SantaState;
}

export function springOutcome(housing: number, hp: number, capacity: number, damage: number) {
  const ejected = housing <= capacity || hp <= damage;
  return { ejected, hp: ejected ? 0 : hp - damage };
}

/** Resolve campaign identity before archetype, keeping seasonal traps out of the home catalog. */
export function battleTrapStats(trap: Pick<Building, 'kind' | 'level' | 'npc'>) {
  const base = trapStats(trap.kind, trap.level);
  if (base && trap.npc === 'pumpkin-bomb') return { ...base, ...PUMPKIN_BOMB };
  if (base && trap.npc === 'santa-trap') return { ...base, ...SANTA_TRAP };
  return base;
}

export function stepTraps(battle: Battle, dt: number, effect: (fx: FX) => void) {
  if (battle.finished) return false;
  let changed = false;
  for (const trap of battle.buildings) {
    const d = battleTrapStats(trap);
    if (!d || trap.constructing || trap.upgradeEnd) continue;
    const mode = trap.kind === 'skeletontrap' ? (trap.skeletonMode ?? 'ground') : d.targets;
    let state = battle.traps[trap.id];
    if (state?.resolved) continue;
    const center = {
      x: trap.x + BUILDINGS[trap.kind].size / 2,
      y: trap.y + BUILDINGS[trap.kind].size / 2,
    };
    const eligible = (u: Unit) =>
      u.hp > 0 &&
      (u.hero ? 25 : TROOPS[u.kind].space) >= (d.minHousing ?? 0) &&
      (!d.springCapacity || (u.springUntil ?? 0) <= battle.elapsed) &&
      !!TROOPS[u.kind].flying === (mode === 'air');
    if (!state) {
      const nearby = battle.units.filter(
        (u) => eligible(u) && Math.hypot(u.x - center.x, u.y - center.y) <= d.trigger,
      );
      nearby.sort(
        (a, b) =>
          (d.springCapacity
            ? (b.hero ? 25 : TROOPS[b.kind].space) - (a.hero ? 25 : TROOPS[a.kind].space)
            : 0) ||
          Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y) ||
          a.id - b.id,
      );
      const target = nearby[0];
      if (!target) continue;
      state = battle.traps[trap.id] = {
        activatedAt: battle.elapsed,
        resolved: false,
        targetId: target.id,
        ...center,
      };
      if (trap.npc === 'santa-trap') state.santa = makeSantaState(state, trap.id, battle.seed);
      // Springs resolve immediately and provide their own label and sound below.
      if (!d.springCapacity && trap.npc !== 'santa-trap')
        effect({
          type: 'trap',
          ...center,
          text: trap.npc ? NPC_BUILDINGS[trap.npc].name : BUILDINGS[trap.kind].name,
          color: mode === 'air' ? 0xff746c : 0xffd175,
        });
      changed = true;
    }
    if (state.santa) {
      changed = stepSanta(battle, state) || changed;
      continue;
    }
    if (trap.kind === 'skeletontrap') {
      const count = skeletonCount(trap.level);
      while ((state.spawned ?? 0) < count) {
        const index = state.spawned ?? 0,
          at = state.activatedAt + SKELETON_TRAP.firstSpawn + index * SKELETON_TRAP.spawnInterval;
        if (at > battle.elapsed + 1e-9) break;
        spawnSkeleton(battle, trap, at, index);
        state.spawned = index + 1;
        changed = true;
      }
      if (state.spawned === count) state.resolved = true;
      continue;
    }
    if (d.homingSpeed) {
      // A mine follows one live air target; loss of that target consumes the shot.
      const target = battle.units.find((u) => u.id === state.targetId && eligible(u));
      if (!target) {
        state.resolved = true;
        changed = true;
        continue;
      }
      const flightDt = Math.min(dt, Math.max(0, battle.elapsed - state.activatedAt - d.delay));
      if (flightDt <= 0) continue;
      const x = target.x - state.x,
        y = target.y - state.y;
      const distance = Math.hypot(x, y),
        travel = d.homingSpeed * flightDt;
      if (distance > travel + 1e-9) {
        state.x += (x / distance) * travel;
        state.y += (y / distance) * travel;
        continue;
      }
      state.x = target.x;
      state.y = target.y;
      target.hp -= d.damage;
      state.resolved = true;
      changed = true;
      effect({ type: 'blast', x: state.x, y: state.y, radius: 0.6, toAir: true, color: 0xff3c46 });
      continue;
    }
    if (d.targets === 'air') {
      const target = battle.units.find((u) => u.id === state.targetId);
      if (target) {
        const remaining = Math.max(dt, state.activatedAt + d.delay - battle.elapsed + dt);
        const fraction = Math.min(1, dt / remaining);
        state.x += (target.x - state.x) * fraction;
        state.y += (target.y - state.y) * fraction;
      }
    }
    if (battle.elapsed + 1e-9 < state.activatedAt + d.delay) continue;
    state.resolved = true;
    changed = true;
    const power = d.damage;
    if (d.springCapacity) {
      const target = battle.units.find((u) => u.id === state.targetId && eligible(u));
      if (!target) continue;
      const outcome = target.hero
        ? { ejected: false, hp: target.hp - power * 0.5 }
        : springOutcome(TROOPS[target.kind].space, target.hp, springCapacity(trap.level), power);
      target.hp = outcome.hp;
      target.ejected = outcome.ejected;
      if (outcome.ejected)
        target.spent = true; // No death bomb from a troop flung out of the village.
      else {
        target.springUntil = battle.elapsed + SPRING_AIRTIME;
        target.attacking = false;
        target.path = [];
        target.pathAt = 0;
      }
      effect({ type: 'spring', x: target.x, y: target.y });
    } else {
      for (const u of battle.units)
        if (eligible(u) && Math.hypot(u.x - state.x, u.y - state.y) <= d.radius) u.hp -= power;
      effect({
        type: 'blast',
        x: state.x,
        y: state.y,
        radius: d.radius,
        toAir: d.targets === 'air',
        color: d.targets === 'air' ? 0xff7065 : 0xff9a3c,
      });
    }
  }
  return changed;
}
