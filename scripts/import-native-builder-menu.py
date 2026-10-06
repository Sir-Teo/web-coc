#!/usr/bin/env python3
"""Import the builder menu's headings from the client's localization/texts.csv.

The original opens a list from its builder counter: the work under way ("Upgrades in
progress:", shared with the Laboratory's menu), then "Suggested upgrades:" and "Other upgrades:"
(TID_INFOBUBBLE_BUILDER_SUGGESTION and _EXTRA_SUGGESTION). The client keeps which upgrades it
suggests to its server; src/game/builder-menu.ts chooses them (see docs/BUILDER-MENU.md).

Every source is downloaded from the pinned bundle into output/native-campaign-source and must
match its SHA-256 in reference/full-client/manifest.json.

  python3 scripts/import-native-builder-menu.py           # write the catalog
  python3 scripts/import-native-builder-menu.py --check   # verify it reproduces
"""
import argparse
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
TARGET = ROOT / 'reference/builder-menu/catalog.json'
TEXTS = dict(inProgress='TID_RESEARCHER_MENU_IN_PROGRESS',
             suggested='TID_INFOBUBBLE_BUILDER_SUGGESTION',
             other='TID_INFOBUBBLE_BUILDER_EXTRA_SUGGESTION',
             hint='TID_SPECIAL_FTUE_TUTORIAL_BUILDER_MENU')


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
    texts = {r[0]: r[1] for r in decoded_rows(source.read('localization/texts.csv'))[2:]
             if len(r) > 1}
    catalog = dict(clientVersion='18.400.21', bundle=source.BUNDLE, baseUrl=source.BASE,
                   sources=None, texts={k: source.text(texts, tid) for k, tid in TEXTS.items()})
    catalog['sources'] = dict(sorted(source.USED.items()))
    return {TARGET: (json.dumps(catalog, indent=2) + '\n').encode()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for path, data in build().items():
        if args.check:
            if not (path.exists() and path.read_bytes() == data):
                raise SystemExit(f'Builder menu import: {path.relative_to(ROOT)} differs')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    print('Builder menu texts reproduce the client.' if args.check
          else f'Wrote {TARGET.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
