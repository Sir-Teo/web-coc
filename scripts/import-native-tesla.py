#!/usr/bin/env python3
"""Preserve all native Hidden Tesla levels, reveal timelines, particles and sounds.

Requires scripts/native_art/requirements.txt. --check rebuilds from hash-pinned
client inputs and compares every output pixel, sound byte and metadata field.
Additive groups are retained explicitly; this importer does not flatten them.
"""
import argparse
import csv
import hashlib
import io
import json
import lzma

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, BUNDLE, BASE, SOURCES, digest, source
from native_art.sc6 import SC6, decode_sctx, rasterize, require
from native_art.scene_graph import capture_graph, crop_textures, graph_draws

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'sc/buildings.sc': SOURCES['sc/buildings.sc'],
    'sc/buildings_18.sctx': 'bd0c3b2eece3e9c43b2b3d61463e5b12ff4d274ae6adcc0ce33ceed63df58ffa',
    'sc/buildings_25.sctx': 'c290a82b3940513f16b55dba2305e875d923d4120c5997b6b6908c680ec8ca3d',
    'sc/buildings_27.sctx': '5f56a05f9af274538d989149676f958f28d1a0041b3167b3c79df5a02ce91a5f',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
    'logic/globals.csv': '16210fc28bfb86d00ea04d581a99fe98e128172017b2d4f637b8848c0cf20087',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'csv/particle_emitters.csv': '8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef',
    'sfx/tesla_appear_01.ogg': '5ddcd41b1c5be321e3244546de8beb6ba8622ea91787a4638ebc7cf7f0699cc1',
    'sfx/tesla_zap_01.ogg': '3b3cd34b44efc2d82d0de8c7709e692670fe2fb03cf7f49f4825f70884466b38',
    'sfx/tesla_zap_03.ogg': 'cab4f177f4ce290f369f3345b5e42afccabb7fb510ec316ee1e954e7a5672bf8',
    'sfx/tesla_pickup_11.ogg': 'dace89a1fbdb5dbae92f946924ef8ec67bd0a86bbbc5a5f07b76fdaa810a233e',
    'sfx/tesla_drop_09.ogg': 'b5c2a24cddb223128e53cb0dcc34590d4d3c80307592926053ed469c203b7a94',
}
PREFIX = 'assets/buildings/tesla-native'
PREVIEW_BOUNDS = [-80, -85, 80, 105]


def table(path):
    raw = source(path, PINS)
    if raw.startswith(b'Sig:'): raw = raw[68:]
    if not raw.startswith(b'"'): raw = lzma.decompress(raw[:9] + b'\0' * 4 + raw[9:])
    result, name = {}, ''
    for row in list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))[1:]:
        if row['Name']:
            name = row['Name']
            require(name not in result, 'Duplicate source record')
            result[name] = []
        require(name, 'Unnamed source record')
        result[name].append({k: v for k, v in row.items() if v})
    return result


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client identity differs')
    manifest = {v['file']: v['sha'] for v in fingerprint['files']}
    for path in PINS:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, PINS)).hexdigest() == manifest[path], f'Fingerprint differs: {path}')
    building = table('logic/buildings.csv')['Hidden Tesla']
    require(building[0]['GlobalID'] == '1000019' and len(building) == 17, 'Tesla identity or level count differs')
    levels, inherited = [], {}
    for row in building:
        inherited.update(row)
        require(not inherited.get('Projectile') and inherited['Hidden'] == 'TRUE', 'Tesla weapon/visibility differs')
        require(inherited['BaseGfx'] == '-1', 'Unexpected native Tesla foundation')
        levels.append(inherited.copy())
    fields = ['ExportName', 'ExportNameTriggered', 'ExportNameConstruction', 'ExportNameBuildAnim', 'ExportNameDamaged']
    names = {level[field] for level in levels for field in fields}
    all_effects = table('logic/effects.csv')
    effect_fields = ['AppearEffect', 'AttackEffect', 'AttackEffect2', 'HitEffect', 'PickUpEffect', 'PlacingEffect']
    effect_names = sorted({level[key] for level in levels for key in effect_fields if level.get(key)})
    effects = {name: all_effects[name] for name in effect_names}
    names.update(row['ExportName'] for rows in effects.values() for row in rows if row.get('ExportName'))
    particle_names = sorted({row['ParticleEmitter'] for rows in effects.values() for row in rows if row.get('ParticleEmitter')})
    all_particles = table('csv/particle_emitters.csv')
    particles = {name: all_particles[name] for name in particle_names}
    for rows in particles.values():
        require(rows[0]['ParticleSwf'] == 'sc/buildings.sc', 'Unexpected Tesla particle source')
        names.update(row['ParticleExportName'] for row in rows if row.get('ParticleExportName'))
    sc = SC6(source('sc/buildings.sc', PINS))
    graph = capture_graph(sc, {name: sc.exports[name] for name in sorted(names)})
    used = {texture for commands in graph['shapes'].values() for texture, _ in commands}
    require(used == {18, 25, 27, 39}, 'Tesla texture set differs')
    decoded = {t: decode_sctx(source(f'sc/buildings_{t}.sctx', PINS)) for t in sorted(used)}
    for t, image in decoded.items():
        require(image.size == (sc.textures[t]['width'], sc.textures[t]['height']), 'SC6/SCTX dimensions differ')
    outputs, textures, runtime = crop_textures(graph, decoded, PREFIX)
    groups = sorted({str(c['children'][i]) for c in graph['clips'].values() for i, blend in enumerate(c['blending'])
                     if blend == 8 and str(c['children'][i]) in graph['clips'] and graph['clips'][str(c['children'][i])]['children']})
    # Validate all child timelines independently, keeping group boundaries intact.
    # Body-only diagnostic playback explicitly hides the named electricity group.
    diagnostic_draws = 0
    for id_, clip in graph['clips'].items():
        for frame in range(len(clip['timeline'])):
            diagnostic_draws += len(list(graph_draws(graph, int(id_), frame, {'idle_electricity': False})))
    animation = {}
    for level in levels:
        setup = graph['clips'][str(sc.exports[level['ExportName']])]
        trigger = graph['clips'][str(sc.exports[level['ExportNameTriggered']])]
        require(len(setup['timeline']) == 1 and trigger['fps'] == 24 and len(trigger['timeline']) == 18,
                'Tesla setup/reveal timeline differs')
        slot = trigger['names'].index('idle_electricity')
        present = [f for f, i in enumerate(trigger['timeline']) if any(p[0] == slot for p in trigger['frames'][i])]
        require(present == [17], 'Reveal-to-idle placement boundary differs')
        idle = graph['clips'][str(setup['children'][setup['names'].index('idle_electricity')])]
        animation[level['BuildingLevel']] = dict(revealFrames=18, revealFps=24, idleStartsAtFrame=17,
                                                 idleFrames=len(idle['timeline']), idleFps=idle['fps'])
    previews = {}
    original_pixels = {t: np.array(im, dtype=float) / 255 for t, im in decoded.items()}
    for level in levels:
        name = level['ExportName']
        draws = list(graph_draws(graph, sc.exports[name], 0, {'idle_electricity': False}))
        for _, vertices, matrix, _, blend in draws:
            xy = np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ matrix.T
            require((xy[:, :2] >= PREVIEW_BOUNDS[:2]).all() and (xy[:, :2] <= PREVIEW_BOUNDS[2:]).all(), 'Tesla preview clips geometry')
        image = rasterize([(t, v, np.diag([2, 2, 1]) @ m, c) for t, v, m, c, blend in draws if blend == 0],
                          original_pixels, [v * 2 for v in PREVIEW_BOUNDS])
        path = f'{PREFIX}/preview-{level["BuildingLevel"]}.png'
        outputs[path] = image
        previews[level['BuildingLevel']] = dict(path=path, bounds=PREVIEW_BOUNDS, width=image.width, height=image.height,
                                                controls={'idle_electricity': False}, omittedAdditiveLeaves=sum(d[-1] == 8 for d in draws),
                                                rgbaSha256=digest(image.tobytes()))
    sounds = {}
    for original in sorted({row['Sound'] for rows in effects.values() for row in rows if row.get('Sound')}):
        path = PREFIX + '/' + original.removeprefix('sfx/')
        outputs[path] = source(original, PINS)
        sounds[original] = dict(path=path, sha256=digest(outputs[path]))
    globals_ = table('logic/globals.csv')
    globals_ = {name: globals_[name] for name in ['HIDDEN_BUILDING_APPEAR_DESTRUCTION_PERCENTAGE', 'REMOVE_UNTRIGGERED_TESLA']}
    metadata = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS,
                    building=building, globals=globals_, effects=effects, particles=particles, graph=graph,
                    textures=textures, previews=previews, sounds=sounds, animation=animation,
                    reconstruction=dict(additiveGroups=groups, diagnosticDrawCommands=diagnostic_draws,
                        preview='Original normal-blend polygons at density 2; named idle electricity and additive leaves omitted for background-independent DOM portraits',
                        geometry='Original polygon strips, all six affine values, multiply/add color transforms and source timelines',
                        nativePlaybackVerified=False, worldProjectionVerified=False, particleEngineVerified=False,
                        soundSelectionVerified=False, weaponEngineVerified=False))
    runtime['levels'] = [{key: level[key] for key in fields} for level in levels]
    runtime['sounds'], runtime['animation'] = sounds, animation
    first = levels[0]
    combat = dict(levels=[dict(level=int(v['BuildingLevel']), townhall=int(v['TownHallLevel']), hp=int(v['Hitpoints']),
                              dps=int(v['DPS']), cost=int(v['BuildCost']),
                              seconds=sum(int(v[key]) * scale for key, scale in [('BuildTimeD', 86400), ('BuildTimeH', 3600), ('BuildTimeM', 60), ('BuildTimeS', 1)]),
                              attackEffect=v['AttackEffect'], secondaryEffect=v.get('AttackEffect2')) for v in levels],
                  intervalMs=int(first['AttackSpeed']), triggerRange=int(first['TriggerRadius']), attackRange=int(first['AttackRange']),
                  airTargets=first['AirTargets'] == 'TRUE', groundTargets=first['GroundTargets'] == 'TRUE',
                  size=int(first['Width']))
    print(f'Captured {len(graph["exports"])} Tesla exports, {len(graph["shapes"])} shapes, '
          f'{len(graph["clips"])} clips and {len(groups)} isolated additive groups', flush=True)
    return outputs, metadata, runtime, combat


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, metadata, runtime, combat = build()
    folder = ROOT / 'public' / PREFIX
    if args.check:
        require({str(p.relative_to(ROOT / 'public')) for p in folder.iterdir() if p.is_file()} == set(outputs), 'Tesla output membership differs')
    for path, value in outputs.items():
        target = ROOT / 'public' / path
        if args.check:
            if isinstance(value, bytes): require(target.read_bytes() == value, f'Tesla sound differs: {path}')
            else:
                with Image.open(target) as old:
                    require(old.mode == 'RGBA' and old.size == value.size and old.tobytes() == value.tobytes(), f'Tesla pixels differ: {path}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(value, bytes): target.write_bytes(value)
            else: value.save(target, optimize=True)
    for name, data in [('native', metadata), ('runtime', runtime), ('combat', combat)]:
        target = ROOT / 'reference/tesla' / (name + '.json')
        content = json.dumps(data, indent=2) + '\n'
        if args.check: require(target.read_text() == content, f'Tesla metadata differs: {name}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} native Tesla assets and 17 source levels')


if __name__ == '__main__': main()
