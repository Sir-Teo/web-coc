#!/usr/bin/env python3
"""Compile the pinned Home Village combat tables used by the complete battle rules.

Rows stay exactly as the client declares them: the first row is level one and later rows
carry only changed columns. The runtime applies the same forward inheritance. Presentation-only
columns (text ids, SWF exports, icons, effects) are omitted; every retained value is the original
string so numeric conversions stay explicit in TypeScript.
"""
import argparse, hashlib, json, re
from native_art.bundle import ROOT, digest
from native_art.source_csv import records, decoded_rows
from native_art.sc6 import require

BASE = ROOT/'art/source/native-client-18.400.21'
FINGERPRINT = 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b'
TARGET = ROOT/'reference/full-client/combat.json'

TROOPS = ['Barbarian', 'Archer', 'Giant', 'Goblin', 'Wall Breaker', 'Balloon', 'Wizard', 'Healer', 'Dragon',
          'PEKKA', 'Baby Dragon', 'Miner', 'Electro Dragon', 'Yeti', 'Dragon Rider', 'Electro Titan',
          'Root Rider', 'Thrower', 'Meteor Golem', 'Minion', 'Hog Rider', 'Valkyrie', 'Golem', 'Witch',
          'Lava Hound', 'Bowler', 'Ice Golem', 'Headhunter', 'Apprentice Warden', 'Druid', 'Furnace',
          'Ruin Witch']
SUPER = ['Super Barbarian', 'Super Archer', 'Super Giant', 'Sneaky Goblin', 'Super Wall Breaker',
         'Rocket Balloon', 'Super Wizard', 'Super Dragon', 'Inferno Dragon', 'Super Miner', 'Super Yeti',
         'Super Minion', 'Super Hog Rider', 'Super Valkyrie', 'Super Witch', 'Ice Hound', 'Super Bowler']
SIEGE = ['Wall Wrecker', 'Battle Blimp', 'Stone Slammer', 'Siege Barracks', 'Log Launcher', 'Flame Flinger',
         'Battle Drill', 'Troop Launcher']
HEROES = ['Barbarian King', 'Archer Queen', 'Grand Warden', 'Royal Champion', 'Minion Prince', 'Dragon Duke']
PETS = ['LASSI', 'Mighty Yak', 'Electro Owl', 'Unicorn', 'Phoenix', 'Phoenix Egg', 'Poison Lizard', 'Diggy',
        'Frosty', 'Spirit Fox', 'Angry Jelly', 'Sneezy', 'Crow']
SPELLS = ['Lightning', 'Healing', 'Rage', 'Jump', 'Freeze', 'Clone', 'Invisibility', 'Recall', 'Revive',
          'Totem Spell', 'Poison', 'Earthquake', 'Haste', 'Skeleton Spell', 'Bat Spell', 'Overgrowth', 'Ice Block',
          'AngrySpell']
BUILDINGS = ['Town Hall', 'Clan Castle', 'Gold Storage', 'Elixir Storage', 'Dark Elixir Storage', 'Gold Mine',
             'Elixir Collector', 'Dark Elixir Drill', 'Army Camp', 'Laboratory', 'Barracks', 'Dark Barracks',
             'Spell Factory', 'Dark Spell Factory', 'Siege Workshop', 'Hero Hall', 'Pet House', 'Blacksmith',
             'Builders Hut', 'Helper Hut', 'Wall', 'Cannon', 'Archer Tower', 'Mortar', 'Air Defense',
             'Wizard Tower', 'Hidden Tesla', 'Air Sweeper', 'Bomb Tower', 'X-Bow', 'Inferno Tower',
             'Eagle Artillery', 'Scattershot', 'Spell Tower', 'Monolith', 'Multi Archer Tower', 'Ricochet Cannon',
             'Multi Gear Tower', 'Firespitter', 'Revenge Tower', 'Super Wizard Tower']
TRAPS = ['Bomb', 'Spring Trap', 'Air Bomb', 'Giant Bomb', 'Seeking Air Mine', 'Skeleton Trap', 'Tornado Trap',
         'Giga Bomb']

# Text, 2D/3D artwork, icons, effects and UI metadata never influence the battle simulation.
PRESENTATION = re.compile(
    r'(TID|SWF|ExportName|Icon|Picture|Effect|Scenario|StatBars|StrengthWeight2?$|HintPriority|Animation|'
    r'Gfx|Sound|Sfx|Skin|Geometry|Texture|ShadowExport|Camera|Portrait|Banner|Flag|Tombstone|TombStone|'
    r'ClipName|DepthBias|Offset$|^Visual|^Gender|Wardrobe|ThemeYear|HighlightEffect|MiniLevels|'
    r'Locked$|ShopBuildingClass|IsRed$|UpgradeTasks|LevelRequirementTID|Capital|War(Gold|Elixir|Dark)|'
    r'BoostCost|FreeBoost|BoosterCostDivisor|^DestructionXP$|^RedMul$|^GreenMul$|^BlueMul$|^RedAdd$|'
    r'^GreenAdd$|^BlueAdd$|^Stage$|^SeasonalDefense$|^GlobalID$|ParticleEmitter|Rope|^3D$|Shadow|'
    r'ScaleTimeline|DirectionCount|DirectionFrame|RotateEmitter|UseRotate|PlayOnce|UseTopLayer|^Scale$|'
    r'UseParentAnimation3D|DepthBias|AllowSkinOverride|UseNormalizeLenghtFix|SmallRandomHitPosition|'
    r'RandomHitPositionOnCharacters|StartOffsetFromGunBone|ProjectileEffectOffset)')
REFERENCE_COLUMNS = {
    'characters': ['SecondaryTroop', 'SummonTroop', 'BunkerTroops', 'EvolveToCharacter', 'MergeToCharacter',
                   'DefensiveTroop', 'SpawnOnAttack'],
    'spells': ['AuraSpell', 'SelfSpell', 'HitSpell', 'PoisonOnHitSpell', 'ChainSpell', 'CastSpell',
               'RageOnHitSpell', 'HeroDeathAbilitySpell', 'DieSpellAttacker', 'Spell', 'SummonTroop',
               'HitSpellOverride', 'DieDamageSpell', 'MasterAura'],
    'abilities': ['SpecialAbilities', 'GivenAbility', 'ExtraAbilities', 'MainAbilities', 'GiveSpecialAbility'],
    'projectiles': ['Projectile', 'AltProjectile', 'ProjectileOnActivation', 'ReflectProjectile'],
}


PROJECTILE_COLUMNS = {'Name', 'Speed', 'IsBallistic', 'HitSpell', 'HitSpellLevel', 'HitSpellInheritAffectType',
                      'DontTrackTarget', 'BallisticHeight', 'TrajectoryStyle', 'FixedTravelTime', 'MaxTravelTime',
                      'DamageDelay', 'TargetPosRandomRadius', 'SlowdownDefencePercent', 'MaxBounceDistance',
                      'StopToTargetTime', 'SmoothDamage', 'PenetratingHitBoxWidth', 'MaxHitBuildings',
                      'MaxHitObjects', 'ReturningProjectile', 'RetargetRadius', 'RetargetTimer', 'PullTarget',
                      'SpellsBoostedByParent', 'HasBunkerTroops', 'BounceDamageReductionPercent',
                      'HitsGroundAndAir', 'ScaleDamageByDistance', 'ScaleDamageByDistanceTimePercents',
                      'ScaleDamageByDistanceScalePercents', 'StartHeight'}


def gameplay(row, kind=None):
    if kind == 'projectiles':
        return {k: v for k, v in row.items() if k in PROJECTILE_COLUMNS}
    return {k: v for k, v in row.items() if not PRESENTATION.search(k)}


# Per-level columns whose blank cells mean "none" rather than "same as the previous level".
# Verified against the official wiki: the Town Hall 18 row has no weapon or merge, and research
# minutes written only on level one do not carry into later levels.
EXACT_COLUMNS = {
    'buildings': {'Weapon', 'MergeRequirement', 'ActivateAfterSeconds', 'ActivateCombatOnDamageTaken',
                  'CombatActivationDelay'},
    'characters': {'UpgradeTimeM'},
    'heroes': {'UpgradeTimeM'},
    'pets': {'UpgradeTimeM'},
    'spells': {'UpgradeTimeM'},
}


def deltas(rows, exact=frozenset()):
    """Keep only values that differ from the forward-inherited previous level.

    Explicit zeros stay: some columns (HealerWeight) distinguish a written 0 from a blank default.
    Exact columns emit an empty string where a blank cell ends an inherited value.
    """
    inherited, result = {}, []
    for index, row in enumerate(rows):
        change = {k: v for k, v in row.items() if inherited.get(k) != v}
        for column in exact:
            if index and column not in row and inherited.get(column, '') != '':
                change[column] = ''
                inherited[column] = ''
        inherited.update(row)
        result.append(change)
    return result


SUPERCHARGE_COLUMNS = {'Name', 'Level', 'TargetBuilding', 'RequiredTownHallLevel', 'BuildTimeD', 'BuildTimeH',
                       'BuildTimeM', 'BuildTimeS', 'BuildResource', 'BuildCost', 'DPS', 'DPSLv2', 'DPSLv3',
                       'Hitpoints', 'ResourcePer100Hours', 'ResourceMax', 'SpecialAbilityLevelBuff',
                       'ProjectileSpellDamageBoost'}


def supercharges(source):
    linked = {}
    for name in BUILDINGS:
        link = next((row['MiniLevels'] for row in source['buildings'][name] if row.get('MiniLevels')), None)
        if not link:
            continue
        rows = source['mini_levels'][link]
        require(rows[0].get('TargetBuilding') == name, f'Supercharge target mismatch: {link}')
        linked[name] = deltas([{k: v for k, v in row.items() if k in SUPERCHARGE_COLUMNS} for row in rows])
    return linked


def names(value):
    return [part for part in (value or '').split(';') if part]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    fingerprint = (BASE/'fingerprint.json').read_bytes()
    require(digest(fingerprint) == FINGERPRINT, 'Fingerprint differs')
    members = {r['file']: r['sha'] for r in json.loads(fingerprint)['files']}
    pins = {}

    def table(name):
        path = f'logic/{name}.csv'
        data = (BASE/'files'/path).read_bytes()
        require(hashlib.sha1(data).hexdigest() == members[path], f'Source mismatch: {path}')
        pins[path] = digest(data)
        return records(decoded_rows(data))

    source = {name: table(name) for name in [
        'characters', 'heroes', 'pets', 'character_items', 'spells', 'special_abilities', 'buildings',
        'traps', 'weapons', 'projectiles', 'townhall_levels', 'globals', 'super_licences', 'mini_levels']}
    result = {k: {} for k in ['characters', 'heroes', 'pets', 'items', 'spells', 'abilities', 'buildings',
                              'traps', 'weapons', 'projectiles']}
    pending = {k: [] for k in result}

    def want(kind, name):
        if name and name not in result[kind] and name not in pending[kind]:
            pending[kind].append(name)

    for n in TROOPS + SUPER + SIEGE: want('characters', n)
    for n in HEROES: want('heroes', n)
    for n in PETS: want('pets', n)
    for n in SPELLS: want('spells', n)
    for n in BUILDINGS: want('buildings', n)
    for n in TRAPS: want('traps', n)
    for n in source['weapons']: want('weapons', n)
    for n, rows in source['character_items'].items():
        if not n.startswith('UNUSED'): want('items', n)
    tables = {'characters': 'characters', 'heroes': 'heroes', 'pets': 'pets', 'items': 'character_items',
              'spells': 'spells', 'abilities': 'special_abilities', 'buildings': 'buildings', 'traps': 'traps',
              'weapons': 'weapons', 'projectiles': 'projectiles'}
    while any(pending.values()):
        for kind in result:
            while pending[kind]:
                name = pending[kind].pop(0)
                rows = source[tables[kind]].get(name)
                require(rows is not None, f'Missing {kind} record: {name}')
                kept = deltas([gameplay(row, kind) for row in rows], EXACT_COLUMNS.get(kind, frozenset()))
                result[kind][name] = kept
                for row in rows:
                    for column, target in [(c, 'characters') for c in REFERENCE_COLUMNS['characters']] + \
                            [(c, 'spells') for c in REFERENCE_COLUMNS['spells']] + \
                            [(c, 'abilities') for c in REFERENCE_COLUMNS['abilities']] + \
                            [(c, 'projectiles') for c in REFERENCE_COLUMNS['projectiles']]:
                        for ref in names(row.get(column)):
                            if column == 'Spell' and kind != 'traps': continue
                            if column == 'SummonTroop' and kind == 'spells': target = 'characters'
                            if column == 'SpawnOnAttack': continue
                            if target == 'characters' and ref not in source['characters']: continue
                            if target == 'spells' and ref not in source['spells']: continue
                            if target == 'abilities' and ref not in source['special_abilities']: continue
                            if target == 'projectiles' and ref not in source['projectiles']: continue
                            want(target, ref)
                    for column in ['SpawnedTroop', 'AbilitySummonTroop', 'DefenceTroopCharacter',
                                   'DefenceTroopCharacter2', 'DefenderCharacter', 'SpawnedCharGround',
                                   'SpawnedCharAir', 'SecondaryTroopAttacker']:
                        for ref in names(row.get(column)):
                            if ref in source['characters']: want('characters', ref)
    # Items name their granted abilities in a semicolon list; heroes point at equipment rows by name.
    townhall = [gameplay(source['townhall_levels'][str(level)][0]) for level in range(1, 19)]
    result.update(
        clientVersion='18.400.21',
        sources=dict(sorted(pins.items())),
        roster=dict(troops=TROOPS, super=SUPER, siege=SIEGE, heroes=HEROES, pets=PETS, spells=SPELLS,
                    buildings=BUILDINGS, traps=TRAPS),
        townhall=townhall,
        globals={name: rows for name, rows in source['globals'].items()},
        superLicences=source['super_licences'],
        # Supercharges linked from a building row (MiniLevels); unlinked leftovers are not playable.
        superchargeRows=supercharges(source),
    )
    text = json.dumps(result, separators=(',', ':'), sort_keys=False) + '\n'
    if args.check:
        require(TARGET.read_text() == text, 'Combat tables differ')
    else:
        TARGET.write_text(text)
    counts = {k: len(v) for k, v in result.items() if isinstance(v, dict) and k not in ('sources', 'roster', 'globals')}
    print(f'Compiled combat tables {counts} ({len(text):,} bytes)')


if __name__ == '__main__':
    main()
