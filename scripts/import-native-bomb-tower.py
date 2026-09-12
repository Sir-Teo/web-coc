#!/usr/bin/env python3
"""Preserve native Bomb Tower bodies, rooftop defenders, bombs and original audio.

Requires scripts/native_art/requirements.txt. --check reconstructs every sampling
pixel, graph and source projection from the pinned public client. Live presentation
consumes the retained source graphs; additional gameplay levels remain gated.
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
from native_art.bundle import ROOT, BUNDLE, BASE, SOURCES, digest, source
from native_art.sc6 import SC6, decode_sctx, require
from native_art.scene_graph import capture_graph, crop_textures

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'sc/buildings.sc': SOURCES['sc/buildings.sc'],
    'sc/buildings_5.sctx': '6403f600eb8303935d63df9edfd7832ba8eb84d8fc4cd1ecf2f3788fc0285184',
    'sc/buildings_8.sctx': '588eba7d5739a5d9b53d3e14f2ab83bd170cad735363a81dd37bea7bcc0bb3bd',
    'sc/buildings_25.sctx': 'c290a82b3940513f16b55dba2305e875d923d4120c5997b6b6908c680ec8ca3d',
    'sc/buildings_30.sctx': '2159db826ffba3ca31bfed16a7d6985991f0745403d36ba7135b3aa17031c4c2',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
    'sc/buildings_66.sctx': SOURCES['sc/buildings_66.sctx'],
    'sc/buildings_36.sctx': '9b0798f9eeb63bc6d5994c8424af84262835f7fc968b0130f5f6d1f01a7d7749',
    'sc/chr_b_skeleton.sc': '108d73e0021eb67336410cb8f2b1ab293a1accda44129fb389f7b27d19840f6c',
    'sc/chr_b_skeleton_0.sctx': 'e4f018d6fee615e5429d7548cb11ad107ac8a9a3455534e98fc837eb07cccb97',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
    'logic/projectiles.csv': '71cda0e457ad88a6772f6421a22419b24d6bcf78d0ed305f09184404889a72dc',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'csv/animations.csv': 'b0be152c98d06ccd0689320acfa19b07e04dd2a07fc6a1253558592f67bf29d8',
    'csv/particle_emitters.csv': '8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef',
    'sfx/bomb_tower_atk_01.ogg': '62f742d51c4d00ca2586d87d952bd9e4613d5539b6c98444a6713d18a46c44fe',
    'sfx/bomb_tower_hit_01.ogg': '0320c2aeb7f412dace1acf16b4727ea44c04f93240f7c51486be5c23ae42bb84',
    'sfx/building_destroyed_01.ogg': 'fd8295765aa86ff5c7c6be1159cd8fc97aed3c858c29fbdb1af5e3d5c5ce7f04',
    'sfx/mortar_hit_01.ogg': '3d54d10262b8ac7b59faef7a4c75a62c161855bb78ed90a2a02fb414f317d4cc',
    'sfx/mortar_pickup_01.ogg': 'df5f892454fc24538551396ca2c34649f648547c62db566d9be6e0d839633558',
    'sfx/mortar_place_02.ogg': '264513d090ecaecdd13096508c93e21f1e58c15e2d24222118d1f4357a53f726',
}
PREFIX = 'assets/buildings/bombtower-native'
PREVIEW_BOUNDS = [-90, -65, 90, 145]


def decoded(path):
    blob = source(path, PINS)
    if blob.startswith(b'Sig:'): blob = blob[68:]
    if not blob.startswith(b'"'): blob = lzma.decompress(blob[:9] + b'\0' * 4 + blob[9:])
    return blob.decode('utf-8-sig')


def table(path):
    result, name = {}, ''
    for row in list(csv.DictReader(io.StringIO(decoded(path))))[1:]:
        if row['Name']:
            name = row['Name']
            require(name not in result, 'Duplicate source record')
            result[name] = []
        require(name and None not in row, 'Invalid source row')
        result[name].append({k: v for k, v in row.items() if v})
    return result


def animations(wanted):
    # This CSV contains separate named tables with different headers. Treating
    # its first row as one global header silently loses the defender columns.
    rows = list(csv.reader(io.StringIO(decoded('csv/animations.csv'))))
    result = {}
    for i, row in enumerate(rows):
        if not row or row[0] not in wanted: continue
        name = row[0]
        require(name not in result, 'Duplicate animation table')
        header, types = rows[i + 1][1:], rows[i + 2][1:]
        require(header[0] == 'Name' and types[0] == 'String', 'Animation header differs')
        entries = []
        for values in rows[i + 3:]:
            if values[0]: break
            require(len(values) == len(header) + 1, 'Animation row width differs')
            require(all(key or not value for key, value in zip(header, values[1:])),
                    'Unnamed animation value')
            entries.append({key: value for key, value in zip(header, values[1:]) if value})
        result[name] = dict(headers=[key for key in header if key],
                            types=[value for key, value in zip(header, types) if key], rows=entries)
    require(set(result) == set(wanted), 'Missing rooftop defender')
    return result


def capture(path, names, prefix, expected_textures):
    sc = SC6(source(path, PINS))
    graph = capture_graph(sc, {name: sc.exports[name] for name in sorted(names)})
    used = {texture for commands in graph['shapes'].values() for texture, _ in commands}
    require(used == expected_textures, 'Native texture membership differs')
    images = {t: decode_sctx(source('sc/' + sc.textures[t]['external'], PINS)) for t in sorted(used)}
    for t, image in images.items():
        require(image.size == (sc.textures[t]['width'], sc.textures[t]['height']), 'Texture dimensions differ')
    outputs, textures, runtime = crop_textures(graph, images, prefix)
    print(f'Captured {path}: {len(graph["exports"])} exports, {len(graph["clips"])} clips, '
          f'{len(graph["shapes"])} shapes, {len(textures)} textures', flush=True)
    return outputs, dict(graph=graph, textures=textures), runtime


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client identity differs')
    manifest = {v['file']: v['sha'] for v in fingerprint['files']}
    for path in PINS:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, PINS)).hexdigest() == manifest[path], f'Fingerprint differs: {path}')
    building = table('logic/buildings.csv')['Bomb Tower']
    require(building[0]['GlobalID'] == '1000032' and len(building) == 13, 'Bomb Tower identity/levels differ')
    levels, inherited = [], {}
    for row in building:
        inherited.update(row)
        levels.append(inherited.copy())
    all_projectiles = table('logic/projectiles.csv')
    projectiles = {name: all_projectiles[name] for name in sorted({v['Projectile'] for v in levels})}
    all_effects = table('logic/effects.csv')
    fields = ['AttackEffect', 'HitEffect', 'DestroyEffect', 'DestroyDamageEffect',
              'DieDamageEffect', 'PickUpEffect', 'PlacingEffect']
    pending = sorted({v[key] for v in levels for key in fields})
    effects = {}
    while pending:
        name = pending.pop()
        if name in effects: continue
        effects[name] = all_effects[name]
        pending += [row['SpawnEffect'] for row in effects[name] if row.get('SpawnEffect')]
    effects = dict(sorted(effects.items()))
    all_particles = table('csv/particle_emitters.csv')
    particle_names = {row['ParticleEmitter'] for rows in effects.values() for row in rows if row.get('ParticleEmitter')}
    particle_names |= {row['ParticleEmitter'] for rows in projectiles.values() for row in rows if row.get('ParticleEmitter')}
    particles = {name: all_particles[name] for name in sorted(particle_names)}
    defender = animations({v['DefenderCharacter'] for v in levels})
    defender_names = set()
    for value in defender.values():
        for row in value['rows']:
            require(row['SWF'] == 'sc/chr_b_skeleton.sc' and row['HasDirections'] == 'TRUE', 'Defender source differs')
            defender_names.update(row['ExportName'] + '_' + str(i) for i in (1, 2, 3))
    exports = ['ExportName', 'ExportNameBase', 'ExportNameConstruction', 'ExportNameBuildAnim', 'ExportNameDamaged']
    body_names = {v[key] for v in levels for key in exports}
    body_names |= {row[key] for rows in projectiles.values() for row in rows for key in ['ExportName', 'ShadowExportName']}
    body_names |= {row['ParticleExportName'] for name, rows in particles.items()
                   if name.startswith('Bomb Tower Bomb Appear') for row in rows}
    outputs, body, body_runtime = capture('sc/buildings.sc', body_names, PREFIX + '/body', {5, 8, 25, 36})
    actor_outputs, actor, actor_runtime = capture('sc/chr_b_skeleton.sc', defender_names, PREFIX + '/defender', {0})
    outputs.update(actor_outputs)
    particle_names = {row['ParticleExportName'] for name, rows in particles.items()
                      if not name.startswith('Bomb Tower Bomb Appear') for row in rows}
    particle_outputs, particle_art, particle_runtime = capture('sc/buildings.sc', particle_names,
                                                               PREFIX + '/particles', {30, 39, 66})
    outputs.update(particle_outputs)
    # Original normal-blend source polygons for background-independent portraits.
    # The roof is centered at source (0, 0); the local ground anchor is (0, 80).
    cpu = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))
    pixels = {
        key: {int(t): np.array(decode_sctx(source(f'sc/{prefix}_{t}.sctx', PINS))) / 255
              for t in value['textures']}
        for key, prefix, value in [('body', 'buildings', body), ('defender', 'chr_b_skeleton', actor)]
    }
    previews = {}
    for level in levels:
        root = np.array([[2, 0, -PREVIEW_BOUNDS[0] * 2], [0, 2, -PREVIEW_BOUNDS[1] * 2], [0, 0, 1]])
        body_poses = []
        for field in ['ExportNameBase', 'ExportName']:
            body_poses += cpu['nodes'](body['graph'], body['graph']['exports'][level[field]], 0, root)
        row = defender[level['DefenderCharacter']]['rows'][0]
        actor_name = row['ExportName'] + '_3'
        actor_root = root @ np.diag([int(row['Scale']) / 100, int(row['Scale']) / 100, 1])
        actor_poses = cpu['nodes'](actor['graph'], actor['graph']['exports'][actor_name], 0, actor_root)
        # Slot 1 is the explicitly named ability control in each imported root.
        clip = actor['graph']['clips'][str(actor['graph']['exports'][actor_name])]
        ability = clip['names'].index('ability_on')
        actor_poses = [p for p in actor_poses if not p['key'].startswith(f"{actor['graph']['exports'][actor_name]}/{ability}/") and p['blend'] == 0]
        cell = 480
        a = cpu['compose'](body_poses, pixels['body'], cell)
        b = cpu['compose'](actor_poses, pixels['defender'], cell)
        combined = b + a * (1 - b[:, :, 3:4])
        combined[:, :, :3] /= np.where(combined[:, :, 3:4] > 0, combined[:, :, 3:4], 1)
        image = Image.fromarray(np.round(np.clip(combined, 0, 1) * 255).astype(np.uint8), 'RGBA')
        image = image.crop((0, 0, (PREVIEW_BOUNDS[2] - PREVIEW_BOUNDS[0]) * 2,
                            (PREVIEW_BOUNDS[3] - PREVIEW_BOUNDS[1]) * 2))
        path = f'{PREFIX}/preview-{level["BuildingLevel"]}.png'
        outputs[path] = image
        previews[level['BuildingLevel']] = dict(path=path, bounds=PREVIEW_BOUNDS, width=image.width, height=image.height,
            defender=actor_name, defenderScale=int(row['Scale']) / 100, rgbaSha256=digest(image.tobytes()))
    sounds = {}
    for original in sorted({row['Sound'] for rows in effects.values() for row in rows if row.get('Sound')}):
        path = PREFIX + '/' + original.removeprefix('sfx/')
        outputs[path] = source(original, PINS)
        sounds[original] = dict(path=path, sha256=digest(outputs[path]))
    first = levels[0]
    combat = dict(levels=[dict(level=int(v['BuildingLevel']), townhall=int(v['TownHallLevel']), hp=int(v['Hitpoints']),
                    dps=int(v['DPS']), cost=int(v['BuildCost']), deathDamage=int(v['DieDamage']),
                    seconds=sum(int(v[key]) * scale for key, scale in [('BuildTimeD', 86400), ('BuildTimeH', 3600), ('BuildTimeM', 60), ('BuildTimeS', 1)]),
                    projectile=v['Projectile'], defender=v['DefenderCharacter'], hitEffect=v['HitEffect'],
                    destroyedEffect=v['DestroyDamageEffect'], body=v['ExportName']) for v in levels],
                  intervalMs=int(first['AttackSpeed']), attackRange=int(first['AttackRange']),
                  damageRadius=int(first['DamageRadius']), deathRadius=int(first['DieDamageRadius']),
                  deathDelayMs=int(first['DieDamageDelay']), defenderZ=int(first['DefenderZ']),
                  airTargets=first['AirTargets'] == 'TRUE', groundTargets=first['GroundTargets'] == 'TRUE', size=int(first['Width']))
    body_runtime['levels'] = [{key: v[key] for key in exports} for v in levels]
    body_runtime['projectiles'] = projectiles
    body_runtime['deathBombs'] = {name: rows[0] for name, rows in particles.items() if name.startswith('Bomb Tower Bomb Appear')}
    actor_runtime['animations'] = {name: value['rows'] for name, value in defender.items()}
    metadata = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS,
                    building=building, projectiles=projectiles, animations=defender, effects=effects,
                    particles=particles, body=body, defender=actor, sounds=sounds, previews=previews, particleArt=particle_art,
                    reconstruction=dict(liveIntegration=dict(body=True, defender=True, projectile=True, deathBomb=True,
                                                             impactParticles=True, audio=True), nativePlaybackVerified=False,
                        directionMappingVerified=False, worldProjectionVerified=False, particleEngineVerified=False,
                        scope='All 13 bodies, foundations/scaffolds/rubble, three directional defender families, three projectiles, four death bombs and six source sounds. All referenced particle artwork and original sounds are retained; particle projection and motion remain local interpretations.'))
    return outputs, dict(native=metadata, body=body_runtime, defender=actor_runtime, combat=combat, particle_art=particle_runtime,
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
            if isinstance(value, bytes): require(target.read_bytes() == value, f'Sound bytes differ: {path}')
            else:
                with Image.open(target) as old:
                    require(old.mode == 'RGBA' and old.size == value.size and old.tobytes() == value.tobytes(), f'Pixels differ: {path}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(value, bytes): target.write_bytes(value)
            else: value.save(target, optimize=True)
    for name, value in references.items():
        target = ROOT / 'reference/bombtower' / (name + '.json')
        content = json.dumps(value, indent=2) + '\n'
        if args.check: require(target.read_text() == content, f'Reference differs: {name}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} native Bomb Tower assets and 13 source levels')


if __name__ == '__main__': main()
