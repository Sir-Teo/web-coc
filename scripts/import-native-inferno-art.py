#!/usr/bin/env python3
"""Capture every original Inferno building/effect graph and exact source texels."""
import argparse
import hashlib
import json
from PIL import Image
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import SC6, decode_sctx, require
from native_art.scene_graph import capture_graph, crop_textures

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'sc/buildings.sc': 'f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed',
    'sc/buildings_8.sctx': '588eba7d5739a5d9b53d3e14f2ab83bd170cad735363a81dd37bea7bcc0bb3bd',
    'sc/buildings_18.sctx': 'bd0c3b2eece3e9c43b2b3d61463e5b12ff4d274ae6adcc0ce33ceed63df58ffa',
    'sc/buildings_25.sctx': 'c290a82b3940513f16b55dba2305e875d923d4120c5997b6b6908c680ec8ca3d',
    'sc/buildings_28.sctx': '4f25555390bd05b262fd4b0eec96bf89cc97db8d2d4e862afb791f0713962f40',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
}


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    members = {row['file']: row['sha'] for row in fingerprint['files']}
    for path in PINS:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, PINS)).hexdigest() == members[path], 'Fingerprint differs')
    definition_path = ROOT / 'reference/inferno/native.json'
    definition = json.loads(definition_path.read_text())
    inventory = definition['artInventory']
    sc = SC6(source('sc/buildings.sc', PINS))
    require(all(sc.exports[name] == id_ for name, id_ in inventory['exports'].items()), 'Export ID differs')
    graph = capture_graph(sc, inventory['exports'], allowed_blends=(0, 3, 4, 8))
    require(len(graph['clips']) == inventory['clipCount'], 'Clip inventory differs')
    require(len(graph['shapes']) == inventory['shapeCount'], 'Shape inventory differs')
    used = {t for commands in graph['shapes'].values() for t, _ in commands}
    require(used == {t['index'] for t in inventory['textures']}, 'Texture inventory differs')
    decoded = {t: decode_sctx(source(f'sc/buildings_{t}.sctx', PINS)) for t in sorted(used)}
    for texture in inventory['textures']:
        require(decoded[texture['index']].size == (texture['width'], texture['height']), 'Texture size differs')
    assets, textures, runtime = crop_textures(graph, decoded, 'assets/inferno-native/texture')
    metadata = dict(sources=PINS, definitionSha256=digest(definition_path.read_bytes()),
                    graph=graph, textures=textures, nativePlaybackVerified=False,
                    qualification='Exact source graph and texture regions; full animation pixel qualification pending.')
    return assets, {'reference/inferno/art-runtime.json': runtime,
                    'reference/inferno/art-source.json': metadata}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    assets, documents = build()
    for path, image in assets.items():
        target = ROOT / 'public' / path
        if args.check:
            with Image.open(target) as old:
                require(old.mode == image.mode and old.size == image.size and old.tobytes() == image.tobytes(), 'Source texels differ')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target, optimize=True)
    for path, document in documents.items():
        target = ROOT / path
        text = json.dumps(document, indent=2) + '\n'
        if args.check:
            require(target.read_text() == text, 'Source graph differs')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text)
    print('Verified complete Inferno source artwork' if args.check else 'Wrote complete Inferno source artwork')
