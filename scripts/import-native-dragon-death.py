#!/usr/bin/env python3
"""Import the common death export referenced by Dragon7, plus independent pixel witnesses."""
import argparse
import hashlib
import json
import runpy
import numpy as np
from PIL import Image
from native_art.bundle import ROOT, source
from native_art.sc6 import SC6, decode_sctx, require
from native_art.scene_graph import capture_graph, crop_textures

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'sc/characters.sc': '0e23bd3745176fe7db3d61e490d9da07c63a42e95462f514d6eac696314c3798',
    'sc/characters_2.sctx': '8b26f89c67ad4e0d7234caf65253962b92e6a7d8b90389eff7278bd66515bdad',
}

def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    members = {row['file']: row['sha'] for row in fingerprint['files']}
    for path in PINS:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, PINS)).hexdigest() == members[path], 'Fingerprint differs')
    sc = SC6(source('sc/characters.sc', PINS))
    graph = capture_graph(sc, {'barbarian_death_1': sc.exports['barbarian_death_1']})
    used = {t for shapes in graph['shapes'].values() for t, _ in shapes}
    require(used == {2}, 'Death texture membership changed')
    original = decode_sctx(source('sc/characters_2.sctx', PINS))
    assets, textures, runtime = crop_textures(graph, {2: original}, 'assets/garrison-death-native/texture')
    metadata = dict(sources=PINS, graph=graph, textures=textures,
        resolution='Dragon7 die names barbarian_death_1 with empty SWF; resolve the matching export in common sc/characters.sc. Native executable lookup remains unverified.')
    witness = runpy.run_path(str(ROOT / 'scripts/native-garrison-gpu-fixtures.py'))
    count = len(graph['clips'][str(graph['exports']['barbarian_death_1'])]['timeline'])
    cases = [dict(family='death', export='barbarian_death_1', frame=i, controls={}, category='death') for i in range(count)]
    sheet, manifest = witness['build']({'worlds': {'death': {'graph': graph}}}, 'death', cases, {'death': {2: np.array(original) / 255}})
    for case in manifest['cases']:
        x, y, cell = case['x'], case['y'], manifest['cell']
        pixels = np.array(sheet.crop((x, y, x + cell, y + cell)))[:, :, :3]
        case['rasterEmpty'] = bool(np.all(pixels == [48, 65, 53]))
    images = {'public/' + path: image for path, image in assets.items()}
    images['tests/fixtures/native-dragon-death-mesh/death.png'] = sheet
    documents = {'reference/garrison/dragon-death.json': runtime,
                 'reference/garrison/dragon-death-source.json': metadata,
                 'tests/fixtures/native-dragon-death-mesh/death.json': manifest,
                 'tests/fixtures/native-dragon-death-mesh/index.json': [dict(category='death', cases=count, width=manifest['width'], height=manifest['height'])]}
    return images, documents

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    images, documents = build()
    for path, image in images.items():
        target = ROOT / path
        if args.check:
            with Image.open(target) as old:
                require(old.mode == image.mode and old.size == image.size and old.tobytes() == image.tobytes(), 'Source pixels differ')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target, optimize=True)
    for path, document in documents.items():
        target = ROOT / path
        data = json.dumps(document, indent=2) + '\n'
        if args.check:
            require(target.read_text() == data, 'Source graph/witness differs')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(data)
    print('Verified Dragon death source and all 143 frames' if args.check else 'Wrote Dragon death source and all 143 frames')
