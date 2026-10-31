import { stoneSlammerSecondaryStats } from '../game/native-stone-slammer';
import { superDragonBurstStats } from '../game/native-super-dragon';
import type { TroopKind } from '../game/data';
import { nativeUnitRow, nativeUnitStats, type NativeUnitStats } from '../game/native-units';
import { nativeGlobalArray, nativeRow, num, seconds, text, tiles } from '../game/native-data';
import { superHogSplitStats } from '../game/native-super-hog';
import { superMinionLongShot } from '../game/native-super-minion';
import { rageModifiers } from '../game/native-rage';
import { nativeHitPoison } from '../game/defender-hit-poison';

/** These units use their summon controller instead of their placeholder attack columns. */
export function troopSummonsOnly(stats: NativeUnitStats) {
  return !!(stats.bunker || stats.consumeDebris);
}

/** Favorite targets use the combat source, including native troops without legacy UI flags. */
export function troopFavoriteTarget(stats: NativeUnitStats) {
  if (stats.consumeDebris) return 'Rubble';
  if (stats.bunker) return 'None';
  const bonus = (scale: number) => (scale > 1 ? ` (${scale}× damage)` : '');
  if (stats.preferHeroes) return `Heroes${bonus(stats.heroMultiplier)}`;
  if (stats.preferredBuilding)
    return `${stats.preferredBuilding}${bonus(stats.preferredMultiplier)}`;
  const group = { Defense: 'Defenses', Resource: 'Resources', Wall: 'Walls' }[stats.preferredClass];
  return group ? `${group}${bonus(stats.preferredMultiplier)}` : 'Any building';
}

export function troopAttackTargets(stats: NativeUnitStats) {
  if (troopSummonsOnly(stats)) return 'None';
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
export function troopCombatGuide(
  kind: TroopKind,
  stats: NativeUnitStats,
  rules: { superDragonBurst?: boolean; stoneSlammerAttacks?: boolean } = {},
) {
  const facts: [string, string][] = [];
  let tactic: string | undefined;
  if (kind === 'furnace') {
    const firemite = nativeUnitStats('firemite', stats.level);
    facts.push(
      ['Firemite stock', `${stats.bunkerCount}`],
      ['Base lifetime', `${stats.bunkerDecay} s`],
      ['Health loss', `${stats.hp / stats.bunkerDecay} HP/s`],
      ['Firemite hitpoints', firemite.hp.toLocaleString('en-US')],
      ['Firemite damage per jump', `${firemite.damage}`],
      ['Firemite targets', troopAttackTargets(firemite)],
    );
    tactic =
      'Place it behind a frontline to release Firemites before its health runs out. Friendly health auras can extend its lifetime, but its stock is finite. Each Firemite jumps once at a ground or air target.';
  } else if (kind === 'wallwrecker') {
    facts.push(
      ['Movement destination', text(nativeUnitRow(kind, stats.level), 'PreferredMovementTarget')],
      ['Wall damage multiplier', `${stats.preferredMultiplier}×`],
      [
        'Damage per ram vs walls',
        (stats.damage * stats.preferredMultiplier).toLocaleString('en-US'),
      ],
      ['Can receive healing', stats.immuneToHealing ? 'No' : 'Yes'],
    );
    tactic =
      'Deploy in line with the Town Hall to open a ground route. It heads toward the Town Hall and deals extra damage to blocking walls. Protect it with other troops; it cannot be healed.';
  } else if (kind === 'battleblimp' || kind === 'stoneslammer') {
    if (kind === 'battleblimp')
      facts.push([
        'Movement destination',
        text(nativeUnitRow(kind, stats.level), 'PreferredMovementTarget'),
      ]);
    facts.push(
      ['Death blast delay', `${stats.deathDelay} s`],
      ['Can receive healing', stats.immuneToHealing ? 'No' : 'Yes'],
    );
    tactic =
      kind === 'battleblimp'
        ? 'Choose an approach to the Town Hall that avoids Air Defenses. It bombs buildings along its flight and releases a delayed blast when destroyed. It cannot be healed.'
        : 'Send it after defenses while other troops distract Air Defenses. Its boulders and delayed death blast damage ground targets. It cannot be healed.';
    if (kind === 'stoneslammer' && rules.stoneSlammerAttacks !== false) {
      const blast = stoneSlammerSecondaryStats(stats.level);
      facts.push(
        ['Secondary blast damage', `${blast.minimum}–${blast.maximum}`],
        ['Secondary blast radius', `${blast.radius} tiles`],
        ['Full secondary damage within', `${blast.falloffStart} tiles`],
        ['Secondary minimum damage at', `${blast.falloffEnd} tiles`],
        ['Wall damage multiplier', `${stats.damageMultiplier}×`],
      );
      tactic += ` Each attack adds a wider ground blast that weakens beyond ${blast.falloffStart} tiles. Walls take extra damage.`;
    }
  } else if (kind === 'siegebarracks') {
    facts.push(
      ['Base lifetime', `${stats.bunkerDecay} s`],
      ['First release delay', `${seconds(nativeUnitRow(kind, stats.level), 'SpawnIdle')} s`],
    );
    tactic =
      'Deploy on a safe edge to release its troops. Its health drains over time; troops still inside are lost if it is destroyed early.';
  } else if (kind === 'ruinwitch') {
    const knight = nativeUnitStats('ruinknight', stats.summonLevel),
      row = nativeUnitRow('ruinknight', stats.summonLevel),
      limit = stats.summonLifetimeLimit || stats.summonLimit;
    facts.push(
      ['Knights per rubble pile', `${stats.summonCount}`],
      ['Lifetime Knight limit', `${limit}`],
      [
        'Vacuum time',
        `${seconds(nativeUnitRow(kind, stats.level), 'DebrisSummonCompletionTime')} s`,
      ],
      ['Summon windup', `${stats.summonDelay} s`],
      ['Knight hitpoints', knight.hp.toLocaleString('en-US')],
      ['Knight DPS', `${knight.dps}`],
      ['Knight targets', troopAttackTargets(knight)],
      ['Knight damage vs walls', (knight.damage * knight.damageMultiplier).toLocaleString('en-US')],
      ['Knight health loss', `${num(row, 'LoseHpPerTick') / seconds(row, 'LoseHpInterval')} HP/s`],
    );
    tactic = `Destroy buildings first to provide rubble. Each pile creates one Ruin Knight; after ${limit} summons the Witch disappears. Knights attack ground targets, deal extra damage to walls and lose health over time.`;
  } else if (kind === 'healer') {
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
  } else if (kind === 'electrotitan' && stats.aura) {
    const aura = nativeRow('spells', stats.aura, stats.auraLevel);
    facts.push(
      ['Aura DPS', `${num(aura, 'Damage') / seconds(aura, 'TimeBetweenHitsMS')}`],
      ['Aura damage per pulse', `${num(aura, 'Damage')}`],
      ['Aura pulse interval', `${seconds(aura, 'TimeBetweenHitsMS')} s`],
      ['Aura radius', `${tiles(aura, 'Radius')} tiles`],
      ['Aura damage vs heroes', `${num(aura, 'HeroDamageMultiplier', 100)}%`],
    );
    tactic =
      'Keep her near clustered buildings and defending troops so her aura adds damage alongside her whip. The aura reaches ground and air, leaves walls unharmed and keeps pulsing during Freeze.';
  } else if (kind === 'apprenticewarden' && stats.aura) {
    const aura = nativeRow('spells', stats.aura, stats.auraLevel);
    facts.push(
      ['Health aura bonus', `+${num(aura, 'ExtraHealthPermil') / 10}%`],
      ['Health aura radius', `${tiles(aura, 'Radius')} tiles`],
      ['Health aura targets', 'Other ground and air troops'],
    );
    tactic =
      'Keep him with a group to add a temporary health buffer to other troops. It does not heal existing damage or affect siege machines or Totems. Overlapping health auras use the strongest bonus.';
  } else if (kind === 'rootrider' && stats.aura) {
    const aura = nativeRow('spells', stats.aura, stats.auraLevel);
    facts.push(
      ['Wall aura damage per pulse', num(aura, 'Damage').toLocaleString('en-US')],
      ['Wall aura pulse interval', `${seconds(aura, 'TimeBetweenHitsMS')} s`],
      ['Wall aura radius', `${tiles(aura, 'Radius')} tiles`],
    );
    tactic =
      'It crosses walls and pulses damage into nearby walls. Use it to open paths for ground troops while it pursues defenses.';
  } else if (kind === 'electrodragon') {
    facts.push(
      ['Chain targets', `Up to ${stats.chainDepth}`],
      ['Chain radius', `${stats.chainDistance} tiles`],
      ['Chain damage per hop', `${Math.round((1 - stats.chainReduction) * 100)}%`],
    );
    tactic =
      'Use it against clustered buildings and defending troops. Its lightning can chain through ground and air targets; protect it while it charges.';
  } else if (kind === 'headhunter') {
    const poison = nativeHitPoison(stats);
    facts.push(['Hit damage vs heroes', `${stats.damage * stats.heroMultiplier}`]);
    if (poison)
      facts.push(
        ['Hit poison duration', `${poison.duration} s`],
        ['Poison movement slow', `${Math.round(-poison.speed * 100)}%`],
        ['Poison attack slow', `${Math.round(-poison.attack * 100)}%`],
      );
    tactic =
      'Send it behind a frontline to hunt defending heroes. It crosses walls and its cards slow ground and air defenders.';
  } else if (kind === 'supergiant' && stats.damageMultiplierTarget === 'Wall') {
    facts.push(
      ['Wall damage multiplier', `${stats.damageMultiplier}×`],
      [
        'Damage per hit vs walls',
        (stats.damage * stats.damageMultiplier).toLocaleString('en-US', {
          maximumFractionDigits: 2,
        }),
      ],
    );
    tactic =
      'Let it tank defensive fire for ground troops. It deals extra damage to blocking walls while pursuing defenses.';
  } else if (kind === 'yeti' || kind === 'superyeti') {
    const ability = nativeRow('abilities', stats.ability, stats.abilityLevel),
      mite = nativeUnitStats(
        kind === 'yeti' ? 'yetimite' : 'electromite',
        num(ability, 'TroopLevel', 1),
      ),
      name = kind === 'yeti' ? 'Yetimite' : 'Electromite';
    facts.push(
      [`${name} stock`, `${num(ability, 'TroopCount')}`],
      [
        'Damage taken per release',
        `${num(ability, 'SpawnnedTroopsPerDamage') || stats.spawnWhenDamaged}`,
      ],
      [`${name} targets`, troopAttackTargets(mite)],
    );
    if (kind === 'yeti') {
      facts.push(
        ['Yetimite hitpoints', mite.hp.toLocaleString('en-US')],
        ['Yetimite damage per hit', `${mite.damage}`],
        ['Yetimite favorite target', troopFavoriteTarget(mite)],
      );
      tactic =
        'Let it draw fire to release Yetimites, which jump walls and prefer defenses. It releases its remaining stock when defeated.';
    } else {
      const chain = nativeRow('abilities', mite.ability, mite.abilityLevel);
      facts.push(
        ['Electromite first building hit', `${mite.damage * mite.preferredMultiplier}`],
        ['Chain targets', `Up to ${num(chain, 'ChainAttackDepth')}`],
        ['Chain radius', `${tiles(chain, 'ChainAttackDistance')} tiles`],
        ['Stun per hit', `${seconds(chain, 'FrostOnHitTime')} s`],
        ['Chain damage per hop', `${100 - num(chain, 'ChainAttackDamageReductionPercent')}%`],
      );
      tactic =
        'Let it draw fire to release Electromites. Each Electromite chains through nearby buildings or ground and air defenders, briefly stunning them. Damage falls with each hop; remaining stock is released on defeat.';
    }
  } else if (kind === 'golem') {
    const golemite = nativeUnitStats('golemite', stats.level);
    facts.push(
      ['Golemites on defeat', `${stats.secondaryCount}`],
      ['Golemite hitpoints', golemite.hp.toLocaleString('en-US')],
      ['Golemite DPS', `${golemite.dps}`],
      ['Golemite targets', troopAttackTargets(golemite)],
    );
    tactic =
      'Use it as a frontline while damage dealers work behind it. It splits into Golemites when defeated; both the Golem and its Golemites prefer defenses.';
  } else if (kind === 'icegolem') {
    const ability = nativeRow('abilities', stats.ability, stats.abilityLevel),
      freeze = nativeRow('spells', ability.SelfSpell, num(ability, 'SelfSpellLevel', 1));
    facts.push(
      ['Freeze on defeat', `${seconds(freeze, 'FreezeTimeMS')} s`],
      ['Freeze radius', `${tiles(freeze, 'Radius')} tiles`],
      ['Hit chill duration', `${stats.frostTime} s`],
      ['Hit chill slow', `${Math.round(stats.frostPercent * 100)}%`],
    );
    tactic =
      'Send it ahead of ground damage dealers. It slows enemies it hits and freezes nearby targets on defeat, giving the rest of your army time to advance.';
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
  } else if (kind === 'meteorgolem') {
    const mite = nativeUnitStats('meteormite', stats.level);
    facts.push(
      ['Wall damage multiplier', `${stats.damageMultiplier}×`],
      [
        'Damage per throw vs walls',
        (stats.damage * stats.damageMultiplier).toLocaleString('en-US'),
      ],
      ['Meteormite maximum hitpoints', mite.hp.toLocaleString('en-US')],
      ['Meteormite DPS', `${mite.dps}`],
      ['Meteormite damage per hit', `${mite.damage}`],
      ['Meteormite targets', troopAttackTargets(mite)],
      ['Meteormite movement', troopMovement(mite)],
      ['Merge search radius', `${mite.mergeRadius} tiles`],
    );
    tactic =
      'At full health, a throw splits it into two Meteormites. The halves inherit its current health and jump walls; nearby idle halves can merge again. Cloned halves cannot merge. Below 1% health, only the thrown half remains.';
  } else if (kind === 'supervalkyrie') {
    const ability = nativeRow('abilities', stats.ability, stats.abilityLevel),
      rage = nativeRow('spells', text(ability, 'SelfSpell'), num(ability, 'SelfSpellLevel', 1)),
      troop = rageModifiers(rage, false, false),
      preferred = rageModifiers(rage, false, true),
      hero = rageModifiers(rage, true, false),
      hits = Math.max(1, num(rage, 'NumberOfHits', 1));
    facts.push(
      ['Rage radius on defeat', `${tiles(rage, 'Radius')} tiles`],
      ['Rage troop damage bonus', `+${Math.round(troop.damage * 100)}%`],
      ['Rage hero damage bonus', `+${Math.round(hero.damage * 100)}%`],
      ['Rage movement bonus', `+${troop.speed} tiles/s`],
      ['Rage movement with favorite target', `+${preferred.speed} tiles/s`],
      ['Rage pulse window', `${(hits - 1) * seconds(rage, 'TimeBetweenHitsMS')} s`],
      ['Rage effect lingers', `${seconds(rage, 'BoostTimeMS')} s`],
    );
    tactic =
      'When defeated, she leaves a smaller Rage field for nearby troops. Keep allies inside it to boost damage and movement; heroes receive reduced bonuses. Siege machines and Totems are unaffected.';
  } else if (kind === 'superhogrider') {
    const split = superHogSplitStats(stats.level),
      hog = nativeUnitStats(split.hog.kind, split.hog.level),
      rider = nativeUnitStats(split.rider.kind, split.rider.level);
    facts.push(
      ['Hog hitpoints', hog.hp.toLocaleString('en-US')],
      ['Hog DPS', `${hog.dps}`],
      ['Hog favorite target', troopFavoriteTarget(hog)],
      ['Hog movement', troopMovement(hog)],
      ['Rider hitpoints', rider.hp.toLocaleString('en-US')],
      ['Rider DPS', `${rider.dps}`],
      ['Rider favorite target', troopFavoriteTarget(rider)],
      ['Rider movement', troopMovement(rider)],
      ['Rider landing delay', `${split.duration} s`],
    );
    tactic =
      'When defeated, it releases one Hog immediately and one Rider after a short backward flight. The Hog jumps walls and pursues defenses; the Rider attacks any building and needs an open path through walls. Spring Trap ejection releases neither half.';
  } else if (kind === 'bowler' || kind === 'superbowler') {
    facts.push(
      ['Boulder landings', `${stats.bounces}`],
      ['Bounce distance', `${stats.bounceDistance} tiles`],
    );
    tactic =
      kind === 'bowler'
        ? 'Line up ground targets so the second boulder landing reaches behind the first. The bounce continues along the original throw direction.'
        : 'Use a frontline to protect it while boulders bounce through clustered buildings and ground troops.';
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
  } else if (kind === 'superdragon' && rules.superDragonBurst !== false) {
    const burst = superDragonBurstStats(stats.level);
    facts.push(
      ['Flames per burst', `Up to ${burst.count}`],
      ['Flame spacing', `${burst.delay} s`],
      ['First flame charge', `${burst.firstHit} s`],
    );
    tactic =
      'Keep it on a target long enough to finish its flame burst. Changing targets stops the remaining flames. Protect it from Air Defenses.';
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
