#!/usr/bin/env python3
"""Preserve all seven original Air Sweeper levels, controllable parts and effects.

--check reconstructs source records, packed texels, previews and original sounds.
This imports source evidence; live integration and native clock parity are separate.
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
from native_art.scene_graph import capture_graph, crop_textures, graph_draws

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'sc/buildings.sc': 'f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed',
    'sc/buildings_1.sctx': 'e931b617d748a541da10cfe7126b8b3fb77d13486ae0d97beb4abde2ef828f4a',
    'sc/buildings_2.sctx': 'ff0f766b8d361eeb942384600ace1082a11c7c7404bed41d976fbafbdd2dc622',
    'sc/buildings_8.sctx': '588eba7d5739a5d9b53d3e14f2ab83bd170cad735363a81dd37bea7bcc0bb3bd',
    'sc/buildings_25.sctx': 'c290a82b3940513f16b55dba2305e875d923d4120c5997b6b6908c680ec8ca3d',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
    'sc/buildings_61.sctx': '0620e3b14e72fbc0790d852c629f42be7bfe0b1af2aedffde105407437398410',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
    'logic/projectiles.csv': '71cda0e457ad88a6772f6421a22419b24d6bcf78d0ed305f09184404889a72dc',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'csv/particle_emitters.csv': '8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef',
    'sfx/air_cannon_fire_04.ogg': '795b231e88fb8178a93a0d9b90b1a505eb573336bf27f930d7cddfbaa893540e',
    'sfx/air_cannon_pickup_03.ogg': '338e634b18c43c108ea5dec730fecb56737a4707bf70f9599f120f503fa662f7',
    'sfx/air_cannon_place_02.ogg': 'd6826884df5c66e012c782b8ab76a7fc9f26df89516ec651ffd3c6a93cc9e4e5',
    'sfx/building_destroyed_01.ogg': 'fd8295765aa86ff5c7c6be1159cd8fc97aed3c858c29fbdb1af5e3d5c5ce7f04',
}
PREFIX = 'assets/buildings/air-sweeper-native'
BODY_FIELDS = ['ExportName', 'ExportNameConstruction', 'ExportNameBuildAnim',
               'ExportNameUpgradeAnim', 'ExportNameDamaged', 'ExportNameBase']


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


def poses(graph, name, frame=0, controls=None, root=None):
    """Independent normal-blend sampler; fail closed if the graph gains groups."""
    result = []
    for t, v, m, c, blend in graph_draws(graph, graph['exports'][name], frame, controls, root):
        require(blend == 0, 'Air Sweeper requires a different compositor')
        result.append(dict(texture=t, vertices=v.reshape(-1).tolist(), matrix=m[:2].reshape(-1).tolist(),
                           multiply=c[0].tolist(), add=c[1].tolist(), blend=blend))
    return result


def points(poses_):
    result = []
    for pose in poses_:
        vertices = np.array(pose['vertices']).reshape(-1, 4)
        result.extend(np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @
                      np.array(pose['matrix']).reshape(2, 3).T)
    return result


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client differs')
    membership = {v['file']: v['sha'] for v in fingerprint['files']}
    for path in PINS:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, PINS)).hexdigest() == membership[path], f'Fingerprint differs: {path}')
    rows = table('logic/buildings.csv')['Air Sweeper']
    require(len(rows) == 7 and rows[0]['GlobalID'] == '1000028', 'Air Sweeper identity/levels differ')
    all_projectiles = table('logic/projectiles.csv')
    projectiles = {n: all_projectiles[n] for n in sorted({r['Projectile'] for r in rows if r.get('Projectile')})}
    all_effects = table('logic/effects.csv')
    pending = {v for row in [*rows, *[r for rs in projectiles.values() for r in rs]]
               for k, v in row.items() if 'Effect' in k and v in all_effects}
    effects = {}
    while pending:
        name = pending.pop()
        if name in effects: continue
        effects[name] = all_effects[name]
        pending.update(row['SpawnEffect'] for row in effects[name] if row.get('SpawnEffect'))
    effects = dict(sorted(effects.items()))
    all_particles = table('csv/particle_emitters.csv')
    names = sorted({r['ParticleEmitter'] for rs in effects.values() for r in rs if r.get('ParticleEmitter')})
    particles = {n: all_particles[n] for n in names}
    body_exports = {r[k] for r in rows for k in BODY_FIELDS if r.get(k)}
    exports = set(body_exports)
    for rs in [*projectiles.values(), *effects.values()]:
        for r in rs:
            if r.get('ExportName'):
                require(r['SWF'] == 'sc/buildings.sc', 'Unexpected effect/projectile source')
                exports.add(r['ExportName'])
    for rs in particles.values():
        swf = rs[0]['ParticleSwf']
        for r in rs:
            swf = r.get('ParticleSwf', swf)
            require(swf == 'sc/buildings.sc', 'Unexpected particle source')
            if r.get('ParticleExportName'): exports.add(r['ParticleExportName'])
    sc = SC6(source('sc/buildings.sc', PINS))
    require(exports <= sc.exports.keys(), 'Missing original export')
    graph = capture_graph(sc, {n: sc.exports[n] for n in sorted(exports)})
    require({b for c in graph['clips'].values() for b in c['blending']} == {0}, 'Unexpected source blend')
    used = {t for ss in graph['shapes'].values() for t, _ in ss}
    require(used == {1, 2, 8, 25, 39, 61}, 'Texture membership differs')
    images = {t: decode_sctx(source('sc/' + sc.textures[t]['external'], PINS)) for t in sorted(used)}
    for t, image in images.items():
        require(image.size == (sc.textures[t]['width'], sc.textures[t]['height']), 'Texture dimensions differ')
    outputs, textures, runtime = crop_textures(graph, images, PREFIX + '/texture')
    cpu = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))
    pixels = {t: np.array(image) / 255 for t, image in images.items()}
    all_points = []
    for name in sorted(body_exports):
        clip = graph['clips'][str(graph['exports'][name])]
        if 'turret' in clip['names']:
            require(len(clip['timeline']) == 1, 'Preview bounds require a static parent')
            # Each controlled part is a sibling with fixed placement. Sampling its
            # full phase range once therefore encloses every combination of phases.
            for phase in range(360):
                controls = {'turret': phase, 'turret_sector': phase, 'turret_load': phase % 325}
                all_points.extend(points(poses(graph, name, controls=controls)))
        else:
            for frame in range(len(clip['timeline'])):
                all_points.extend(points(poses(graph, name, frame)))
    box = np.array(all_points)
    bounds = [int(v) for v in [*np.floor(box.min(axis=0) - 8), *np.ceil(box.max(axis=0) + 8)]]
    width, height = 2 * (bounds[2] - bounds[0]), 2 * (bounds[3] - bounds[1])
    root = np.array([[2, 0, -bounds[0] * 2], [0, 2, -bounds[1] * 2], [0, 0, 1]])
    previews = {}
    for level, row in enumerate(rows, 1):
        for direction in range(8):
            controls = {'turret': direction * 45, 'turret_sector': direction * 45, 'turret_load': 0}
            preview_poses = poses(graph, rows[0]['ExportNameBase'], root=root)
            preview_poses += poses(graph, row['ExportName'], controls=controls, root=root)
            xy = np.array(points(preview_poses))
            require((xy >= 0).all() and (xy < [width, height]).all(), 'Clipped source preview')
            rgba = cpu['compose'](preview_poses, pixels, max(width, height))
            rgba[:, :, :3] /= np.where(rgba[:, :, 3:4] > 0, rgba[:, :, 3:4], 1)
            image = Image.fromarray(np.round(np.clip(rgba, 0, 1) * 255).astype(np.uint8), 'RGBA').crop((0, 0, width, height))
            path = f'{PREFIX}/level-{level}-{direction}.png'
            outputs[path] = image
            previews[f'{level}-{direction}'] = dict(path=path, export=row['ExportName'], baseExport=rows[0]['ExportNameBase'],
                controls=controls, bounds=bounds, width=width, height=height, pixelsPerNativeUnit=2, rgbaSha256=digest(image.tobytes()))
    sounds = {}
    for original in sorted({r['Sound'] for rs in effects.values() for r in rs if r.get('Sound')}):
        path = PREFIX + '/' + original.removeprefix('sfx/')
        outputs[path] = source(original, PINS)
        sounds[original] = dict(path=path, sha256=digest(outputs[path]))
    native = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS,
        buildings={'Air Sweeper': rows}, projectiles=projectiles, effects=effects, particles=particles,
        world=dict(source='sc/buildings.sc', graph=graph, textures=textures), previews=previews, sounds=sounds,
        reconstruction=dict(liveIntegration=False, nativePlaybackVerified=False,
            scope='Seven original levels, 360-frame turret/sector controls, all loading labels, construction/upgrade/rubble/base exports, projectile, four effect records and four sounds.',
            preview='All body frames and controlled child phases enclosed with eight native units of padding at 2x. Base and body share the unchanged source origin. Framing and direction mapping are local.',
            timing='Source loading labels span 224 idle, 91 loading and 10 attack frames at 30 fps. Their relation to PrepareSpeed=600, AttackSpeed=5000 and CoolDownOverride=4800 is not established by source data alone.',
            projectile='Air Blaster Ammo1 references dummy_particle. Its original geometry is retained; this does not verify the native traveling shockwave renderer or justify replacing its cone fields.',
            availability='Source TH requirements are retained. Importing levels 5-7 does not change the current TH8 home cap or unlock unsupported campaign stages.'))
    combat = dict(building=rows[0], levels=rows, projectile=projectiles[rows[0]['Projectile']][0])
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
        target = ROOT / 'reference/air-sweeper' / (name + '.json')
        content = json.dumps(value, indent=2) + '\n'
        if args.check: require(target.read_text() == content, f'Reference differs: {name}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} original Air Sweeper assets')


if __name__ == '__main__': main()
