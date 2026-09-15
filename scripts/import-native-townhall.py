#!/usr/bin/env python3
"""Import the pinned Town Hall catalog: per-level counts, gates and King records.

The Home Village tier tables live in three separate signed sources. `townhall_levels.csv`
holds how many of each building a Town Hall permits, `buildings.csv` and `traps.csv` hold
the Town Hall each individual level requires, and `heroes.csv` holds the King records that
a Hero Hall unlocks. Blank cells inherit from the previous row within a named record, so
every row is expanded before it is written.
"""
import argparse
import csv
import hashlib
import io
import json
import lzma
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = '7f04bdfdc4124b1f49308423bb8f4aa8b137aae3'
BASE = f'https://game-assets.clashofclans.com/{BUNDLE}/'
PINS = {
    'logic/townhall_levels.csv': '2d596bcd08433924c3e566f79f380eb2260076f87c5b5dd30c9ab6f2c3f41472',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
    'logic/traps.csv': '757ca07de02b26b2071b52bb3cb495df2f0ae879731a859d3102ca3552dd528c',
    'logic/heroes.csv': '658c9721fb0fd5488b69ca3555ef5597d521f28dde95af051a2a98ccbdd65197',
    'logic/special_abilities.csv': 'c978dd90ff2335e60d988f3476d78bec72672e8c074344d149096e89951181eb',
    'logic/globals.csv': '16210fc28bfb86d00ea04d581a99fe98e128172017b2d4f637b8848c0cf20087',
}
REFERENCE = ROOT / 'reference/townhall'
# The Home Village entities this game implements. Names are the original record names.
BUILDINGS = [
    'Town Hall', 'Army Camp', 'Elixir Storage', 'Gold Storage', 'Elixir Collector',
    'Gold Mine', 'Barracks', 'Builders Hut', 'Laboratory', 'Spell Factory', 'Wall',
    'Hero Hall', 'Blacksmith', 'Clan Castle', 'Cannon', 'Archer Tower', 'Mortar',
    'Air Defense', 'Wizard Tower', 'Hidden Tesla', 'Bomb Tower', 'X-Bow', 'Air Sweeper',
    'Dark Elixir Drill', 'Dark Elixir Storage', 'Inferno Tower', 'Eagle Artillery', 'Scattershot',
    'Monolith', 'Spell Tower',
]
TRAPS = [
    'Bomb', 'Spring Trap', 'Air Bomb', 'Giant Bomb', 'Seeking Air Mine', 'Skeleton Trap',
    'Tornado Trap',
]
# Ownable entities this game does not build. They are counted and gated here so the tier
# ladder is complete and the gap is measurable, but their per-level rows are not tabled:
# nothing reads them yet, and the catalog is parsed by every module that reads a building.
UNBUILT_BUILDINGS = [
    'Dark Barracks', 'Dark Spell Factory', 'Siege Workshop', 'Pet House',
    'Multi Archer Tower', 'Multi Gear Tower', 'Ricochet Cannon', 'Firespitter',
    'Super Wizard Tower', 'Revenge Tower', 'Crafting Station', 'Helper Hut', 'BOBs Hut',
    'Communications mast',
]
UNBUILT_TRAPS = ['Giga Bomb', 'ShrinkTrap', 'SantaTrap', 'Halloweenbomb', 'FreezeBomb', 'Slowbomb']
# Counted columns in townhall_levels.csv. The Town Hall itself is never one of them.
COUNTED = ([name for name in BUILDINGS if name != 'Town Hall'] + TRAPS
           + UNBUILT_BUILDINGS + UNBUILT_TRAPS)
# Entities whose per-level rows this reference owns. The rest already have their own pinned
# family reference (Cannon, Mortar, Tesla, X-Bow, the drill and so on) and are not duplicated.
TABLED = [
    'Town Hall', 'Army Camp', 'Elixir Storage', 'Gold Storage', 'Elixir Collector', 'Gold Mine',
    'Barracks', 'Builders Hut', 'Laboratory', 'Spell Factory', 'Wall', 'Hero Hall', 'Blacksmith',
    'Air Defense', 'Bomb', 'Spring Trap', 'Air Bomb', 'Giant Bomb', 'Skeleton Trap',
    'Eagle Artillery', 'Scattershot', 'Monolith', 'Spell Tower', 'Tornado Trap',
]
# Optional numeric columns, with the divisor that converts source units to tiles.
OPTIONAL = (
    ('DPS', 'dps', 1), ('HousingSpace', 'housing', 1), ('UnitProduction', 'production', 1),
    ('MaxStoredGold', 'storedGold', 1), ('MaxStoredElixir', 'storedElixir', 1),
    ('MaxStoredDarkElixir', 'storedDark', 1), ('Damage', 'damage', 1),
    ('DamageRadius', 'radius', 100), ('TriggerRadius', 'trigger', 100),
    ('EjectHousingLimit', 'eject', 1),
)
RESOURCES = {'Gold': 'gold', 'Elixir': 'elixir', 'DarkElixir': 'dark', 'Diamonds': 'gems'}
# King records the local Hero Hall reaches; Hero Hall 12 at Town Hall 18 permits all 110.
KING_LEVELS = 110
# Gem price of the 2nd through 5th Builder's Hut. The first hut ships with the village and
# the second is free, so the source charges only for the last three.
WORKERS = ('WORKER_COST_2ND', 'WORKER_COST_3RD', 'WORKER_COST_4TH', 'WORKER_COST_5TH')
# What a new village is granted. The gems here are already this game's opening allowance.
STARTING = {'gold': 'STARTING_GOLD', 'elixir': 'STARTING_ELIXIR', 'gems': 'STARTING_DIAMONDS'}


def require(condition, message):
    if not condition:
        raise SystemExit(f'Town Hall import: {message}')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source(path):
    require(path in PINS, f'Unpinned source requested: {path}')
    target = ROOT / 'output/native-campaign-source' / path
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + '.part')
        subprocess.run(['curl', '--fail', '--silent', '--show-error', '--retry', '2',
                        BASE + path, '-o', str(temporary)], check=True)
        require(digest(temporary.read_bytes()) == PINS[path], f'Source checksum differs: {path}')
        temporary.replace(target)
    data = target.read_bytes()
    require(digest(data) == PINS[path], f'Source checksum differs: {path}')
    return data


def rows(path):
    """Decode one signed, LZMA-compressed client table into raw rows."""
    blob = source(path)
    if blob.startswith(b'Sig:'):
        blob = blob[68:]
    if not blob.startswith(b'"'):
        blob = lzma.decompress(blob[:9] + b'\0' * 4 + blob[9:])
    decoded = list(csv.reader(io.StringIO(blob.decode('utf-8-sig'))))
    require(len(decoded) > 2 and decoded[0][0] == 'Name', f'Missing table header: {path}')
    return decoded


def records(path):
    """Group continuation rows under their named record, expanding inherited cells."""
    decoded = rows(path)
    headers = decoded[0]
    require(all(headers) and len(set(headers)) == len(headers), f'Invalid columns: {path}')
    result, name = {}, None
    for row in decoded[2:]:
        if not any(row):
            continue
        require(len(row) == len(headers), f'Malformed row: {path}')
        if row[0]:
            name = row[0]
            require(name not in result, f'Duplicate record: {name}')
            result[name] = []
        require(name is not None, f'Orphan row: {path}')
        inherited = dict(result[name][-1]) if result[name] else {}
        inherited.update({k: v for k, v in zip(headers, row) if v})
        result[name].append(inherited)
    return result


def globals_table():
    """The client's flat Name/NumberValue sheet, which carries no continuation rows."""
    decoded = rows('logic/globals.csv')
    headers = decoded[0]
    return {row[0]: dict(zip(headers, row)) for row in decoded[2:] if row and row[0]}


def seconds(row):
    return (int(row.get('BuildTimeD', 0)) * 24 + int(row.get('BuildTimeH', 0))) * 3600 + \
        int(row.get('BuildTimeM', 0)) * 60 + int(row.get('BuildTimeS', 0))


def level_row(name, row, level):
    """One destination-level record. Traps carry no hitpoints and are never damageable."""
    resource = row['BuildResource']
    require(resource in RESOURCES, f'Unknown {name} resource: {resource}')
    record = dict(level=level, townhall=int(row['TownHallLevel']), cost=int(row['BuildCost']),
                  resource=RESOURCES[resource], seconds=seconds(row))
    if 'Hitpoints' in row:
        record['hp'] = int(row['Hitpoints'])
    for column, key, divisor in OPTIONAL:
        value = row.get(column)
        if value in (None, ''):
            continue
        record[key] = int(value) if divisor == 1 else int(value) / divisor
    return record


def build():
    halls = records('logic/townhall_levels.csv')
    buildings = records('logic/buildings.csv')
    traps = records('logic/traps.csv')
    heroes = records('logic/heroes.csv')
    abilities = records('logic/special_abilities.csv')
    settings = globals_table()

    missing = [name for name in BUILDINGS if name not in buildings]
    require(not missing, f'Absent source buildings: {missing}')
    missing = [name for name in TRAPS if name not in traps]
    require(not missing, f'Absent source traps: {missing}')

    hall_rows = buildings['Town Hall']
    require(len(halls) == len(hall_rows), 'Town Hall tier count differs from the level table')
    tiers = []
    for index, row in enumerate(hall_rows):
        level = int(row['BuildingLevel'])
        require(level == index + 1 and str(level) in halls, f'Unexpected Town Hall row {level}')
        # Each tier row names the Town Hall that unlocks it: level 9 requires level 8.
        require(int(row['TownHallLevel']) == level - 1, f'Unexpected Town Hall gate {level}')
        # Each tier is its own record, so a blank count carries over from the tier below.
        previous = tiers[-1]['counts'] if tiers else {}
        counts = {}
        for name in COUNTED:
            value = halls[str(level)][0].get(name)
            counts[name] = int(value) if value else previous.get(name, 0)
        tiers.append(dict(level=level, hp=int(row['Hitpoints']), cost=int(row['BuildCost']),
                          seconds=seconds(row), counts=counts))
    for previous, tier in zip(tiers, tiers[1:]):
        for name in COUNTED:
            require(tier['counts'][name] >= previous['counts'][name],
                    f'{name} count falls at Town Hall {tier["level"]}')

    gates, tabled = {}, {}
    for name in BUILDINGS + TRAPS + UNBUILT_BUILDINGS + UNBUILT_TRAPS:
        table = buildings.get(name) or traps[name]
        key = 'BuildingLevel' if name in buildings else 'Level'
        levels, rows = [], []
        for index, row in enumerate(table):
            require(int(row[key]) == index + 1, f'Unexpected {name} level order')
            levels.append(int(row['TownHallLevel']))
            rows.append(level_row(name, row, index + 1))
        gates[name] = levels
        if name in TABLED:
            tabled[name] = rows
    missing = [name for name in TABLED if name not in tabled]
    require(not missing, f'Absent tabled entities: {missing}')

    recovery = {int(row['Level']): int(row['HealOnActivation'])
                for row in abilities['BarbarianKingAbilityHeal']}
    source_king = heroes['Barbarian King']
    require(len(source_king) >= KING_LEVELS, 'Source King table is shorter than the local roster')
    king = []
    for level in range(1, KING_LEVELS + 1):
        row = source_king[level - 1]
        # Price and duration sit on the row below their destination level.
        paid = source_king[level - 2] if level > 1 else None
        king.append(dict(
            level=level,
            hp=int(row['Hitpoints']),
            dps=int(row['DPS']),
            recovery=recovery[int(row['SpecialAbilitiesLevel'])],
            cost=int(paid['UpgradeCost']) if paid else 0,
            seconds=int(paid['UpgradeTimeH']) * 3600 if paid else 0,
            townhall=int(row['RequiredTownHallLevel']),
            hall=int(row['RequiredHeroTavernLevel']),
        ))

    missing = [name for name in WORKERS if name not in settings]
    require(not missing, f'Absent worker costs: {missing}')
    workers = [int(settings[name]['NumberValue']) for name in WORKERS]
    require(workers == sorted(workers), 'Worker gem costs fall as huts are bought')
    missing = [name for name in STARTING.values() if name not in settings]
    require(not missing, f'Absent starting grant: {missing}')
    starting = {key: int(settings[name]['NumberValue']) for key, name in STARTING.items()}

    return dict(
        clientVersion='18.400.21',
        bundle=BUNDLE,
        baseUrl=BASE,
        sources=dict(sorted(PINS.items())),
        scope='Home Village tier counts and level gates for every entity a village can own, '
              'with the Barbarian King records a Hero Hall unlocks, the gem price of each hut '
              'and what a new village is granted.',
        townHalls=tiers,
        gates=gates,
        levels=tabled,
        heroes=dict(barbarianKing=king),
        workers=workers,
        starting=starting,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true',
                        help='verify the committed reference instead of rewriting it')
    arguments = parser.parse_args()
    catalog = build()
    target = REFERENCE / 'catalog.json'
    text = json.dumps(catalog, indent=2) + '\n'
    if arguments.check:
        require(target.exists(), 'Missing reference/townhall/catalog.json')
        require(target.read_text() == text, 'Committed Town Hall catalog differs from the source')
        print(f'Town Hall catalog reproduces {len(catalog["townHalls"])} tiers, '
              f'{len(catalog["gates"])} gated entities, '
              f'{sum(len(rows) for rows in catalog["levels"].values())} level rows across '
              f'{len(catalog["levels"])} tabled entities and '
              f'{len(catalog["heroes"]["barbarianKing"])} King records, '
              f'{len(catalog["workers"])} hut prices and the opening grant.')
        return
    REFERENCE.mkdir(parents=True, exist_ok=True)
    target.write_text(text)
    print(f'Wrote {target.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
