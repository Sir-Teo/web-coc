#!/usr/bin/env python3
"""Import the pinned troop and spell rosters: every level the original defines.

Both tables use the same offset the hero table does. A row's own cells describe that
level — hitpoints, damage, housing and the Laboratory it needs — while its `UpgradeCost`
and `UpgradeTime` buy the level *above* it, so they are shifted down by one row here.
Blank cells inherit from the previous row within a named record.
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
# Local troop keys and the original record each one is.
TROOPS = {
    'swordsman': 'Barbarian', 'archer': 'Archer', 'giant': 'Giant', 'wizard': 'Wizard',
    'balloon': 'Balloon', 'goblin': 'Goblin', 'wallbreaker': 'Wall Breaker',
    'healer': 'Healer', 'dragon': 'Dragon', 'pekka': 'PEKKA',
}
SPELLS = {'lightning': 'Lightning', 'heal': 'Healing', 'rage': 'Rage'}
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


def build():
    characters = records('logic/characters.csv')
    spells = records('logic/spells.csv')

    troops = {}
    for kind, name in TROOPS.items():
        require(name in characters, f'Absent source troop: {name}')
        table = characters[name]
        rows = []
        for index, row in enumerate(table):
            require(number(row, 'VisualLevel') == index + 1, f'Unexpected {name} level order')
            dps = number(row, 'DPS')
            record = dict(level=index + 1, hp=number(row, 'Hitpoints'),
                          # The Healer carries its healing as a negative damage rate.
                          dps=max(0, dps), housing=number(row, 'HousingSpace'),
                          # Level one is the troop as trained, so no research reaches it.
                          laboratory=0 if index == 0 else number(row, 'LaboratoryLevel'),
                          **paid(table, index + 1))
            if dps < 0:
                record['heal'] = -dps
            if number(row, 'DieDamage'):
                record['deathDamage'] = number(row, 'DieDamage')
            rows.append(record)
        for previous, row in zip(rows, rows[1:]):
            require(row['hp'] >= previous['hp'], f'{name} hitpoints fall at level {row["level"]}')
            require(row['laboratory'] >= previous['laboratory'],
                    f'{name} Laboratory requirement falls at level {row["level"]}')
        troops[kind] = rows

    tabled = {}
    for kind, name in SPELLS.items():
        require(name in spells, f'Absent source spell: {name}')
        table = spells[name]
        rows = []
        for index, row in enumerate(table):
            require(number(row, 'Level') == index + 1, f'Unexpected {name} level order')
            # The Healing spell carries its healing as a negative damage rate, as the
            # Healer does; every other spell leaves the healing column at zero.
            damage = number(row, 'Damage')
            rows.append(dict(level=index + 1, housing=number(row, 'HousingSpace'),
                             laboratory=0 if index == 0 else number(row, 'LaboratoryLevel'),
                             damage=max(0, damage),
                             heal=max(0, -damage),
                             damageBoost=number(row, 'DamageBoostPercent'),
                             speedBoost=number(row, 'SpeedBoost'),
                             **paid(table, index + 1)))
        tabled[kind] = rows

    return dict(
        clientVersion='18.400.21',
        bundle=BUNDLE,
        baseUrl=BASE,
        sources=dict(sorted(PINS.items())),
        scope='Every original level of the ten troops and three spells this game implements.',
        troops=troops,
        spells=tabled,
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
        print(f'Troop catalog reproduces {len(catalog["troops"])} troops and '
              f'{len(catalog["spells"])} spells across '
              f'{sum(len(r) for r in catalog["troops"].values())} troop levels and '
              f'{sum(len(r) for r in catalog["spells"].values())} spell levels.')
        return
    REFERENCE.mkdir(parents=True, exist_ok=True)
    target.write_text(text)
    print(f'Wrote {target.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
