#!/usr/bin/env python3
"""Import the client's gem prices for time and for missing resources from logic/globals.csv.

The client prices a speed-up and a purchase of missing Gold, Elixir or Dark Elixir from a few
points each: `SPEED_UP_DIAMOND_COST_1_MIN` … `_1_WEEK` (seconds → gems),
`RESOURCE_DIAMOND_COST_100` … `_10000000` (Gold or Elixir → gems) and
`DARK_ELIXIR_DIAMOND_COST_1` … `_100000` (Dark Elixir → gems). src/game/gem-costs.ts draws
straight lines between them. The Builder Base (`VILLAGE2_…`) and ore rows are left out. The
prompt's strings come from localization/texts.csv.

Every source is downloaded from the pinned bundle into output/native-campaign-source and must
match its SHA-256 in reference/full-client/manifest.json.

  python3 scripts/import-native-gem-costs.py           # write the catalog
  python3 scripts/import-native-gem-costs.py --check   # verify it reproduces
"""
import argparse
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
TARGET = ROOT / 'reference/gem-costs/catalog.json'
TIME = {'1_MIN': 60, '1_HOUR': 3600, '24_HOURS': 86400, '1_WEEK': 604800}
TEXTS = dict(header='TID_BUY_MISSING_RESOURCES_HEADER', text='TID_BUY_MISSING_RESOURCES_TEXT',
             notEnoughGems='TID_POPUP_NOT_ENOUGH_DIAMONDS_TITLE', cancel='TID_BUTTON_CANCEL',
             gold='TID_GOLD', elixir='TID_ELIXIR', dark='TID_DARK_ELIXIR')


def decorations():
    """scripts/import-native-decorations.py: its pinned reader."""
    spec = importlib.util.spec_from_file_location('decorations',
                                                  ROOT / 'scripts/import-native-decorations.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build():
    from native_art.source_csv import decoded_rows, records
    source = decorations()
    require, read = source.require, source.read
    rows = records(decoded_rows(read('logic/globals.csv')))
    texts = {r[0]: r[1] for r in decoded_rows(read('localization/texts.csv'))[2:] if len(r) > 1}

    def value(name):
        require(name in rows, f'Missing global: {name}')
        return int(rows[name][0]['NumberValue'])

    def points(prefix):
        """Every `<prefix><amount>` row, by amount."""
        found = sorted((int(name[len(prefix):]), value(name)) for name in rows
                       if name.startswith(prefix) and name[len(prefix):].isdigit())
        require(len(found) >= 2, f'Too few {prefix} points')
        require(all(a[1] < b[1] for a, b in zip(found, found[1:])), f'{prefix} prices fall')
        return [list(p) for p in found]

    catalog = dict(
        clientVersion='18.400.21', bundle=source.BUNDLE, baseUrl=source.BASE,
        sources=None,
        time=[[seconds, value(f'SPEED_UP_DIAMOND_COST_{key}')] for key, seconds in TIME.items()],
        resource=points('RESOURCE_DIAMOND_COST_'),
        dark=points('DARK_ELIXIR_DIAMOND_COST_'),
        texts={key: source.text(texts, tid) for key, tid in TEXTS.items()},
    )
    catalog['sources'] = dict(sorted(source.USED.items()))
    return {TARGET: (json.dumps(catalog, indent=2) + '\n').encode()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for path, data in build().items():
        if args.check:
            if not (path.exists() and path.read_bytes() == data):
                raise SystemExit(f'Gem cost import: {path.relative_to(ROOT)} differs')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    print('Gem costs reproduce the client.' if args.check else f'Wrote {TARGET.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
