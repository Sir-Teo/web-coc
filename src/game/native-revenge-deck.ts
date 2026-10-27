import { BUILDINGS, TROOPS } from './data';
import { distance2D } from './distance';
import { distanceTo, type Unit } from './model';
import { num, text, tiles, seconds } from './native-data';
import type { HeroAbility } from './native-heroes';
import type { NativeTroopContext } from './native-troops';
import { launchProjectile } from './projectiles';
import { healUnit } from './native-status';

export interface RevengeHit {
  sourceId: number;
  at: number;
  x: number;
  y: number;
}

/** Consume actual direct hits once, preserving an independent source cooldown for each attacker. */
export function stepRevengeDeck(
  ctx: NativeTroopContext,
  unit: Unit,
  ability: HeroAbility,
  state: Record<string, number>,
) {
  const hits = unit.native?.revengeHits;
  if (!hits?.length) return;
  delete unit.native!.revengeHits;
  hits.sort((a, b) => a.at - b.at || a.sourceId - b.sourceId);
  for (const hit of hits) {
    const key = `reflect:${ability.name}:${hit.sourceId}`;
    if (hit.at + 1e-9 < (state[key] ?? 0)) continue;
    const building =
      hit.sourceId > 0
        ? ctx.battle.buildings.find((building) => building.id === hit.sourceId && building.hp > 0)
        : undefined;
    const defender =
      hit.sourceId < 0
        ? ctx.battle.defenders?.find(
            (defender) =>
              defender.id === hit.sourceId &&
              defender.hp > 0 &&
              defender.spawnedAt <= hit.at + 1e-9,
          )
        : undefined;
    if (!building && !defender) continue;
    const distance = building
      ? distanceTo(hit, building)
      : distance2D(defender!.x - hit.x, defender!.y - hit.y);
    if (distance > tiles(ability.row, 'ReflectedRange') + 1e-9) continue;
    const point = building
      ? {
          x: building.x + BUILDINGS[building.kind].size / 2,
          y: building.y + BUILDINGS[building.kind].size / 2,
        }
      : defender!;
    launchProjectile(
      ctx.battle,
      {
        weapon: 'native',
        native: {
          name: text(ability.row, 'ReflectProjectile'),
          kind: unit.kind,
          level: unit.level ?? 1,
        },
        sourceId: unit.id,
        targetId: hit.sourceId,
        targetBuilding: !!building,
        ...(defender ? { targetDefender: true } : {}),
        fromX: hit.x,
        fromY: hit.y,
        x: point.x,
        y: point.y,
        fromAir: !!TROOPS[unit.kind].flying,
        toAir: defender?.mode === 'air',
        damage: num(ability.row, 'ReflectedDamage'),
      },
      ctx.effect,
      hit.at,
    );
    healUnit(ctx.battle, unit, num(ability.row, 'HealOnReflect'), hit.at);
    state[key] = hit.at + seconds(ability.row, 'ReflectCooldownMS');
  }
}
