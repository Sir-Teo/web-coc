#!/usr/bin/env python3
"""Preserve original campaign Shrink Trap data, graphics and sounds.

Uses the same pinned public client as the native campaign. --check reconstructs
all output pixels, sound bytes and source records without changing files.
"""
import argparse
import csv
import hashlib
import io
import json
import lzma
import runpy

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, BUNDLE, BASE, source, digest
from native_art.sc6 import SC6, decode_sctx, require
from native_art.scene_graph import capture_graph, crop_textures

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'sc/buildings.sc': 'f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed',
    'sc/buildings_18.sctx': 'bd0c3b2eece3e9c43b2b3d61463e5b12ff4d274ae6adcc0ce33ceed63df58ffa',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
    'sc/buildings_66.sctx': 'c65a2f6e362edfd51d5fc634d5a6c30ec353bd936fa06fa8775b856aeb7baff0',
    'logic/traps.csv': '757ca07de02b26b2071b52bb3cb495df2f0ae879731a859d3102ca3552dd528c',
    'logic/spells.csv': '385159e00327e6a1567cd91f1585b4ed0717d3f4475f0823398243482598289d',
    'logic/globals.csv': '16210fc28bfb86d00ea04d581a99fe98e128172017b2d4f637b8848c0cf20087',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'csv/particle_emitters.csv': '8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef',
    'sfx/cannon_drop2.ogg': 'b50b98444dd9aa6af9fbbffd5966fbb9be8d4234aa5a34137cc85b44fd0d9d4a',
    'sfx/generic_hit_01.ogg': '5fca48e71d21be79eb6d40a1ca1ad3a002e3d69ba72388b2eb6a4d2ec10e5934',
    'sfx/shrink_spell_03.ogg': '10780435f565ac93ddda10e02f5983f67682ec06bb631ae8bc56a0992d689081',
    'sfx/wall_pickup_01.ogg': 'de5a84c06e812bf78a05984f84d0eaa85a226854f3473d77458458e6aa8f1fec',
}
PREFIX = 'assets/buildings/shrink-trap-native'
BODY_FIELDS = ['ExportName', 'ExportNameBuildAnim', 'ExportNameBroken', 'BigPicture', 'ExportNameTriggered']


def table(path):
    blob = source(path, PINS)
    if blob.startswith(b'Sig:'): blob = blob[68:]
    if not blob.startswith(b'"'): blob = lzma.decompress(blob[:9] + b'\0' * 4 + blob[9:])
    result, name = {}, ''
    for row in list(csv.DictReader(io.StringIO(blob.decode('utf-8-sig'))))[1:]:
        if row['Name']:
            name = row['Name']
            require(name not in result, 'Duplicate source record')
            result[name] = []
        require(name and None not in row, 'Malformed source row')
        result[name].append({k: v for k, v in row.items() if v})
    return result


def points(poses):
    result = []
    for pose in poses:
        if 'group' in pose:
            result.extend(points(pose['group']))
        else:
            vertices = np.array(pose['vertices']).reshape(-1, 4)
            xy = np.column_stack([vertices[:, :2], np.ones(len(vertices))])
            result.extend(xy @ np.array(pose['matrix']).reshape(2, 3).T)
    return result


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client differs')
    membership = {v['file']: v['sha'] for v in fingerprint['files']}
    for path in PINS:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, PINS)).hexdigest() == membership[path], f'Fingerprint differs: {path}')
    all_traps = table('logic/traps.csv')
    traps = {name: all_traps[name] for name in ['ShrinkTrap', 'ShrinkTrap_SinglePlayer']}
    require([traps[name][0]['GlobalID'] for name in traps] == ['12000015', '12000017'], 'Trap identity differs')
    require(all(len(rows) == 1 for rows in traps.values()), 'Trap levels differ')
    trap = traps['ShrinkTrap_SinglePlayer'][0]
    spells = {trap['Spell']: table('logic/spells.csv')[trap['Spell']]}
    globals_ = {'SHRINK_SPELL_DURATION_SECONDS': table('logic/globals.csv')['SHRINK_SPELL_DURATION_SECONDS']}
    all_effects = table('logic/effects.csv')
    pending = {v for rows in [*traps.values(), *spells.values()] for row in rows
               for k, v in row.items() if 'Effect' in k and v in all_effects}
    effects = {}
    while pending:
        name = pending.pop()
        if name in effects: continue
        effects[name] = all_effects[name]
        pending.update(row['SpawnEffect'] for row in effects[name] if row.get('SpawnEffect'))
    effects = dict(sorted(effects.items()))
    all_particles = table('csv/particle_emitters.csv')
    names = sorted({row['ParticleEmitter'] for rows in effects.values() for row in rows if row.get('ParticleEmitter')})
    particles = {name: all_particles[name] for name in names}
    exports = {row[key] for rows in traps.values() for row in rows for key in BODY_FIELDS}
    for rows in effects.values():
        for row in rows:
            if row.get('ExportName'):
                require(row['SWF'] == 'sc/buildings.sc', 'Unexpected direct effect source')
                exports.add(row['ExportName'])
    for rows in particles.values():
        swf = rows[0]['ParticleSwf']
        for row in rows:
            swf = row.get('ParticleSwf', swf)
            require(swf == 'sc/buildings.sc', 'Unexpected particle source')
            if row.get('ParticleExportName'): exports.add(row['ParticleExportName'])
    sc = SC6(source('sc/buildings.sc', PINS))
    require(exports <= sc.exports.keys(), 'Missing original export')
    graph = capture_graph(sc, {name: sc.exports[name] for name in sorted(exports)})
    used = {t for shapes in graph['shapes'].values() for t, _ in shapes}
    require(used == {18, 39, 66}, 'Texture membership differs')
    images = {t: decode_sctx(source('sc/' + sc.textures[t]['external'], PINS)) for t in sorted(used)}
    for t, image in images.items():
        require(image.size == (sc.textures[t]['width'], sc.textures[t]['height']), 'Texture dimensions differ')
    outputs, textures, runtime = crop_textures(graph, images, PREFIX + '/texture')
    cpu = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))
    pixels = {t: np.array(image) / 255 for t, image in images.items()}
    all_points = []
    for name in sorted({trap[k] for k in BODY_FIELDS}):
        clip_id = graph['exports'][name]
        for frame in range(len(graph['clips'][str(clip_id)]['timeline'])):
            all_points.extend(points(cpu['nodes'](graph, clip_id, frame, np.eye(3))))
    box = np.array(all_points)
    bounds = [*np.floor(box.min(axis=0) - 8).astype(int), *np.ceil(box.max(axis=0) + 8).astype(int)]
    bounds = [int(v) for v in bounds]
    width, height = 2 * (bounds[2] - bounds[0]), 2 * (bounds[3] - bounds[1])
    root = np.array([[2, 0, -bounds[0] * 2], [0, 2, -bounds[1] * 2], [0, 0, 1]])
    previews = {}
    for state, name in [('armed', trap['ExportName']), ('unarmed', trap['ExportNameBroken'])]:
        poses = cpu['nodes'](graph, graph['exports'][name], 0, root)
        xy = np.array(points(poses))
        require((xy >= 0).all() and (xy < [width, height]).all(), 'Clipped source preview')
        rgba = cpu['compose'](poses, pixels, max(width, height))
        rgba[:, :, :3] /= np.where(rgba[:, :, 3:4] > 0, rgba[:, :, 3:4], 1)
        image = Image.fromarray(np.round(np.clip(rgba, 0, 1) * 255).astype(np.uint8), 'RGBA').crop((0, 0, width, height))
        path = f'{PREFIX}/{state}.png'
        outputs[path] = image
        previews[state] = dict(path=path, export=name, bounds=bounds, width=width, height=height,
                               pixelsPerNativeUnit=2, rgbaSha256=digest(image.tobytes()))
    sounds = {}
    for original in sorted({row['Sound'] for rows in effects.values() for row in rows if row.get('Sound')}):
        path = PREFIX + '/' + original.removeprefix('sfx/')
        outputs[path] = source(original, PINS)
        sounds[original] = dict(path=path, sha256=digest(outputs[path]))
    native = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS,
                  traps=traps, spells=spells, globals=globals_, effects=effects, particles=particles,
                  world=dict(source='sc/buildings.sc', graph=graph, textures=textures),
                  previews=previews, sounds=sounds,
                  reconstruction=dict(liveIntegration=True, nativePlaybackVerified=False,
                      scope='Both original trap identities, all body/reveal/aura/particle exports, source spell/global fields and four sounds.',
                      preview='Common bounds enclose all source trap frames with eight native units of padding; framing is local.',
                      health='ShrinkHitpointsRatio=50 is retained as a source field. Supercell\'s February 2022 release notes state that Shrink Trap no longer reduces HP.',
                      timing='ActionFrame=14, 14 trigger frames at 24 fps, trap duration 20000 ms, spell hit timing and seven-second global are retained. The local handoff is documented in docs/SHRINK-TRAP.md; native counter semantics remain unverified.'))
    combat = dict(trap=trap, spell=spells['ShrinkTrap'][0],
                  statusDurationSeconds=int(globals_['SHRINK_SPELL_DURATION_SECONDS'][0]['NumberValue']),
                  triggerFps=graph['clips'][str(graph['exports'][trap['ExportNameTriggered']])]['fps'])
    return outputs, dict(native=native, runtime=runtime, combat=combat,
                         effects=dict(effects=effects, particles=particles, sounds=sounds))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, references = build()
    folder = ROOT / 'public' / PREFIX
    if args.check:
        require({p.relative_to(ROOT / 'public').as_posix() for p in folder.rglob('*') if p.is_file()} == set(outputs), 'Asset membership differs')
    for path, value in outputs.items():
        target = ROOT / 'public' / path
        if args.check:
            if isinstance(value, bytes): require(target.read_bytes() == value, f'Sound differs: {path}')
            else:
                with Image.open(target) as old:
                    require(old.mode == 'RGBA' and old.size == value.size and old.tobytes() == value.tobytes(), f'Pixels differ: {path}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(value, bytes): target.write_bytes(value)
            else: value.save(target, optimize=True)
    for name, value in references.items():
        target = ROOT / 'reference/shrink-trap' / (name + '.json')
        content = json.dumps(value, indent=2) + '\n'
        if args.check: require(target.read_text() == content, f'Reference differs: {name}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} original Shrink Trap assets')


if __name__ == '__main__': main()
