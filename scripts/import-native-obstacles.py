#!/usr/bin/env python3
"""Import the client's Home Village obstacles: their rules from logic/obstacles.csv and portraits.

The rows are the eight kinds that regrow (`RespawnWeight` above zero), the stones a new village
starts with, and the Bonus Gembox. Each keeps its `ClearResource`, `ClearCost`,
`ClearTimeSeconds`, footprint (`Width`), loot (`LootResource`, `LootCount`), regrowth weight and,
for the Gembox, `AppearancePeriodHours` and `MinRespawnTimeHours`. English names come from
localization/texts.csv. Portraits are rendered from the rows' `sc/buildings.sc` exports by the
same compositor as scripts/native-full-catalog.py and written to public/assets/obstacles-native.

Every source is downloaded from the pinned bundle into output/native-campaign-source and must
match its SHA-256 in reference/full-client/manifest.json. Needs scripts/native_art/requirements.txt.

  python3 scripts/import-native-obstacles.py           # write the catalog and portraits
  python3 scripts/import-native-obstacles.py --check   # verify both reproduce
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
TARGET = ROOT / 'reference/obstacles/catalog.json'
ART = 'assets/obstacles-native'
REGROW = ['Pine Tree', 'Square Bush', 'Square Tree', 'Square Tree 2', 'Tree Trunk 1',
          'Tree Trunk 2', 'Mushrooms', 'Fallen Tree']
STONES = ['Small Stone 1', 'Small Stone 2', 'Small Stone 3', 'Small Stone 4', 'Large Stone',
          'Large Stone2', 'Stone Pillar 1', 'Sharp Stone 1', 'Sharp Stone 2', 'Sharp Stone 3',
          'Sharp Stone 4', 'Sharp Stone 5']
GEMBOX = 'Bonus Gembox'
RESOURCES = {'Gold': 'gold', 'Elixir': 'elixir', 'DarkElixir': 'dark', 'Diamonds': 'gems'}


def require(condition, message):
    if not condition:
        raise SystemExit(f'Obstacle import: {message}')


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


def build():
    from native_art.source_csv import decoded_rows, records
    rows = records(decoded_rows(read('logic/obstacles.csv')))
    texts = {r[0]: r[1] for r in decoded_rows(read('localization/texts.csv'))[2:] if len(r) > 1}
    renderer = compositor()
    obstacles, files = [], {}
    for name in [*REGROW, *STONES, GEMBOX]:
        require(name in rows, f'Missing obstacle row: {name}')
        row = rows[name][0]
        require(row.get('VillageType', '') in ('', '0'), f'{name} is not a Home Village obstacle')
        slug = re.sub('[^a-z0-9]+', '-', name.lower()).strip('-')
        # One frame each; the Gem Box's rainbow is part of its idle art.
        image, registration = renderer.render([(row['SWF'], row['ExportName'])])
        path = f'{ART}/{slug}.png'
        buffer = io.BytesIO()
        image.save(buffer, format='PNG', optimize=True)
        files[ROOT / 'public' / path] = buffer.getvalue()
        loot = RESOURCES.get(row.get('LootResource', ''))
        record = dict(
            id=slug, name=texts.get(row.get('TID', ''), name), export=row['ExportName'],
            size=int(row['Width']), resource=RESOURCES[row['ClearResource']],
            cost=int(row['ClearCost']), seconds=int(row['ClearTimeSeconds']),
            regrowWeight=int(row.get('RespawnWeight') or 0),
        )
        if loot:
            record['loot'] = loot
        if row.get('LootCount'):
            record['lootCount'] = int(row['LootCount'])
        if row.get('AppearancePeriodHours'):
            record['appearanceHours'] = int(row['AppearancePeriodHours'])
            record['minRespawnHours'] = int(row.get('MinRespawnTimeHours') or 0)
        record['art'] = dict(path=path, **{k: registration[k] for k in
                                           ['width', 'height', 'originX', 'originY', 'rgbaSha256']})
        obstacles.append(record)
    catalog = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE,
                   sources=dict(sorted(USED.items())), obstacles=obstacles)
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
    print('Obstacles reproduce the client.' if args.check else f'Wrote {TARGET.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
