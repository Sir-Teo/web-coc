#!/usr/bin/env python3
"""Import the Home Village decorations the Shop sells: their rules from logic/decos.csv and portraits.

The rows are the twelve decorations the Shop sells for Elixir, Gold or Gems (the wiki's
"Permanently Available Decorations"). Each keeps its `BuildResource`, `BuildCost`,
`RequiredExpLevel`, `MaxCount` and footprint (`Width`). English names come from
localization/texts.csv (these rows have no description), together with the Shop tab's name and
the client's stash dialog. Portraits draw the row's `ExportNameBase` (its plinth or patch of
ground) under its `ExportName`, both from `sc/buildings.sc`, by the same compositor as
scripts/native-full-catalog.py, at frame 0, and are written to public/assets/decorations-native.

Rows the Shop does not sell are left out: event and pass rewards (`NotInShop`), the removed
national flags, the two statues bought with Sparky Stones (this game has none) and the Eagle
Monument (a Town Hall 17 gift whose art uses masks the compositor does not draw).

Every source is downloaded from the pinned bundle into output/native-campaign-source and must
match its SHA-256 in reference/full-client/manifest.json. Needs scripts/native_art/requirements.txt.

  python3 scripts/import-native-decorations.py           # write the catalog and portraits
  python3 scripts/import-native-decorations.py --check   # verify both reproduce
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
TARGET = ROOT / 'reference/decorations/catalog.json'
ART = 'assets/decorations-native'
# The Shop's order: Elixir decorations by unlock level, then Gold, then Gems.
SHOP = ['Torch', 'White Flag', 'Flower box 1', 'Flower box 2', 'Windmeter', 'Down Arrow Flag',
        'Up Arrow Flag', 'Skull Altar', 'PEKKA Statue', 'Skull Flag', 'Barbarian Statue',
        'BK Statue']
RESOURCES = {'Gold': 'gold', 'Elixir': 'elixir', 'Diamonds': 'gems'}
TEXTS = dict(shopTab='TID_SHOP_CATEGORY_DECOS', stash='TID_BUTTON_STORE_DECO',
             stashTitle='TID_POPUP_STORE_DECORATION', stashText='TID_POPUP_TEXT_STORE_DECORATION')


def require(condition, message):
    if not condition:
        raise SystemExit(f'Decoration import: {message}')


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


def text(texts, tid):
    """An English string, with the client's \\q quote escapes and \\n breaks resolved."""
    return texts[tid].replace('\\q', '"').replace('\\n', ' ').strip()


def build():
    from native_art.source_csv import decoded_rows, records
    rows = records(decoded_rows(read('logic/decos.csv')))
    texts = {r[0]: r[1] for r in decoded_rows(read('localization/texts.csv'))[2:] if len(r) > 1}
    renderer = compositor()
    decorations, files = [], {}
    for name in SHOP:
        require(name in rows, f'Missing decoration row: {name}')
        row = rows[name][0]
        require(row.get('VillageType', '') in ('', '0'), f'{name} is not a Home Village decoration')
        require(row.get('NotInShop', '') != 'TRUE', f'{name} is no longer sold')
        require(int(row.get('MaxCount') or 0) > 0, f'{name} cannot be placed')
        require(row['Width'] == row['Height'], f'{name} is not square')
        slug = re.sub('[^a-z0-9]+', '-', name.lower()).strip('-')
        # The plinth or patch of ground first, then the decoration itself.
        image, registration = renderer.render([(row['SWF'], row['ExportNameBase']),
                                               (row['SWF'], row['ExportName'])])
        path = f'{ART}/{slug}.png'
        buffer = io.BytesIO()
        image.save(buffer, format='PNG', optimize=True)
        files[ROOT / 'public' / path] = buffer.getvalue()
        decorations.append(dict(
            id=slug, name=text(texts, row['TID']),
            export=row['ExportName'], base=row['ExportNameBase'], size=int(row['Width']),
            resource=RESOURCES[row['BuildResource']], cost=int(row['BuildCost']),
            chiefLevel=int(row.get('RequiredExpLevel') or 1), max=int(row['MaxCount']),
            art=dict(path=path, **{k: registration[k] for k in
                                   ['width', 'height', 'originX', 'originY', 'rgbaSha256']}),
        ))
    catalog = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE,
                   sources=dict(sorted(USED.items())),
                   texts={key: text(texts, tid) for key, tid in TEXTS.items()},
                   decorations=decorations)
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
    print('Decorations reproduce the client.' if args.check else f'Wrote {TARGET.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
