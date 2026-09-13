import { BUILDINGS, SPELL_KEYS, SPELLS, TROOP_KEYS, TROOPS } from './data';
import type { LateCombatContext } from './late-campaign';
import type { Battle, Building } from './model';
import { spellTowerDefenseBoost } from './spell-tower';
import { BUILDER_HUT_HOUSING, builderHutWeapon } from './builder-hut-stats';
import {
  emptyWeaponSlots,
  firstWeaponTickAfter,
  launchLateProjectile,
  stepLateProjectiles,
  tickWeaponSlots,
  weaponCandidates,
  weaponTickTime,
  WEAPON_TICK_MS,
  type LateProjectile,
  type WeaponSlot,
} from './late-goblin-weapon';

/** Armed Builder's Huts: nail turret and repairing Defending Builder.
 * The turret is complete; the campaign gate stays closed until the Defending Builder lands. */
export const BUILDER_HUT_READY = false;

export interface BuilderHutShot {
  index: number;
  at: number;
  impact: number;
  x: number;
  y: number;
  toAir: boolean;
}
export interface BuilderHutHit {
  index: number;
  at: number;
  x: number;
  y: number;
  toAir: boolean;
}
export interface BuilderHutState {
  /** First combat tick that observed the WakeUpSpace deployment threshold. */
  wakeAt?: number;
  /** Tick on which the WakeUpSpeed countdown reached zero: the turret fires from here. */
  readyAt?: number;
  nextTick: number;
  slot: WeaponSlot;
  fired: number;
  /** Last aim offset in tiles from the hut center; drives turret facing after a shot. */
  aimX: number;
  aimY: number;
  shots: BuilderHutShot[];
  hits: BuilderHutHit[];
}
/** Battle-only state, reconstructed from the replay snapshot and simulation clock. */
export interface BuilderHutBattleState {
  huts: Record<number, BuilderHutState>;
  projectiles: LateProjectile[];
  destroyed: Record<number, number>;
}
/** The turret applies no per-attacker status. */
export type BuilderHutUnitState = Record<string, never>;

const HISTORY_SECONDS = 5;
/** Only campaign Builder's Huts in version-44 goblin-v1 battles are armed; home huts stay passive. */
export const campaignBuilderHut = (battle: Battle | null | undefined, b: Building) =>
  !!battle?.late &&
  battle.catalog === 'goblin-v1' &&
  !battle.practice &&
  b.kind === 'builder' &&
  !b.npc;
const center = (b: Building) => ({
  x: b.x + BUILDINGS.builder.size / 2,
  y: b.y + BUILDINGS.builder.size / 2,
});

/**
 * Battle-log housing: troops at UNIT_HOUSING_COST_MULTIPLIER, spells at
 * SPELL_HOUSING_COST_MULTIPLIER and the deployed King at HERO_HOUSING_COST_MULTIPLIER
 * (pinned globals and hero row). Garrison defenders never count.
 */
export function deployedHousingSpace(battle: Battle) {
  let total = 0;
  for (const kind of TROOP_KEYS)
    total +=
      (BUILDER_HUT_HOUSING.unit *
        TROOPS[kind].space *
        Math.max(0, battle.carriedArmy[kind] - battle.remaining[kind])) /
      100;
  for (const kind of SPELL_KEYS)
    total +=
      (BUILDER_HUT_HOUSING.spell *
        SPELLS[kind].space *
        Math.max(0, battle.carried[kind] - battle.spells[kind])) /
      100;
  if (battle.hero && battle.hero.unitId !== null)
    total += (BUILDER_HUT_HOUSING.hero * BUILDER_HUT_HOUSING.barbarianKing) / 100;
  return total;
}

function stateFor(battle: Battle) {
  if (!battle.late) return undefined;
  if (!battle.late.builderHut && !battle.buildings.some((b) => campaignBuilderHut(battle, b)))
    return undefined;
  return (battle.late.builderHut ??= { huts: {}, projectiles: [], destroyed: {} });
}

function stepHuts(battle: Battle, dt: number, state: BuilderHutBattleState) {
  let deployed: number | undefined;
  for (const hut of battle.buildings) {
    if (!campaignBuilderHut(battle, hut)) continue;
    const weapon = builderHutWeapon(hut.level);
    if (!weapon) continue;
    const s = (state.huts[hut.id] ??= {
      nextTick: firstWeaponTickAfter(battle.elapsed - dt),
      slot: emptyWeaponSlots(1)[0],
      fired: 0,
      aimX: 1,
      aimY: 0,
      shots: [],
      hits: [],
    });
    const from = center(hut);
    while (weaponTickTime(s.nextTick) <= battle.elapsed + 1e-9) {
      const at = weaponTickTime(s.nextTick++);
      if (hut.hp <= 0) {
        Object.assign(s.slot, { targetId: null, chargeMs: 0 });
        continue;
      }
      if (s.wakeAt === undefined) {
        // Deployments only occur between simulation samples, so every tick in this
        // sample observes the same battle-log total.
        deployed ??= deployedHousingSpace(battle);
        if (deployed < weapon.wakeUpSpace) continue;
        s.wakeAt = at;
        // The countdown decrements on this tick; combat proceeds on the tick it reaches zero.
        s.readyAt = weaponTickTime(s.nextTick - 2 + Math.ceil(weapon.wakeUpMs / WEAPON_TICK_MS));
      }
      if (at < s.readyAt! - 1e-9) continue;
      const boost = spellTowerDefenseBoost(battle, hut, at);
      const candidates = weaponCandidates(battle, from, weapon, at);
      const slots = [s.slot];
      for (const { target } of tickWeaponSlots(
        slots,
        candidates,
        WEAPON_TICK_MS * boost.rate,
        weapon.intervalMs,
      )) {
        const toAir = !!TROOPS[target.kind].flying;
        const projectile = launchLateProjectile({
          sourceId: hut.id,
          index: ++s.fired,
          slot: 0,
          targetId: target.id,
          toAir,
          fromX: from.x,
          fromY: from.y,
          x: target.x,
          y: target.y,
          launched: at,
          damage: boost.damage === 1 ? weapon.damage : weapon.damage * boost.damage,
          speed: weapon.projectileSpeed,
          tracking: weapon.projectile.tracking,
          splash: 0,
        });
        state.projectiles.push(projectile);
        s.shots.push({
          index: projectile.index,
          at,
          impact: projectile.impact,
          x: target.x,
          y: target.y,
          toAir,
        });
      }
      const aimed = candidates.find((u) => u.id === s.slot.targetId);
      if (aimed) {
        s.aimX = aimed.x - from.x;
        s.aimY = aimed.y - from.y;
      }
    }
    s.shots = s.shots.filter((shot) => shot.at >= battle.elapsed - HISTORY_SECONDS);
    s.hits = s.hits.filter((hit) => hit.at >= battle.elapsed - HISTORY_SECONDS);
  }
}

export function stepBuilderHut(context: LateCombatContext) {
  const { battle, phase } = context;
  if (phase !== 'projectiles' && phase !== 'defenses') return;
  const state = stateFor(battle);
  if (!state) return;
  if (phase === 'defenses') {
    stepHuts(battle, context.dt, state);
    return;
  }
  const { pending, hits } = stepLateProjectiles(battle, state.projectiles);
  state.projectiles = pending;
  for (const { projectile: p, struck } of hits) {
    const hut = state.huts[p.sourceId];
    if (hut && struck.length)
      hut.hits.push({ index: p.index, at: p.impact, x: p.x, y: p.y, toAir: p.toAir });
  }
}
/** True while this family still has an unresolved effect that must finish before results. */
export function builderHutPending(battle: Battle) {
  return (battle.late?.builderHut?.projectiles.length ?? 0) > 0;
}
export function builderHutDestroyed(context: LateCombatContext, building: Building, at: number) {
  if (!campaignBuilderHut(context.battle, building)) return;
  const state = stateFor(context.battle);
  if (!state) return;
  state.destroyed[building.id] ??= at;
  const hut = state.huts[building.id];
  if (hut) Object.assign(hut.slot, { targetId: null, chargeMs: 0 });
}
/** ActivatedCombatAddBuildingClass=Defense once the woken turret enters combat. */
export function builderHutDefenseClass(battle: Battle, building: Building) {
  const hut = battle.late?.builderHut?.huts[building.id];
  return (
    !!hut && building.hp > 0 && hut.readyAt !== undefined && hut.readyAt <= battle.elapsed + 1e-9
  );
}
/**
 * Hook for the Defending Builder (DefenceTroopCharacter "Defending Builder", one per armed hut,
 * DefenceTroopLevel 1-3 for hut levels 2-4). `wakeAt` is when the hut observed its WakeUpSpace
 * deployment, `readyAt` when its combat started, `destroyedAt` when the hut fell. All times are
 * battle seconds and reconstruct identically in replays. The character itself is not implemented.
 */
export function builderHutActivation(battle: Battle | null | undefined, building: Building) {
  if (!battle || !campaignBuilderHut(battle, building) || !builderHutWeapon(building.level))
    return undefined;
  const hut = battle.late?.builderHut?.huts[building.id];
  return {
    level: building.level,
    wakeAt: hut?.wakeAt,
    readyAt: hut?.readyAt,
    destroyedAt: battle.late?.builderHut?.destroyed[building.id],
  };
}
