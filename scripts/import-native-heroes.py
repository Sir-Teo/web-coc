#!/usr/bin/env python3
"""Import the pinned hero roster: every original level of all six home-village heroes.

`heroes.csv` uses the same destination-level offset the troop and spell tables do. A row's
own cells describe that level — hitpoints, damage, the Town Hall and Hero Hall it needs, and
the ability tier it activates — while its `UpgradeCost` and `UpgradeTimeH` buy the level
*above* it, so they are shifted down by one row here. Blank cells inherit from the previous
row within a named record, so a hero's fixed columns are read from its first row.

Each hero activates one `<Hero>AbilityHeal` record in `special_abilities.csv`, indexed by the
level row's `SpecialAbilitiesLevel`. The Dragon Duke additionally carries a passive that needs
no activation; only the activated record is tabled here.
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
    'logic/heroes.csv': '658c9721fb0fd5488b69ca3555ef5597d521f28dde95af051a2a98ccbdd65197',
    'logic/special_abilities.csv': 'c978dd90ff2335e60d988f3476d78bec72672e8c074344d149096e89951181eb',
    'logic/character_items.csv': '66e644c62331a026aec3795980d9a37af95e2120d67dfbad380c729f3645ebad',
}
REFERENCE = ROOT / 'reference/heroes'
# Local hero keys and the original record each one is. The Royal Champion's art and skin
# records still carry her development name, Warrior Princess; her logic record does not.
HEROES = {
    'barbarianKing': 'Barbarian King',
    'archerQueen': 'Archer Queen',
    'grandWarden': 'Grand Warden',
    'royalChampion': 'Royal Champion',
    'minionPrince': 'Minion Prince',
    'dragonDuke': 'Dragon Duke',
}
RESOURCES = {'Elixir': 'elixir', 'DarkElixir': 'dark', 'Gold': 'gold'}
# The activated ability every hero shares. A hero may list further passive records; those
# carry no activation tier and are named in `passives` rather than tabled.
ACTIVATED = 'AbilityHeal'


def require(condition, message):
    if not condition:
        raise SystemExit(f'Hero import: {message}')


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


def listed(row, column):
    """A semicolon-separated cell, without its trailing separator or blank entries."""
    return [part.strip() for part in row.get(column, '').split(';') if part.strip()]


def truth(row, column):
    value = row.get(column, '')
    require(value in ('TRUE', 'FALSE', ''), f'Unexpected boolean: {column}={value!r}')
    return value == 'TRUE'


def ability_table(abilities, name):
    """The activation tiers of one ability record, indexed by its own `Level`."""
    require(name in abilities, f'Absent ability record: {name}')
    tiers = []
    for index, row in enumerate(abilities[name]):
        require(number(row, 'Level') == index + 1, f'Unexpected {name} tier order')
        tiers.append(dict(tier=index + 1,
                          heal=number(row, 'HealOnActivation'),
                          seconds=number(row, 'DeactivateAfterTime') / 1000,
                          activations=number(row, 'MaxActivations')))
    return tiers


def equipment_owners(items):
    """Every hero equipment record the source allows each hero, in table order."""
    owned = {}
    for name, rows in items.items():
        for hero in listed(rows[0], 'AllowedCharacters'):
            owned.setdefault(hero, []).append(dict(
                name=name,
                rarity=rows[0].get('Rarity', ''),
                levels=len(rows),
                # A one-row placeholder the client never offers; kept visible, not hidden.
                unused=name.startswith('UNUSED'),
            ))
    return owned


def build():
    heroes = records('logic/heroes.csv')
    abilities = records('logic/special_abilities.csv')
    owned = equipment_owners(records('logic/character_items.csv'))

    result = {}
    for key, name in HEROES.items():
        require(name in heroes, f'Absent source hero: {name}')
        table = heroes[name]
        base = table[0]
        resource = base.get('UpgradeResource', 'Elixir')
        require(resource in RESOURCES, f'Unknown upgrade resource: {resource}')

        names = listed(base, 'SpecialAbilities')
        activated = [n for n in names if n.endswith(ACTIVATED)]
        require(len(activated) == 1, f'{name} does not activate exactly one ability: {names}')
        tiers = ability_table(abilities, activated[0])

        levels = []
        for index, row in enumerate(table):
            require(number(row, 'VisualLevel') == index + 1, f'Unexpected {name} level order')
            # Price and duration sit on the row below their destination level.
            paid = table[index - 1] if index else None
            tier = number(row, 'SpecialAbilitiesLevel', 1) if len(names) == 1 else \
                int(listed(row, 'SpecialAbilitiesLevel')[names.index(activated[0])])
            require(1 <= tier <= len(tiers), f'{name} level {index + 1} names ability tier {tier}')
            levels.append(dict(
                level=index + 1,
                hp=number(row, 'Hitpoints'),
                dps=number(row, 'DPS'),
                recovery=tiers[tier - 1]['heal'],
                tier=tier,
                cost=number(paid, 'UpgradeCost') if paid else 0,
                seconds=number(paid, 'UpgradeTimeH') * 3600 if paid else 0,
                townhall=number(row, 'RequiredTownHallLevel'),
                hall=number(row, 'RequiredHeroTavernLevel'),
            ))
        for previous, level in zip(levels, levels[1:]):
            for column in ('hp', 'dps', 'townhall', 'hall', 'tier'):
                require(level[column] >= previous[column],
                        f'{name} {column} falls at level {level["level"]}')

        result[key] = dict(
            name=name,
            skin=base['DefaultSkin'],
            housing=number(base, 'HousingSpace'),
            speed=number(base, 'Speed'),
            range=number(base, 'AttackRange'),
            attackSpeed=number(base, 'AttackSpeed'),
            flying=truth(base, 'IsFlying'),
            airTargets=truth(base, 'AirTargets'),
            groundTargets=truth(base, 'GroundTargets'),
            resource=RESOURCES[resource],
            slots=number(base, 'ItemSlotCount'),
            defaultItems=listed(base, 'DefaultItems'),
            ability=dict(name=activated[0], tiers=tiers),
            passives=[n for n in names if n != activated[0]],
            equipment=owned.get(name, []),
            levels=levels,
        )

    return dict(
        clientVersion='18.400.21',
        bundle=BUNDLE,
        baseUrl=BASE,
        sources=dict(sorted(PINS.items())),
        scope='Every original level of the six home-village heroes, with the ability tiers '
              'each one activates and the equipment the source allows it.',
        heroes=result,
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
        require(target.exists(), 'Missing reference/heroes/catalog.json')
        require(target.read_text() == text, 'Committed hero catalog differs from the source')
        print(f'Hero catalog reproduces {len(catalog["heroes"])} heroes across '
              f'{sum(len(h["levels"]) for h in catalog["heroes"].values())} levels, '
              f'{sum(len(h["ability"]["tiers"]) for h in catalog["heroes"].values())} ability '
              f'tiers and {sum(len(h["equipment"]) for h in catalog["heroes"].values())} '
              'equipment records.')
        return
    REFERENCE.mkdir(parents=True, exist_ok=True)
    target.write_text(text)
    print(f'Wrote {target.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
