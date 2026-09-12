#!/usr/bin/env python3
"""Preserve all home-village X-Bow levels, aiming controls, bolts and native sounds.

Uses scripts/native_art/requirements.txt. --check compares source hashes, every
sampling region, remapped geometry, output pixels, sound bytes and references.
"""
import argparse
import csv
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
    'sc/buildings_8.sctx': '588eba7d5739a5d9b53d3e14f2ab83bd170cad735363a81dd37bea7bcc0bb3bd',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
    'sc/buildings_70.sctx': '72eeb95ba9aed5b5a91ef6d7a3fffce1d916c3274b698af7ac55332844c54a3a',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
    'logic/projectiles.csv': '71cda0e457ad88a6772f6421a22419b24d6bcf78d0ed305f09184404889a72dc',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'csv/particle_emitters.csv': '8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef',
    'sfx/bow_attack.ogg': 'b3f52928c4d2161349ffe0b10676704bd97e33bebc77486c221f24c84f408c5a',
    'sfx/generic_hit_01.ogg': '5fca48e71d21be79eb6d40a1ca1ad3a002e3d69ba72388b2eb6a4d2ec10e5934',
    'sfx/bow_load.ogg': '823b738a75e935f5a3644663fa2220f99b929e5fb266b768b64d2027e678fb97',
    'sfx/bow_out_of_ammo.ogg': '39672fdd87c0352d5bf621ba11c7642e6387c62f719f50fd1ed0bd36a511af84',
    'sfx/bow_pickup.ogg': '6fa87171dd0c12d507259ecb71f5366d32b733a259b33ff8aee7e0c5cf7db472',
    'sfx/bow_place.ogg': '9b155458cd993e03f02fcef0a51a62522ef8d05c49bd0be1a925bb5ae055dc10',
    'sfx/bow_target.ogg': '6ce1662bd07978da29bdd4d2dd89cd242164b3808d1dcc9ed8911065c2b6aa2b',
}
PREFIX = 'assets/buildings/xbow-native'


def table(path):
    raw = source(path, PINS)
    if raw.startswith(b'Sig:'):
        raw = raw[68:]
    if not raw.startswith(b'"'):
        raw = lzma.decompress(raw[:9] + b'\0' * 4 + raw[9:])
    result = {}
    for row in list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))[1:]:
        if row['Name']:
            name = row['Name']
            require(name not in result, 'Duplicate named source record')
            result[name] = []
        result[name].append({k: v for k, v in row.items() if v})
    return result


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client fingerprint differs')
    building = table('logic/buildings.csv')['X-Bow']
    require(building[0]['GlobalID'] == '1000021' and len(building) == 13, 'Home X-Bow identity or levels differ')
    levels, inherited = [], {}
    for row in building:
        inherited.update(row)
        levels.append(inherited.copy())
    fields = ['ExportName', 'AlternateExportName', 'ExportNameUpgradeAnim', 'AlternateUpgradeExportName']
    names = [level[field] for level in levels for field in fields]
    names += ['rapidfire_base', 'npc_rapidfire_base', 'war_rapidfire_base']
    projectiles = table('logic/projectiles.csv')
    projectile_names = sorted({level[field] for level in levels for field in ['Projectile', 'AltProjectile']})
    selected_projectiles = {name: projectiles[name] for name in projectile_names}
    names += [rows[0]['ExportName'] for rows in selected_projectiles.values()]
    names += sorted({rows[0]['ShadowExportName'] for rows in selected_projectiles.values()})
    effects = table('logic/effects.csv')
    effect_fields = ['AttackEffect', 'HitEffect', 'LoadAmmoEffect', 'NoAmmoEffect', 'ToggleAttackModeEffect',
                     'PickUpEffect', 'PlacingEffect']
    selected_effects = {building[0][key]: effects[building[0][key]] for key in effect_fields}
    particle_names = sorted({r['ParticleEmitter'] for rows in selected_effects.values() for r in rows if r.get('ParticleEmitter')})
    particles = table('csv/particle_emitters.csv')
    selected_particles = {name: particles[name] for name in particle_names}
    sc = SC6(source('sc/buildings.sc', PINS))
    graph = capture_graph(sc, {name: sc.exports[name] for name in names})
    decoded = {}
    for index in (8, 39, 70):
        descriptor = sc.textures[index]
        image = decode_sctx(source('sc/' + descriptor['external'], PINS))
        require(image.size == (descriptor['width'], descriptor['height']), 'SC6/SCTX dimensions differ')
        decoded[index] = image
    outputs, textures, runtime = crop_textures(graph, decoded, PREFIX)
    # Enumerate every clip frame to reject unsupported additive groups before shipping.
    # This also exercises otherwise invisible empty source timelines.
    draw_count = 0
    for id_, clip in graph['clips'].items():
        for frame in range(len(clip['timeline'])):
            draw_count += len(list(graph_draws(graph, int(id_), frame)))
    directions = {}
    for name in names[:52]:
        clip = graph['clips'][str(sc.exports[name])]
        require(len(clip['timeline']) == 1, 'Expected a static X-Bow composition root')
        for slot, role in enumerate(clip['names']):
            if role not in ('turret', 'ammo'):
                continue
            id_ = str(clip['children'][slot])
            child = graph['clips'][id_]
            require(len(child['timeline']) == 360 and len(child['frames']) == 36, 'Native directional views differ')
            require(all(len(set(child['timeline'][i:i + 10])) == 1 for i in range(0, 360, 10)), 'Direction hold differs')
            directions[id_] = dict(role=role, sourceFrames=360, views=36, hold=10)
    sounds = {}
    for rows in selected_effects.values():
        for row in rows:
            if not row.get('Sound'):
                continue
            original = row['Sound']
            path = PREFIX + '/' + original.removeprefix('sfx/')
            outputs[path] = source(original, PINS)
            sounds[original] = dict(path=path, sha256=digest(outputs[path]))
    # Static DOM portraits keep the native base/turret/ammo at a common origin.
    # Additive sparks remain live mesh layers; a normal PNG cannot represent
    # their appearance over every arbitrary HUD background.
    previews = {}
    preview_textures = {70: np.array(decoded[70], dtype=float) / 255}
    bounds = [-100, -30, 100, 140]
    for level in range(1, 14):
        for mode in ('ground', 'both'):
            name = f'rapidfire_turret_lvl{level}' + ('_air' if mode == 'both' else '')
            commands = []
            for texture, vertices, matrix, color, blend in graph_draws(graph, sc.exports[name], 0, {'turret': 225, 'ammo': 225}):
                points = np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ matrix.T
                require((points[:, :2] >= bounds[:2]).all() and (points[:, :2] <= bounds[2:]).all(), 'X-Bow preview clips native geometry')
                if blend == 0:
                    commands.append((texture, vertices, np.diag([2, 2, 1]) @ matrix, color))
            image = rasterize(commands, preview_textures, [v * 2 for v in bounds])
            path = f'{PREFIX}/preview-{level}-{mode}.png'
            outputs[path] = image
            previews[f'{level}-{mode}'] = dict(path=path, bounds=bounds, width=image.width, height=image.height,
                                              direction=225, rgbaSha256=digest(image.tobytes()))
    metadata = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS,
                    building=building, projectiles=selected_projectiles, effects=selected_effects,
                    particles=selected_particles, graph=graph, textures=textures, directions=directions, sounds=sounds, previews=previews,
                    reconstruction=dict(textureSampling='unscaled source texels with full bilinear neighbours',
                        geometry='original polygon strips, six affine values and multiply/add color transforms',
                        blends='normal=0, add=8; distinct instances and layer order retained',
                        nestedTimelines='elapsed frames since continuous placement; loop subclips',
                        nativePlaybackVerified=False, directionMappingVerified=False, weaponEngineVerified=False,
                        diagnosticDrawCommands=draw_count))
    runtime['levels'] = [{key: row[key] for key in fields} for row in levels]
    runtime['directions'] = directions
    runtime['sounds'] = sounds
    print(f'Captured {len(graph["exports"])} exports, {len(graph["shapes"])} shapes, '
          f'{len(graph["clips"])} clips, {len(directions)} directional controls, {draw_count} diagnostic draw commands', flush=True)
    return outputs, metadata, runtime


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, metadata, runtime = build()
    for path, value in outputs.items():
        target = ROOT / 'public' / path
        if args.check:
            if isinstance(value, bytes):
                require(target.read_bytes() == value, f'Native X-Bow sound differs: {path}')
            else:
                with Image.open(target) as existing:
                    require(existing.mode == 'RGBA' and existing.size == value.size and existing.tobytes() == value.tobytes(),
                            f'Native X-Bow pixels differ: {path}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(value, bytes):
                target.write_bytes(value)
            else:
                value.save(target, optimize=True)
    if args.check:
        shipped = {str(p.relative_to(ROOT / 'public')) for p in (ROOT / 'public' / PREFIX).iterdir() if p.is_file()}
        require(shipped == set(outputs), 'Unexpected or missing native X-Bow assets')
    # Combat consumes only audited numeric data, without importing the large art graph.
    levels, inherited = [], {}
    projectiles = list(metadata['projectiles'])
    for row in metadata['building']:
        inherited.update(row)
        levels.append(dict(level=int(inherited['BuildingLevel']), townhall=int(inherited['TownHallLevel']),
                           hp=int(inherited['Hitpoints']), dps=int(inherited['DPS']), cost=int(inherited['BuildCost']),
                           seconds=sum(int(inherited[k]) * scale for k, scale in
                                       [('BuildTimeD', 86400), ('BuildTimeH', 3600), ('BuildTimeM', 60), ('BuildTimeS', 1)]),
                           projectile=projectiles.index(inherited['Projectile']) + 1))
    first = metadata['building'][0]
    combat = dict(levels=levels, intervalMs=int(first['AttackSpeed']), ammunition=int(first['AmmoCount']),
                  groundRange=int(first['AttackRange']), groundAirRange=int(first['AltAttackRange']),
                  projectiles=[dict(export=metadata['projectiles'][p][0]['ExportName'],
                                    speed=int(metadata['projectiles'][p][0]['Speed']),
                                    height=int(metadata['projectiles'][p][0]['StartHeight'])) for p in projectiles])
    for name, value in [('native', metadata), ('runtime', runtime), ('combat', combat)]:
        target = ROOT / 'reference/xbow' / (name + '.json')
        content = json.dumps(value, indent=2) + '\n'
        if args.check:
            require(target.read_text() == content, f'Native X-Bow metadata differs: {name}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} native X-Bow assets and reference metadata')


if __name__ == '__main__':
    main()
