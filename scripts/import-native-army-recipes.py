#!/usr/bin/env python3
"""Import the Cookbook's army recipes from the client's logic/cookbook_armies.csv.

The original's army screen has a Cookbook tab of ready-made Army Recipes for the player's Town
Hall. The client ships the Featured (Event) and Creator recipes, Town Halls 10 to 17, each row
an `ArmyCode`: the same code as a shared army link, in sections of `h` heroes, `i` and `d` Clan
Castle troops and spells, `u` troops and siege machines and `s` spells. A troop or spell entry
is `<count>x<id>`, where the id is the record's GlobalID less its table's base (characters.csv
4000000, spells.csv 26000000). A hero entry is `<id>[m<mode>][p<pet>][e<item>_<item>]`, by
record order in heroes.csv, pets.csv and character_items.csv. Every code is decoded here into
client names; src/game/army-recipes.ts maps them to this game's kinds. The Starter recipes of
Town Halls 4 to 9 have names in texts.csv but no rows: their armies come from the server.

Every source is downloaded from the pinned bundle into output/native-campaign-source and must
match its SHA-256 in reference/full-client/manifest.json.

  python3 scripts/import-native-army-recipes.py           # write the catalog
  python3 scripts/import-native-army-recipes.py --check   # verify it reproduces
"""
import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
TARGET = ROOT / 'reference/army-recipes/catalog.json'
TEXTS = dict(tab='TID_TRAINING_TAB_TITLE_COMMUNITY_PRESETS',
             saved='TID_TRAINING_TAB_TITLE_PRESETS',
             info='TID_INFO_TOOLTIP_COMMUNITY_RECIPES',
             creator='TID_CREATOR_ARMY_NAME',
             useTitle='TID_POPUP_CONFIRM_USE_RECIPE_TITLE',
             autofix='TID_POPUP_CONFIRM_AUTOFIX_RECIPE_TEXT',
             loaded='TID_ARMY_PRESET_LOADED',
             cannotTrain='TID_COPY_ARMY_CANNOT_TRAIN',
             sanitized='TID_HUD_MESSAGE_ARMY_HEROES_HAVE_BEEN_SANITIZED')
HERO = re.compile(r'^(\d+)(?:m(\d+))?(?:p(\d+))?(?:e(\d+)(?:_(\d+))?)?$')


def decorations():
    """scripts/import-native-decorations.py: its pinned reader."""
    spec = importlib.util.spec_from_file_location('decorations',
                                                  ROOT / 'scripts/import-native-decorations.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build():
    from native_art.source_csv import decoded_rows
    source = decorations()
    require = source.require

    def table(path):
        rows = decoded_rows(source.read(path))
        return rows[0], [r for r in rows[2:] if r and r[0]]

    def by_global(path, base):
        header, rows = table(path)
        column = header.index('GlobalID')
        return {int(r[column]) - base: r[0] for r in rows if r[column]}

    def by_order(path):
        return [r[0] for r in table(path)[1]]

    characters = by_global('logic/characters.csv', 4000000)
    spells = by_global('logic/spells.csv', 26000000)
    heroes, pets, items = (by_order(f'logic/{name}.csv')
                           for name in ('heroes', 'pets', 'character_items'))
    texts = {r[0]: r[1] for r in decoded_rows(source.read('localization/texts.csv'))[2:]
             if len(r) > 1}

    def units(code, names, kind):
        result = []
        for entry in filter(None, code.split('-')):
            count, unit = map(int, entry.split('x'))
            require(unit in names, f'Unknown {kind} {unit}')
            result.append([names[unit], count])
        return result

    def hero(entry):
        match = HERO.match(entry)
        require(match, f'Unreadable hero entry {entry}')
        index, mode, pet, *gear = match.groups()
        result = dict(hero=heroes[int(index)],
                      items=[items[int(item)] for item in gear if item is not None])
        if pet is not None:
            result['pet'] = pets[int(pet)]
        if mode is not None:
            result['mode'] = int(mode)
        return result

    header, rows = table('logic/cookbook_armies.csv')
    column = {name: i for i, name in enumerate(header)}
    recipes = []
    for row in rows:
        value = lambda name: row[column[name]] if column[name] < len(row) else ''
        sections = dict(re.findall(r'([hidus])([^hidus]+)', value('ArmyCode')))
        require(''.join(sections) and set(sections) <= set('hidus'),
                f'Unreadable army code in {row[0]}')
        recipe = dict(id=row[0], name=source.text(texts, value('ArmyNameTID')),
                      creator=value('CreatorName') or None, type=value('ArmyType'),
                      townHall=[int(value('MinRequiredTownHallLevel')),
                                int(value('MaxRequiredTownHallLevel'))],
                      calendar=value('EnabledByCalendar') == 'TRUE',
                      guide=value('GuideUrl') or None,
                      heroes=[hero(h) for h in sections.get('h', '').split('-') if h],
                      troops=units(sections.get('u', ''), characters, 'troop'),
                      spells=units(sections.get('s', ''), spells, 'spell'),
                      castle=dict(troops=units(sections.get('i', ''), characters, 'troop'),
                                  spells=units(sections.get('d', ''), spells, 'spell')))
        recipes.append(recipe)
    require(len(recipes) == 37, f'Expected 37 recipes, found {len(recipes)}')
    # The tooltip's second paragraph ("refreshes every x days") is the server calendar's.
    strings = {k: re.split(r'\s*[\x00-\x1f]+\s*', source.text(texts, tid))[0]
               for k, tid in TEXTS.items()}
    catalog = dict(clientVersion='18.400.21', bundle=source.BUNDLE, baseUrl=source.BASE,
                   sources=None, texts=strings, recipes=recipes)
    catalog['sources'] = dict(sorted(source.USED.items()))
    return {TARGET: (json.dumps(catalog, indent=2) + '\n').encode()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for path, data in build().items():
        if args.check:
            if not (path.exists() and path.read_bytes() == data):
                raise SystemExit(f'Army recipe import: {path.relative_to(ROOT)} differs')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    print('Army recipes reproduce the client.' if args.check
          else f'Wrote {TARGET.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
