#!/usr/bin/env python3
"""Import the pinned Blacksmith and King equipment tables: every level the original defines.

Three sources meet here. `buildings.csv` holds the Blacksmith's own levels and the ore each
one stores; `character_items.csv` holds each item's passive stats, ore prices and which
ability tier it carries; `special_abilities.csv` and `spells.csv` hold what those tiers do.

An item row's `UpgradeCosts` buys the level above it, as the hero table does, so prices are
shifted down by one row. Blank cells inherit from the previous row within a named record.
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
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
    'logic/character_items.csv': '66e644c62331a026aec3795980d9a37af95e2120d67dfbad380c729f3645ebad',
    'logic/special_abilities.csv': 'c978dd90ff2335e60d988f3476d78bec72672e8c074344d149096e89951181eb',
    'logic/spells.csv': '385159e00327e6a1567cd91f1585b4ed0717d3f4475f0823398243482598289d',
}
REFERENCE = ROOT / 'reference/equipment'
# Local keys and the original record each one is. Every other item is pinned here too but
# has no local key until this game equips it.
ITEMS = {'puppet': 'Barbarian Puppet', 'vial': 'Rage Vial', 'boots': 'Earthquake Boots'}
ORES = {'CommonOre': 'shiny', 'RareOre': 'glowy', 'EpicOre': 'starry'}
ABILITY_TIERS = 7


def require(condition, message):
    if not condition:
        raise SystemExit(f'Equipment import: {message}')


def source(path):
    require(path in PINS, f'Unpinned source requested: {path}')
    target = ROOT / 'output/native-campaign-source' / path
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + '.part')
        subprocess.run(['curl', '--fail', '--silent', '--show-error', '--retry', '2',
                        BASE + path, '-o', str(temporary)], check=True)
        temporary.replace(target)
    data = target.read_bytes()
    require(hashlib.sha256(data).hexdigest() == PINS[path], f'Source checksum differs: {path}')
    return data


def records(path):
    blob = source(path)
    if blob.startswith(b'Sig:'):
        blob = blob[68:]
    if not blob.startswith(b'"'):
        blob = lzma.decompress(blob[:9] + b'\0' * 4 + blob[9:])
    decoded = list(csv.reader(io.StringIO(blob.decode('utf-8-sig'))))
    headers = decoded[0]
    require(headers[0] == 'Name', f'Missing table header: {path}')
    result, name = {}, None
    for row in decoded[2:]:
        if not any(row):
            continue
        if row[0]:
            name = row[0]
            require(name not in result, f'Duplicate record: {name}')
            result[name] = []
        require(name is not None, f'Orphan row: {path}')
        inherited = dict(result[name][-1]) if result[name] else {}
        inherited.update({k: v for k, v in zip(headers, row) if v})
        result[name].append(inherited)
    return result


def number(row, column, default=0):
    value = row.get(column)
    return int(value) if value not in (None, '') else default


def seconds(row):
    return (number(row, 'BuildTimeD') * 24 + number(row, 'BuildTimeH')) * 3600 + \
        number(row, 'BuildTimeM') * 60


def price(table, level):
    """Ore price of reaching `level`, which sits on the row below it."""
    cost = {name: 0 for name in ORES.values()}
    if level < 2:
        return cost
    row = table[level - 2]
    kinds = [k.strip() for k in row.get('UpgradeResources', '').split(';') if k.strip()]
    amounts = [a.strip() for a in row.get('UpgradeCosts', '').split(';') if a.strip()]
    require(len(kinds) == len(amounts), f'Mismatched upgrade cost columns at level {level}')
    for kind, amount in zip(kinds, amounts):
        require(kind in ORES, f'Unknown upgrade ore: {kind}')
        cost[ORES[kind]] = int(amount)
    return cost


def build():
    buildings = records('logic/buildings.csv')
    items = records('logic/character_items.csv')
    abilities = records('logic/special_abilities.csv')
    spells = records('logic/spells.csv')

    require('Blacksmith' in buildings, 'Absent source Blacksmith')
    forge = []
    for index, row in enumerate(buildings['Blacksmith']):
        require(number(row, 'BuildingLevel') == index + 1, 'Unexpected Blacksmith level order')
        forge.append(dict(level=index + 1, townhall=number(row, 'TownHallLevel'),
                          cost=number(row, 'BuildCost'), seconds=seconds(row),
                          hp=number(row, 'Hitpoints'),
                          shiny=number(row, 'MaxStoredCommonOre'),
                          glowy=number(row, 'MaxStoredRareOre'),
                          starry=number(row, 'MaxStoredEpicOre')))

    roster = {}
    for name, table in items.items():
        rows = []
        for index, row in enumerate(table):
            require(number(row, 'Level') == index + 1, f'Unexpected {name} level order')
            rows.append(dict(level=index + 1, blacksmith=number(row, 'RequiredBlacksmithLevel'),
                             ability=number(row, 'MainAbilityLevels'),
                             hp=number(row, 'HitPoints'), dps=number(row, 'DPS'),
                             recovery=number(row, 'HealOnActivation'),
                             cost=price(table, index + 1)))
        for previous, row in zip(rows, rows[1:]):
            require(row['blacksmith'] >= previous['blacksmith'],
                    f'{name} Blacksmith requirement falls at level {row["level"]}')
            require(row['ability'] >= previous['ability'],
                    f'{name} ability tier falls at level {row["level"]}')
        roster[name] = dict(
            heroes=[h.strip() for h in table[0].get('AllowedCharacters', '').split(';') if h.strip()],
            rarity=table[0].get('Rarity', ''),
            # A one-row placeholder the client ships but never offers.
            unused=name.startswith('UNUSED'),
            levels=rows,
        )

    for kind, name in ITEMS.items():
        require(name in roster, f'Absent source equipment: {name} (for {kind})')
        for row in roster[name]['levels']:
            require(1 <= row['ability'] <= ABILITY_TIERS,
                    f'{name} level {row["level"]} names tier {row["ability"]}')

    summon = abilities['BarbarianKingSpawnBarbarians']
    boost = abilities['BoostBarbarian']
    rage = abilities['BarbarianKingRage']
    quake = spells['Earthquake Boots Spell']
    for name, table in (('summon', summon), ('boost', boost), ('rage', rage), ('quake', quake)):
        require(len(table) >= ABILITY_TIERS, f'Source {name} table is shorter than seven tiers')

    tiers = dict(
        summon=[dict(
            level=n + 1,
            count=number(summon[n], 'TroopCount'),
            perHit=number(summon[n], 'SpawnnedTroopsPerHit'),
            delay=number(summon[n], 'SpawnDelayBetweenHitsMS') / 1000,
            seconds=number(summon[n], 'DeactivateAfterTime') / 1000,
            # The summoned Barbarians carry their own separate, equally tiered boost.
            boostDamage=1 + number(boost[n], 'BoostDamagePercentage') / 100,
            boostSpeed=number(boost[n], 'SpeedBoost') / 100,
            boostSeconds=number(boost[n], 'DeactivateAfterTime') / 1000,
        ) for n in range(ABILITY_TIERS)],
        rage=[dict(
            level=n + 1,
            damage=1 + number(rage[n], 'BoostDamagePercentage') / 100,
            speed=number(rage[n], 'SpeedBoost') / 100,
            seconds=number(rage[n], 'DeactivateAfterTime') / 1000,
        ) for n in range(ABILITY_TIERS)],
        quake=[dict(
            level=n + 1,
            building=number(quake[n], 'BuildingDamagePermil') / 1000,
            troop=number(quake[n], 'TroopDamagePermil') / 1000,
            radius=number(quake[n], 'Radius') / 100,
            pulses=number(quake[n], 'NumberOfHits'),
            interval=number(quake[n], 'TimeBetweenHitsMS') / 1000,
        ) for n in range(ABILITY_TIERS)],
    )

    return dict(
        clientVersion='18.400.21',
        bundle=BUNDLE,
        baseUrl=BASE,
        sources=dict(sorted(PINS.items())),
        scope='Every Blacksmith level, every level of every hero equipment record the '
              'source defines, and the seven tiers of the abilities the three items this '
              'game equips carry.',
        blacksmith=forge,
        items=dict(sorted(ITEMS.items())),
        roster=roster,
        abilities=tiers,
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
        require(target.exists(), 'Missing reference/equipment/catalog.json')
        require(target.read_text() == text, 'Committed equipment catalog differs from the source')
        print(f'Equipment catalog reproduces {len(catalog["blacksmith"])} Blacksmith levels, '
              f'{sum(len(r["levels"]) for r in catalog["roster"].values())} item levels across '
              f'{len(catalog["roster"])} equipment records and {ABILITY_TIERS} ability tiers; '
              f'{len(catalog["items"])} items have a local key.')
        return
    REFERENCE.mkdir(parents=True, exist_ok=True)
    target.write_text(text)
    print(f'Wrote {target.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
