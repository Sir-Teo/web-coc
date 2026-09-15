#!/usr/bin/env python3
"""Import the pinned troop and spell rosters: every level of every producible unit.

Both tables use the same offset the hero table does. A row's own cells describe that
level — hitpoints, damage, housing and the Laboratory it needs — while its `UpgradeCost`
and `UpgradeTime` buy the level *above* it, so they are shifted down by one row here.
Blank cells inherit from the previous row within a named record.

The roster is everything the home village can actually produce: a record whose `VillageType`
is the home village and whose `DisableProduction` is unset. That excludes summoned units,
defensive variants and internal spell effects — a player never trains them, so they are not
part of the roster — and excludes the Builder Base, which is not modelled. `ProductionBuilding`
says which building trains each one, and is kept so a caller can tell a Barracks troop from a
dark or siege one without a list written here.
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
    'logic/characters.csv': '5c3acc5b46ff9e7978f406b540264e65c93a846b69d03cd43326a9853703cb89',
    'logic/spells.csv': '385159e00327e6a1567cd91f1585b4ed0717d3f4475f0823398243482598289d',
}
REFERENCE = ROOT / 'reference/troops'
# Home village records, as the source spells its own village column.
HOME_VILLAGE = '0'
# Local troop keys and the original record each one is. Every other roster entry is pinned
# here too but has no local key until this game trains it.
TROOPS = {
    'swordsman': 'Barbarian', 'archer': 'Archer', 'giant': 'Giant', 'wizard': 'Wizard',
    'balloon': 'Balloon', 'goblin': 'Goblin', 'wallbreaker': 'Wall Breaker',
    'healer': 'Healer', 'dragon': 'Dragon', 'pekka': 'PEKKA',
}
SPELLS = {'lightning': 'Lightning', 'heal': 'Healing', 'rage': 'Rage', 'freeze': 'Freeze'}
RESOURCES = {'Elixir': 'elixir', 'DarkElixir': 'dark', 'Gold': 'gold'}


def require(condition, message):
    if not condition:
        raise SystemExit(f'Troop import: {message}')


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
    digest = hashlib.sha256(data).hexdigest()
    require(digest == PINS[path], f'Source checksum differs: {path}')
    return data


def records(path):
    """Group continuation rows under their named record, expanding inherited cells."""
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


def paid(table, level):
    """Price and duration of reaching `level`, which sit on the row below it."""
    if level < 2:
        return dict(cost=0, seconds=0, resource='elixir')
    row = table[level - 2]
    resource = row.get('UpgradeResource', 'Elixir')
    require(resource in RESOURCES, f'Unknown upgrade resource: {resource}')
    return dict(cost=number(row, 'UpgradeCost'),
                seconds=number(row, 'UpgradeTimeH') * 3600 + number(row, 'UpgradeTimeM') * 60,
                resource=RESOURCES[resource])


def playable(rows):
    """A record the home village can actually produce, not a summon or defensive variant."""
    first = rows[0]
    return (first.get('VillageType', HOME_VILLAGE) == HOME_VILLAGE
            and first.get('DisableProduction') != 'TRUE')


def troop_levels(name, table):
    """Every row of one character record, in table order."""
    rows = []
    for index, row in enumerate(table):
        dps = number(row, 'DPS')
        record = dict(
            # A Super troop's rows begin at the level of the troop it upgrades, so the
            # displayed level is the row's own `VisualLevel`, not its position.
            level=number(row, 'VisualLevel', index + 1),
            hp=number(row, 'Hitpoints'),
            # The Healer carries its healing as a negative damage rate.
            dps=max(0, dps),
            housing=number(row, 'HousingSpace'),
            # Level one is the troop as trained, so no research reaches it.
            laboratory=0 if index == 0 else number(row, 'LaboratoryLevel'),
            **paid(table, index + 1),
        )
        if dps < 0:
            record['heal'] = -dps
        if number(row, 'DieDamage'):
            record['deathDamage'] = number(row, 'DieDamage')
        rows.append(record)
    for previous, row in zip(rows, rows[1:]):
        require(row['hp'] >= previous['hp'], f'{name} hitpoints fall at level {row["level"]}')
        require(row['laboratory'] >= previous['laboratory'],
                f'{name} Laboratory requirement falls at level {row["level"]}')
        require(row['level'] == previous['level'] + 1, f'{name} levels skip at {row["level"]}')
    return rows


# Mechanical columns a spell may carry, with the divisor that converts source units. Radii
# and speeds are hundredths of a tile, durations are milliseconds, and permil damage is a
# thousandth of the target's maximum hitpoints. A spell records only the columns it has, so
# a reader can tell "this spell does not freeze" from "this spell freezes for zero seconds".
MECHANICS = (
    ('Radius', 'radius', 100),
    ('NumberOfHits', 'pulses', 1),
    ('TimeBetweenHitsMS', 'interval', 1000),
    ('DeployTimeMS', 'deploy', 1000),
    ('BuildingDamagePermil', 'buildingDamage', 1000),
    ('TroopDamagePermil', 'troopDamage', 1000),
    ('PreferredTargetDamageMod', 'preferredDamage', 1),
    ('FreezeTimeMS', 'freeze', 1000),
    ('FreezeOuterTimeMS', 'freezeOuter', 1000),
    ('BoostTimeMS', 'boost', 1000),
    ('SpeedBoost', 'speedBoost', 1),
    ('SpeedBoost2', 'speedBoost2', 1),
    ('AttackSpeedBoost', 'attackSpeedBoost', 1),
    ('DamageBoostPercent', 'damageBoost', 1),
    ('PoisonDPS', 'poisonDps', 1),
    ('InvisibilityTime', 'invisibility', 1000),
    ('JumpBoostMS', 'jump', 1000),
)
# Flags that say what a spell cannot touch, kept so immunity is read rather than assumed.
IMMUNITIES = (
    ('ImmunityStorages', 'storages'),
    ('ImmunityWalls', 'walls'),
    ('ImmunityTH_CC', 'townHallAndCastle'),
    ('ImmunityOtherBuildings', 'otherBuildings'),
    ('ImmunitySiegeMachines', 'siegeMachines'),
    ('ImmunityTotems', 'totems'),
)


def spell_levels(name, table):
    rows = []
    for index, row in enumerate(table):
        require(number(row, 'Level') == index + 1, f'Unexpected {name} level order')
        # The Healing spell carries its healing as a negative damage rate, as the Healer
        # does; every other spell leaves the healing column at zero.
        damage = number(row, 'Damage')
        record = dict(level=index + 1, housing=number(row, 'HousingSpace'),
                      laboratory=0 if index == 0 else number(row, 'LaboratoryLevel'),
                      damage=max(0, damage),
                      heal=max(0, -damage),
                      damageBoost=number(row, 'DamageBoostPercent'),
                      speedBoost=number(row, 'SpeedBoost'),
                      **paid(table, index + 1))
        mechanics = {}
        for column, key, divisor in MECHANICS:
            if row.get(column) not in (None, ''):
                value = int(row[column]) / divisor
                mechanics[key] = value if divisor != 1 else int(row[column])
        if mechanics:
            record['mechanics'] = mechanics
        rows.append(record)
    return rows


def build():
    characters = records('logic/characters.csv')
    spells = records('logic/spells.csv')

    roster = {}
    for name, table in characters.items():
        if not playable(table):
            continue
        first = table[0]
        building = first.get('ProductionBuilding')
        require(building, f'Producible troop without a production building: {name}')
        roster[name] = dict(
            building=building,
            # A Super troop is a paid, temporary upgrade of an ordinary one.
            superTroop=first.get('EnabledBySuperLicence') == 'TRUE',
            barracks=number(first, 'BarrackLevel'),
            townhall=number(first, 'UnlockByTH'),
            levels=troop_levels(name, table),
        )

    spellRoster = {}
    for name, table in spells.items():
        if not playable(table):
            continue
        building = table[0].get('ProductionBuilding')
        require(building, f'Producible spell without a production building: {name}')
        immune = [key for column, key in IMMUNITIES if table[0].get(column) == 'TRUE']
        spellRoster[name] = dict(
            building=building,
            forge=number(table[0], 'SpellForgeLevel'),
            # The Earthquake spell alone prefers a target: it hits Walls five times as hard.
            preferredTarget=table[0].get('PreferredTarget', ''),
            immune=immune,
            levels=spell_levels(name, table),
        )

    for key, name in TROOPS.items():
        require(name in roster, f'Absent source troop: {name} (for {key})')
    for key, name in SPELLS.items():
        require(name in spellRoster, f'Absent source spell: {name} (for {key})')

    return dict(
        clientVersion='18.400.21',
        bundle=BUNDLE,
        baseUrl=BASE,
        sources=dict(sorted(PINS.items())),
        scope='Every original level of every troop and spell the home village can produce, '
              'with the local key of each one this game trains.',
        troops=dict(sorted(TROOPS.items())),
        spells=dict(sorted(SPELLS.items())),
        roster=roster,
        spellRoster=spellRoster,
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
        require(target.exists(), 'Missing reference/troops/catalog.json')
        require(target.read_text() == text, 'Committed troop catalog differs from the source')
        print(f'Troop catalog reproduces {len(catalog["roster"])} producible troops and '
              f'{len(catalog["spellRoster"])} spells across '
              f'{sum(len(r["levels"]) for r in catalog["roster"].values())} troop levels and '
              f'{sum(len(r["levels"]) for r in catalog["spellRoster"].values())} spell levels; '
              f'{len(catalog["troops"])} troops and {len(catalog["spells"])} spells have a '
              'local key.')
        return
    REFERENCE.mkdir(parents=True, exist_ok=True)
    target.write_text(text)
    print(f'Wrote {target.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
