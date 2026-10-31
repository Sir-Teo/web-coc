import type { TroopKind } from '../game/data';
import { nativeUnitRow, nativeUnitStats, type NativeUnitStats } from '../game/native-units';
import { nativeGlobalArray, nativeRow, num, seconds, tiles } from '../game/native-data';
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

export function troopAttackTargets(stats: NativeUnitStats) {
  if (stats.groundTargets && stats.airTargets) return 'Ground and air';
  if (stats.groundTargets) return 'Ground only';
  if (stats.airTargets) return 'Air only';
  return 'None';
}

export function troopMovement(stats: NativeUnitStats) {
  if (stats.flying) return 'Air · ignores walls';
  if (stats.underground) return 'Ground · burrows under walls';
  if (stats.jumper) return 'Ground · crosses walls';
  return 'Ground';
}

/** Short player-facing advice and source ability facts for the Army information panel. */
export function troopCombatGuide(kind: TroopKind, stats: NativeUnitStats) {
  const facts: [string, string][] = [];
  let tactic: string | undefined;
  if (kind === 'healer') {
    const stacking = nativeGlobalArray('HEAL_STACK_PERCENT');
    facts.push(
      [
        'Full-strength Healers per group',
        `${stacking.filter((percent) => percent === 100).length}`,
      ],
      [
        'Healers adding healing per group',
        `Up to ${stacking.filter((percent) => percent > 0).length}`,
      ],
    );
  } else if (kind === 'druid') {
    const bear = nativeUnitStats('bear', stats.level);
    facts.push(
      ['Recipients per chain', `Up to ${stats.bounces + 1}`],
      [
        'Healing bounce range',
        `${tiles(nativeRow('projectiles', stats.projectile), 'MaxBounceDistance')} tiles`,
      ],
      ['Transforms after', `${stats.evolveTime} s`],
      ['Bear maximum hitpoints', bear.hp.toLocaleString('en-US')],
      ['Bear damage per second', `${bear.dps}`],
      ['Bear favorite target', troopFavoriteTarget(bear)],
    );
  } else if (kind === 'witch' || kind === 'superwitch') {
    const summon = nativeUnitStats(kind === 'witch' ? 'skeleton' : 'bigboy', stats.summonLevel);
    if (kind === 'witch') {
      facts.push(
        ['Skeletons per wave', `${stats.summonCount}`],
        ['Skeleton limit', `${stats.summonLimit}`],
        ['Skeleton hitpoints', `${summon.hp}`],
        ['Skeleton DPS', `${summon.dps}`],
        ['Skeleton targets', troopAttackTargets(summon)],
      );
      tactic =
        'Keep her behind a frontline so she can keep summoning Skeletons. Her ranged attacks hit ground and air; the Skeletons fight on the ground.';
    } else {
      facts.push(
        ['Big Boys at a time', `${stats.summonLimit}`],
        ['Big Boy hitpoints', summon.hp.toLocaleString('en-US')],
        ['Big Boy DPS', `${summon.dps}`],
        ['Big Boy damage per hit', `${summon.damage}`],
        ['Big Boy targets', troopAttackTargets(summon)],
      );
      tactic =
        'Protect her while the Big Boy draws ground fire. She supports it with ranged attacks against ground and air; only one of her Big Boys can be alive at a time.';
    }
  } else if (kind === 'lavahound' || kind === 'icehound') {
    const pup = nativeUnitStats(kind === 'lavahound' ? 'lavapup' : 'icehoundpup', 1);
    facts.push(
      ['Pups on defeat', `${stats.secondaryCount}`],
      ['Pup hitpoints', `${pup.hp}`],
      ['Pup DPS', `${pup.dps}`],
      ['Pup targets', troopAttackTargets(pup)],
    );
    if (kind === 'icehound') {
      facts.push(
        ['Pup chill duration', `${pup.frostTime} s`],
        ['Pup chill slow', `${Math.round(pup.frostPercent * 100)}%`],
      );
      tactic =
        'Send it ahead of other air troops to draw Air Defense fire. Its hits slow enemies, and its defeat freezes nearby targets and releases Ice Pups whose shots also chill.';
    } else {
      tactic =
        'Send it ahead of other air troops to draw Air Defense fire. On defeat it bursts into Pups that attack buildings and ground or air defenders.';
    }
  } else if ((kind === 'superminer' || kind === 'infernodragon') && stats.damageRamp) {
    const ramp = stats.damageRamp;
    facts.push(
      ['Second tier DPS', `${ramp.dps[1]}`],
      ['Maximum DPS', `${ramp.dps[2]}`],
      ['Damage ramps after', `${ramp.switchAt[0]} / ${ramp.switchAt[1]} s`],
      kind === 'superminer'
        ? ['Death bomb delay', `${stats.deathDelay} s`]
        : ['Pause after a kill', `${ramp.killedCooldown} s`],
    );
    tactic =
      kind === 'superminer'
        ? 'Keep it on a single target to build damage. Changing targets restarts the ramp. It travels underground and leaves a delayed ground explosion when defeated.'
        : 'Keep its beam on a single target to build damage. Changing targets restarts the ramp. Protect it from Air Defenses while it locks on.';
  } else if (kind === 'superwallbreaker') {
    const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    facts.push(
      [
        'Contact damage vs walls',
        number((stats.damage + stats.deathDamage) * stats.preferredMultiplier),
      ],
      ['Death damage vs walls', number(stats.deathDamage * stats.preferredMultiplier)],
    );
    tactic =
      'Let a frontline draw fire while it opens walls. Its bomb explodes when it attacks or is defeated; both attack and death damage receive the Wall bonus.';
  } else if (kind === 'superbowler') {
    facts.push(
      ['Boulder landings', `${stats.bounces}`],
      ['Bounce distance', `${stats.bounceDistance} tiles`],
    );
    tactic =
      'Use a frontline to protect it while boulders bounce through clustered buildings and ground troops.';
  } else if (kind === 'superbarbarian') {
    const ability = nativeRow('abilities', stats.ability, stats.abilityLevel),
      duration = seconds(ability, 'DeactivateAfterTime');
    facts.push(
      ['Opening Rage', `${duration} s`],
      ['Rage damage bonus', `+${num(ability, 'BoostDamagePercentage')}%`],
      ['Rage speed bonus', `+${num(ability, 'SpeedBoost') / 100} tiles/s`],
    );
    tactic = `Deploy close to targets to make the most of its opening Rage. Its extra damage and movement speed expire after ${duration} seconds.`;
  } else if (kind === 'sneakygoblin') {
    const ability = nativeRow('abilities', stats.ability, stats.abilityLevel);
    facts.push(['Opening invisibility', `${seconds(ability, 'DeactivateAfterTime')} s`]);
    tactic =
      'Use its brief opening invisibility to raid exposed resource buildings. Clear a route first so it reaches its target before the cloak ends.';
  } else if (kind === 'superarcher') {
    const row = nativeUnitRow(kind, stats.level);
    facts.push(
      ['Extra arrow travel', `${tiles(row, 'PenetratingExtraRange')} tiles`],
      ['Piercing radius', `${tiles(row, 'PenetratingRadius')} tiles`],
    );
    tactic =
      'Line up buildings and defending troops so one arrow can pierce several targets. Arrows continue beyond their original target.';
  } else if (kind === 'superwizard') {
    facts.push(
      ['Chain targets', `${num(nativeUnitRow(kind, stats.level), 'ChainAttackFactor')}`],
      ['Chain radius', `${stats.chainDistance} tiles`],
      ['Branch damage', `${Math.round((1 - stats.chainReduction) * 100)}%`],
    );
    tactic =
      'Use a durable frontline to protect it while attacking clustered buildings and troops. Lightning branches spread from the first target to nearby enemies.';
  } else if (kind === 'superminion') {
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
