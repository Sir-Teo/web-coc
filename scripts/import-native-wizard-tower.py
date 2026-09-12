#!/usr/bin/env python3
"""Retain all original Wizard Tower levels, rooftop Wizards and four effect tiers.

Requires scripts/native_art/requirements.txt. --check reconstructs every output
pixel, sound byte and reference from fingerprint-verified public client inputs.
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
    'sc/buildings_8.sctx': '588eba7d5739a5d9b53d3e14f2ab83bd170cad735363a81dd37bea7bcc0bb3bd',
    'sc/buildings_18.sctx': 'bd0c3b2eece3e9c43b2b3d61463e5b12ff4d274ae6adcc0ce33ceed63df58ffa',
    'sc/buildings_25.sctx': 'c290a82b3940513f16b55dba2305e875d923d4120c5997b6b6908c680ec8ca3d',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
    'sc/buildings_69.sctx': '21f5148e468a8a99268c243100a70fd7a7e7ee44eaf6be8de582db9d6b757403',
    'sc/chr_wizard.sc': '118447ed4ce9c4dfc6c37799ba21d3b68e8f05e66899110f41e4a172b6124b83',
    'sc/chr_wizard_0.sctx': 'd5acfc9be92a2812c1b5aac1d5a8e926f69e0b4d4fc1218143f2e5ff3710157a',
    'sc/vfx_character.sc': '1fedfef75fd781233c33535b2b0f11a45298ef02f93105d8f3730554c67e74e6',
    'sc/vfx_character_8.sctx': '44e0458c6ec9f38e55399975e119e0b7b349fb74c52f503f22c71f056419d45c',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
    'logic/projectiles.csv': '71cda0e457ad88a6772f6421a22419b24d6bcf78d0ed305f09184404889a72dc',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'csv/animations.csv': 'b0be152c98d06ccd0689320acfa19b07e04dd2a07fc6a1253558592f67bf29d8',
    'csv/particle_emitters.csv': '8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef',
    'sfx/building_destroyed_01.ogg': 'fd8295765aa86ff5c7c6be1159cd8fc97aed3c858c29fbdb1af5e3d5c5ce7f04',
    'sfx/mage_attack_02.ogg': '590e29c7e17e6a61b5ac3adff6cfd1538a7a2aa935e4150b34ddebca5311d099',
    'sfx/mage_attack_02v2.ogg': '31002ba09312ad0d3efa52e68f1959e41d0246191eb35a86a2390b0dbd6a37c9',
    'sfx/mage_attack_02v3.ogg': 'b9683dd1a771e8c1f9615af3cedc4592f148cb3cf04a7d108646d274c3774c54',
    'sfx/wizard_hit_01.ogg': 'c0ed0e6d5b0781f70d5962034493b23e9ce17d45939e52f873df9566cda28cdf',
    'sfx/wizard_tower_drop_01.ogg': '2c838bdf357e2ffdf3dc27c22d71ed567c8153b46b08787d29d9bf55ec4b994e',
    'sfx/wizard_tower_pickup_02.ogg': 'efa32a7a0740631351c131f7b82d6a4f95295e75aafde135dbfb9e5ce42e8082',
}
PREFIX = 'assets/buildings/wizard-tower-native'
PREVIEW_BOUNDS = [-90, -60, 90, 130]
BODY_FIELDS = ['ExportName', 'ExportNameBase', 'ExportNameConstruction', 'ExportNameBuildAnim', 'ExportNameDamaged']


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
            require(all(key or not value for key, value in zip(header, values[1:])), 'Unnamed animation value')
            entries.append({key: value for key, value in zip(header, values[1:]) if value})
        result[name] = dict(headers=[key for key in header if key],
                            types=[value for key, value in zip(header, types) if key], rows=entries)
    require(set(result) == wanted, 'Missing rooftop Wizard')
    return result


def capture(path, names, prefix, expected_textures):
    sc = SC6(source(path, PINS))
    require(names <= sc.exports.keys(), 'Missing source export')
    graph = capture_graph(sc, {name: sc.exports[name] for name in sorted(names)})
    used = {texture for commands in graph['shapes'].values() for texture, _ in commands}
    require(used == expected_textures, 'Native texture membership differs')
    images = {t: decode_sctx(source('sc/' + sc.textures[t]['external'], PINS)) for t in sorted(used)}
    for t, image in images.items():
        require(image.size == (sc.textures[t]['width'], sc.textures[t]['height']), 'Texture dimensions differ')
    outputs, textures, runtime = crop_textures(graph, images, prefix)
    print(f'Captured {path}: {len(graph["exports"])} exports, {len(graph["clips"])} clips, '
          f'{len(graph["shapes"])} shapes, {len(textures)} textures', flush=True)
    return outputs, dict(source=path, graph=graph, textures=textures), runtime, images


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client differs')
    manifest = {v['file']: v['sha'] for v in fingerprint['files']}
    for path in PINS:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, PINS)).hexdigest() == manifest[path], f'Fingerprint differs: {path}')
    building = table('logic/buildings.csv')['Wizard Tower']
    require(building[0]['GlobalID'] == '1000011' and len(building) == 17, 'Wizard Tower identity/levels differ')
    levels, inherited = [], {}
    for row in building:
        inherited.update(row)
        levels.append(inherited.copy())
    all_projectiles = table('logic/projectiles.csv')
    projectiles = {name: all_projectiles[name] for name in sorted({v['Projectile'] for v in levels})}
    all_effects = table('logic/effects.csv')
    fields = ['AttackEffect', 'HitEffect', 'DestroyEffect', 'PickUpEffect', 'PlacingEffect']
    pending = sorted({v[key] for v in levels for key in fields})
    effects = {}
    while pending:
        name = pending.pop()
        if name in effects: continue
        effects[name] = all_effects[name]
        pending += [row['SpawnEffect'] for row in effects[name] if row.get('SpawnEffect')]
    effects = dict(sorted(effects.items()))
    all_particles = table('csv/particle_emitters.csv')
    particle_names = {r['ParticleEmitter'] for rows in [*effects.values(), *projectiles.values()]
                      for r in rows if r.get('ParticleEmitter')}
    particles = {name: all_particles[name] for name in sorted(particle_names)}
    # Variant rows may omit ParticleSwf; resolve their containing emitter's source.
    exports = {'sc/buildings.sc': {v[k] for v in levels for k in BODY_FIELDS}, 'sc/vfx_character.sc': set()}
    for rows in projectiles.values():
        require(len(rows) == 1, 'Unexpected projectile variants')
        for row in rows:
            exports[row['SWF']].add(row['ExportName'])
    for rows in particles.values():
        swf = rows[0]['ParticleSwf']
        for row in rows:
            swf = row.get('ParticleSwf', swf)
            require(swf in exports, 'Unexpected particle source')
            if row.get('ParticleExportName'): exports[swf].add(row['ParticleExportName'])
    actor_animations = animations({v['DefenderCharacter'] for v in levels})
    actor_names = set()
    for value in actor_animations.values():
        for row in value['rows']:
            if row['Name'] not in ('idle', 'attack'): continue
            require(row['SWF'] == 'sc/chr_wizard.sc' and row['HasDirections'] == 'TRUE', 'Defender source differs')
            actor_names.update(row['ExportName'] + '_' + str(i) for i in (1, 2, 3))
    require(len(actor_animations) == 11 and len(actor_names) == 66, 'Rooftop family/direction count differs')
    outputs, body, body_runtime, body_images = capture('sc/buildings.sc', exports['sc/buildings.sc'], PREFIX + '/body', {8, 18, 25, 39, 69})
    actor_outputs, actor, actor_runtime, actor_images = capture('sc/chr_wizard.sc', actor_names, PREFIX + '/defender', {0})
    effect_outputs, effect_art, effect_runtime, _ = capture('sc/vfx_character.sc', exports['sc/vfx_character.sc'], PREFIX + '/effects', {8})
    outputs.update(actor_outputs)
    outputs.update(effect_outputs)
    cpu = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))
    body_pixels = {t: np.array(im) / 255 for t, im in body_images.items()}
    actor_pixels = {t: np.array(im) / 255 for t, im in actor_images.items()}
    previews = {}
    for level in levels:
        root = np.array([[2, 0, -PREVIEW_BOUNDS[0] * 2], [0, 2, -PREVIEW_BOUNDS[1] * 2], [0, 0, 1]])
        body_poses = []
        for field in ['ExportNameBase', 'ExportName']:
            body_poses += cpu['nodes'](body['graph'], body['graph']['exports'][level[field]], 0, root)
        idle = next(r for r in actor_animations[level['DefenderCharacter']]['rows'] if r['Name'] == 'idle')
        name = idle['ExportName'] + '_3'
        actor_poses = cpu['nodes'](actor['graph'], actor['graph']['exports'][name], 0, root)
        width, height = (PREVIEW_BOUNDS[2] - PREVIEW_BOUNDS[0]) * 2, (PREVIEW_BOUNDS[3] - PREVIEW_BOUNDS[1]) * 2
        def check_bounds(poses):
            for pose in poses:
                if 'group' in pose:
                    check_bounds(pose['group'])
                    continue
                vertices = np.array(pose['vertices']).reshape(-1, 4)
                xy = np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ np.array(pose['matrix']).reshape(2, 3).T
                require((xy >= 0).all() and (xy < [width, height]).all(), 'Wizard Tower preview clips source geometry')
        check_bounds([*body_poses, *actor_poses])
        a = cpu['compose'](body_poses, body_pixels, max(width, height))
        b = cpu['compose'](actor_poses, actor_pixels, max(width, height))
        rgba = b + a * (1 - b[:, :, 3:4])
        rgba[:, :, :3] /= np.where(rgba[:, :, 3:4] > 0, rgba[:, :, 3:4], 1)
        image = Image.fromarray(np.round(np.clip(rgba, 0, 1) * 255).astype(np.uint8), 'RGBA')
        image = image.crop((0, 0, width, height))
        path = f'{PREFIX}/preview-{level["BuildingLevel"]}.png'
        outputs[path] = image
        previews[level['BuildingLevel']] = dict(path=path, bounds=PREVIEW_BOUNDS, width=width, height=height,
            pixelsPerNativeUnit=2, defender=name, defenderAnchor=[0, 0], rgbaSha256=digest(image.tobytes()))
    sounds = {}
    for original in sorted({r['Sound'] for rows in effects.values() for r in rows if r.get('Sound')}):
        path = PREFIX + '/' + original.removeprefix('sfx/')
        outputs[path] = source(original, PINS)
        sounds[original] = dict(path=path, sha256=digest(outputs[path]))
    first = levels[0]
    combat = dict(levels=[dict(level=int(v['BuildingLevel']), townhall=int(v['TownHallLevel']), hp=int(v['Hitpoints']),
                    dps=int(v['DPS']), cost=int(v['BuildCost']),
                    seconds=sum(int(v[k]) * s for k, s in [('BuildTimeD', 86400), ('BuildTimeH', 3600), ('BuildTimeM', 60), ('BuildTimeS', 1)]),
                    body=v['ExportName'], defender=v['DefenderCharacter'], defenderZ=int(v['DefenderZ']),
                    projectile=v['Projectile'], attackEffect=v['AttackEffect'], hitEffect=v['HitEffect']) for v in levels],
                  intervalMs=int(first['AttackSpeed']), range=int(first['AttackRange']), radius=int(first['DamageRadius']),
                  size=int(first['Width']), airTargets=first['AirTargets'] == 'TRUE', groundTargets=first['GroundTargets'] == 'TRUE')
    body_runtime['levels'] = [{k: v[k] for k in BODY_FIELDS} for v in levels]
    actor_runtime['animations'] = {name: [r for r in value['rows'] if r['Name'] in ('idle', 'attack')]
                                   for name, value in actor_animations.items()}
    metadata = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS,
                    building=building, projectiles=projectiles, animations=actor_animations,
                    effects=effects, particles=particles, body=body, defender=actor, effectArt=effect_art,
                    previews=previews, sounds=sounds,
                    reconstruction=dict(liveIntegration=False, nativePlaybackVerified=False,
                        scope='All 17 bodies, foundations/scaffolds/rubble, idle and attack in three directions for 11 rooftop Wizard families, four projectile tiers, all referenced particle artwork and seven sounds.',
                        excludedCharacterActions='Walk, celebration and death metadata are retained but not imported as rooftop artwork. The die row names barbarian_death_1 with no SWF; no source is guessed.',
                        preview='Original body/base plus direction-three idle Wizard at source origin; 360x380 at density two. This framing and rooftop placement are local and not verified native projection.',
                        sourceBlends='Normal=0, screen=4 and additive=8 retained with isolated container composition and post-composition RGB transforms.',
                        weapon='Tier one source speed is 500; tiers two through four are 900. All specify DontTrackTarget=TRUE, StartHeight=180 and StartOffset=70. Native timing and projectile height/offset semantics remain unverified.'))
    return outputs, dict(native=metadata, body=body_runtime, defender=actor_runtime, effect_art=effect_runtime,
                         combat=combat, effects=dict(effects=effects, particles=particles, projectiles=projectiles, sounds=sounds))


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
        target = ROOT / 'reference/wizard-tower' / (name + '.json')
        content = json.dumps(value, indent=2) + '\n'
        if args.check: require(target.read_text() == content, f'Reference differs: {name}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} original Wizard Tower assets and 17 source levels')


if __name__ == '__main__': main()
