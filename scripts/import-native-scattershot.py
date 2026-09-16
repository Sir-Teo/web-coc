#!/usr/bin/env python3
"""Preserve all seven original Scattershot levels, 24 aimed throw clips, projectiles and shard cone.

--check regenerates every source record, packed texel, preview and copied sound and compares
bytes. Combat/presentation interpretations are documented in reference/scattershot/README.md.
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
    'sc/buildings_8.sctx': '588eba7d5739a5d9b53d3e14f2ab83bd170cad735363a81dd37bea7bcc0bb3bd',
    'sc/buildings_25.sctx': 'c290a82b3940513f16b55dba2305e875d923d4120c5997b6b6908c680ec8ca3d',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
    'sc/buildings_45.sctx': 'ce0425622f22f1dade3fd1614e1c3ce5fabe4e09d9c5f32d014dd1f12cdc9287',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
    'logic/projectiles.csv': '71cda0e457ad88a6772f6421a22419b24d6bcf78d0ed305f09184404889a72dc',
    'logic/spells.csv': '385159e00327e6a1567cd91f1585b4ed0717d3f4475f0823398243482598289d',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'logic/mini_levels.csv': '548d592770d5e0799a13a9e70da9092da4e282d5293bba852f5e0424c78812d3',
    'csv/particle_emitters.csv': '8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef',
    'sfx/building_destroyed_01.ogg': 'fd8295765aa86ff5c7c6be1159cd8fc97aed3c858c29fbdb1af5e3d5c5ce7f04',
    'sfx/scattershot_atk_01.ogg': '2337ea8e9a7f69338523778c02beea3b61ba893f3173459a8ec86208a1ab76fe',
    'sfx/scattershot_atk_hit_01.ogg': 'b27f44da6f9bc0cd6ba201271da151fcc62a55817db74774c19d331c6b8e4695',
}
PREFIX = 'assets/buildings/scattershot-native'
NAME = 'Scattershot'
BATTLE_EFFECTS = ['Ice Breaker Attack', 'Ice Breaker Hit lvl1', 'Building Destroyed']
ART = dict(scale=1.2, anchorX=0, anchorY=80)
PREVIEW_TURRET = 225


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


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client fingerprint differs')
    members = {row['file']: row['sha'] for row in fingerprint['files']}
    for path in PINS:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, PINS)).hexdigest() == members[path], f'Fingerprint differs: {path}')
    rows = table('logic/buildings.csv')[NAME]
    require(len(rows) == 7 and rows[0]['GlobalID'] == '1000067', 'Scattershot identity/levels differ')
    levels = inherited_levels(rows)
    first = levels[0]
    require((first['Width'], first['Height'], first['BuildingClass']) == ('3', '3', 'Defense'), 'Footprint differs')
    all_projectiles = table('logic/projectiles.csv')
    projectile_names = [level['Projectile'] for level in levels]
    require(projectile_names == [f'Scattershot Projectile {i}' for i in range(1, 8)], 'Projectile identities differ')
    projectiles = {name: all_projectiles[name] for name in projectile_names}
    spells = table('logic/spells.csv')
    require({rows_[0]['HitSpell'] for rows_ in projectiles.values()} == {'Scattershot Hit Spell'}, 'Hit spell differs')
    hit_spell = spells['Scattershot Hit Spell']
    require(len(hit_spell) == 7 and hit_spell[0]['GlobalID'] == '26000030', 'Hit spell levels differ')
    for level, rows_ in enumerate(projectiles.values(), 1):
        require(rows_[0]['HitSpellLevel'] == str(level), 'Hit spell level mapping differs')
    spell_levels = inherited_levels(hit_spell)
    mini_levels = table('logic/mini_levels.csv')['Scattershot Mini Levels']
    all_effects = table('logic/effects.csv')
    effect_names = {v for row in rows for k, v in row.items() if k.endswith('Effect') and v in all_effects}
    effect_names |= {rows_[0]['Effect'] for rows_ in projectiles.values() if rows_[0].get('Effect')}
    effect_names |= {row['HitEffect'] for row in hit_spell if row.get('HitEffect')}
    effects = effect_closure(all_effects, effect_names)
    require(set(BATTLE_EFFECTS) <= set(effects), 'Battle effect set differs')
    all_particles = table('csv/particle_emitters.csv')
    emitter_names = {row['ParticleEmitter'] for rows_ in effects.values() for row in rows_ if row.get('ParticleEmitter')}
    emitter_names |= {rows_[0]['ParticleEmitter'] for rows_ in projectiles.values() if rows_[0].get('ParticleEmitter')}
    particles = {name: all_particles[name] for name in sorted(emitter_names)}

    sc = SC6(source('sc/buildings.sc', PINS))
    body = sorted({level[k] for level in levels for k in ('ExportName', 'ExportNameUpgradeAnim')})
    exports = set(body) | {first['ExportNameBase'], first['ExportNameDamaged']}
    for rows_ in projectiles.values():
        exports |= {rows_[0]['ExportName'], rows_[0]['ShadowExportName']}
    for rows_ in effects.values():
        for row in rows_:
            if row.get('ExportName'):
                require(row.get('SWF', 'sc/buildings.sc') == 'sc/buildings.sc', 'Unexpected effect SWF')
                exports.add(row['ExportName'])
    external_particles = {}
    for name, rows_ in particles.items():
        swf = rows_[0]['ParticleSwf']
        if swf != 'sc/buildings.sc':
            # The level-7 blue trail lives in sc/vfx_env.sc; its rows are retained but not rendered.
            require(name == 'e_scattershot_Trail_Blue' and swf == 'sc/vfx_env.sc', f'Unexpected particle SWF: {name}')
            external_particles[name] = swf
            continue
        for row in rows_:
            require(row.get('ParticleSwf', swf) == 'sc/buildings.sc', f'Unexpected particle SWF: {name}')
            exports.add(row['ParticleExportName'])
    require(exports <= sc.exports.keys(), 'Missing original export')
    graph = capture_graph(sc, {name: sc.exports[name] for name in sorted(exports)}, allowed_blends=(0, 3, 4, 8))
    used = sorted({t for commands in graph['shapes'].values() for t, _ in commands})
    require(used == [8, 25, 39, 45], f'Texture membership differs: {used}')
    images = {t: decode_sctx(source('sc/' + sc.textures[t]['external'], PINS)) for t in used}
    for t, image in images.items():
        require(image.size == (sc.textures[t]['width'], sc.textures[t]['height']), 'Texture dimensions differ')
    outputs, textures, runtime = crop_textures(graph, images, PREFIX)

    # Each 360-frame turret timeline holds 24 aimed throw clips of 15 frames. The named control
    # selects band*15 + throw phase; frame zero of every band is the loaded rest pose.
    directions = {}
    for level, row in enumerate(levels, 1):
        for field in ('ExportName', 'ExportNameUpgradeAnim'):
            clip = graph['clips'][str(graph['exports'][row[field]])]
            require(clip['names'].count('turret') == 1 and len(clip['timeline']) == 360, 'Turret root differs')
            turret = graph['clips'][str(clip['children'][clip['names'].index('turret')])]
            require(len(turret['timeline']) == 360 and turret['fps'] == 30, 'Turret timeline differs')
            bands = []
            for band in range(24):
                slots = {tuple(p[0] for p in turret['frames'][turret['timeline'][f]]) for f in range(band * 15, band * 15 + 15)}
                require(len(slots) == 1 and len(next(iter(slots))) == 1, 'Direction band placement differs')
                bands.append(turret['children'][next(iter(slots))[0]])
            if field == 'ExportName':
                # Levels 5-7 reuse throw clips between mirrored views through their placement matrices.
                require(len(set(bands)) >= 13, 'Direction bands collapsed')
                for child in bands:
                    require(len(graph['clips'][str(child)]['timeline']) == 15, 'Throw clip length differs')
            else:
                # Upgrade scaffolds reuse static shapes between symmetric views.
                require(all(str(child) in graph['shapes'] for child in bands), 'Upgrade direction views differ')
            directions[row[field]] = dict(views=24, frames=360, framesPerView=15, fps=30)
    cone = graph['clips'][str(graph['exports'][effects['Ice Breaker Hit lvl1'][0]['ExportName']])]
    require(cone['names'] == ['turret'] and len(graph['clips'][str(cone['children'][0])]['timeline']) == 360,
            'Shard cone rotation differs')

    draw_count = 0
    for id_, clip in graph['clips'].items():
        for frame in range(len(clip['timeline'])):
            try:
                draw_count += len(list(graph_draws(graph, int(id_), frame)))
            except ValueError as error:
                require('Additive group' in str(error), 'Unexpected graph playback failure')

    textures_float = {t: np.array(image, dtype=float) / 255 for t, image in images.items()}
    preview_draws, all_points, omitted = {}, [], {}
    for level, row in enumerate(levels, 1):
        draws = list(graph_draws(graph, graph['exports'][first['ExportNameBase']], 0))
        draws += list(graph_draws(graph, graph['exports'][row['ExportName']], 0, {'turret': PREVIEW_TURRET}))
        # Like the X-Bow portraits, transparent PNGs omit additive glints that need a live background.
        omitted[str(level)] = sum(b != 0 for *_, b in draws)
        require(all(b in (0, 8) for *_, b in draws), 'Portrait contains an unsupported blend')
        draws = [d for d in draws if d[4] == 0]
        preview_draws[level] = draws
        for _, vertices, matrix, _, _ in draws:
            all_points.extend((np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ matrix.T)[:, :2])
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
                                    turretFrame=PREVIEW_TURRET, pixelsPerSourceUnit=2, omittedAdditiveDraws=omitted[str(level)],
                                    rgbaSha256=digest(image.tobytes()))

    sounds = {}
    for name in BATTLE_EFFECTS:
        for row in effects[name]:
            if row.get('Sound'):
                original = row['Sound']
                path = PREFIX + '/' + original.removeprefix('sfx/')
                outputs[path] = source(original, PINS)
                sounds[original] = dict(path=path, sha256=digest(outputs[path]))

    projectile = projectiles['Scattershot Projectile 1'][0]
    combat = dict(
        globalId=int(first['GlobalID']), size=int(first['Width']),
        levels=[dict(level=int(v['BuildingLevel']), townhall=int(v['TownHallLevel']), hp=int(v['Hitpoints']),
                     dps=int(v['DPS']), spellDamage=int(spell_levels[i]['Damage']), spellMinDamage=int(spell_levels[i]['MinDamage']),
                     projectile=v['Projectile'], projectileExport=projectiles[v['Projectile']][0]['ExportName'],
                     trailEmitter=projectiles[v['Projectile']][0]['ParticleEmitter'], body=v['ExportName'],
                     upgrade=v['ExportNameUpgradeAnim'], animationActionFrame=int(v['AnimationActionFrame']))
                for i, v in enumerate(levels)],
        attackRange=int(first['AttackRange']), minAttackRange=int(first['MinAttackRange']),
        attackSpeedMs=int(first['AttackSpeed']), cooldownOverrideMs=int(first['CoolDownOverride']),
        newTargetAttackDelayMs=int(first['NewTargetAttackDelay']), damageRadius=int(first['DamageRadius']),
        ammunition=int(first['AmmoCount']), airTargets=first['AirTargets'] == 'TRUE',
        groundTargets=first['GroundTargets'] == 'TRUE',
        projectile={k: projectile[k] for k in ('Speed', 'StartHeight', 'StartOffset', 'IsBallistic', 'BallisticHeight',
                                               'TrajectoryStyle', 'FixedTravelTime', 'DamageDelay', 'UseRotate', 'UseTopLayer',
                                               'Scale', 'ShadowExportName', 'DontTrackTarget', 'SmoothDamage',
                                               'HitSpellInheritAffectType', 'RandomHitPositionOnCharacters')},
        hitSpell=dict(radius=int(hit_spell[0]['Radius']), coneAngle=int(hit_spell[0]['ConeAngle']),
                      minRadius=int(hit_spell[0]['MinRadius']), numberOfHits=int(hit_spell[0]['NumberOfHits']),
                      hitTimeMs=int(hit_spell[0]['HitTimeMS']), hitEffect=hit_spell[0]['HitEffect']),
        effects=dict(attack=first['AttackEffect'], destroy=first['DestroyEffect'], hit=hit_spell[0]['HitEffect']),
        exports=dict(base=first['ExportNameBase'], ruin=first['ExportNameDamaged'],
                     cone=effects['Ice Breaker Hit lvl1'][0]['ExportName'], shadow=projectile['ShadowExportName']),
        directions=directions, externalParticles=external_particles, miniLevels=mini_levels)
    require([level['dps'] for level in combat['levels']] == [125, 150, 170, 175, 180, 185, 190], 'DPS differs')
    require([level['spellDamage'] for level in combat['levels']] == [300, 360, 380, 400, 420, 440, 450], 'Shard damage differs')
    native = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS, building={NAME: rows},
                  projectiles=projectiles, hitSpell={'Scattershot Hit Spell': hit_spell}, miniLevels={'Scattershot Mini Levels': mini_levels},
                  effects=effects, particles=particles, world=dict(source='sc/buildings.sc', graph=graph, textures=textures),
                  previews=previews, sounds=sounds,
                  reconstruction=dict(liveIntegration=True, nativePlaybackVerified=False, diagnosticDrawCommands=draw_count,
                                      registration=ART, externalParticles=external_particles,
                                      scope='Seven bodies and upgrade bodies with 24 aimed throw clips, base, rubble, seven projectile/shadow pairs, shard cone and destruction effects.'))
    runtime['art'] = ART
    return outputs, dict(native=native, runtime=runtime, combat=combat,
                         effects=dict(effects=effects, particles=particles, sounds=sounds))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, references = build()
    folder = ROOT / 'public' / PREFIX
    if args.check:
        shipped = {p.relative_to(ROOT / 'public').as_posix() for p in folder.rglob('*') if p.is_file()}
        require(shipped == set(outputs), 'Scattershot asset membership differs')
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
        target = ROOT / 'reference/scattershot' / (name + '.json')
        content = json.dumps(value, indent=2) + '\n'
        if args.check:
            require(target.read_text() == content, f'Reference differs: {name}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} original Scattershot assets')


if __name__ == '__main__':
    main()
