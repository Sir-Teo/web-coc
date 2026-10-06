#!/usr/bin/env python3
"""Import Practice Mode's levels from the client's logic/npcs.csv.

The original's Practice Mode is a set of single-player villages, Town Halls 4 to 13. Each one
comes with its own army, so the player trains nothing. The levels are the `TUTORIAL` rows named
`CHALLENGE_TH<level>_<army>`. A level's army is listed across the record's continuation rows:

- `FixedArmyUnitType`, `FixedArmyUnitLevel` and `FixedArmyUnitCountOrStage` give each unit;
- `FixedArmyUnitAlliance` marks the Clan Castle's units;
- `FixedArmyUnitPet`, `FixedArmyGear1` and `FixedArmyGear2` (with their levels) equip a hero.
  No level sets them in this client, so a hero brings its default items at level 1.

`TutorialUnlockTHLevel` is the Town Hall that opens the level. The villages themselves are
imported with the campaign (scripts/import-native-campaign.py), which this catalog points to
by stage. The step-by-step tutorial (`DeploySteps`) is not imported.

Every source is downloaded from the pinned bundle into output/native-campaign-source and must
match its SHA-256 in reference/full-client/manifest.json.

  python3 scripts/import-native-practice.py           # write the catalog
  python3 scripts/import-native-practice.py --check   # verify it reproduces
"""
import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
TARGET = ROOT / 'reference/practice/catalog.json'
CAMPAIGN = ROOT / 'reference/campaign/catalog.json'
LEVEL = re.compile(r'CHALLENGE_TH(\d+)_[A-Z0-9]+$')
TEXTS = dict(title='TID_TRAINING_LEVELS', info='TID_TRAINING_LEVELS_DESCRIPTION',
             unlocks='TID_PRACTICE_MODE_UNLOCKS_LATER')


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

    def names(path):
        return {r[0] for r in decoded_rows(source.read(path))[2:] if r and r[0]}

    kinds = dict(troop=names('logic/characters.csv'), spell=names('logic/spells.csv'),
                 hero=names('logic/heroes.csv'))
    texts = {r[0]: r[1] for r in decoded_rows(source.read('localization/texts.csv'))[2:]
             if len(r) > 1}
    stages = {s['id']: s['stage'] for s in json.loads(CAMPAIGN.read_text())['stages']
              if s.get('id')}
    rows = decoded_rows(source.read('logic/npcs.csv'))
    header = rows[0]
    levels, current = [], None
    for row in rows[2:]:
        value = {name: row[i] for i, name in enumerate(header) if i < len(row) and row[i]}
        if row and row[0]:
            current = None
            if value.get('Type') == 'TUTORIAL' and LEVEL.match(row[0]):
                current = dict(id=row[0], name=source.text(texts, value['TID']),
                               townHall=int(value['TutorialUnlockTHLevel']),
                               stage=stages.get(row[0]), gold=int(value.get('Gold', 0)),
                               elixir=int(value.get('Elixir', 0)),
                               dark=int(value.get('DarkElixir', 0)), army=[])
                levels.append(current)
        unit = value.get('FixedArmyUnitType')
        if not current or not unit:
            continue
        kind = next((k for k, known in kinds.items() if unit in known), None)
        require(kind, f'{current["id"]}: unknown unit {unit}')
        entry = dict(unit=unit, kind=kind, level=int(value['FixedArmyUnitLevel']),
                     count=int(value['FixedArmyUnitCountOrStage']))
        if value.get('FixedArmyUnitAlliance') == 'TRUE':
            entry['castle'] = True
        if value.get('FixedArmyUnitPet'):
            entry['pet'] = [value['FixedArmyUnitPet'], int(value['FixedArmyUnitPetLevel'])]
        gear = [[value[f'FixedArmyGear{i}'], int(value[f'FixedArmyGear{i}Level'])]
                for i in (1, 2) if value.get(f'FixedArmyGear{i}')]
        if gear:
            entry['gear'] = gear
        current['army'].append(entry)
    require(len(levels) == 19, f'Expected 19 Practice levels, found {len(levels)}')
    require(all(level['army'] for level in levels), 'A Practice level has no army')
    levels.sort(key=lambda level: (level['townHall'], level['stage'] or 999, level['id']))
    catalog = dict(clientVersion='18.400.21', bundle=source.BUNDLE, baseUrl=source.BASE,
                   sources=None, texts={k: source.text(texts, tid) for k, tid in TEXTS.items()},
                   levels=levels)
    catalog['sources'] = dict(sorted(source.USED.items()))
    return {TARGET: (json.dumps(catalog, indent=2) + '\n').encode()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for path, data in build().items():
        if args.check:
            if not (path.exists() and path.read_bytes() == data):
                raise SystemExit(f'Practice import: {path.relative_to(ROOT)} differs')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    print('Practice levels reproduce the client.' if args.check
          else f'Wrote {TARGET.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
