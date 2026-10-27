import { poisonAvoidanceTarget } from './poison-avoidance';
import { defenderHitPoisonScales } from './defender-hit-poison';
import { defenderFrostScales } from './defender-frost';
import { defenderRageStats } from './native-rage';
import { TROOPS } from './data';
import { heroRow, HERO_UNIT, type HeroKind } from './native-hero-data';
import { nativeUnitStats } from './native-units';
import { tiles } from './native-data';
import { hurtUnit, unitHidden } from './native-status';
import { distance2D } from './distance';
import { findPath, type Battle, type FX } from './model';
import type { HeroDefender } from './defenders';
export interface DefendingHeroSetup {
  kind: HeroKind;
  level: number;
  x: number;
  y: number;
}
export function defendingHero(setup: DefendingHeroSetup, index: number): HeroDefender {
  const stats = nativeUnitStats(HERO_UNIT[setup.kind], setup.level);
  return {
    id: -10000 - index,
    sourceId: -10000 - index,
    kind: 'hero',
    hero: setup.kind,
    level: setup.level,
    home: { x: setup.x, y: setup.y },
    x: setup.x,
    y: setup.y,
    mode: stats.flying ? 'air' : 'ground',
    hp: stats.hp,
    maxHp: stats.hp,
    spawnedAt: 0,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
}
/** Local practice snapshots defenders with their levels; equipment and pets belong to attacks. */
export function stepDefendingHeroes(battle: Battle, dt: number, effect: (fx: FX) => void) {
  for (const d of battle.defenders ?? []) {
    if (d.kind !== 'hero' || d.hp <= 0) continue;
    d.attacking = false;
    const stunnedUntil = d.stunnedUntil ?? 0;
    if (stunnedUntil > battle.elapsed) continue;
    const activeDt =
      battle.nativeDefendingHeroStunTime && stunnedUntil > 0
        ? Math.min(dt, Math.max(0, battle.elapsed - stunnedUntil))
        : dt;
    if (activeDt <= 0) continue;
    const stats = battle.nativeRageRules
        ? defenderRageStats(battle, d, nativeUnitStats(HERO_UNIT[d.hero], d.level))
        : nativeUnitStats(HERO_UNIT[d.hero], d.level),
      row = heroRow(d.hero, d.level);
    const alert = tiles(row, 'AlertRadius') || 12,
      leash = tiles(row, 'MaxSearchRadiusForDefender') || 10;
    const eligible = battle.units.filter(
      (u) =>
        u.hp > 0 &&
        !u.ejected &&
        !unitHidden(u, battle.elapsed) &&
        (!TROOPS[u.kind].flying || stats.airTargets) &&
        distance2D(u.x - d.home.x, u.y - d.home.y) <= (d.alerted ? leash : alert),
    );
    const target =
      eligible.find((u) => u.id === d.target) ??
      eligible.sort(
        (a, b) =>
          distance2D(a.x - d.x, a.y - d.y) - distance2D(b.x - d.x, b.y - d.y) || a.id - b.id,
      )[0];
    d.target = target?.id ?? null;
    d.alerted = !!target;
    const wasAvoiding = !!d.avoidingPoison;
    const escape = !target ? poisonAvoidanceTarget(battle, d, d.home) : undefined;
    if (escape) d.avoidingPoison = true;
    else delete d.avoidingPoison;
    if (wasAvoiding !== !!escape) {
      d.path = [];
      d.pathAt = 0;
    }
    const point = target ?? escape ?? d.home,
      distance = distance2D(point.x - d.x, point.y - d.y);
    const poison = d.poison && d.poison.until > battle.elapsed ? d.poison : undefined;
    const hitPoison = defenderHitPoisonScales(d, battle.elapsed);
    const frost = defenderFrostScales(d, battle.elapsed);
    const areaAttackScale = battle.nativeDefendingHeroPoison
      ? Math.max(0.05, 1 + (poison?.attack ?? 0))
      : 1 - (poison?.attack ?? 0);
    const attackScale = hitPoison ? Math.min(areaAttackScale, hitPoison.attack) : areaAttackScale;
    d.cooldown -= activeDt * attackScale * frost.attack;
    if (target && distance <= stats.range) {
      d.attacking = true;
      if (d.cooldown <= 0) {
        d.cooldown += stats.rate;
        hurtUnit(
          battle,
          target,
          stats.damage,
          battle.elapsed,
          battle.nativeRevengeDeck ? d.id : undefined,
        );
        effect({ type: 'hit', x: d.x, y: d.y, toX: target.x, toY: target.y, sourceId: d.id });
      }
      continue;
    }
    if (distance < 0.05) {
      if (escape) d.path = [];
      continue;
    }
    d.pathAt -= activeDt;
    if (d.mode === 'air') d.path = [point];
    else if (d.pathAt <= 0 || !d.path.length) {
      const dummy = { ...battle.buildings[0], x: point.x, y: point.y, kind: 'wall' as const };
      d.path = findPath(
        d,
        escape ?? dummy,
        battle.buildings.filter((b) => b.hp > 0 && b.kind !== 'wall'),
        target ? stats.range : 0.1,
      );
      d.pathAt = 1;
    }
    const areaMoveScale = battle.nativeDefendingHeroPoison
      ? Math.max(0, 1 + (poison?.speed ?? 0))
      : 1 - (poison?.speed ?? 0);
    const moveScale = hitPoison ? Math.min(areaMoveScale, hitPoison.move) : areaMoveScale;
    let travel = stats.speed * activeDt * moveScale * frost.move;
    while (travel > 0 && d.path.length) {
      const p = d.path[0],
        length = distance2D(p.x - d.x, p.y - d.y),
        step = Math.min(length, travel);
      if (length > 0) {
        d.x += ((p.x - d.x) * step) / length;
        d.y += ((p.y - d.y) * step) / length;
      }
      travel -= step;
      if (step >= length) d.path.shift();
      else break;
    }
  }
}
