import type { NativeTroopContext } from './native-troops';
import type { CombatProjectile } from './projectiles';
import { nativeUnitStats } from './native-units';
import { nativeRow, num, text } from './native-data';
import { castNativeSpell } from './native-spells';
import { resolveRangedAreaImpact } from './native-ranged-area-impact';

/** One ground area pass, per-building Wall scaling, then the pinned persistent burn. */
export function resolveFlameFlingerImpact(ctx: NativeTroopContext, shot: CombatProjectile) {
  if (!ctx.battle.nativeFlameFlingerBursts || shot.native?.kind !== 'flameflinger') return false;
  const source = shot.native,
    stats = nativeUnitStats('flameflinger', source.level);
  resolveRangedAreaImpact(
    ctx,
    shot,
    (building) =>
      shot.damage *
      (building.kind === 'wall' && stats.damageMultiplierTarget === 'Wall'
        ? stats.damageMultiplier
        : 1),
  );
  const row = nativeRow('projectiles', source.name),
    spell = text(row, 'HitSpell');
  if (spell)
    castNativeSpell(
      ctx.battle,
      spell,
      num(row, 'HitSpellLevel', 1) || 1,
      'attack',
      shot.x,
      shot.y,
      { at: shot.impact, immediate: true },
    );
  return true;
}
