#!/usr/bin/env python3
"""Pin the numeric roster indices used by the client's shared army codes.

Characters/spells use GlobalID minus their table base. Heroes, pets and equipment
use source record order, as in the Cookbook importer. Cached source bytes must
match the full-client manifest. No game assets are regenerated.
"""
import argparse
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
TARGET = ROOT / 'reference/army-codes/index.json'
EXAMPLES = ROOT / 'tests/fixtures/native-army-codes.json'


def build():
    from native_art.source_csv import decoded_rows
    spec = importlib.util.spec_from_file_location('recipes', ROOT / 'scripts/import-native-army-recipes.py')
    recipes = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(recipes)
    source = recipes.decorations()

    def table(path):
        rows = decoded_rows(source.read(path))
        return rows[0], [row for row in rows[2:] if row and row[0]]

    def global_ids(path, base):
        columns, rows = table(path)
        at = columns.index('GlobalID')
        return {str(int(row[at]) - base): row[0] for row in rows if row[at]}

    def ordered(path):
        return [row[0] for row in table(path)[1]]

    index = dict(
        clientVersion='18.400.21', bundle=source.BUNDLE,
        troops=global_ids('logic/characters.csv', 4000000),
        spells=global_ids('logic/spells.csv', 26000000),
        heroes=ordered('logic/heroes.csv'), pets=ordered('logic/pets.csv'),
        items=ordered('logic/character_items.csv'),
    )
    index['sources'] = dict(sorted(source.USED.items()))
    columns, rows = table('logic/cookbook_armies.csv')
    at = columns.index('ArmyCode')
    examples = {row[0]: row[at] for row in rows}
    source.require(len(examples) == 37, 'Expected all 37 pinned Cookbook codes')
    return {
        TARGET: (json.dumps(index, indent=2) + '\n').encode(),
        EXAMPLES: (json.dumps(examples, indent=2) + '\n').encode(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for path, data in build().items():
        if args.check:
            if not path.exists() or path.read_bytes() != data:
                raise SystemExit(f'Native army code index differs: {path.relative_to(ROOT)}')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    print('Native army code indices reproduce the pinned client.' if args.check else 'Wrote native army code indices and Cookbook examples.')


if __name__ == '__main__':
    main()
