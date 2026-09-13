#!/usr/bin/env python3
"""Preserve the late Goblin campaign buildings and the armed campaign Builder's Hut.

Communications Mast, Goblin Hall levels 1-2 (GoblinTh02 weapon), Goblin Castle,
Foreboding Cave and Goblin Boss Town Hall (GoblinBossTH weapon) form one family;
the Builder's Hut nail turret forms the second. --check regenerates every source
record, packed texel, preview, sound and reference byte from checksum-pinned inputs.
Native executable activation, targeting and projectile timing remain unverified.
"""
import argparse
import hashlib
import json
import runpy

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, BUNDLE, BASE, source, digest
from native_art.sc6 import SC6, decode_sctx, require
from native_art.scene_graph import capture_graph, crop_textures
from native_art.source_csv import decoded_rows, records, inherited_levels

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
    'logic/weapons.csv': '38f6891fd14c5287ede72f7a2e873e0648231bf63e29463a9b63f1b8142ec540',
    'logic/projectiles.csv': '71cda0e457ad88a6772f6421a22419b24d6bcf78d0ed305f09184404889a72dc',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'logic/globals.csv': '16210fc28bfb86d00ea04d581a99fe98e128172017b2d4f637b8848c0cf20087',
    'logic/heroes.csv': '658c9721fb0fd5488b69ca3555ef5597d521f28dde95af051a2a98ccbdd65197',
    'csv/particle_emitters.csv': '8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef',
    'sc/buildings.sc': 'f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed',
    'sc/characters.sc': '0e23bd3745176fe7db3d61e490d9da07c63a42e95462f514d6eac696314c3798',
    'sc/buildings_2.sctx': 'ff0f766b8d361eeb942384600ace1082a11c7c7404bed41d976fbafbdd2dc622',
    'sc/buildings_5.sctx': '6403f600eb8303935d63df9edfd7832ba8eb84d8fc4cd1ecf2f3788fc0285184',
    'sc/buildings_7.sctx': 'f5f6ace9e3740b73a326c34c15a107e0543fdca8afbaa02f5d530c459276a3a4',
    'sc/buildings_8.sctx': '588eba7d5739a5d9b53d3e14f2ab83bd170cad735363a81dd37bea7bcc0bb3bd',
    'sc/buildings_13.sctx': '79a67dd40bd2f5e3bd956e711f9ca77d6b548e6db528776390fb27c3602146bd',
    'sc/buildings_14.sctx': 'd194f9c0f1d52c99a4efe74890a07f9ce1bcaf5d70d4149baa5bdf61a9b8a432',
    'sc/buildings_25.sctx': 'c290a82b3940513f16b55dba2305e875d923d4120c5997b6b6908c680ec8ca3d',
    'sc/buildings_37.sctx': 'bf4e486ffcd139075200b4fdb7faa7849973d19878036b6b4d4659d505f5a195',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
    'sc/characters_7.sctx': 'e90c58ec5665bb886b64b2d2518fdf3aac08f229ba25dd913a2d89cc3e86c039',
    'sfx/gob_th_atk_01.ogg': 'fc0abfd3994287778fd71eb75a3fc1ff15ed8ca4da62ac9dec9e1284b00cfdbc',
    'sfx/gob_th_activate_01.ogg': '38d5844fafab2d66053153da6140dd5552186e8439b789c70f7280c61727f68a',
    'sfx/clash_b_nail_gun_02.ogg': 'fffa11e4c57ee68552fefc136755803d7360ea37cac85c1db42eba84d742d3d6',
    'sfx/generic_hit_01.ogg': '5fca48e71d21be79eb6d40a1ca1ad3a002e3d69ba72388b2eb6a4d2ec10e5934',
    'sfx/bomb_tower_atk_01.ogg': '62f742d51c4d00ca2586d87d952bd9e4613d5539b6c98444a6713d18a46c44fe',
    'sfx/bomb_tower_hit_01.ogg': '0320c2aeb7f412dace1acf16b4727ea44c04f93240f7c51486be5c23ae42bb84',
    'sfx/building_destroyed_01.ogg': 'fd8295765aa86ff5c7c6be1159cd8fc97aed3c858c29fbdb1af5e3d5c5ce7f04',
}
GOBLIN_PREFIX = 'assets/buildings/late-goblin-native'
HUT_PREFIX = 'assets/buildings/builder-hut-native'
SCENE = runpy.run_path(str(ROOT / 'scripts/import-native-cannon.py'))
CPU = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))
# Existing local world registration conventions: uniform body scale 1.2 with a native
# ground anchor, and the Goblin Town Hall foundation fitted to its local four-tile diamond.
WORLD_SCALE = 1.2
GOBLIN_HALL_BASE_BOUNDS = [-112.5, -15.85, 111.25, 178.95]
IDENTITIES = {
    'comm-mast': dict(name='Communications mast', globalId=1000016, size=2, anchor=[0, 40]),
    'goblin-hall': dict(name='Goblin Hall', globalId=1000017, size=4, anchor=[0, 80]),
    'goblin-castle': dict(name='Goblin Castle', globalId=1000061, size=3, anchor=[0, 80]),
    'foreboding-cave': dict(name='Foreboding Cave', globalId=1000062, size=4, anchor=[0, 80]),
    'goblin-boss-th': dict(name='Goblin Boss TH', globalId=1000069, size=4, anchor=[0, 80]),
}
HUT_ANCHOR = [0, 40]
BUILDING_FIELDS = ['ExportName', 'ExportNameBase', 'ExportNameDamaged']


def table(path):
    return records(decoded_rows(source(path, PINS)))


def number(row, key, default=0):
    return int(row[key]) if row.get(key) else default


def effect_closure(names, all_effects):
    effects, pending = {}, set(names)
    while pending:
        name = pending.pop()
        if name in effects: continue
        require(name in all_effects, f'Missing original effect: {name}')
        effects[name] = all_effects[name]
        pending.update(row['SpawnEffect'] for row in effects[name] if row.get('SpawnEffect'))
    return dict(sorted(effects.items()))


def particle_rows(effects, projectiles, all_particles):
    names = sorted({r['ParticleEmitter'] for rs in [*effects.values(), *projectiles.values()] for r in rs
                    if r.get('ParticleEmitter')})
    result = {n: all_particles[n] for n in names}
    exports = set()
    for rows in result.values():
        swf = rows[0]['ParticleSwf']
        for row in rows:
            swf = row.get('ParticleSwf', swf)
            require(swf == 'sc/buildings.sc', 'Unexpected particle source')
            if row.get('ParticleExportName'): exports.add(row['ParticleExportName'])
    return result, exports


def sounds_for(effects, prefix, outputs):
    sounds = {}
    for original in sorted({r['Sound'] for rs in effects.values() for r in rs if r.get('Sound')}):
        path = prefix + '/' + original.removeprefix('sfx/')
        outputs[path] = source(original, PINS)
        sounds[original] = dict(path=path, sha256=digest(outputs[path]))
    return sounds


def labels(graph, name):
    clip = graph['clips'][str(graph['exports'][name])]
    return {label: index for index, label in clip['labels']}


def capture(sc, names, textures, prefix, blends):
    require(set(names) <= sc.exports.keys(), 'Missing original export')
    graph = capture_graph(sc, {n: sc.exports[n] for n in sorted(names)}, allowed_blends=(0, 4, 8))
    require({b for c in graph['clips'].values() for b in c['blending']} == blends, 'Unexpected source blend')
    used = sorted({t for commands in graph['shapes'].values() for t, _ in commands})
    require(used == textures, f'Texture membership differs: {used}')
    images = {t: decode_sctx(source('sc/' + sc.textures[t]['external'], PINS)) for t in used}
    for t, image in images.items():
        require(image.size == (sc.textures[t]['width'], sc.textures[t]['height']), 'Texture dimensions differ')
    outputs, packed, runtime = crop_textures(graph, images, prefix + '/texture')
    source_pixels = {t: np.array(image) / 255 for t, image in images.items()}
    return graph, outputs, packed, runtime, source_pixels


def base_matrix(bounds, size, anchor):
    """Foundation fit expressed in native body units (inverse of the uniform body root)."""
    left, top, right, bottom = bounds
    sx, sy = size * 64 / (right - left), size * 32 / (bottom - top)
    return np.array([[sx / WORLD_SCALE, 0, -sx * (left + right) / 2 / WORLD_SCALE + anchor[0]],
                     [0, sy / WORLD_SCALE, -sy * (top + bottom) / 2 / WORLD_SCALE + anchor[1]], [0, 0, 1]])


def preview(graph, pixels, layers, anchor, path, outputs):
    """Two pixels per native body unit; framing is local, geometry and texels are original."""
    draws = []
    for name, matrix, controls, frame in layers:
        draws += SCENE['poses'](graph, name, frame, controls, matrix)
    xy = np.array(SCENE['points'](draws))
    bounds = [int(v) for v in [*np.floor(xy.min(axis=0) - 8), *np.ceil(xy.max(axis=0) + 8)]]
    width, height = 2 * (bounds[2] - bounds[0]), 2 * (bounds[3] - bounds[1])
    root = np.array([[2, 0, -bounds[0] * 2], [0, 2, -bounds[1] * 2], [0, 0, 1]])
    draws = []
    for name, matrix, controls, frame in layers:
        draws += SCENE['poses'](graph, name, frame, controls, root @ matrix)
    rgba = CPU['compose'](draws, pixels, max(width, height))
    rgba[:, :, :3] /= np.where(rgba[:, :, 3:4] > 0, rgba[:, :, 3:4], 1)
    image = Image.fromarray(np.round(np.clip(rgba, 0, 1) * 255).astype(np.uint8), 'RGBA').crop((0, 0, width, height))
    outputs[path] = image
    return dict(path=path, layers=[dict(export=n, matrix=m[:2].reshape(-1).tolist(), controls=c, frame=f)
                                   for n, m, c, f in layers],
                bounds=bounds, anchor=anchor, width=width, height=height, pixelsPerNativeUnit=2,
                worldScale=WORLD_SCALE, rgbaSha256=digest(image.tobytes()))


def weapon_record(row, building, projectile):
    speed = number(row, 'AttackSpeed')
    per_hit = number(row, 'DPS') * speed / 1000
    require(per_hit == int(per_hit), 'Fractional weapon hit damage')
    return dict(name=row['Name'], export=row['ExportName'], rangeSource=number(row, 'AttackRange'),
                intervalMs=speed, dps=number(row, 'DPS'), damagePerHit=int(per_hit),
                airTargets=row.get('AirTargets') == 'TRUE', groundTargets=row.get('GroundTargets') == 'TRUE',
                multiTargets=row.get('MultiTargets') == 'TRUE', numMultiTargets=number(row, 'NumMultiTargets'),
                damageRadiusSource=number(building, 'DamageRadius'), attackEffect=row.get('AttackEffect'),
                hitEffect=row.get('HitEffect'), activationEffect=row.get('ActivationEffect'),
                projectile=row['Projectile'], projectileExport=projectile['ExportName'],
                projectileSwf=projectile['SWF'], projectileSpeed=number(projectile, 'Speed'),
                startHeight=number(projectile, 'StartHeight'), startOffset=number(projectile, 'StartOffset'),
                ballisticHeight=number(projectile, 'BallisticHeight'),
                tracking=projectile.get('DontTrackTarget') != 'TRUE',
                rotate=projectile.get('UseRotate') == 'TRUE', scale=number(projectile, 'Scale', 100),
                trail=projectile.get('ParticleEmitter'), shadow=projectile.get('ShadowExportName'))


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client differs')
    membership = {v['file']: v['sha'] for v in fingerprint['files']}
    for path in PINS:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, PINS)).hexdigest() == membership[path], f'Fingerprint differs: {path}')
    buildings = table('logic/buildings.csv')
    weapons = table('logic/weapons.csv')
    all_projectiles = table('logic/projectiles.csv')
    all_effects = table('logic/effects.csv')
    all_particles = table('csv/particle_emitters.csv')
    globals_ = {row[0]: row[1:] for row in decoded_rows(source('logic/globals.csv', PINS))[2:] if row and row[0]}
    heroes = table('logic/heroes.csv')

    rows = {key: buildings[v['name']] for key, v in IDENTITIES.items()}
    for key, v in IDENTITIES.items():
        first = rows[key][0]
        require(first['GlobalID'] == str(v['globalId']) and first['Width'] == str(v['size']), f'{key} identity differs')
    mast, halls, castle, cave, boss = (rows[k] for k in IDENTITIES)
    require(len(mast) == 1 and mast[0]['BuildingClass'] == 'Npc' and mast[0]['Hitpoints'] == '250' and
            not mast[0].get('Weapon') and not mast[0].get('DPS'), 'Communications mast differs')
    require([mast[0][f] for f in BUILDING_FIELDS] == ['comm_mast_lvl1', 'comm_mast_base', 'destroyedBuilding_2s_pit_wood'],
            'Communications mast exports differ')
    hall_levels = inherited_levels(halls)
    require(len(halls) == 2 and [r['Hitpoints'] for r in hall_levels] == ['750', '7500'], 'Goblin Hall levels differ')
    require(hall_levels[0]['BuildingClass'] == 'Npc Town Hall' and hall_levels[0]['SecondaryTargetingClass'] == 'Resource' and
            hall_levels[0]['ActivatedCombatAddBuildingClass'] == 'Defense' and not hall_levels[0].get('Weapon'),
            'Goblin Hall level 1 differs')
    require([hall_levels[1][f] for f in ['ExportName', 'ActivateCombatOnDamageTaken', 'CombatActivationDelay', 'Weapon']] ==
            ['goblin_th02', '1', '500', 'GoblinTh02'], 'Goblin Hall level 2 activation differs')
    # The level-2 row also retains older inline Tesla fields; its Weapon reference supplies combat.
    require([halls[1][f] for f in ['DPS', 'AttackSpeed', 'AttackRange', 'AttackEffect', 'HitEffect']] ==
            ['120', '500', '1000', 'Tesla Attack_4', 'Tesla Hit'], 'Goblin Hall legacy row fields differ')
    require(len(castle) == 1 and [castle[0][f] for f in ['BuildingClass', 'Hitpoints', 'Bunker', 'HousingSpace', *BUILDING_FIELDS]] ==
            ['Npc', '4000', 'TRUE', '50', 'goblin_clancastle_01', 'alliance_castle_base', 'alliance_castle_lvl1_broken'],
            'Goblin Castle differs')
    require(len(cave) == 1 and [cave[0][f] for f in ['BuildingClass', 'Hitpoints', 'Bunker', *BUILDING_FIELDS]] ==
            ['Npc', '25000', 'TRUE', 'deco_dragoncave_01', 'alliance_castle_base', 'alliance_castle_lvl1_broken'],
            'Foreboding Cave differs')
    require(len(boss) == 1 and [boss[0].get(f) for f in
            ['BuildingClass', 'Hitpoints', 'DamageRadius', 'AnimationActionFrame', 'CombatActivationDelay',
             'ActivateCombatOnDamageTaken', 'ActivateAfterSeconds', 'ActivatedCombatAddBuildingClass', 'Weapon', *BUILDING_FIELDS]] ==
            ['Npc Town Hall', '50000', '100', '15', '500', None, None, 'Defense', 'GoblinBossTH',
             'goblin_clancastle_01', 'goblin_townhall_base', 'destroyedBuilding_4m_base_woodpanel_yellow'],
            'Goblin Boss Town Hall differs')
    th02, boss_weapon = weapons['GoblinTh02'], weapons['GoblinBossTH']
    require(len(th02) == 1 and len(boss_weapon) == 1, 'Goblin weapon levels differ')
    th02, boss_weapon = th02[0], boss_weapon[0]
    require([th02.get(f) for f in ['ExportName', 'AttackRange', 'AttackSpeed', 'DPS', 'MultiTargets', 'NumMultiTargets',
                                   'Projectile', 'AttackEffect', 'HitEffect', 'ActivationEffect', 'AirTargets', 'GroundTargets']] ==
            ['goblin_th02', '1000', '200', '150', 'TRUE', '3', 'Goblin Townhall Arrow', 'Goblin Townhall Attack',
             'Generic Hit', 'Goblin Townhall Activate', 'TRUE', 'TRUE'], 'GoblinTh02 differs')
    require([boss_weapon.get(f) for f in ['ExportName', 'AttackRange', 'AttackSpeed', 'DPS', 'MultiTargets', 'NumMultiTargets',
                                          'Projectile', 'AttackEffect', 'HitEffect', 'ActivationEffect', 'AirTargets', 'GroundTargets']] ==
            ['goblin_th02', '1100', '1100', '300', 'TRUE', None, 'Bomb Tower Ammo1', 'Bomb Tower Throw Start',
             'Bomb Tower Hit', None, 'FALSE', 'TRUE'], 'GoblinBossTH differs')

    huts = buildings['Builders Hut']
    hut_levels = inherited_levels(huts)
    require(huts[0]['GlobalID'] == '1000015' and huts[0]['Width'] == '2', "Builder's Hut identity differs")
    require([(r['ExportName'], r['Hitpoints'], r.get('DPS'), r.get('Projectile'), r.get('DefenceTroopLevel'))
             for r in hut_levels[:4]] ==
            [('worker_building', '250', None, None, None),
             ('worker_building_armed_lvl1', '1000', '80', 'Nail Ammo', '1'),
             ('worker_building_armed_lvl2', '1300', '100', 'Nail Ammo', '2'),
             ('worker_building_armed_lvl3', '1600', '120', 'Nail Ammo 2', '3')], "Builder's Hut armed tiers differ")
    for r in hut_levels[1:4]:
        require([r.get(f) for f in ['AttackRange', 'AttackSpeed', 'AttackEffect', 'HitEffect', 'AnimateTurret', 'AirTargets',
                                    'GroundTargets', 'WakeUpSpeed', 'WakeUpSpace', 'ActivatedCombatAddBuildingClass',
                                    'ExportNameBase', 'ExportNameDamaged', 'DefenceTroopCharacter', 'DefenceTroopCount']] ==
                ['700', '400', 'Nailgun Attack FX', 'Generic Hit', 'TRUE', 'TRUE', 'TRUE', '1600', '1',
                 'Defense', 'worker_building_base', 'rockWood_destructed_tiles2_battlebuilder', 'Defending Builder', '1'],
                "Builder's Hut weapon fields differ")
    require(hut_levels[0].get('WakeUpSpace') is None and hut_levels[0]['ExportNameDamaged'] == 'destroyedBuilding_2s_pit_wood_darkbrown',
            "Builder's Hut level 1 differs")
    for key, expected in [('UNIT_HOUSING_COST_MULTIPLIER', '100'), ('SPELL_HOUSING_COST_MULTIPLIER', '500'),
                          ('HERO_HOUSING_COST_MULTIPLIER', '100'), ('ALLIANCE_UNIT_HOUSING_COST_MULTIPLIER', '0'),
                          ('HIDDEN_BUILDING_APPEAR_DESTRUCTION_PERCENTAGE', '50')]:
        require(globals_[key][0] == expected, f'Global differs: {key}')
    require(heroes['Barbarian King'][0]['HousingSpace'] == '25', 'Hero housing differs')

    projectiles = {n: all_projectiles[n] for n in ['Goblin Townhall Arrow', 'Bomb Tower Ammo1']}
    hut_projectiles = {n: all_projectiles[n] for n in ['Nail Ammo', 'Nail Ammo 2']}
    require(projectiles['Goblin Townhall Arrow'][0]['SWF'] == 'sc/characters.sc' and
            projectiles['Bomb Tower Ammo1'][0]['SWF'] == 'sc/buildings.sc' and
            all(p[0]['SWF'] == 'sc/buildings.sc' for p in hut_projectiles.values()), 'Projectile source differs')
    goblin_effects = effect_closure(
        [th02['AttackEffect'], th02['HitEffect'], th02['ActivationEffect'], boss_weapon['AttackEffect'],
         boss_weapon['HitEffect'], *{r[0]['DestroyEffect'] for r in rows.values()}], all_effects)
    hut_effects = effect_closure([hut_levels[1]['AttackEffect'], hut_levels[1]['HitEffect'], hut_levels[1]['DestroyEffect']],
                                 all_effects)
    goblin_particles, goblin_particle_exports = particle_rows(goblin_effects, projectiles, all_particles)
    hut_particles, hut_particle_exports = particle_rows(hut_effects, hut_projectiles, all_particles)

    outputs = {}
    sc = SC6(source('sc/buildings.sc', PINS))
    goblin_exports = {'comm_mast_lvl1', 'comm_mast_lvl1_broken', 'comm_mast_base', 'comm_mast_broken_base',
                      'goblin_townhall_lvl1', 'goblin_th02', 'goblin_townhall_base', 'goblin_clancastle_01',
                      'deco_dragoncave_01', 'alliance_castle_base', 'alliance_castle_lvl1_broken',
                      'destroyedBuilding_2s_pit_wood', 'destroyedBuilding_4m_base_woodpanel_yellow',
                      projectiles['Bomb Tower Ammo1'][0]['ExportName'], projectiles['Bomb Tower Ammo1'][0]['ShadowExportName'],
                      *goblin_particle_exports}
    graph, assets, textures, runtime, pixels = capture(sc, goblin_exports, [2, 5, 8, 13, 14, 25, 37, 39], GOBLIN_PREFIX, {0, 8})
    outputs.update(assets)
    # The "broken" Communications Mast exports reuse the intact shapes; ExportNameDamaged supplies the ruin.
    mast_body = graph['clips'][str(graph['exports']['comm_mast_lvl1'])]
    require(mast_body['children'] == graph['clips'][str(graph['exports']['comm_mast_lvl1_broken'])]['children'] and
            graph['clips'][str(graph['exports']['comm_mast_base'])]['children'] ==
            graph['clips'][str(graph['exports']['comm_mast_broken_base'])]['children'], 'Broken mast exports differ')
    th02_labels = labels(graph, 'goblin_th02')
    require(th02_labels == {'deactive_idle': 0, 'active_start': 2, 'active_idle': 35} and
            len(graph['clips'][str(graph['exports']['goblin_th02'])]['timeline']) == 68, 'Goblin Hall activation timeline differs')
    cave_clip = graph['clips'][str(graph['exports']['deco_dragoncave_01'])]
    require(len(cave_clip['timeline']) == 60 and cave_clip['fps'] == 24, 'Foreboding Cave timeline differs')
    chars = SC6(source('sc/characters.sc', PINS))
    arrow = projectiles['Goblin Townhall Arrow'][0]['ExportName']
    char_graph, char_assets, char_textures, char_runtime, _ = capture(chars, {arrow}, [7], GOBLIN_PREFIX + '/characters', {0})
    outputs.update(char_assets)

    hut_exports = {'worker_building', 'worker_building_armed_lvl1', 'worker_building_armed_lvl2', 'worker_building_armed_lvl3',
                   'worker_building_base', 'destroyedBuilding_2s_pit_wood_darkbrown',
                   'rockWood_destructed_tiles2_battlebuilder', *(p[0]['ExportName'] for p in hut_projectiles.values()),
                   *hut_particle_exports}
    hut_graph, hut_assets, hut_textures, hut_runtime, hut_pixels = capture(sc, hut_exports, [7, 8, 25, 39], HUT_PREFIX, {0, 4})
    outputs.update(hut_assets)
    def sleep_timeline(name):
        """Only the three staggered Z sleep markers animate on the Builder's Hut root."""
        clip = hut_graph['clips'][str(hut_graph['exports'][name])]
        placements = {}
        for pattern in clip['timeline']:
            for slot, matrix, color in clip['frames'][pattern]:
                placements.setdefault(slot, set()).add((matrix, color))
        moving = sorted(slot for slot, values in placements.items() if len(values) > 1)
        require(len(moving) == 3 and len({clip['children'][s] for s in moving}) == 1 and
                all(clip['names'][s] == '' for s in moving), 'Builder\'s Hut root timeline differs')
        present = [f for f, pattern in enumerate(clip['timeline'])
                   if any(p[0] in moving for p in clip['frames'][pattern])]
        return dict(rootFrames=len(clip['timeline']), fps=clip['fps'], sleepFrames=[present[0], present[-1]],
                    awakeFrame=next(f for f, pattern in enumerate(clip['timeline'])
                                    if not any(p[0] in moving for p in clip['frames'][pattern])),
                    marker=clip['children'][moving[0]])

    hut_controls = {}
    for level, row in enumerate(hut_levels[1:4], 2):
        clip = hut_graph['clips'][str(hut_graph['exports'][row['ExportName']])]
        require(clip['names'][2:5] == ['turret_load', 'turret', 'builder_out'] and len(clip['timeline']) == 94, 'Armed hut layout differs')
        load = hut_graph['clips'][str(clip['children'][2])]
        turret = hut_graph['clips'][str(clip['children'][3])]
        require({label: i for i, label in load['labels']} == {'idle': 0, 'activating_start': 1, 'activating_end': 37, 'battleidle': 38},
                'Armed hut activation labels differ')
        # Level 3 (armed tier 2) repeats one adjacent view, so it retains 35 distinct placements.
        require(len(turret['timeline']) == 360 and len(turret['frames']) == (35 if level == 3 else 36) and
                all(turret['timeline'][f] == turret['timeline'][f - f % 10] for f in range(360)), 'Armed hut turret frames differ')
        hut_controls[level] = sleep_timeline(row['ExportName'])
    require(len({json.dumps(v) for v in hut_controls.values()}) == 1, 'Armed hut sleep timelines differ')
    plain = hut_graph['clips'][str(hut_graph['exports']['worker_building'])]
    require('builder_out' in plain['names'] and sleep_timeline('worker_building') == hut_controls[2],
            'Plain hut layout differs')

    # Previews: frame zero, dormant/idle controls, source bases, local 1.2 world scale.
    identity = np.eye(3)
    goblin_previews = {}
    hall_base = base_matrix(GOBLIN_HALL_BASE_BOUNDS, 4, IDENTITIES['goblin-hall']['anchor'])
    for key, layers in [
        ('comm-mast', [('comm_mast_base', identity, {}, 0), ('comm_mast_lvl1', identity, {}, 0)]),
        ('goblin-hall-1', [('goblin_townhall_base', hall_base, {}, 0), ('goblin_townhall_lvl1', identity, {}, 0)]),
        ('goblin-th02', [('goblin_townhall_base', hall_base, {}, 0), ('goblin_th02', identity, {}, 0)]),
        ('goblin-castle', [('alliance_castle_base', identity, {'shadow_edit': False}, 0), ('goblin_clancastle_01', identity, {}, 0)]),
        ('foreboding-cave', [('alliance_castle_base', identity, {'shadow_edit': False}, 0), ('deco_dragoncave_01', identity, {}, 0)]),
    ]:
        anchor = IDENTITIES['comm-mast' if key == 'comm-mast' else 'goblin-hall']['anchor']
        goblin_previews[key] = preview(graph, pixels, layers, anchor, f'{GOBLIN_PREFIX}/{key}.png', outputs)
    hut_previews = {}
    dormant = {'turret_load': 0, 'turret': False, 'builder_out': False}
    for level, row in enumerate(hut_levels[:4], 1):
        controls = dormant if level > 1 else {'builder_out': False}
        hut_previews[str(level)] = preview(hut_graph, hut_pixels, [('worker_building_base', identity, {}, 0),
                                                                    (row['ExportName'], identity, controls, 0)],
                                           HUT_ANCHOR, f'{HUT_PREFIX}/level-{level}.png', outputs)

    goblin_sounds = sounds_for(goblin_effects, GOBLIN_PREFIX, outputs)
    hut_sounds = sounds_for(hut_effects, HUT_PREFIX, outputs)
    fingerprint_members = {p: membership[p] for p in PINS if p != 'fingerprint.json'}
    goblin_native = dict(
        clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS, fingerprintMembership=fingerprint_members,
        buildings={v['name']: rows[k] for k, v in IDENTITIES.items()}, weapons=dict(GoblinTh02=th02, GoblinBossTH=boss_weapon),
        projectiles=projectiles, effects=goblin_effects, particles=goblin_particles,
        world=dict(source='sc/buildings.sc', graph=graph, textures=textures),
        characters=dict(source='sc/characters.sc', graph=char_graph, textures=char_textures),
        previews=goblin_previews, sounds=goblin_sounds,
        reconstruction=dict(
            liveIntegration=True, nativePlaybackVerified=False,
            weapon='Goblin Hall level 2 combat uses its Weapon=GoblinTh02 record. Its inline DPS=120/AttackSpeed=500/Tesla effect fields are retained as evidence only.',
            bossBody='Goblin Boss TH retains ExportName goblin_clancastle_01, but weapon-bearing halls display the weapon export and its deactive/active labels (goblin_th02), as the multi-level Townhall17 weapon exports do.',
            registration='Uniform body scale 1.2 with native ground anchors (0, 40) for 2x2 and (0, 80) for 3x3/4x4; goblin_townhall_base is fitted to the local four-tile diamond. Local, not native camera parity.'))
    hut_native = dict(
        clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS, fingerprintMembership=fingerprint_members,
        buildings={'Builders Hut': huts[:4]}, projectiles=hut_projectiles, effects=hut_effects, particles=hut_particles,
        world=dict(source='sc/buildings.sc', graph=hut_graph, textures=hut_textures), previews=hut_previews, sounds=hut_sounds,
        reconstruction=dict(
            liveIntegration=True, nativePlaybackVerified=False,
            scope='Campaign Builder\'s Huts 1-4 with the armed turret tiers 2-4; the Defending Builder character is excluded.',
            controls='turret_load idle/activating/battleidle labels, 36 turret directions (10 frames each) and builder_out are retained; the sleeping Z root timeline is the only animated root placement.'))

    def building_art(row, key):
        return dict(body=row['ExportName'], base=row['ExportNameBase'], ruin=row['ExportNameDamaged'],
                    destroyEffect=row['DestroyEffect'], size=int(row['Width']), anchor=IDENTITIES[key]['anchor'])

    goblin_combat = dict(
        worldScale=WORLD_SCALE, goblinHallBaseBounds=GOBLIN_HALL_BASE_BOUNDS,
        identities={
            'comm-mast': dict(hp=[250], **building_art(mast[0], 'comm-mast')),
            'goblin-hall': dict(hp=[int(r['Hitpoints']) for r in hall_levels],
                                levels=[building_art(r, 'goblin-hall') for r in hall_levels]),
            'goblin-castle': dict(hp=[4000], **building_art(castle[0], 'goblin-castle')),
            'foreboding-cave': dict(hp=[25000], **building_art(cave[0], 'foreboding-cave')),
            'goblin-boss-th': dict(hp=[50000], **building_art(boss[0], 'goblin-boss-th'),
                                   animationActionFrame=number(boss[0], 'AnimationActionFrame')),
        },
        weapons={
            'goblin-hall': dict(**weapon_record(th02, hall_levels[1], projectiles['Goblin Townhall Arrow'][0]),
                                level=2, activateOnDamage=True, activationDelayMs=number(hall_levels[1], 'CombatActivationDelay'),
                                addBuildingClass=hall_levels[1]['ActivatedCombatAddBuildingClass']),
            'goblin-boss-th': dict(**weapon_record(boss_weapon, boss[0], projectiles['Bomb Tower Ammo1'][0]),
                                   level=1, activateOnDamage=False, activationDelayMs=number(boss[0], 'CombatActivationDelay'),
                                   addBuildingClass=boss[0]['ActivatedCombatAddBuildingClass']),
        },
        timeline=dict(export='goblin_th02', fps=24, frames=68, labels=th02_labels, flagFrames=24),
        caveTimeline=dict(export='deco_dragoncave_01', fps=24, frames=60),
        hiddenBuildingAppearDestructionPercentage=int(globals_['HIDDEN_BUILDING_APPEAR_DESTRUCTION_PERCENTAGE'][0]),
        previews={k: {f: v[f] for f in ('path', 'bounds', 'anchor', 'width', 'height')} for k, v in goblin_previews.items()})
    hut_combat = dict(
        worldScale=WORLD_SCALE, anchor=HUT_ANCHOR,
        levels=[dict(level=int(r['BuildingLevel']), hp=int(r['Hitpoints']), dps=number(r, 'DPS'), body=r['ExportName'],
                     base=r['ExportNameBase'], ruin=r['ExportNameDamaged'], destroyEffect=r['DestroyEffect'],
                     projectile=r.get('Projectile'), defenceTroop=r.get('DefenceTroopCharacter'),
                     defenceTroopLevel=number(r, 'DefenceTroopLevel') or None) for r in hut_levels[:4]],
        weapon=dict(rangeSource=number(hut_levels[1], 'AttackRange'), intervalMs=number(hut_levels[1], 'AttackSpeed'),
                    airTargets=True, groundTargets=True, attackEffect=hut_levels[1]['AttackEffect'],
                    hitEffect=hut_levels[1]['HitEffect'], wakeUpSpace=number(hut_levels[1], 'WakeUpSpace'),
                    wakeUpSpeedMs=number(hut_levels[1], 'WakeUpSpeed'),
                    addBuildingClass=hut_levels[1]['ActivatedCombatAddBuildingClass'],
                    projectiles={n: dict(export=p[0]['ExportName'], speed=number(p[0], 'Speed'),
                                         startHeight=number(p[0], 'StartHeight'), startOffset=number(p[0], 'StartOffset'),
                                         ballisticHeight=number(p[0], 'BallisticHeight'),
                                         tracking=p[0].get('DontTrackTarget') != 'TRUE', topLayer=p[0].get('UseTopLayer') == 'TRUE')
                                 for n, p in hut_projectiles.items()}),
        housing=dict(unit=int(globals_['UNIT_HOUSING_COST_MULTIPLIER'][0]), spell=int(globals_['SPELL_HOUSING_COST_MULTIPLIER'][0]),
                     hero=int(globals_['HERO_HOUSING_COST_MULTIPLIER'][0]), alliance=int(globals_['ALLIANCE_UNIT_HOUSING_COST_MULTIPLIER'][0]),
                     barbarianKing=int(heroes['Barbarian King'][0]['HousingSpace'])),
        turret=dict(frames=360, directions=36, load=dict(idle=0, activatingStart=1, activatingEnd=37, battleIdle=38)),
        sleep=hut_controls[2],
        previews={k: {f: v[f] for f in ('path', 'bounds', 'anchor', 'width', 'height')} for k, v in hut_previews.items()})
    documents = {
        'reference/late-goblin-buildings/native.json': goblin_native,
        'reference/late-goblin-buildings/runtime.json': runtime,
        'reference/late-goblin-buildings/characters-runtime.json': char_runtime,
        'reference/late-goblin-buildings/combat.json': goblin_combat,
        'reference/late-goblin-buildings/effects.json': dict(effects=goblin_effects, particles=goblin_particles, sounds=goblin_sounds),
        'reference/builder-hut/native.json': hut_native,
        'reference/builder-hut/runtime.json': hut_runtime,
        'reference/builder-hut/combat.json': hut_combat,
        'reference/builder-hut/effects.json': dict(effects=hut_effects, particles=hut_particles, sounds=hut_sounds),
    }
    return outputs, documents


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, documents = build()
    if args.check:
        for prefix in (GOBLIN_PREFIX, HUT_PREFIX):
            folder = ROOT / 'public' / prefix
            actual = {p.relative_to(ROOT / 'public').as_posix() for p in folder.rglob('*') if p.is_file()}
            require(actual == {p for p in outputs if p.startswith(prefix + '/')}, f'Asset membership differs: {prefix}')
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
    for path, value in documents.items():
        target = ROOT / path
        content = json.dumps(value, indent=2) + '\n'
        if args.check: require(target.read_text() == content, f'Reference differs: {path}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} late Goblin building and Builder\'s Hut assets')


if __name__ == '__main__': main()
