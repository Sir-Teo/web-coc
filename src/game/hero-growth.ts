import type { Battle, Unit } from './model';
import { itemStats } from './native-hero-data';
import { nativeRow, num } from './native-data';
import { heroOf } from './native-heroes';

// Equipment is fixed within a battle. Cache the source percentage by equipment level.
const gauntletGrowth = new Map<number, number>();
function growthFor(battle: Battle, unit: Unit) {
  if (unit.kind !== 'barbarianking' || !unit.native?.effects?.splash) return 0;
  const hero = heroOf(battle, unit);
  const item = hero?.items.find((item) => item.slug === 'giant-gauntlet');
  if (!item) return 0;
  let growth = gauntletGrowth.get(item.level);
  if (growth === undefined) {
    growth = 0;
    for (const ability of itemStats(item.slug, item.level).abilities)
      growth = Math.max(
        growth,
        num(nativeRow('abilities', ability.name, ability.level), 'GrowthScale') / 100,
      );
    gauntletGrowth.set(item.level, growth);
  }
  return growth;
}

/** Presentation only: GrowthScale is the additional fraction above the normal body size. */
export function heroGrowthScale(battle: Battle, unit: Unit, at = battle.elapsed) {
  const splash = unit.native?.effects?.splash;
  return splash && splash.until > at + 1e-9 ? 1 + growthFor(battle, unit) : 1;
}

/** A Hero who falls during Gauntlet holds the knockout pose until its original deadline. */
export function heroKnockoutFadeAt(battle: Battle, unit: Unit) {
  const fallen = unit.defeatedAt ?? battle.elapsed;
  const splash = unit.native?.effects?.splash;
  if (
    unit.hp > 0 ||
    unit.defeatedAt === undefined ||
    !splash ||
    splash.until <= fallen + 1e-9 ||
    !growthFor(battle, unit)
  )
    return fallen;
  const hero = heroOf(battle, unit)!;
  return fallen + 1e-9 >= (hero.abilityAt ?? 0) ? splash.until : fallen;
}
