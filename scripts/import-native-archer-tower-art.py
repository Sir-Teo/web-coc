#!/usr/bin/env python3
"""Capture every original Archer Tower building/effect graph and exact source texels."""
import argparse
import hashlib
import json
from PIL import Image
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import SC6, decode_sctx, require
from native_art.scene_graph import capture_graph, crop_textures

PINS = {
    'sc/buildings_18.sctx': 'bd0c3b2eece3e9c43b2b3d61463e5b12ff4d274ae6adcc0ce33ceed63df58ffa',
    'sc/characters.sc': '0e23bd3745176fe7db3d61e490d9da07c63a42e95462f514d6eac696314c3798',
    'sc/characters_7.sctx': 'e90c58ec5665bb886b64b2d2518fdf3aac08f229ba25dd913a2d89cc3e86c039',
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'sc/buildings.sc': 'f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed',
    'sc/buildings_8.sctx': '588eba7d5739a5d9b53d3e14f2ab83bd170cad735363a81dd37bea7bcc0bb3bd',
    'sc/buildings_25.sctx': 'c290a82b3940513f16b55dba2305e875d923d4120c5997b6b6908c680ec8ca3d',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
}


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    members = {row['file']: row['sha'] for row in fingerprint['files']}
    for path in PINS:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, PINS)).hexdigest() == members[path], 'Fingerprint differs')
    definition_path = ROOT / 'reference/archer-tower/native.json'
    inventory_path = ROOT / 'reference/archer-tower/art-inventory.json'
    inventory = json.loads(inventory_path.read_text())
    require(inventory['definitionSha256'] == digest(definition_path.read_bytes()), 'Definition differs')
    all_assets, documents = {}, {}
    for swf, entry in inventory['scenes'].items():
        name = swf.split('/')[-1].split('.')[0]
        sc = SC6(source(swf, PINS))
        require(all(sc.exports[n] == id_ for n, id_ in entry['exports'].items()), 'Export ID differs')
        graph = capture_graph(sc, entry['exports'], allowed_blends=(0, 8))
        require(set(graph['clips']) == set(entry['clips']), 'Clip inventory differs')
        require({int(k) for k in graph['shapes']} == set(entry['shapes']), 'Shape inventory differs')
        for id_, c in graph['clips'].items():
            require(len(c['timeline']) == entry['clips'][id_]['frames'], 'Frame count differs')
        used = {t for commands in graph['shapes'].values() for t, _ in commands}
        require(used == {t['index'] for t in entry['textures']}, 'Texture inventory differs')
        decoded = {t['index']: decode_sctx(source(t['file'], PINS)) for t in entry['textures']}
        for texture in entry['textures']:
            require(decoded[texture['index']].size == (texture['width'], texture['height']), 'Texture size differs')
        assets, textures, runtime = crop_textures(graph, decoded, f'assets/archer-tower-native/{name}/texture')
        all_assets.update(assets)
        metadata = dict(sources=PINS, definitionSha256=digest(definition_path.read_bytes()),
                        inventorySha256=digest(inventory_path.read_bytes()), sourceScene=swf,
                        graph=graph, textures=textures, nativePlaybackVerified=False,
                        qualification='Exact referenced source graph and texture regions; resident archers and animation pixel qualification pending.')
        documents[f'reference/archer-tower/{name}-runtime.json'] = runtime
        documents[f'reference/archer-tower/{name}-source.json'] = metadata
    return all_assets, documents


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
    print('Verified complete Archer Tower source artwork' if args.check else 'Wrote complete Archer Tower source artwork')
