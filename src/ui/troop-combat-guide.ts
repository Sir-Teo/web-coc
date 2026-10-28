import type { TroopKind } from '../game/data';
import type { NativeUnitStats } from '../game/native-units';
import { nativeRow, num, seconds, tiles } from '../game/native-data';
import { superMinionLongShot } from '../game/native-super-minion';

/** Favorite targets use the combat source, including native troops without legacy UI flags. */
export function troopFavoriteTarget(stats: NativeUnitStats) {
  const bonus = (scale: number) => (scale > 1 ? ` (${scale}× damage)` : '');
  if (stats.preferHeroes) return `Heroes${bonus(stats.heroMultiplier)}`;
  if (stats.preferredBuilding)
    return `${stats.preferredBuilding}${bonus(stats.preferredMultiplier)}`;
  const group = { Defense: 'Defenses', Resource: 'Resources', Wall: 'Walls' }[stats.preferredClass];
  return group ? `${group}${bonus(stats.preferredMultiplier)}` : 'Any building';
}

/** Short player-facing advice and source ability facts for the Army information panel. */
export function troopCombatGuide(kind: TroopKind, stats: NativeUnitStats) {
  const facts: [string, string][] = [];
  let tactic: string | undefined;
  if (kind === 'superminion') {
    const opening = superMinionLongShot(stats)!;
    facts.push(
      ['Long Shot attacks', `${opening.count}`],
      ['Long Shot range', `${opening.range} tiles`],
    );
    tactic = `Use its first ${opening.count} Long Shots to attack from farther away. After they are spent, it moves closer to use its normal range.`;
  } else if (kind === 'babydragon') {
    const ability = nativeRow('abilities', stats.ability, stats.abilityLevel),
      radius = tiles(ability, 'ActiveWhileAloneRadius');
    facts.push(
      ['Tantrum damage bonus', `+${num(ability, 'BoostDamagePercentage')}%`],
      ['Tantrum attack rate', `+${num(ability, 'BoostAttackSpeedPercentage')}%`],
      ['Tantrum ally radius', `${radius} tiles`],
    );
    tactic = `Keep flying allies more than ${radius} tiles away to activate Tantrum. Ground allies do not suppress it.`;
  } else if (kind === 'balloon') {
    facts.push(['Death blast delay', `${stats.deathDelay} s`]);
    tactic =
      'Bombs damage nearby buildings and ground troops directly beneath the Balloon. Remove Air Defenses before sending Balloons over the walls.';
  } else if (kind === 'rocketballoon') {
    const ability = nativeRow('abilities', stats.ability, stats.abilityLevel);
    facts.push(['Boosters duration', `${seconds(ability, 'DeactivateAfterTime')} s`]);
    tactic =
      'Use its opening speed boost to rush exposed defenses. Its bombs and death blast damage nearby ground targets.';
  } else if (kind === 'dragonrider') {
    facts.push(['Death blast delay', `${stats.deathDelay} s`]);
    tactic =
      'Send it after defenses and support it against Air Defenses. Its delayed death blast damages nearby ground targets.';
  } else if (kind === 'minion') {
    tactic =
      'Use small groups to finish exposed buildings while air defenses are distracted. Minions deal single-target damage.';
  }
  return { facts, tactic };
}
