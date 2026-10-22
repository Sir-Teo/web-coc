#!/usr/bin/env python3
"""Reconstruct all twelve original crafted-defense tier portraits at source frame zero."""
import argparse
import hashlib
import importlib.util
import json

from PIL import Image
from native_art.bundle import ROOT, BUNDLE, source, digest
from native_art.sc6 import require
from native_art.source_csv import records, decoded_rows, inherited_levels

PREFIX = 'assets/crafted-native'
INDEX = ROOT / 'reference/crafted-defenses/art.json'
PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'logic/seasonal_defense_archetypes.csv': '875c805702710b513206599e8082a3a3948c2ecaf6b526e129e6472420adbc9b',
    'logic/special_abilities.csv': 'c978dd90ff2335e60d988f3476d78bec72672e8c074344d149096e89951181eb',
    'sc/building_bases.sc': '964584a104a31088dfa6bef53f6c2df7bc9e59e0b05d4354bbe8ac4431c49d9f',
    'sc/building_bases_0.sctx': '6bc35b86398b457643446ed8d86e24a1fe68d1daadf9155cfe94e13c4840d9fd',
    'sc/buildings.sc': 'f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed',
    'sc/buildings_50.sctx': '442ef9aa6903691b0933847d7dc119928f815ed71c11ac42ef41c59209d0ccb0',
    'sc/buildings_53.sctx': '61fa8629eb325771fbbf4085d775b0cd7fceb6f9c34bbed4d82a51d4ae83aa42',
    'sc/buildings_56.sctx': '6b9bb00ade73cba47bd148ec04f8f904e7bd0c4b05a2fe6160d4fca533aba6d6',
}
DEFENSES = {'candle': 'Inferno Candle', 'hunter': 'Headhunter Tower', 'cake': 'Cake Thrower'}


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE, 'Client bundle differs')
    members = {row['file']: row['sha'] for row in fingerprint['files']}
    spec = importlib.util.spec_from_file_location('crafted_portraits', ROOT / 'scripts/native-full-catalog.py')
    art = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(art)

    def read(path):
        data = source(path, PINS)
        require(hashlib.sha1(data).hexdigest() == members[path], f'Fingerprint differs: {path}')
        art.PINS[path] = digest(data)
        return data

    art.read = read
    archetypes = records(decoded_rows(read('logic/seasonal_defense_archetypes.csv')))
    abilities = records(decoded_rows(read('logic/special_abilities.csv')))
    outputs, defenses = {}, {}
    for key, name in DEFENSES.items():
        archetype = archetypes[name][0]
        thresholds = [int(value) for value in archetype['TotalModuleLevelThresholds'].split(';')]
        rows = inherited_levels(abilities[archetype['SpecialAbility']])
        require(len(rows) == len(thresholds) + 1 == 4, 'Visual tier inventory differs')
        require(thresholds == sorted(set(thresholds)), 'Visual thresholds differ')
        portraits = []
        for tier, row in enumerate(rows, 1):
            components = []
            for field in ['OverrideExportNameBase', 'OverrideExportName']:
                export = row[field]
                path = next((path for path in [row['OverrideSWF'], 'sc/building_bases.sc']
                             if export in art.scene(path).exports), None)
                require(path is not None, f'Missing original export: {export}')
                components.append((path, export))
            image, registration = art.render(components, frame_zero=True)
            path = f'{PREFIX}/{key}/tier-{tier}.png'
            outputs[path] = image
            portraits.append(dict(tier=tier, path=path, frame=0,
                                  components=[dict(source=path, export=export) for path, export in components],
                                  **registration))
        defenses[key] = dict(sourceName=name, ability=archetype['SpecialAbility'],
                             totalModuleLevelThresholds=thresholds, portraits=portraits)
    require(set(art.PINS) == set(PINS) - {'fingerprint.json'}, 'Source dependency inventory differs')
    return outputs, dict(clientVersion='18.400.21', bundle=BUNDLE, sources=PINS,
                         nativePlaybackVerified=False,
                         qualification='Static source frame zero. Only active placements are captured; active masks remain unsupported.',
                         defenses=defenses)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, document = build()
    if args.check:
        folder = ROOT / 'public' / PREFIX
        require({path.relative_to(ROOT / 'public').as_posix() for path in folder.rglob('*')
                 if path.is_file()} == set(outputs), 'Crafted portrait membership differs')
    for path, image in outputs.items():
        target = ROOT / 'public' / path
        if args.check:
            with Image.open(target) as old:
                require(old.mode == image.mode and old.size == image.size
                        and old.tobytes() == image.tobytes(), f'Crafted portrait pixels differ: {path}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target, optimize=True)
    encoded = json.dumps(document, indent=2) + '\n'
    if args.check:
        require(INDEX.read_text() == encoded, 'Crafted portrait source index differs')
    else:
        INDEX.write_text(encoded)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} original crafted-defense portraits')


if __name__ == '__main__':
    main()
