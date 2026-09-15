#!/usr/bin/env python3
"""Preserve all seven original Eagle Artillery levels, activation clips, shells, beams and effects.

--check regenerates every source record, packed texel, preview and copied sound and compares
bytes. Combat/presentation interpretations are documented in reference/eagle-artillery/README.md.
"""
import argparse
import hashlib
import json

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, BUNDLE, BASE, digest, source
from native_art.sc6 import SC6, decode_sctx, rasterize, require
from native_art.scene_graph import capture_graph, crop_textures, graph_draws
from native_art.source_csv import decoded_rows, records, inherited_levels

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'sc/buildings.sc': 'f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed',
    'sc/building_bases.sc': '964584a104a31088dfa6bef53f6c2df7bc9e59e0b05d4354bbe8ac4431c49d9f',
    'sc/building_bases_0.sctx': '6bc35b86398b457643446ed8d86e24a1fe68d1daadf9155cfe94e13c4840d9fd',
    'sc/buildings_2.sctx': 'ff0f766b8d361eeb942384600ace1082a11c7c7404bed41d976fbafbdd2dc622',
    'sc/buildings_19.sctx': '26df2233dcb1d4470f9bf3f110dfd1d354361850181fb7b3c69d866aea9b7b7c',
    'sc/buildings_25.sctx': 'c290a82b3940513f16b55dba2305e875d923d4120c5997b6b6908c680ec8ca3d',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
    'logic/projectiles.csv': '71cda0e457ad88a6772f6421a22419b24d6bcf78d0ed305f09184404889a72dc',
    'logic/spells.csv': '385159e00327e6a1567cd91f1585b4ed0717d3f4475f0823398243482598289d',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'logic/characters.csv': '5c3acc5b46ff9e7978f406b540264e65c93a846b69d03cd43326a9853703cb89',
    'logic/heroes.csv': '658c9721fb0fd5488b69ca3555ef5597d521f28dde95af051a2a98ccbdd65197',
    'logic/globals.csv': '16210fc28bfb86d00ea04d581a99fe98e128172017b2d4f637b8848c0cf20087',
    'csv/particle_emitters.csv': '8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef',
    'sfx/ancient_explo_01.ogg': 'eeb8489f327d9b6dec5d7032f712dd30df1f1e2245a3f2fdb03e95d74eb497ea',
    'sfx/ancient_fire_02.ogg': '4f87389359b8392642a661a3be223e1dd8d4f38b0cc8b3d25ae7e10d99351a6d',
    'sfx/ancient_target_02.ogg': 'b74fb2d3712307999788e096febd38b1693c657acfa8b99b0bcb9f31ca1848d2',
    'sfx/building_destroyed_01.ogg': 'fd8295765aa86ff5c7c6be1159cd8fc97aed3c858c29fbdb1af5e3d5c5ce7f04',
    'sfx/mech_eagle_sad_no_ammo_01.ogg': '7600e40c633f2b8992c03c2159bdc416a734e18836959ce43a9d33b4642f0170',
    'sfx/mortar_hit_01.ogg': '3d54d10262b8ac7b59faef7a4c75a62c161855bb78ed90a2a02fb414f317d4cc',
}
PREFIX = 'assets/buildings/eagle-artillery-native'
NAME = 'Eagle Artillery'
# Only battle effects ship audio. Home handling (pickup/placing) and home rearming (load)
# rows stay in the reference, but the campaign-only defense never plays them.
BATTLE_EFFECTS = ['Artillery PreAttack', 'Artillery Attack', 'Ancient Hit', 'Artillery Hit',
                  'Artillery Trail', 'Artillery No Ammo', 'Building Destroyed']
TURRET_LABELS = ['idle', 'activating_start', '25', '50', '75', 'activating_end', 'battleidle_start',
                 'battleidle_end', 'attack_start', 'attack_end', 'load_start', 'load_end',
                 'deactivate_start', 'deactivating_end', 'empty']
TROOPS = {'swordsman': 'Barbarian', 'archer': 'Archer', 'giant': 'Giant', 'wizard': 'Wizard',
          'balloon': 'Balloon', 'goblin': 'Goblin', 'wallbreaker': 'Wall Breaker', 'healer': 'Healer',
          'dragon': 'Dragon', 'pekka': 'PEKKA'}
SPELLS = {'rage': 'Rage', 'heal': 'Healing', 'lightning': 'Lightning', 'freeze': 'Freeze',
          'invisibility': 'Invisibility', 'jump': 'Jump', 'clone': 'Clone',
          'recall': 'Recall', 'revive': 'Revive'}
HOUSING_GLOBALS = ['UNIT_HOUSING_COST_MULTIPLIER', 'SPELL_HOUSING_COST_MULTIPLIER', 'HERO_HOUSING_COST_MULTIPLIER',
                   'ALLIANCE_UNIT_HOUSING_COST_MULTIPLIER', 'PET_HOUSING_COST_MULTIPLIER',
                   'UNIT_HOUSING_COST_MULTIPLIER_FOR_TOTAL', 'SPELL_HOUSING_COST_MULTIPLIER_FOR_TOTAL',
                   'HERO_HOUSING_COST_MULTIPLIER_FOR_TOTAL', 'ALLIANCE_UNIT_HOUSING_COST_MULTIPLIER_FOR_TOTAL']
# Local world registration shared with the other 1.2-scale native building meshes.
ART = dict(scale=1.2, anchorX=0, anchorY=80)


def table(path):
    return records(decoded_rows(source(path, PINS)))


def effect_closure(all_effects, names):
    pending, result = set(names), {}
    while pending:
        name = pending.pop()
        if name in result:
            continue
        require(name in all_effects, f'Missing effect row: {name}')
        result[name] = all_effects[name]
        pending.update(row['SpawnEffect'] for row in result[name] if row.get('SpawnEffect'))
    return dict(sorted(result.items()))


def draw_points(draws):
    points = []
    for _, vertices, matrix, _, _ in draws:
        points.extend(np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ matrix.T)
    return np.array(points)[:, :2]


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client fingerprint differs')
    members = {row['file']: row['sha'] for row in fingerprint['files']}
    for path in PINS:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, PINS)).hexdigest() == members[path], f'Fingerprint differs: {path}')
    rows = table('logic/buildings.csv')[NAME]
    require(len(rows) == 7 and rows[0]['GlobalID'] == '1000031', 'Eagle Artillery identity/levels differ')
    levels = inherited_levels(rows)
    first = levels[0]
    require((first['Width'], first['Height'], first['BuildingClass']) == ('4', '4', 'Defense'), 'Footprint differs')
    all_projectiles = table('logic/projectiles.csv')
    projectile_names = [level['Projectile'] for level in levels]
    require(projectile_names == [f'Artillery Ammo{i}' for i in range(1, 8)], 'Projectile identities differ')
    projectiles = {name: all_projectiles[name] for name in projectile_names}
    spells = table('logic/spells.csv')
    hit_spell_name = {rows_[0]['HitSpell'] for rows_ in projectiles.values()}
    require(hit_spell_name == {'Eagle Artillery Hit Spell'}, 'Hit spell differs')
    hit_spell = spells['Eagle Artillery Hit Spell']
    require(len(hit_spell) == 7 and hit_spell[0]['GlobalID'] == '26000014', 'Hit spell levels differ')
    for level, (name, rows_) in enumerate(projectiles.items(), 1):
        require(rows_[0]['HitSpellLevel'] == str(level), 'Hit spell level mapping differs')
    all_effects = table('logic/effects.csv')
    effect_names = {v for row in rows for k, v in row.items() if k.endswith('Effect') and v in all_effects}
    effect_names |= {rows_[0]['Effect'] for rows_ in projectiles.values()}
    effect_names |= {row['HitEffect'] for row in hit_spell if row.get('HitEffect')}
    effects = effect_closure(all_effects, effect_names)
    require(set(BATTLE_EFFECTS) <= set(effects), 'Battle effect set differs')
    all_particles = table('csv/particle_emitters.csv')
    emitter_names = sorted({row['ParticleEmitter'] for rows_ in effects.values() for row in rows_ if row.get('ParticleEmitter')})
    particles = {name: all_particles[name] for name in emitter_names}
    characters = table('logic/characters.csv')
    heroes = table('logic/heroes.csv')
    housing = {kind: dict(source=name, housingSpace=int(characters[name][0]['HousingSpace']),
                          enemyGroupWeight=int(characters[name][0]['EnemyGroupWeight']))
               for kind, name in TROOPS.items()}
    king = heroes['Barbarian King'][0]
    hero = dict(source='Barbarian King', housingSpace=int(king['HousingSpace']), enemyGroupWeight=int(king['EnemyGroupWeight']))
    spell_housing = {kind: dict(source=name, housingSpace=int(spells[name][0]['HousingSpace'])) for kind, name in SPELLS.items()}
    globals_rows = decoded_rows(source('logic/globals.csv', PINS))
    header = globals_rows[0]
    globals_ = {row[0]: int(row[header.index('NumberValue')]) for row in globals_rows[2:] if row[0] in HOUSING_GLOBALS}
    require(sorted(globals_) == sorted(HOUSING_GLOBALS), 'Housing multiplier globals differ')

    sc = SC6(source('sc/buildings.sc', PINS))
    bases = SC6(source('sc/building_bases.sc', PINS))
    body = sorted({level[k] for level in levels for k in ('ExportName', 'ExportNameUpgradeAnim')})
    exports = set(body) | {first['ExportNameDamaged'], first['ExportNameBeamStart'], first['ExportNameBeamEnd']}
    exports |= {rows_[0]['ExportName'] for rows_ in projectiles.values()}
    for rows_ in effects.values():
        for row in rows_:
            if row.get('ExportName'):
                require(row.get('SWF', 'sc/buildings.sc') == 'sc/buildings.sc', 'Unexpected effect SWF')
                exports.add(row['ExportName'])
    for name, rows_ in particles.items():
        swf = rows_[0]['ParticleSwf']
        for row in rows_:
            swf = row.get('ParticleSwf', swf)
            require(swf == 'sc/buildings.sc', f'Unexpected particle SWF: {name}')
            exports.add(row['ParticleExportName'])
    require(exports <= sc.exports.keys(), 'Missing original export')
    # The pinned buildings.sc omits ExportNameBase; the client ships it in building_bases.sc.
    require(first['ExportNameBase'] not in sc.exports and first['ExportNameBase'] in bases.exports,
            'Eagle Artillery base location differs')
    graph = capture_graph(sc, {name: sc.exports[name] for name in sorted(exports)}, allowed_blends=(0, 3, 4, 8))
    base_graph = capture_graph(bases, {first['ExportNameBase']: bases.exports[first['ExportNameBase']]})
    used = sorted({t for commands in graph['shapes'].values() for t, _ in commands})
    require(used == [2, 19, 25, 39], f'Texture membership differs: {used}')
    require({t for commands in base_graph['shapes'].values() for t, _ in commands} == {0}, 'Base texture differs')
    images = {t: decode_sctx(source('sc/' + sc.textures[t]['external'], PINS)) for t in used}
    for t, image in images.items():
        require(image.size == (sc.textures[t]['width'], sc.textures[t]['height']), 'Texture dimensions differ')
    base_images = {0: decode_sctx(source('sc/building_bases_0.sctx', PINS))}
    require(base_images[0].size == (bases.textures[0]['width'], bases.textures[0]['height']), 'Base texture size differs')
    outputs, textures, runtime = crop_textures(graph, images, PREFIX)
    base_outputs, base_textures, base_runtime = crop_textures(base_graph, base_images, PREFIX + '/base')
    outputs.update(base_outputs)

    # Named activation/attack/load labels are engine-driven states, not a looping idle.
    turret = {}
    for level, row in enumerate(levels, 1):
        clip = graph['clips'][str(graph['exports'][row['ExportName']])]
        require(len(clip['timeline']) == 1 and clip['names'].count('turret_load') == 1, 'Static body root differs')
        child = graph['clips'][str(clip['children'][clip['names'].index('turret_load')])]
        labels = {label: frame for frame, label in child['labels']}
        require(list(labels) == TURRET_LABELS and len(child['timeline']) == 243 and child['fps'] == 24,
                f'Eagle Artillery level {level} turret labels differ')
        require([labels[k] for k in ('idle', 'activating_start', '25', '50', '75', 'activating_end')] ==
                [0, 1, 25, 50, 75, 100], 'Activation label frames differ')
        upgrade = graph['clips'][str(graph['exports'][row['ExportNameUpgradeAnim']])]
        require('turret_load' in upgrade['names'], 'Upgrade body lacks its turret')
        turret[str(level)] = dict(export=row['ExportName'], upgrade=row['ExportNameUpgradeAnim'], labels=labels)
    beams = {}
    for field in ('ExportNameBeamStart', 'ExportNameBeamEnd'):
        clip = graph['clips'][str(graph['exports'][first[field]])]
        labels = {label.lower(): frame for frame, label in clip['labels']}
        require(set(labels) == {'warmup', 'warmupend', 'loop', 'loopend', 'fadestart', 'fadeend'} and clip['fps'] == 24,
                'Beam labels differ')
        beams[field] = dict(export=first[field], frames=len(clip['timeline']), labels=labels)

    # Every clip frame must be reachable by the retained player without flattening groups.
    draw_count = 0
    for id_, clip in graph['clips'].items():
        for frame in range(len(clip['timeline'])):
            try:
                draw_count += len(list(graph_draws(graph, int(id_), frame)))
            except ValueError as error:
                require('Additive group' in str(error), 'Unexpected graph playback failure')

    # Static portraits: dormant turret frame zero over the original base shadow, common native
    # bounds (source units, 2x raster density). The world adapter supplies scale and anchor.
    textures_float = {t: np.array(image, dtype=float) / 255 for t, image in images.items()}
    textures_float['base'] = np.array(base_images[0], dtype=float) / 255
    preview_draws, all_points = {}, []
    for level, row in enumerate(levels, 1):
        draws = [('base', v, m, c, b) for _, v, m, c, b in graph_draws(base_graph, base_graph['exports'][first['ExportNameBase']], 0)]
        draws += list(graph_draws(graph, graph['exports'][row['ExportName']], 0, {'turret_load': 0}))
        require(all(b == 0 for *_, b in draws), 'Dormant portrait requires a blend compositor')
        preview_draws[level] = draws
        all_points.extend(draw_points(draws))
    box = np.array(all_points)
    bounds = [int(v) for v in [*np.floor(box.min(axis=0) - 4), *np.ceil(box.max(axis=0) + 4)]]
    require(bounds[2] - bounds[0] <= 256 and bounds[3] - bounds[1] <= 256, f'Preview bounds exceed raster limit: {bounds}')
    previews = {}
    for level, draws in preview_draws.items():
        image = rasterize([(t, v, np.diag([2, 2, 1]) @ m, c) for t, v, m, c, _ in draws], textures_float,
                          [v * 2 for v in bounds])
        path = f'{PREFIX}/preview-{level}.png'
        outputs[path] = image
        previews[str(level)] = dict(path=path, bounds=bounds, width=image.width, height=image.height,
                                    turretFrame=0, pixelsPerWorldPixel=2, rgbaSha256=digest(image.tobytes()))

    sounds = {}
    for name in BATTLE_EFFECTS:
        for row in effects[name]:
            if row.get('Sound'):
                original = row['Sound']
                path = PREFIX + '/' + original.removeprefix('sfx/')
                outputs[path] = source(original, PINS)
                sounds[original] = dict(path=path, sha256=digest(outputs[path]))

    def ms(value):
        return int(value) if value else 0

    combat = dict(
        globalId=int(first['GlobalID']), size=int(first['Width']),
        levels=[dict(level=int(v['BuildingLevel']), townhall=int(v['TownHallLevel']), hp=int(v['Hitpoints']),
                     damage=int(v['Damage']), spellDamage=int(hit_spell[i].get('Damage', hit_spell[0]['Damage'])),
                     projectile=v['Projectile'], projectileExport=projectiles[v['Projectile']][0]['ExportName'],
                     body=v['ExportName'], upgrade=v['ExportNameUpgradeAnim'])
                for i, v in enumerate(levels)],
        attackRange=int(first['AttackRange']), minAttackRange=int(first['MinAttackRange']),
        attackSpeedMs=int(first['AttackSpeed']), cooldownOverrideMs=int(first['CoolDownOverride']),
        damageRadius=int(first['DamageRadius']), pushback=int(first['Pushback']),
        pushbackHousingLimit=int(first['PushbackHousingLimit']), ammunition=int(first['AmmoCount']),
        targetGroups=first['TargetGroups'] == 'TRUE', targetGroupsRadius=int(first['TargetGroupsRadius']),
        wakeUpSpeedMs=int(first['WakeUpSpeed']), wakeUpSpace=int(first['WakeUpSpace']),
        burstCount=int(first['BurstCount']), burstDelayMs=int(first['BurstDelay']),
        airTargets=first['AirTargets'] == 'TRUE', groundTargets=first['GroundTargets'] == 'TRUE',
        projectile=dict((k, projectiles['Artillery Ammo1'][0][k]) for k in (
            'Speed', 'StartHeight', 'StartOffset', 'IsBallistic', 'BallisticHeight', 'TrajectoryStyle', 'FixedTravelTime',
            'DamageDelay', 'UseRotate', 'UseTopLayer', 'Scale', 'Effect', 'DontTrackTarget', 'HitSpellInheritAffectType')),
        hitSpell=dict(radius=int(hit_spell[0]['Radius']), numberOfHits=int(hit_spell[0]['NumberOfHits']),
                      timeBetweenHitsMs=ms(hit_spell[0].get('TimeBetweenHitsMS')), hitTimeMs=ms(hit_spell[0].get('HitTimeMS')),
                      deployTimeMs=ms(hit_spell[0].get('DeployTimeMS')), hitEffect=hit_spell[0]['HitEffect']),
        effects=dict(attack=first['AttackEffect'], hit=first['HitEffect'], preAttack=first['PreAttackEffect'],
                     noAmmo=first['NoAmmoEffect'], destroy=first['DestroyEffect'], trail=projectiles['Artillery Ammo1'][0]['Effect'],
                     spellHit=hit_spell[0]['HitEffect']),
        exports=dict(base=first['ExportNameBase'], ruin=first['ExportNameDamaged'], beamUp=first['ExportNameBeamStart'],
                     beamDown=first['ExportNameBeamEnd']),
        housing=dict(troops=housing, hero=hero, spells=spell_housing, globals=globals_),
        turret=turret, beams=beams)
    # Every inherited level must keep a unique projectile and increasing hit-spell damage.
    require([level['spellDamage'] for level in combat['levels']] == [225, 250, 275, 350, 425, 475, 525], 'Hit spell damage differs')
    require([level['damage'] for level in combat['levels']] == [20, 25, 30, 35, 40, 45, 50], 'Shockwave damage differs')
    native = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS, building={NAME: rows},
                  projectiles=projectiles, hitSpell={'Eagle Artillery Hit Spell': hit_spell}, effects=effects,
                  particles=particles, characters={name: characters[name] for name in TROOPS.values()},
                  heroes={'Barbarian King': heroes['Barbarian King']},
                  spells={name: spells[name] for name in SPELLS.values()}, globals=globals_,
                  world=dict(source='sc/buildings.sc', graph=graph, textures=textures),
                  base=dict(source='sc/building_bases.sc', graph=base_graph, textures=base_textures),
                  previews=previews, sounds=sounds,
                  reconstruction=dict(liveIntegration=True, nativePlaybackVerified=False, diagnosticDrawCommands=draw_count,
                                      registration=ART,
                                      scope='Seven bodies and upgrade bodies with named turret_load states, base shadow, rubble, beams, shells, hit, crater, trail, empty and destruction effects.'))
    runtime['art'] = ART
    return outputs, dict(native=native, runtime=runtime, base=base_runtime, combat=combat,
                         effects=dict(effects=effects, particles=particles, sounds=sounds))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, references = build()
    folder = ROOT / 'public' / PREFIX
    if args.check:
        shipped = {p.relative_to(ROOT / 'public').as_posix() for p in folder.rglob('*') if p.is_file()}
        require(shipped == set(outputs), 'Eagle Artillery asset membership differs')
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
        target = ROOT / 'reference/eagle-artillery' / (name + '.json')
        content = json.dumps(value, indent=2) + '\n'
        if args.check:
            require(target.read_text() == content, f'Reference differs: {name}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} original Eagle Artillery assets')


if __name__ == '__main__':
    main()
