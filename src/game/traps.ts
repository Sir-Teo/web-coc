import { hurtUnit, unitTriggersTraps } from './native-status';
import { distance2D } from './distance';
import { BUILDINGS, TROOPS, springCapacity, trapStats } from './data';
import type { Battle, Building, FX, Unit } from './model';
import { PUMPKIN_BOMB } from './pumpkin-bomb';
import { NPC_BUILDINGS } from './npc-buildings';
import { SPRING_AIRTIME } from './trap-stats';
import { SKELETON_TRAP, skeletonCount } from './skeleton-stats';
import { spawnSkeleton } from './defenders';
import { SANTA_TRAP, makeSantaState, stepSanta, type SantaState } from './santa-trap';
import { recordSeekingMineTrail, type SeekingMineFlight } from './seeking-mine-flight';
import { SHRINK_TRAP, makeShrinkState, stepShrink, type ShrinkState } from './shrink-trap';
import { NATIVE_TRAP_SOURCE, fling, nativeTrapValues, stepNativeTrap } from './native-traps';

/** Battle-only state. A home trap is always armed when a fresh attack starts. */
export interface TrapState {
  activatedAt: number;
  resolved: boolean;
  targetId: number;
  x: number;
  y: number;
  spawned?: number;
  santa?: SantaState;
  mine?: SeekingMineFlight;
  shrink?: ShrinkState;
}

export function springOutcome(housing: number, hp: number, capacity: number, damage: number) {
  const ejected = housing <= capacity || hp <= damage;
  return { ejected, hp: ejected ? 0 : hp - damage };
}

/** Resolve campaign identity before archetype, keeping seasonal traps out of the home catalog. */
export function battleTrapStats(trap: Pick<Building, 'kind' | 'level' | 'npc'>, battle?: Battle) {
  const base = trapStats(trap.kind, trap.level);
  if (base && trap.npc === 'pumpkin-bomb') return { ...base, ...PUMPKIN_BOMB };
  if (base && trap.npc === 'santa-trap') return { ...base, ...SANTA_TRAP };
  if (base && trap.npc === 'shrink-trap') return { ...base, ...SHRINK_TRAP };
  if (base && battle?.nativeRoster && !trap.npc && NATIVE_TRAP_SOURCE[trap.kind]) {
    // Version 45: every level's values come from the client rows (Town Hall 9-18 levels included).
    const values = nativeTrapValues(trap.kind, trap.level);
    return {
      ...base,
      damage: values.damage,
      radius: values.radius || base.radius,
      trigger: values.trigger || base.trigger,
      ...(base.springCapacity ? { springCapacity: values.ejectHousing } : {}),
      ...(values.pushback
        ? { pushback: values.pushback, pushbackHousing: values.pushbackHousing }
        : {}),
    };
  }
  return base;
}

export function stepTraps(battle: Battle, dt: number, effect: (fx: FX) => void) {
  if (battle.finished) return false;
  let changed = false;
  for (const trap of battle.buildings) {
    if (
      battle.nativeRoster &&
      !trap.npc &&
      (trap.kind === 'tornadotrap' || trap.kind === 'gigabomb')
    ) {
      if (!trap.constructing && !trap.upgradeEnd)
        changed = stepNativeTrap(battle, trap, effect) || changed;
      continue;
    }
    const d = battleTrapStats(trap, battle);
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
      unitTriggersTraps(u) &&
      (trap.npc !== 'shrink-trap' || (!u.ejected && (u.spawnedAt ?? 0) <= battle.elapsed)) &&
      (u.hero ? 25 : TROOPS[u.kind].space) >= (d.minHousing ?? 0) &&
      (!d.springCapacity || (u.springUntil ?? 0) <= battle.elapsed) &&
      (mode === 'both' || !!TROOPS[u.kind].flying === (mode === 'air'));
    if (!state) {
      const nearby = battle.units.filter(
        (u) => eligible(u) && distance2D(u.x - center.x, u.y - center.y) <= d.trigger,
      );
      nearby.sort(
        (a, b) =>
          (d.springCapacity
            ? (b.hero ? 25 : TROOPS[b.kind].space) - (a.hero ? 25 : TROOPS[a.kind].space)
            : 0) ||
          distance2D(a.x - center.x, a.y - center.y) - distance2D(b.x - center.x, b.y - center.y) ||
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
      if (trap.npc === 'shrink-trap') state.shrink = makeShrinkState(state);
      if (d.homingSpeed) state.mine = { trail: [], nextTrail: 0 };
      // Springs resolve immediately and provide their own label and sound below.
      if (!d.springCapacity && trap.npc !== 'santa-trap' && trap.npc !== 'shrink-trap')
        effect({
          type: 'trap',
          sourceId: trap.id,
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
    if (state.shrink) {
      changed = stepShrink(battle, state) || changed;
      continue;
    }
    if (trap.kind === 'skeletontrap') {
      const count =
        battle.nativeRoster && !trap.npc
          ? nativeTrapValues('skeletontrap', trap.level).spawns
          : skeletonCount(trap.level);
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
      const flight = (state.mine ??= { trail: [], nextTrail: 0 });
      // A mine follows one live air target; loss of that target consumes the shot.
      const target = battle.units.find((u) => u.id === state.targetId && eligible(u));
      if (!target) {
        state.resolved = true;
        flight.resolvedAt = battle.elapsed;
        flight.hit = false;
        changed = true;
        continue;
      }
      const flightDt = Math.min(dt, Math.max(0, battle.elapsed - state.activatedAt - d.delay));
      if (flightDt <= 0) continue;
      const x = target.x - state.x,
        y = target.y - state.y;
      const distance = distance2D(x, y),
        travel = d.homingSpeed * flightDt;
      const from = { x: state.x, y: state.y },
        start = battle.elapsed - flightDt;
      if (distance > travel + 1e-9) {
        state.x += (x / distance) * travel;
        state.y += (y / distance) * travel;
        recordSeekingMineTrail(
          flight,
          state.activatedAt + d.delay,
          start,
          battle.elapsed,
          battle.elapsed,
          from,
          state,
          false,
        );
        continue;
      }
      state.x = target.x;
      state.y = target.y;
      flight.resolvedAt = start + distance / d.homingSpeed;
      flight.hit = true;
      recordSeekingMineTrail(
        flight,
        state.activatedAt + d.delay,
        start,
        flight.resolvedAt,
        battle.elapsed,
        from,
        state,
        true,
      );
      hurtUnit(battle, target, d.damage);
      state.resolved = true;
      changed = true;
      effect({
        type: 'blast',
        sourceId: trap.id,
        x: state.x,
        y: state.y,
        radius: 0.6,
        toAir: true,
        color: 0xff3c46,
      });
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
        if (eligible(u) && distance2D(u.x - state.x, u.y - state.y) <= d.radius) {
          hurtUnit(battle, u, power);
          // Version 45: bombs push small troops (Pushback / PushbackHousingLimit).
          if (
            'pushback' in d &&
            d.pushback &&
            u.hp > 0 &&
            (u.hero ? 25 : TROOPS[u.kind].space) <= (d.pushbackHousing ?? 0)
          )
            fling(battle, u, state.x, state.y, d.pushback);
        }
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
