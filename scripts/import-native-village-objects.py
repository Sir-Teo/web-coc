#!/usr/bin/env python3
"""Import the Trader's camp and the Super Troop building from logic/village_objects.csv.

Village objects are the fixed scenery the client places around the Home Village rather than on
its grid. This importer keeps two groups of them:

- the Trader's camp: his tent (`TraderBuilding`), the pots and rug before it (`TraderDeco1`,
  `TraderDeco2`), his sign (`TraderHiddenDeco`) and the Trader himself (`TraderCharacter`),
  which arrive one Town Hall level after the client's `MIN_TH_LEVEL_FOR_TRADER`;
- the Super Troop building (`SuperTroopsBuilding`), cold or with a boost running, which arrives
  one level after `MIN_TH_LEVEL_FOR_SUPER_LICENCES`.

Each keeps its row's `TileX100`/`TileY100` (hundredths of a tile, in the client's coordinates)
and its export, drawn at frame 0 by scripts/native-full-catalog.py's compositor into
public/assets/village-objects-native, with the registration point the client places at that
tile. The Trader's idle clip (777 frames) is not played; his first frame stands in. Names are the
client's feature titles (the rows reuse the Clan Games and Loot Cart texts).

Every source is downloaded from the pinned bundle into output/native-campaign-source and must
match its SHA-256 in reference/full-client/manifest.json. Needs scripts/native_art/requirements.txt.

  python3 scripts/import-native-village-objects.py           # write the catalog and art
  python3 scripts/import-native-village-objects.py --check   # verify both reproduce
"""
import argparse
import importlib.util
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
TARGET = ROOT / 'reference/village-objects/catalog.json'
ART = 'assets/village-objects-native'
# id, client row, the export rows (state → ExportName), what tapping it opens and its unlock.
OBJECTS = [
    ('trader-tent', 'TraderBuilding', {'idle': 'trader_tent_01'}, 'trader', 'trader'),
    ('trader-pots', 'TraderDeco1', {'idle': 'trader_pot_01'}, 'trader', 'trader'),
    ('trader-rug', 'TraderDeco2', {'idle': 'trader_rug_01'}, 'trader', 'trader'),
    ('trader-sign', 'TraderHiddenDeco', {'idle': 'trader_sign_01'}, 'trader', 'trader'),
    ('trader', 'TraderCharacter', {'idle': 'trader_idle1_2'}, 'trader', 'trader'),
    ('super-troops', 'SuperTroopsBuilding',
     {'idle': 'trader_sauna_inactive', 'active': 'trader_sauna_active'}, 'super-troops', 'super'),
]
# The unlock globals hold the level below the one the feature arrives at (as for the Trader's
# Gem offers in docs/TRADER.md); the wiki's Trader and Super Sauna pages give TH6 and TH11.
UNLOCKS = dict(trader='MIN_TH_LEVEL_FOR_TRADER', super='MIN_TH_LEVEL_FOR_SUPER_LICENCES')
NAMES = dict(trader='TID_TRADER_FEATURE', super='TID_SUPER_TROOPS_FEATURE')
INFO = dict(trader='TID_TRADER_FEATURE_DESCRIPTION', super='TID_SUPER_TROOP_INTRO_TEXT')


def decorations():
    """scripts/import-native-decorations.py: its pinned reader and compositor."""
    spec = importlib.util.spec_from_file_location('decorations',
                                                  ROOT / 'scripts/import-native-decorations.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build():
    from native_art.source_csv import decoded_rows, records
    source = decorations()
    require, read = source.require, source.read
    rows = records(decoded_rows(read('logic/village_objects.csv')))
    globals_ = records(decoded_rows(read('logic/globals.csv')))
    texts = {r[0]: r[1] for r in decoded_rows(read('localization/texts.csv'))[2:] if len(r) > 1}
    renderer = source.compositor()
    objects, files = [], {}
    for slug, name, states, opens, feature in OBJECTS:
        require(name in rows, f'Missing village object: {name}')
        row = rows[name][0]
        require(row.get('Disabled', '') != 'TRUE', f'{name} is disabled')
        require(row.get('VillageType', '') in ('', '0'), f'{name} is not in the Home Village')
        exports = {r['ExportName'] for r in rows[name]}
        art = {}
        for state, export in states.items():
            require(export in exports, f'{name} has no {export}')
            image, registration = renderer.render([(row['SWF'], export)])
            path = f'{ART}/{slug}{"" if state == "idle" else "-" + state}.png'
            buffer = io.BytesIO()
            image.save(buffer, format='PNG', optimize=True)
            files[ROOT / 'public' / path] = buffer.getvalue()
            art[state] = dict(path=path, export=export, **{
                k: registration[k] for k in ['width', 'height', 'originX', 'originY', 'rgbaSha256']})
        objects.append(dict(
            id=slug, row=name, feature=feature, opens=opens,
            tileX=int(row['TileX100']) / 100, tileY=int(row['TileY100']) / 100, art=art))
    features = {key: dict(
        name=source.text(texts, NAMES[key]), info=source.text(texts, INFO[key]),
        townhall=int(globals_[UNLOCKS[key]][0]['NumberValue']) + 1) for key in UNLOCKS}
    catalog = dict(clientVersion='18.400.21', bundle=source.BUNDLE, baseUrl=source.BASE,
                   sources=dict(sorted(source.USED.items())), features=features, objects=objects)
    files[TARGET] = (json.dumps(catalog, indent=2) + '\n').encode()
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for path, data in build().items():
        if args.check:
            if not (path.exists() and path.read_bytes() == data):
                raise SystemExit(f'Village object import: {path.relative_to(ROOT)} differs')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    print('Village objects reproduce the client.' if args.check
          else f'Wrote {TARGET.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
