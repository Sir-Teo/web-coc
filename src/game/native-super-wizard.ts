import {
  chainKey,
  chainPoint,
  chainRef,
  nearestChainTarget,
  resolveChainTarget,
  type ChainRef,
  type ChainTarget,
} from './chain-targets';
import { hurtDefender } from './defenders';
import type { ElectromiteZap } from './native-electromite';
import { num } from './native-data';
import { nativeUnitRow, nativeUnitStats } from './native-units';
import type { Unit } from './model';
import type { NativeTroopContext } from './native-troops';

export interface SuperWizardZap extends ElectromiteZap {
  fromTarget?: ChainRef;
}
export interface SuperWizardBranch {
  key: string;
  sourceId: number;
  level: number;
  at: number;
  damage: number;
  x: number;
  y: number;
  fromAir: boolean;
  origin: ChainRef;
  hit: string[];
  count: number;
}
function strike(
  ctx: NativeTroopContext,
  cast: Omit<SuperWizardBranch, 'origin'> & { origin?: ChainRef },
  target: ChainTarget,
  primary: boolean,
) {
  const point = chainPoint(target),
    ref = chainRef(target);
  (ctx.battle.nativeSuperWizardZaps ??= []).push({
    key: `${cast.key}:${cast.hit.length}`,
    sourceId: cast.sourceId,
    level: cast.level,
    at: cast.at,
    primary,
    fromX: cast.x,
    fromY: cast.y,
    fromAir: cast.fromAir,
    x: point.x,
    y: point.y,
    toAir: 'defender' in target && target.defender.mode === 'air',
    targetId: ref.id,
    targetBuilding: ref.building,
    ...(cast.origin ? { fromTarget: cast.origin } : {}),
  });
  if ('building' in target) ctx.damageBuilding(target.building, cast.damage, cast.at);
  else hurtDefender(ctx.battle, target.defender, cast.damage, cast.at);
}
/** One primary; ChainAttackFactor includes that primary and Depth=1 branches from it. */
export function attackSuperWizard(
  ctx: NativeTroopContext,
  unit: Unit,
  damage: number,
  target: ChainTarget,
) {
  const state = (unit.native ??= {}),
    s = nativeUnitStats('superwizard', unit.level ?? ctx.battle.troopLevels?.superwizard ?? 1);
  state.attacks = (state.attacks ?? 0) + 1;
  state.lastAttackAt = ctx.battle.elapsed;
  const cast = {
    key: `superwizard:${unit.id}:${state.attacks}`,
    sourceId: unit.id,
    level: s.level,
    at: ctx.battle.elapsed,
    damage,
    x: unit.x,
    y: unit.y,
    fromAir: false,
    hit: [] as string[],
    count: Math.max(0, num(nativeUnitRow('superwizard', s.level), 'ChainAttackFactor') - 1),
  };
  const point = chainPoint(target),
    origin = chainRef(target),
    fromAir = 'defender' in target && target.defender.mode === 'air';
  strike(ctx, cast, target, true);
  if (cast.count > 0)
    (ctx.battle.nativeSuperWizardBranches ??= []).push({
      ...cast,
      x: point.x,
      y: point.y,
      fromAir,
      origin,
      hit: [chainKey(target)],
      at: cast.at + s.chainDelay,
      damage: damage * (1 - s.chainReduction),
    });
}
/** Every branch shares the primary origin, scheduled time and 40% damage; none creates another hop. */
export function stepSuperWizardBranches(ctx: NativeTroopContext) {
  const b = ctx.battle;
  if (!b.nativeSuperWizard || (!b.nativeSuperWizardBranches && !b.nativeSuperWizardZaps)) return;
  const pending: SuperWizardBranch[] = [];
  const queue = b.nativeSuperWizardBranches ?? [];
  queue.sort((a, c) => a.at - c.at || a.sourceId - c.sourceId);
  for (const cast of queue) {
    if (cast.at > b.elapsed + 1e-9) {
      pending.push(cast);
      continue;
    }
    const origin = resolveChainTarget(ctx, cast.origin, cast.at),
      point = origin ? chainPoint(origin) : cast;
    const source = { ...cast, x: point.x, y: point.y, hit: [...cast.hit] };
    const s = nativeUnitStats('superwizard', cast.level);
    for (let i = 0; i < cast.count; i++) {
      const target = nearestChainTarget(ctx, source, s.chainDistance, source.hit, cast.at);
      if (!target) break;
      strike(ctx, source, target, false);
      source.hit.push(chainKey(target));
    }
  }
  b.nativeSuperWizardBranches = pending;
  b.nativeSuperWizardZaps = (b.nativeSuperWizardZaps ?? []).filter(
    (z) => z.at + 10 >= b.elapsed - 1e-9,
  );
}
