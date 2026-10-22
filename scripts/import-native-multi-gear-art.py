#!/usr/bin/env python3
"""Retain three Fast Attack portraits in the matching original Long Range canvas bounds."""
import argparse
import hashlib
import importlib.util
import json

from PIL import Image
from native_art.bundle import ROOT, BUNDLE, source, digest
from native_art.sc6 import require
from native_art.source_csv import records, decoded_rows, inherited_levels

PREFIX = 'assets/multi-gear-native'
INDEX = ROOT / 'reference/multi-gear/portraits.json'
PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
    'sc/buildings.sc': 'f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed',
    'sc/buildings_8.sctx': '588eba7d5739a5d9b53d3e14f2ab83bd170cad735363a81dd37bea7bcc0bb3bd',
    'sc/buildings_33.sctx': '9ae5ed0d8f74ab23260a5af3f784a4645fb00bcd47de4abc9abd20aea1749666',
}


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE, 'Client bundle differs')
    members = {row['file']: row['sha'] for row in fingerprint['files']}
    spec = importlib.util.spec_from_file_location('multi_gear_portraits', ROOT / 'scripts/native-full-catalog.py')
    art = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(art)

    def read(path):
        data = source(path, PINS)
        require(hashlib.sha1(data).hexdigest() == members[path], f'Fingerprint differs: {path}')
        art.PINS[path] = digest(data)
        return data

    art.read = read
    rows = inherited_levels(records(decoded_rows(read('logic/buildings.csv')))['Multi Gear Tower'])
    require(len(rows) == 3, 'Multi-Gear level inventory differs')
    outputs, portraits = {}, []
    for level, row in enumerate(rows, 1):
        require(row['BuildingLevel'] == str(level) and row['SWF'] == 'sc/buildings.sc', 'Source level differs')
        require((row['ExportNameBase'], row['ExportName'], row['AlternateExportName']) ==
                ('rapidfire_base', f'merged_cat_archer_lvl{level}', f'merged_cat_cannon_lvl{level}'),
                'Source mode exports differ')
        base = (row['SWF'], row['ExportNameBase'])
        normal, normal_meta = art.render([base, (row['SWF'], row['ExportName'])])
        fast, fast_meta = art.render([base, (row['SWF'], row['AlternateExportName'])])
        normal_path = f'assets/catalog-native/multi-gear-tower/level-{level}.png'
        with Image.open(ROOT / 'public' / normal_path) as old:
            require(old.mode == 'RGBA' and old.size == normal.size and old.tobytes() == normal.tobytes(),
                    f'Original Long Range portrait differs: {level}')
        n, f = normal_meta['bounds'], fast_meta['bounds']
        require(f[0] >= n[0] and f[1] >= n[1] and f[2] <= n[2] and f[3] <= n[3],
                'Fast Attack geometry exceeds the normal canvas')
        offset = (f[0] - n[0], f[1] - n[1])
        padded = Image.new('RGBA', normal.size)
        padded.paste(fast, offset)
        require(padded.crop((*offset, offset[0] + fast.width, offset[1] + fast.height)).tobytes() == fast.tobytes(),
                'Padding changed original source pixels')
        path = f'{PREFIX}/preview-{level}-fast.png'
        outputs[path] = padded
        portraits.append(dict(level=level, source=dict(scene=row['SWF'], base=row['ExportNameBase'],
                                                      long=row['ExportName'], fast=row['AlternateExportName']),
                              long=dict(path=normal_path, **normal_meta),
                              fast=dict(path=path, **{**normal_meta, 'rgbaSha256': digest(padded.tobytes())},
                                        originalBounds=fast_meta['bounds'], originalRgbaSha256=fast_meta['rgbaSha256'],
                                        offset=list(offset))))
    require(set(art.PINS) == set(PINS) - {'fingerprint.json'}, 'Source membership differs')
    return outputs, dict(clientVersion='18.400.21', bundle=BUNDLE, generator='scripts/import-native-multi-gear-art.py',
                         sources=PINS, frame=0, nativePlaybackVerified=False,
                         convention='Original base plus selected mode at frame zero. Fast Attack pixels are copied '
                                    'unchanged into the matching Long Range bounds; local preview registration is shared.',
                         portraits=portraits)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, document = build()
    folder = ROOT / 'public' / PREFIX
    if args.check:
        require({p.relative_to(ROOT / 'public').as_posix() for p in folder.rglob('*') if p.is_file()} == set(outputs),
                'Portrait asset membership differs')
    for path, image in outputs.items():
        target = ROOT / 'public' / path
        if args.check:
            with Image.open(target) as old:
                require(old.mode == image.mode and old.size == image.size and old.tobytes() == image.tobytes(),
                        f'Fast Attack pixels differ: {path}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target, optimize=True)
    encoded = json.dumps(document, indent=2) + '\n'
    if args.check:
        require(INDEX.read_text() == encoded, 'Portrait source index differs')
    else:
        INDEX.parent.mkdir(parents=True, exist_ok=True)
        INDEX.write_text(encoded)
    print(f'{"Verified" if args.check else "Wrote"} 3 original Fast Attack portraits; 3 Long Range controls match')


if __name__ == '__main__':
    main()
