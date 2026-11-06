import type { Unit } from './model';
import { nativeRow, num, text } from './native-data';
import { nativeTrapValues } from './native-traps';
import { isHeroUnitKind, isPetUnitKind, nativeUnitRow, nativeUnitStats } from './native-units';

/**
 * Version 238: original ARM64 cdfecc/d6ebb0 and d3d694. The production building's
 * type3 forces siege ejection immunity after loading, even with a blank CSV flag.
 * See reference/native-spring-ejection-18.400.22.json for the original-code oracle.
 */
export function nativeSpringTrapOutcome(unit: Unit, level: number, power: number) {
  const stats = nativeUnitStats(unit.kind, unit.level ?? 1);
  const production = text(nativeUnitRow(unit.kind, unit.level ?? 1), 'ProductionBuilding');
  const siege =
    !!production && num(nativeRow('buildings', production), 'ProducesUnitsOfType') === 3;
  const hero = !!unit.hero || isHeroUnitKind(unit.kind);
  const protectedFromEjection = hero || stats.cantBeEjected || siege;
  const source = nativeTrapValues('springtrap', level);
  if (
    source.attemptEjectBeforeDamage &&
    !protectedFromEjection &&
    stats.housing <= source.ejectHousing
  )
    return { hp: 0, ejected: true, bounce: false };

  const reduction = hero
    ? source.heroDamageReductionPercent
    : isPetUnitKind(unit.kind)
      ? source.petDamageReductionPercent
      : siege
        ? source.siegeDamageReductionPercent
        : 0;
  // TrapData stores Damage in hundredths of HP (ebd9bc), so truncate before converting back.
  const nativePower = power * 100;
  const damage =
    Math.trunc((nativePower * Math.max(0, Math.min(100, 100 - reduction))) / 100) / 100;
  const hp = Math.max(0, unit.hp - damage);
  const ejected = hp === 0 && source.ejectWhenKilling && !protectedFromEjection;
  // The trap's native radial-throw helper d9bfb8 excludes siege category3.
  return { hp, ejected, bounce: !ejected && hp > 0 && !siege };
}
