#!/usr/bin/env python3
"""Preserve garrison emitter rows, original effect meshes and full-texture witnesses.

This captures source art; native emission/attachment equations are not inferred.
"""
import argparse
import hashlib
import json
import runpy
import numpy as np
from PIL import Image
from native_art.bundle import ROOT, source
from native_art.source_csv import decoded_rows, records
from native_art.sc6 import SC6, decode_sctx, require
from native_art.scene_graph import capture_graph, crop_textures

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'csv/particle_emitters.csv': '8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef',
    'sc/buildings.sc': 'f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
}

def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    members = {r['file']: r['sha'] for r in fingerprint['files']}
    blobs = {path: source(path, PINS) for path in PINS}
    for path, blob in blobs.items():
        if path != 'fingerprint.json':
            require(hashlib.sha1(blob).hexdigest() == members[path], 'Fingerprint differs: ' + path)
    bindings = runpy.run_path(str(ROOT / 'scripts/import-native-garrison-sounds.py'))['BINDINGS']
    all_effects = records(decoded_rows(blobs['logic/effects.csv']))
    effects = {n: all_effects[n] for n in sorted({n for b in bindings.values() for n in b.values()})}
    require(not any(r.get('SpawnEffect') for rows in effects.values() for r in rows), 'Unresolved nested effect')
    all_particles = records(decoded_rows(blobs['csv/particle_emitters.csv']))
    particles = {n: all_particles[n] for n in sorted({r['ParticleEmitter'] for rows in effects.values() for r in rows if r.get('ParticleEmitter')})}
    exports = set()
    for rows in particles.values():
        swf = None
        for row in rows:
            swf = row.get('ParticleSwf', swf)
            require(swf == 'sc/buildings.sc', 'Unexpected particle source')
            require(row.get('ParticleExportName'), 'Missing particle variant export')
            exports.add(row['ParticleExportName'])
    sc = SC6(blobs['sc/buildings.sc'])
    require(exports <= sc.exports.keys(), 'Missing particle export')
    graph = capture_graph(sc, {n: sc.exports[n] for n in sorted(exports)})
    used = {t for shapes in graph['shapes'].values() for t, _ in shapes}
    require(used == {39}, 'Particle texture membership changed')
    original = decode_sctx(blobs['sc/buildings_39.sctx'])
    assets, textures, runtime = crop_textures(graph, {39: original}, 'assets/garrison-effects-native/texture')
    documents = {
        'reference/garrison/particles.json': dict(sources=PINS, bindings=bindings, effects=effects, particles=particles),
        'reference/garrison/particle-art.json': runtime,
        'reference/garrison/particle-art-source.json': dict(sources=PINS, graph=graph, textures=textures, nativePlaybackVerified=False),
    }
    # Sample every frame of every reachable clip as an independent root. This
    # includes nested descendants even when an exported outer clip is static.
    witness_graph = dict(graph)
    witness_graph['exports'] = dict(graph['exports'])
    exported_ids = set(graph['exports'].values())
    for clip in graph['clips']:
        if int(clip) not in exported_ids:
            witness_graph['exports']['witness_clip_' + clip] = int(clip)
    cases = [dict(family='particles', export=n, frame=f, controls={}, category='source-particle-frame')
             for n, i in witness_graph['exports'].items()
             for f in range(len(graph['clips'][str(i)]['timeline']))]
    witness = runpy.run_path(str(ROOT / 'scripts/native-garrison-gpu-fixtures.py'))
    images = {'public/' + path: image for path, image in assets.items()}
    index = []
    folder = 'tests/fixtures/native-garrison-particles-mesh/'
    for start in range(0, len(cases), 160):
        name = 'particles-' + str(start // 160 + 1)
        batch = cases[start:start + 160]
        sheet, manifest = witness['build']({'worlds': {'particles': {'graph': witness_graph}}}, name, batch, {'particles': {39: np.array(original) / 255}})
        for case in manifest['cases']:
            x, y, cell = case['x'], case['y'], manifest['cell']
            pixels = np.array(sheet.crop((x, y, x + cell, y + cell)))[:, :, :3]
            case['rasterEmpty'] = bool(np.all(pixels == [48, 65, 53]))
        images[folder + name + '.png'] = sheet
        documents[folder + name + '.json'] = manifest
        index.append(dict(category=name, cases=len(batch), width=manifest['width'], height=manifest['height']))
    documents[folder + 'index.json'] = index
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
                require(old.mode == image.mode and old.size == image.size and old.tobytes() == image.tobytes(), 'Source pixels differ: ' + path)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target, optimize=True)
    for path, document in documents.items():
        target = ROOT / path
        data = json.dumps(document, indent=2) + '\n'
        if args.check:
            require(target.read_text() == data, 'Source records differ: ' + path)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(data)
    print(('Verified' if args.check else 'Wrote') + ' original garrison particles and source-frame witnesses')
