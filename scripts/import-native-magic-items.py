#!/usr/bin/env python3
"""Import the Home Village magic items: their rules from logic/boosters.csv and their icons.

Each item keeps the client's `MaxItems` (how many one village may hold), `DiamondValue` (the
gems it sells for), `DisplayOrder` and effect flags, read into one `effect`:

  finish   Books: `FinishUpgrade` alone finishes a running upgrade of the flagged targets.
  upgrade  Hammers: `StartUpgrade` with `FinishUpgrade` performs the next upgrade instantly and
           free.
  ring     Wall Ring: `Wall` with `StartUpgrade`; a wall level takes ceil(cost / divisor) rings,
           the divisor being the Wall row's `StartUpgradeBoosterCostDivisor` in buildings.csv.
  fill     Runes: `FillStorageResource`.
  boost    Potions, with durations and rates from logic/globals.csv (`BOOSTER_*`,
           `RESOURCE_PRODUCTION_BOOST_*`).
  super    Super Potion: `SuperTroop` boosts a troop into its Super Troop.
  shovel   Shovel of Obstacles (no flag; the client names it TID_BOOSTER_MOVE_OBSTACLE).

Names and descriptions come from localization/texts.csv, with the client's <time> and
<multiplier> placeholders filled in. Icons render the rows' `IconExportName` from `sc/ui.sc` by
the compositor of scripts/native-full-catalog.py and are written to
public/assets/magic-items-native.

Left out: the Builder Base items (Clock Tower Potion, Builder Star Jar and the Builder Gold and
Builder Elixir runes), as that village is not modelled, and the Training Potion, which the live
game removed in March 2025 when training became instant (as it is here).

Every source is downloaded from the pinned bundle into output/native-campaign-source and must
match its SHA-256 in reference/full-client/manifest.json. Needs scripts/native_art/requirements.txt.

  python3 scripts/import-native-magic-items.py           # write the catalog and icons
  python3 scripts/import-native-magic-items.py --check   # verify both reproduce
"""
import argparse
import hashlib
import importlib.util
import io
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
BUNDLE = '7f04bdfdc4124b1f49308423bb8f4aa8b137aae3'
BASE = f'https://game-assets.clashofclans.com/{BUNDLE}/'
CACHE = ROOT / 'output/native-campaign-source'
TARGET = ROOT / 'reference/magic-items/catalog.json'
ART = 'assets/magic-items-native'
LEFT_OUT = {'Training Potion', 'Clock Tower Potion', 'Builder Star Jar', 'Rune of Builder Gold',
            'Rune of Builder Elixir'}
RESOURCES = {'Gold': 'gold', 'Elixir': 'elixir', 'DarkElixir': 'dark'}
TARGETS = {'Troop': 'troop', 'Building': 'building', 'Spell': 'spell', 'Hero': 'hero'}


def require(condition, message):
    if not condition:
        raise SystemExit(f'Magic item import: {message}')


MANIFEST = json.loads((ROOT / 'reference/full-client/manifest.json').read_text())
PINS = {f['path']: f for f in MANIFEST['files']}
USED = {}


def read(path):
    """A pinned client file, downloaded once into the shared source cache."""
    require(path in PINS, f'{path} is not in the client manifest')
    target = CACHE / path
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + '.part')
        subprocess.run(['curl', '--fail', '--silent', '--show-error', '--retry', '2',
                        BASE + path, '-o', str(temporary)], check=True)
        temporary.replace(target)
    data = target.read_bytes()
    require(hashlib.sha256(data).hexdigest() == PINS[path]['sha256'], f'Checksum differs: {path}')
    USED[path] = PINS[path]['sha256']
    return data


def compositor():
    """scripts/native-full-catalog.py's renderer, reading through this importer's pins."""
    spec = importlib.util.spec_from_file_location('full_catalog', ROOT / 'scripts/native-full-catalog.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.read = read
    return module


def duration(seconds):
    """The client's short duration: 1h, 1d."""
    return f'{seconds // 86400}d' if seconds % 86400 == 0 else f'{seconds // 3600}h'


def build():
    from native_art.source_csv import decoded_rows, records
    rows = records(decoded_rows(read('logic/boosters.csv')))
    texts = {r[0]: r[1] for r in decoded_rows(read('localization/texts.csv'))[2:] if len(r) > 1}
    globals_ = {r[0]: r[1] for r in decoded_rows(read('logic/globals.csv'))[2:] if r and r[0]}
    number = lambda key: int(globals_[key])
    walls = records(decoded_rows(read('logic/buildings.csv')))['Wall']
    divisor = int(walls[0]['StartUpgradeBoosterCostDivisor'])
    require(all(int(w['StartUpgradeBoosterCostDivisor']) == divisor for w in walls),
            'Wall levels differ in their ring divisor')
    boosts = {
        'Builder Potion': dict(boost='builders', multiplier=number('BOOSTER_BUILDERS_SPEEDUP'),
                               seconds=number('BOOSTER_BUILDERS_DURATION')),
        'Research Potion': dict(boost='laboratory', multiplier=number('BOOSTER_LABORATORY_SPEEDUP'),
                                seconds=number('BOOSTER_LABORATORY_DURATION')),
        'Pet Potion': dict(boost='pets', multiplier=number('BOOSTER_PET_SHOP_SPEEDUP'),
                           seconds=number('BOOSTER_PET_SHOP_DURATION')),
        'Resource Potion': dict(boost='resources',
                                multiplier=number('RESOURCE_PRODUCTION_BOOST_MULTIPLIER'),
                                seconds=number('RESOURCE_PRODUCTION_BOOST_MINS') * 60),
        'Power Potion': dict(boost='army', seconds=number('BOOSTER_MAX_OUT_ARMY_DURATION')),
        'Hero Potion': dict(boost='heroes', seconds=number('BOOSTER_HERO_POTION_DURATION')),
    }
    renderer = compositor()
    items, files = [], {}
    for name, (row, *rest) in rows.items():
        if name in LEFT_OUT:
            continue
        require(not rest, f'{name} has several rows')
        require(row.get('Enabled') == 'TRUE', f'{name} is disabled')
        flag = lambda column: row.get(column) == 'TRUE'
        targets = [t for column, t in TARGETS.items() if flag(column)]
        if row.get('FillStorageResource'):
            effect = dict(fill=RESOURCES[row['FillStorageResource']])
        elif flag('Wall'):
            require(flag('StartUpgrade'), f'{name} is not a ring')
            effect = dict(ring='wall', divisor=divisor)
        elif flag('SuperTroop'):
            effect = dict(super=True)
        elif flag('StartUpgrade'):
            require(flag('FinishUpgrade') and targets, f'{name} is not a hammer')
            effect = dict(upgrade=targets)
        elif flag('FinishUpgrade'):
            require(targets, f'{name} finishes nothing')
            effect = dict(finish=targets)
        elif name in boosts:
            effect = boosts[name]
        else:
            require(row['TID'] == 'TID_BOOSTER_MOVE_OBSTACLE', f'Unknown effect: {name}')
            effect = dict(shovel=True)
        info = texts[row['InfoTID']]
        if 'seconds' in effect:
            info = info.replace('<time>', duration(effect['seconds']))
        if 'multiplier' in effect:
            info = info.replace('<multiplier>', str(effect['multiplier']))
        require('<' not in info, f'{name} has an unfilled placeholder: {info}')
        slug = re.sub('[^a-z0-9]+', '-', name.lower()).strip('-')
        image, registration = renderer.render([(row['IconSWF'], row['IconExportName'])])
        path = f'{ART}/{slug}.png'
        buffer = io.BytesIO()
        image.save(buffer, format='PNG', optimize=True)
        files[ROOT / 'public' / path] = buffer.getvalue()
        items.append(dict(
            id=slug, name=texts[row['TID']], description=info.replace('\\n', ' ').strip(),
            max=int(row['MaxItems']), gemValue=int(row['DiamondValue']),
            order=int(row.get('DisplayOrder') or 0), effect=effect,
            icon=dict(path=path, width=registration['width'], height=registration['height'],
                      rgbaSha256=registration['rgbaSha256']),
        ))
    catalog = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE,
                   sources=dict(sorted(USED.items())), items=items)
    files[TARGET] = (json.dumps(catalog, indent=2) + '\n').encode()
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for path, data in build().items():
        if args.check:
            require(path.exists() and path.read_bytes() == data, f'{path.relative_to(ROOT)} differs')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    print('Magic items reproduce the client.' if args.check else f'Wrote {TARGET.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
