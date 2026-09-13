#!/usr/bin/env python3
"""Retain the original Monolith levels, projectile tiers, effects and sounds.

Requires scripts/native_art/requirements.txt. Run with PYTHONPATH=scripts. --check
reconstructs every output pixel, sound byte and reference from fingerprint-verified
public client inputs and compares them byte for byte.
"""
import argparse
import hashlib
import json

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, BUNDLE, BASE, digest, source
from native_art.controlled_preview import compose_preview, controlled_nodes, pose_bounds
from native_art.sc6 import SC6, decode_sctx, require
from native_art.scene_graph import capture_graph, crop_textures
from native_art.source_csv import decoded_rows, inherited_levels, records

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'sc/buildings.sc': 'f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed',
    'sc/buildings_8.sctx': '588eba7d5739a5d9b53d3e14f2ab83bd170cad735363a81dd37bea7bcc0bb3bd',
    'sc/buildings_18.sctx': 'bd0c3b2eece3e9c43b2b3d61463e5b12ff4d274ae6adcc0ce33ceed63df58ffa',
    'sc/buildings_25.sctx': 'c290a82b3940513f16b55dba2305e875d923d4120c5997b6b6908c680ec8ca3d',
    'sc/buildings_35.sctx': '35e6392104e55ed6e6b2635da517d0a5df28c947b2a2e34fb39d1550faf88a97',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
    'logic/projectiles.csv': '71cda0e457ad88a6772f6421a22419b24d6bcf78d0ed305f09184404889a72dc',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'csv/particle_emitters.csv': '8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef',
    'sfx/building_destroyed_01.ogg': 'fd8295765aa86ff5c7c6be1159cd8fc97aed3c858c29fbdb1af5e3d5c5ce7f04',
    'sfx/explosive_arrow_01v2.ogg': '2743212b46001112a8dedbc1aee1c944389d21f3f1144ba9e1c5edf3a9b79e4e',
    'sfx/laser_loop_02.ogg': 'e954f6fe9012932ab48cabc6b6e1aa10e4d6f1ee26376915fd40582cc87e8dd0',
    'sfx/monolith_atk_sfx_01.ogg': '4923c7c54ad614cf619c8bc7e0c19e300193db4154ff1d07e0b20ebfb7c2553c',
    'sfx/monolith_atk_sfx_02.ogg': 'ba174cd645070219ced75945c5277b417a673aace10010c5ec994562c602cb1a',
    'sfx/monolith_atk_sfx_03.ogg': '138e6b0654332ab5f651c257b9861e4a4eae98d1188d81a72eb7fc4adf70352d',
    'sfx/monolith_pickup_01.ogg': '6b1a5813ce3283a678e569fc181cb8b8fa499f5e39bbb62c0b99e96733c1224d',
    'sfx/monolith_place_01.ogg': '621f4fb11f0c79c0d2e7288e9630341834d599189a9798ecdb6f890b7ec03588',
}
PREFIX = 'assets/buildings/monolith-native'
# Source units around the export origin, at pixel density two. Every level and turret frame fits.
PREVIEW_BOUNDS = [-90, -100, 90, 130]
PREVIEW_DIRECTION = 45
PREVIEW_VARIANT = 3
BODY_FIELDS = ['ExportName', 'ExportNameBase', 'ExportNameConstruction', 'ExportNameBuildAnim',
               'ExportNameUpgradeAnim', 'ExportNameDamaged']
EFFECT_FIELDS = ['AttackEffect', 'HitEffect', 'DestroyEffect', 'PickUpEffect', 'PlacingEffect']
PROJECTILE_EFFECT_FIELDS = ['Effect', 'SpawnEffect', 'DestroyedEffect']


def table(path):
    return records(decoded_rows(source(path, PINS)))


def number(row, key):
    return int(row[key])


def effect_closure(names, effects):
    pending, result = sorted(set(names)), {}
    while pending:
        name = pending.pop()
        if name in result:
            continue
        require(name in effects, f'Missing source effect: {name}')
        result[name] = effects[name]
        pending += [row['SpawnEffect'] for row in result[name] if row.get('SpawnEffect')]
    return dict(sorted(result.items()))


def emitter_rows(effects, extra, all_particles):
    names = {row['ParticleEmitter'] for rows in effects.values() for row in rows if row.get('ParticleEmitter')}
    names |= set(extra)
    result = {}
    for name in sorted(names):
        require(name in all_particles, f'Missing particle emitter: {name}')
        rows = all_particles[name]
        swf = rows[0].get('ParticleSwf')
        for row in rows:
            swf = row.get('ParticleSwf', swf)
            require(swf == 'sc/buildings.sc', 'Unexpected particle source')
        result[name] = rows
    return result


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client differs')
    members = {row['file']: row['sha'] for row in fingerprint['files']}
    for path in PINS:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, PINS)).hexdigest() == members[path], f'Fingerprint differs: {path}')
    building = table('logic/buildings.csv')['Monolith']
    levels = inherited_levels(building)
    first, second = levels[0], levels[1]
    require(first['GlobalID'] == '1000077' and len(levels) == 5, 'Monolith identity/levels differ')
    require((first['Width'], first['Height'], first['BuildingClass']) == ('3', '3', 'Defense'), 'Monolith footprint differs')
    expected = dict(Hitpoints='4747', AttackRange='1100', AttackSpeed='1500', CoolDownOverride='750', DPS='150',
                    DamagePermilHp='110', ProjectileVariantByTargetMaxHP='600;2500', DefaultProjectileVariant='3',
                    Projectile='MonolithProjectileMin;MonolithProjectileMed;MonolithProjectileMax',
                    HitEffect='Explosive Arrow', AttackEffect='Monolith Attack', DefenderCount='1', DefenderZ='155',
                    AnimationActionFrame='5', AirTargets='TRUE', GroundTargets='TRUE', ExportName='monolith_lvl_1',
                    ExportNameUpgradeAnim='monolith_lvl_1_upgrade', ExportNameBase='dark_tower_base',
                    ExportNameDamaged='destroyedBuilding_3l_base_rockwood')
    require(all(first[k] == v for k, v in expected.items()), 'Monolith level-one source facts differ')
    require((second['Hitpoints'], second['DPS'], second['DamagePermilHp'], second['ProjectileVariantByTargetMaxHP'],
             second['ExportName']) == ('5050', '175', '120', '650;2750', 'monolith_lvl_2'),
            'Monolith level-two source facts differ')
    projectile_names = first['Projectile'].split(';')
    require(all(v['Projectile'].split(';') == projectile_names for v in levels), 'Projectile tiers differ by level')
    all_projectiles = table('logic/projectiles.csv')
    projectiles = {name: all_projectiles[name] for name in projectile_names}
    for rows in projectiles.values():
        require(len(rows) == 1 and rows[0]['SWF'] == 'sc/buildings.sc', 'Unexpected projectile record')
    effects = effect_closure([v[k] for v in levels for k in EFFECT_FIELDS if v.get(k)] +
                             [rows[0][k] for rows in projectiles.values() for k in PROJECTILE_EFFECT_FIELDS if rows[0].get(k)],
                             table('logic/effects.csv'))
    particles = emitter_rows(effects, [rows[0]['ParticleEmitter'] for rows in projectiles.values()
                                       if rows[0].get('ParticleEmitter')], table('csv/particle_emitters.csv'))
    exports = {v[k] for v in levels for k in BODY_FIELDS}
    exports |= {rows[0]['ExportName'] for rows in projectiles.values()}
    exports |= {row['ParticleExportName'] for rows in particles.values() for row in rows if row.get('ParticleExportName')}
    sc = SC6(source('sc/buildings.sc', PINS))
    require(exports <= sc.exports.keys(), 'Missing source export')
    graph = capture_graph(sc, {name: sc.exports[name] for name in sorted(exports)})
    used = {texture for commands in graph['shapes'].values() for texture, _ in commands}
    require(used == {8, 18, 25, 35, 39}, 'Native texture membership differs')
    images = {t: decode_sctx(source('sc/' + sc.textures[t]['external'], PINS)) for t in sorted(used)}
    for t, image in images.items():
        require(image.size == (sc.textures[t]['width'], sc.textures[t]['height']), 'Texture dimensions differ')
    outputs, textures, runtime = crop_textures(graph, images, PREFIX)
    # Directional turret: 16 source views across 360 control frames, each holding a 25-frame attack clip.
    body = graph['clips'][str(graph['exports']['monolith_lvl_1'])]
    turret = graph['clips'][str(body['children'][body['names'].index('turret')])]
    require(len(turret['timeline']) == 360 and turret['names'] == [f'd{i}' for i in range(1, 17)],
            'Monolith turret controls differ')
    views = {}
    for slot, child in enumerate(turret['children']):
        clip = graph['clips'][str(child)]
        require(len(clip['timeline']) == 25 and clip['fps'] == 30, 'Monolith attack clip differs')
        require(sorted(n for n in clip['names'] if n) == ['projectile_0', 'projectile_1', 'projectile_2'],
                'Monolith orb variants differ')
        views[turret['names'][slot]] = child
    pixels = {t: np.array(im) / 255 for t, im in images.items()}
    width, height = (PREVIEW_BOUNDS[2] - PREVIEW_BOUNDS[0]) * 2, (PREVIEW_BOUNDS[3] - PREVIEW_BOUNDS[1]) * 2
    root = np.array([[2, 0, -PREVIEW_BOUNDS[0] * 2], [0, 2, -PREVIEW_BOUNDS[1] * 2], [0, 0, 1]], dtype=float)
    previews = {}
    for level in levels:
        # Every turret view and orb tier must fit the shared registered bounds.
        for direction in range(0, 360, 5):
            for variant in range(3):
                controls = {'turret': direction, **{f'projectile_{v}': False for v in range(3) if v != variant}}
                for phase in (0, 4):
                    controls.update({name: phase for name in views})
                    bounds = pose_bounds(controlled_nodes(graph, graph['exports'][level['ExportName']], 0,
                                                          np.eye(3), controls))
                    require(bounds[0] >= PREVIEW_BOUNDS[0] and bounds[1] >= PREVIEW_BOUNDS[1] and
                            bounds[2] < PREVIEW_BOUNDS[2] and bounds[3] < PREVIEW_BOUNDS[3],
                            'Monolith turret exceeds preview bounds')
        controls = {'turret': PREVIEW_DIRECTION,
                    **{f'projectile_{v}': False for v in range(3) if v != PREVIEW_VARIANT - 1}}
        poses = controlled_nodes(graph, graph['exports'][level['ExportNameBase']], 0, root)
        poses += controlled_nodes(graph, graph['exports'][level['ExportName']], 0, root, controls)
        image = Image.fromarray(compose_preview(poses, pixels, width, height), 'RGBA')
        path = f'{PREFIX}/preview-{level["BuildingLevel"]}.png'
        outputs[path] = image
        previews[level['BuildingLevel']] = dict(path=path, bounds=PREVIEW_BOUNDS, width=width, height=height,
                                                pixelsPerNativeUnit=2, direction=PREVIEW_DIRECTION,
                                                variant=PREVIEW_VARIANT, rgbaSha256=digest(image.tobytes()))
    sounds = {}
    for original in sorted({r['Sound'] for rows in effects.values() for r in rows if r.get('Sound')}):
        path = PREFIX + '/' + original.removeprefix('sfx/')
        outputs[path] = source(original, PINS)
        sounds[original] = dict(path=path, sha256=digest(outputs[path]))
    combat = dict(
        globalId=1000077, size=3, range=number(first, 'AttackRange'), attackSpeedMs=number(first, 'AttackSpeed'),
        coolDownOverrideMs=number(first, 'CoolDownOverride'), animationActionFrame=number(first, 'AnimationActionFrame'),
        defenderZ=number(first, 'DefenderZ'), airTargets=first['AirTargets'] == 'TRUE',
        groundTargets=first['GroundTargets'] == 'TRUE',
        levels=[dict(level=number(v, 'BuildingLevel'), townhall=number(v, 'TownHallLevel'), hp=number(v, 'Hitpoints'),
                     dps=number(v, 'DPS'), damagePermilHp=number(v, 'DamagePermilHp'),
                     variantThresholds=[int(x) for x in v['ProjectileVariantByTargetMaxHP'].split(';')],
                     defaultVariant=number(v, 'DefaultProjectileVariant'), body=v['ExportName'],
                     upgrade=v['ExportNameUpgradeAnim'], base=v['ExportNameBase'], ruin=v['ExportNameDamaged'],
                     construction=v['ExportNameConstruction'], buildAnim=v['ExportNameBuildAnim'],
                     attackEffect=v['AttackEffect'], hitEffect=v['HitEffect'], destroyEffect=v['DestroyEffect'])
                for v in levels],
        projectiles=[dict(name=name, export=rows[0]['ExportName'], speed=number(rows[0], 'Speed'),
                          scale=number(rows[0], 'Scale'), startHeight=number(rows[0], 'StartHeight'),
                          startOffset=number(rows[0], 'StartOffset'), tracksTarget=rows[0]['DontTrackTarget'] != 'TRUE',
                          rotates=rows[0]['UseRotate'] == 'TRUE', scaleTimeline=rows[0]['ScaleTimeline'] == 'TRUE',
                          trailEffect=rows[0]['Effect'], spawnEffect=rows[0]['SpawnEffect'],
                          destroyedEffect=rows[0]['DestroyedEffect'])
                     for name, rows in projectiles.items()])
    runtime['levels'] = combat['levels']
    runtime['projectiles'] = combat['projectiles']
    runtime['turretViews'] = views
    runtime['effects'] = effects
    runtime['particles'] = particles
    runtime['sounds'] = sounds
    catalog = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS, building=building,
                   projectiles=projectiles, effects=effects, particles=particles, sounds=sounds,
                   graphEvidence=dict(exports=graph['exports'], clips=len(graph['clips']), shapes=len(graph['shapes']),
                                      sha256=digest(json.dumps(graph, sort_keys=True, separators=(',', ':')).encode())),
                   textures=textures, previews=previews,
                   reconstruction=dict(
                       nativePlaybackVerified=False,
                       scope='All five Monolith bodies and upgrade overlays, shared base/scaffold/ruin, three projectile tiers, '
                             'every referenced particle export and eight referenced sounds.',
                       controls='turret selects one of 16 directional attack clips across 360 source frames; d1..d16 select the '
                                'attack clip phase; projectile_0..2 are the three orb tiers (min, med, max). Direction mapping '
                                'and orb-tier naming are local interpretations checked against rendered views.',
                       preview=f'Base plus body at turret frame {PREVIEW_DIRECTION} with orb tier {PREVIEW_VARIANT}, frame zero, '
                               'density two; registration is local.'))
    return outputs, {'catalog': catalog, 'runtime': runtime, 'combat': combat}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, references = build()
    folder = ROOT / 'public' / PREFIX
    if args.check:
        require({p.relative_to(ROOT / 'public').as_posix() for p in folder.rglob('*') if p.is_file()} == set(outputs),
                'Asset membership differs')
    for path, value in outputs.items():
        target = ROOT / 'public' / path
        if args.check:
            if isinstance(value, bytes):
                require(target.read_bytes() == value, f'Sound differs: {path}')
            else:
                with Image.open(target) as old:
                    require(old.mode == 'RGBA' and old.size == value.size and old.tobytes() == value.tobytes(),
                            f'Pixels differ: {path}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(value, bytes):
                target.write_bytes(value)
            else:
                value.save(target, optimize=True)
    for name, value in references.items():
        target = ROOT / 'reference/monolith' / (name + '.json')
        # The runtime scene graph is compact; readable source records keep indentation.
        content = (json.dumps(value, separators=(',', ':')) if name == 'runtime' else json.dumps(value, indent=2)) + '\n'
        if args.check:
            require(target.read_text() == content, f'Reference differs: {name}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} original Monolith assets and 5 source levels')


if __name__ == '__main__':
    main()
