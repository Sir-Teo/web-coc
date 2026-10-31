import type { Battle, Unit } from './model';
import type { NativeTroopContext } from './native-troops';
import { statsFor } from './native-troops';
import { nativeUnitRow, nativeUnitStats, type NativeUnitStats } from './native-units';
import { nativeRow, num, seconds, text, tiles } from './native-data';
import { friendlyCombatant, healingEligible } from './friendly-unit';
import { splitTiming } from './garrison-kinds';
import { distance2D } from './distance';
import { healUnit } from './native-status';
import { castNativeSpell } from './native-spells';
import { launchProjectile, type CombatProjectile } from './projectiles';
import {
  advanceHealerWindup,
  beginHealerWindup,
  cancelHealerWindup,
  releaseHealerWindup,
} from './healer-windup';

// The dossier describes Eagle-style group selection. Keep its pinned neighborhood radius.
const groupRadius = tiles(nativeRow('buildings', 'Eagle Artillery', 1), 'TargetGroupsRadius');
// Two ordinary one-space troops carry 50 friendly weight each; either can anchor their group.
const minimumWeight = 100;
const excluded = new Set([
  'trooplauncher',
  'spellbat',
  'spellskeleton',
  'spellskeletonshielded',
  'furnace',
  'firemite',
]);
const cache = new Map<number, ReturnType<typeof resolveStats>>();
function resolveStats(level: number) {
  const stats = nativeUnitStats('trooplauncher', level),
    row = nativeUnitRow('trooplauncher', stats.level),
    projectile = nativeRow('projectiles', stats.projectile),
    spell = text(projectile, 'HitSpell'),
    spellLevel = num(projectile, 'HitSpellLevel', 1),
    payload = nativeRow('spells', spell, spellLevel),
    names = text(payload, 'SummonTroop').split(';'),
    counts = text(payload, 'UnitsToSpawn').split(';').map(Number),
    levels = text(payload, 'SpawnUpgradeLevel').split(';').map(Number);
  return {
    count: stats.attackCount,
    spawnIdle: seconds(row, 'SpawnIdle'),
    charge: splitTiming(row).firstHit,
    flight: seconds(projectile, 'FixedTravelTime'),
    spell,
    spellLevel,
    payload: names.map((name, i) => ({ name, count: counts[i], level: levels[i] })),
    healthLoss: stats.loseHp / stats.loseHpInterval,
  };
}
export function troopLauncherStats(level: number) {
  let result = cache.get(level);
  if (!result) cache.set(level, (result = resolveStats(level)));
  return result;
}

function friendlyWeight(battle: Battle, unit: Unit) {
  if (excluded.has(unit.kind) || !friendlyCombatant(unit, battle.elapsed)) return 0;
  const stats = statsFor(battle, unit);
  return num(nativeUnitRow(stats.kind, stats.level), 'FriendlyGroupWeight');
}
function groupWeight(battle: Battle, anchor: Unit) {
  let total = 0;
  for (const other of battle.units)
    if (distance2D(other.x - anchor.x, other.y - anchor.y) <= groupRadius + 1e-9)
      total += friendlyWeight(battle, other);
  return total;
}
/** Healthy groups qualify too; equal scores keep the first deployed anchor. */
export function troopLauncherTarget(battle: Battle, launcher: Unit) {
  let best: Unit | undefined,
    score = minimumWeight - 1;
  for (const ally of battle.units) {
    if (ally.id === launcher.id || friendlyWeight(battle, ally) <= 0) continue;
    const weight = groupWeight(battle, ally);
    if (weight >= minimumWeight && weight > score) {
      best = ally;
      score = weight;
    }
  }
  return best;
}

/** A stationary friendly caster; the ordinary healer target pass does not own its target. */
export function stepTroopLauncher(
  ctx: NativeTroopContext,
  unit: Unit,
  stats: NativeUnitStats,
  dt: number,
  actionDt: number,
) {
  const battle = ctx.battle,
    ability = troopLauncherStats(stats.level),
    readyAt = (unit.spawnedAt ?? 0) + ability.spawnIdle,
    activeDt = Math.max(0, Math.min(dt, battle.elapsed - readyAt));
  unit.target = null;
  delete unit.defenderTarget;
  unit.path = [];
  unit.attacking = false;
  if (activeDt <= 1e-9) return;
  const windup = advanceHealerWindup(
    battle,
    unit,
    activeDt,
    dt > 0 ? (actionDt * activeDt) / dt : 0,
  );
  if (windup.actionDt <= 1e-9) return;
  let target = windup.engaged
    ? battle.units.find((ally) => ally.id === windup.targetId)
    : undefined;
  if (
    !target ||
    friendlyWeight(battle, target) <= 0 ||
    groupWeight(battle, target) < minimumWeight
  ) {
    cancelHealerWindup(unit);
    delete unit.healTarget;
    target = undefined;
  }
  if (windup.recovery > 1e-9) return;
  // Pick anew when recovery ends, then hold the short charge against the selected group.
  if (!windup.engaged || windup.recoveryAtStart > 1e-9) {
    target = troopLauncherTarget(battle, unit);
    if (!target) {
      cancelHealerWindup(unit);
      delete unit.healTarget;
      return;
    }
  }
  if (!target) return;
  unit.healTarget = target.id;
  beginHealerWindup(battle, unit, target.id);
  unit.attacking = true;
  if (windup.remaining > 1e-9) return;
  launchProjectile(
    battle,
    {
      weapon: 'native',
      native: {
        name: stats.projectile,
        kind: unit.kind,
        level: stats.level,
        healing: { remaining: 0, hit: [unit.id, target.id] },
        troopLauncher: true,
        captureSource: true,
      },
      sourceId: unit.id,
      targetId: target.id,
      targetBuilding: false,
      fromX: unit.x,
      fromY: unit.y,
      x: target.x,
      y: target.y,
      fromAir: false,
      toAir: statsFor(battle, target).flying,
      damage: stats.heal,
      splash: stats.splash,
    },
    ctx.effect,
  );
  const state = unit.native!;
  state.lastAttackAt = battle.elapsed;
  state.attacks = (state.attacks ?? 0) + 1;
  releaseHealerWindup(battle, unit);
  if (state.attacks >= ability.count) {
    unit.hp = 0;
    unit.spent = true;
    unit.defeatedAt = battle.elapsed;
  }
}

/** Barrel troops survive loss of the caster or recipient; the tiny heal uses its fixed point. */
export function resolveTroopLauncherImpact(ctx: NativeTroopContext, shot: CombatProjectile) {
  if (!ctx.battle.nativeTroopLauncherFriendly || !shot.native?.troopLauncher) return false;
  const stats = nativeUnitStats('trooplauncher', shot.native.level),
    ability = troopLauncherStats(stats.level);
  for (const ally of ctx.battle.units) {
    if (!healingEligible(ctx.battle, ally, shot.impact)) continue;
    if (statsFor(ctx.battle, ally).flying !== !!shot.toAir) continue;
    if (distance2D(ally.x - shot.x, ally.y - shot.y) > stats.splash + 1e-9) continue;
    healUnit(ctx.battle, ally, shot.damage * (ally.hero ? stats.heroMultiplier : 1), shot.impact);
  }
  castNativeSpell(ctx.battle, ability.spell, ability.spellLevel, 'attack', shot.x, shot.y, {
    at: shot.impact,
    immediate: true,
  });
  return true;
}
