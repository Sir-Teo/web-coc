import type { SpellKind } from '../game/data';
import { nativeRow, num, seconds, text } from '../game/native-data';
import { nativeUnitStats, unitKindForName } from '../game/native-units';
import { rageModifiers } from '../game/native-rage';
import { SPELL_SOURCE } from '../game/spell-progression';
import { troopAttackTargets } from './troop-combat-guide';

interface SpellCombatGuide {
  targets: string;
  facts: [string, string][];
  tactic: string;
}

const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** The newer spells have distinct effects; none should inherit Rage's information rows. */
export function spellCombatGuide(kind: SpellKind, level: number): SpellCombatGuide | undefined {
  const row = nativeRow('spells', SPELL_SOURCE[kind], level);
  const hits = Math.max(1, num(row, 'NumberOfHits', 1));
  switch (kind) {
    case 'poison':
      return {
        targets: 'Defending ground and air troops',
        facts: [
          ['Maximum DPS', number(num(row, 'PoisonDPS'))],
          ['Movement slow', `${-num(row, 'SpeedBoost')}%`],
          ['Attack slow', `${-num(row, 'AttackSpeedBoost')}%`],
          ['Damage vs heroes', `${num(row, 'HeroDamageMultiplier', 100)}%`],
        ],
        tactic:
          'Keep defending troops inside the cloud. Damage ramps up with exposure, while movement and attacks slow. Buildings are immune and heroes take reduced damage.',
      };
    case 'haste':
      return {
        targets: 'Your ground and air troops',
        facts: [
          ['Movement increase', `+${number(rageModifiers(row, false, false).speed)} tiles/s`],
          [
            'Movement increase with favorite target',
            `+${number(rageModifiers(row, false, true).speed)} tiles/s`,
          ],
          ['Damage increase', `${num(row, 'DamageBoostPercent')}%`],
          ['Pulse window', `${number((hits - 1) * seconds(row, 'TimeBetweenHitsMS'))} s`],
          ['Effect lingers', `${seconds(row, 'BoostTimeMS')} s`],
        ],
        tactic:
          'Speed troops through danger without increasing damage or attack speed. Troops with a favorite target receive the smaller movement boost; heroes receive half the ordinary movement boost. Siege machines are unaffected.',
      };
    case 'earthquake':
      return {
        targets:
          num(row, 'TroopDamagePermil') > 0
            ? 'Enemy buildings, walls and ground defenders'
            : 'Enemy buildings and walls',
        facts: [
          [
            'First cast building damage',
            `${number((num(row, 'BuildingDamagePermil') * hits) / 10)}%`,
          ],
          [
            'Ground defender damage per cast',
            `${number((num(row, 'TroopDamagePermil') * hits) / 10)}%`,
          ],
        ],
        tactic:
          'Repeated casts deal less damage to buildings but become more effective against walls. Damage is a share of maximum hitpoints; resource storages are immune.',
      };
    case 'skeleton':
    case 'bat': {
      const summon = nativeUnitStats(
        unitKindForName(text(row, 'SummonTroop'))!,
        num(row, 'SpawnUpgradeLevel', 1),
      );
      const facts: SpellCombatGuide['facts'] = [
        [kind === 'bat' ? 'Bats summoned' : 'Skeletons summoned', `${num(row, 'UnitsToSpawn')}`],
        ['First group', `${num(row, 'SpawnFirstGroupSize')}`],
        ['Spawn duration', `${seconds(row, 'SpawnDuration')} s`],
        ['Summon attack targets', troopAttackTargets(summon)],
      ];
      if (kind === 'bat')
        facts.push(
          ['Bat hitpoints', number(summon.hp)],
          ['Bat DPS', `${summon.dps}`],
          ['Bat damage per hit', `${summon.damage}`],
          ['Bat attack interval', `${summon.rate} s`],
        );
      else {
        const unshielded = nativeUnitStats(unitKindForName(summon.secondary)!, summon.level);
        facts.push(
          [
            'Shield breaks into',
            `${summon.secondaryCount} unshielded Skeleton${summon.secondaryCount === 1 ? '' : 's'}`,
          ],
          ['Shielded Skeleton hitpoints', number(summon.hp)],
          ['Unshielded Skeleton hitpoints', number(unshielded.hp)],
          ['Skeleton DPS', `${summon.dps}`],
        );
      }
      return {
        targets: kind === 'bat' ? 'Summons air troops' : 'Summons ground troops',
        facts,
        tactic:
          kind === 'bat'
            ? 'Bats prefer defenses and can attack ground and air targets. Distract or freeze area defenses while the swarm arrives; the spell releases its Bats over time.'
            : 'Place shielded Skeletons near a ground target to distract it or add damage. Each is replaced by an unshielded Skeleton when its shield breaks. The squad arrives over time; protect them from area attacks.',
      };
    }
    case 'totem': {
      const summon = nativeRow('spells', text(row, 'ChainSpell'), num(row, 'ChainSpellLevel', 1));
      const totem = nativeRow(
        'characters',
        text(summon, 'SummonTroop'),
        num(summon, 'SpawnUpgradeLevel', 1),
      );
      return {
        targets: 'Enemy buildings and defenders',
        facts: [
          ['Totem maximum hitpoints', number(num(totem, 'Hitpoints'))],
          ['Stun duration', `${seconds(row, 'StunTimeMS')} s`],
        ],
        tactic:
          'Briefly stun nearby enemies and plant a decoy to draw defensive fire. The Totem does not attack and loses health over time.',
      };
    }
    case 'overgrowth':
      return {
        targets: 'Enemy buildings except walls and traps',
        facts: [
          ['Root duration', `${seconds(row, 'FreezeTimeMS')} s`],
          ['Damage', 'None'],
        ],
        tactic:
          'Disable a group of buildings to steer your army around it. Rooted buildings cannot be targeted or damaged until the roots expire; walls and traps remain active.',
      };
    case 'iceblock': {
      const ability = nativeRow(
        'abilities',
        text(row, 'GiveSpecialAbility'),
        num(row, 'GivenSpecialAbilityLevel', 1),
      );
      return {
        targets: 'Your troops and nearby enemies',
        facts: [
          ['Freeze duration', `${seconds(row, 'FreezeTimeMS')} s`],
          ['Damage blocked', `${num(ability, 'ShieldProtectionPercent')}%`],
        ],
        tactic:
          'Protect troops through heavy fire. Affected troops stop moving and attacking while the ice blocks most damage; nearby enemies also freeze. Siege machines are unaffected.',
      };
    }
    case 'angry': {
      const ability = nativeRow(
        'abilities',
        text(row, 'GiveSpecialAbility'),
        num(row, 'GivenSpecialAbilityLevel', 1),
      );
      return {
        targets: 'Your ground and air troops',
        facts: [
          ['Defense priority duration', `${seconds(ability, 'DeactivateAfterTime')} s`],
          ['Preferred target', 'Defenses'],
        ],
        tactic:
          'Make troops in the ring retarget defenses instead of their usual targets. Clear a route through walls first; siege machines are unaffected.',
      };
    }
  }
}
