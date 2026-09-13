#!/usr/bin/env python3
"""Retain the original Spell Tower levels, spell weapons, bottles, spell areas and sounds.

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
    'sc/buildings_1.sctx': 'e931b617d748a541da10cfe7126b8b3fb77d13486ae0d97beb4abde2ef828f4a',
    'sc/buildings_8.sctx': '588eba7d5739a5d9b53d3e14f2ab83bd170cad735363a81dd37bea7bcc0bb3bd',
    'sc/buildings_17.sctx': 'bce86a6857d43a6705833a6cb0a5ec269d8ff9990e8e15c5b9011422d59ab201',
    'sc/buildings_25.sctx': 'c290a82b3940513f16b55dba2305e875d923d4120c5997b6b6908c680ec8ca3d',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
    'logic/weapons.csv': '38f6891fd14c5287ede72f7a2e873e0648231bf63e29463a9b63f1b8142ec540',
    'logic/projectiles.csv': '71cda0e457ad88a6772f6421a22419b24d6bcf78d0ed305f09184404889a72dc',
    'logic/spells.csv': '385159e00327e6a1567cd91f1585b4ed0717d3f4475f0823398243482598289d',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'logic/globals.csv': '16210fc28bfb86d00ea04d581a99fe98e128172017b2d4f637b8848c0cf20087',
    'csv/particle_emitters.csv': '8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef',
    'sfx/bottle_rage_magic_07v2.ogg': '0bc863901ae01414498d7c5a7bbcd37500fd6ef7b11769c13479e1dc6856693e',
    'sfx/building_destroyed_01.ogg': 'fd8295765aa86ff5c7c6be1159cd8fc97aed3c858c29fbdb1af5e3d5c5ce7f04',
    'sfx/generic_hit_01.ogg': '5fca48e71d21be79eb6d40a1ca1ad3a002e3d69ba72388b2eb6a4d2ec10e5934',
    'sfx/invis_spell_01.ogg': '266ee80074c090c734ea9481bff5b86a08eb1d07208730ee2ec3a8faa0b553c9',
    'sfx/spell_tower_pickup_01.ogg': '4a085542b96e93b8492df95fd1bd965fb2b58ce757dca1e98a576d147b50e363',
    'sfx/spell_tower_place_01.ogg': '4023132f45b405ac78105566b01f973a8b4a0e3dddc6a5d23dbcf99708ea4951',
    'sfx/vial_poison_hit_gound_01.ogg': 'b32c7facbb20c61c06b6a4c97dee8b59978e514a52f3753203f7dd90e3da8c04',
}
PREFIX = 'assets/buildings/spell-tower-native'
PREVIEW_BOUNDS = [-70, -70, 70, 90]
WEAPONS = {'rage': ('SpellTowerRage', 49000009), 'poison': ('SpellTowerPoison', 49000008),
           'invisibility': ('SpellTowerInvisibility', 49000007)}
# The load segment length differs by weapon; every other state label is shared.
STATE_LABELS = {'activating_start': 0, 'activating_end': 1, 'idle': 2, 'attack_start': 3, 'attack_end': 32,
                'load_start': 33}
LOAD_END = {'rage': 1235, 'poison': 1473, 'invisibility': 993}
BODY_FIELDS = ['ExportName', 'ExportNameBase', 'ExportNameConstruction', 'ExportNameBuildAnim', 'ExportNameDamaged']
EFFECT_FIELDS = ['HitEffect', 'DestroyEffect', 'PickUpEffect', 'PlacingEffect']


def table(path):
    return records(decoded_rows(source(path, PINS)))


def number(row, key, default=None):
    if key not in row:
        require(default is not None, f'Missing numeric source field: {key}')
        return default
    return int(row[key])


def flag(row, key):
    return row.get(key) == 'TRUE'


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


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client differs')
    members = {row['file']: row['sha'] for row in fingerprint['files']}
    for path in PINS:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, PINS)).hexdigest() == members[path], f'Fingerprint differs: {path}')
    building = table('logic/buildings.csv')['Spell Tower']
    levels = inherited_levels(building)
    first = levels[0]
    require(first['GlobalID'] == '1000072' and len(levels) == 4, 'Spell Tower identity/levels differ')
    require((first['Width'], first['Height'], first['BuildingClass'], first['AttackRange'], first['ExportNameBase']) ==
            ('2', '2', 'Defense', '800', 'dark_tower_base'), 'Spell Tower source facts differ')
    require([v['Hitpoints'] for v in levels] == ['2500', '2800', '3100', '3200'], 'Spell Tower hitpoints differ')
    require([v['ExportName'] for v in levels] ==
            ['spell_tower_lvl1', 'spell_tower_lvl2_rage', 'spell_tower_lvl3_rage', 'spell_tower_lvl4_earthquake'],
            'Spell Tower exports differ')
    require([v['UnlockWeaponMode'] for v in levels] ==
            ['SpellTowerRage', 'SpellTowerPoison', 'SpellTowerInvisibility', 'SpellTowerEarthquake'],
            'Spell Tower weapon unlocks differ')
    require(all(v['TargetingImmunityTotems'] == 'TRUE' for v in levels), 'Totem immunity differs')
    weapon_table = table('logic/weapons.csv')
    order = list(weapon_table)
    weapons, projectiles, spells = {}, {}, {}
    all_projectiles, all_spells = table('logic/projectiles.csv'), table('logic/spells.csv')
    for key, (name, global_id) in WEAPONS.items():
        rows = weapon_table[name]
        require(49000000 + order.index(name) == global_id, f'Weapon GlobalID differs: {name}')
        require([r['Level'] for r in rows] == ['1', '2', '3', '4'] and
                [r['ExportName'] for r in rows] == [f'spell_tower_lvl{i}_{key}' for i in range(1, 5)],
                f'Weapon levels differ: {name}')
        weapons[key] = rows
        projectile = rows[0]['Projectile']
        projectiles[key] = all_projectiles[projectile]
        require(len(projectiles[key]) == 1, 'Unexpected projectile variants')
        spell = projectiles[key][0]['HitSpell']
        spells[key] = all_spells[spell]
        require(len(spells[key]) == 1 and projectiles[key][0]['HitSpellLevel'] == '1', 'Spell levels differ')
    rage, poison, invisibility = (weapons[k][0] for k in ('rage', 'poison', 'invisibility'))
    require((rage['AttackRange'], rage['AttackSpeed'], rage['CoolDownOverride'], rage['SelfAsAoeCenter'],
             rage['AttackCenterOnDeath'], rage['CopyOwnerUpgradeLevel']) == ('900', '70000', '68800', 'TRUE', 'TRUE', 'TRUE'),
            'Rage weapon differs')
    require((poison['AttackRange'], poison['AttackSpeed'], poison['CoolDownOverride'], poison.get('SelfAsAoeCenter'),
             poison['AttackCenterOnDeath']) == ('900', '70000', '68800', None, 'TRUE'), 'Poison weapon differs')
    require((invisibility['AttackRange'], invisibility['AttackSpeed'], invisibility['CoolDownOverride'],
             invisibility['SelfAsAoeCenter'], invisibility['CustomTargetHitBuildingInRange'],
             invisibility['AttackCenterOnDeath'], invisibility['CopyOwnerUpgradeLevel']) ==
            ('450', '50000', '48800', 'TRUE', 'TRUE', 'TRUE', 'TRUE'), 'Invisibility weapon differs')
    globals_table = table('logic/globals.csv')
    hero = dict(rage=number(globals_table['HERO_RAGE_MULTIPLIER'][0], 'NumberValue'),
                speed=number(globals_table['HERO_RAGE_SPEED_MULTIPLIER'][0], 'NumberValue'))
    effect_names = [v[k] for v in levels for k in EFFECT_FIELDS if v.get(k)]
    for key in WEAPONS:
        effect_names += [projectiles[key][0][k] for k in ('Effect', 'SpawnEffect', 'DestroyedEffect')
                         if projectiles[key][0].get(k)]
        effect_names += [spells[key][0][k] for k in ('DeployEffect', 'DeployEffect2', 'PreDeployEffect',
                                                      'ChargingEffect', 'HitEffect') if spells[key][0].get(k)]
    effects = effect_closure(effect_names, table('logic/effects.csv'))
    all_particles = table('csv/particle_emitters.csv')
    emitter_names = {row['ParticleEmitter'] for rows in effects.values() for row in rows if row.get('ParticleEmitter')}
    emitter_names |= {projectiles[k][0]['ParticleEmitter'] for k in WEAPONS if projectiles[k][0].get('ParticleEmitter')}
    particles = {}
    for name in sorted(emitter_names):
        rows = all_particles[name]
        swf = rows[0].get('ParticleSwf')
        for row in rows:
            swf = row.get('ParticleSwf', swf)
            require(swf == 'sc/buildings.sc', 'Unexpected particle source')
        particles[name] = rows
    exports = {v[k] for v in levels for k in BODY_FIELDS}
    exports |= {row['ExportName'] for rows in weapons.values() for row in rows}
    exports |= {rows[0]['ExportName'] for rows in projectiles.values()}
    exports |= {row['ParticleExportName'] for rows in particles.values() for row in rows if row.get('ParticleExportName')}
    sc = SC6(source('sc/buildings.sc', PINS))
    require(exports <= sc.exports.keys(), 'Missing source export')
    graph = capture_graph(sc, {name: sc.exports[name] for name in sorted(exports)})
    used = {texture for commands in graph['shapes'].values() for texture, _ in commands}
    require(used == {1, 8, 17, 25, 39}, f'Native texture membership differs: {sorted(used)}')
    images = {t: decode_sctx(source('sc/' + sc.textures[t]['external'], PINS)) for t in sorted(used)}
    for t, image in images.items():
        require(image.size == (sc.textures[t]['width'], sc.textures[t]['height']), 'Texture dimensions differ')
    outputs, textures, runtime = crop_textures(graph, images, PREFIX)
    for key, rows in weapons.items():
        for row in rows:
            clip = graph['clips'][str(graph['exports'][row['ExportName']])]
            require(clip['names'].count('turret_load') == 1, 'Spell Tower state control differs')
            state = graph['clips'][str(clip['children'][clip['names'].index('turret_load')])]
            require({label: frame for frame, label in state['labels']} == {**STATE_LABELS, 'load_end': LOAD_END[key]} and
                    len(state['timeline']) == LOAD_END[key] + 1 and state['fps'] == 30,
                    f'Spell Tower state labels differ: {row["ExportName"]}')
    pixels = {t: np.array(im) / 255 for t, im in images.items()}
    width, height = (PREVIEW_BOUNDS[2] - PREVIEW_BOUNDS[0]) * 2, (PREVIEW_BOUNDS[3] - PREVIEW_BOUNDS[1]) * 2
    root = np.array([[2, 0, -PREVIEW_BOUNDS[0] * 2], [0, 2, -PREVIEW_BOUNDS[1] * 2], [0, 0, 1]], dtype=float)
    previews = []
    for key, rows in weapons.items():
        for row in rows:
            level = levels[int(row['Level']) - 1]
            controls = {'turret_load': STATE_LABELS['idle']}
            poses = controlled_nodes(graph, graph['exports'][level['ExportNameBase']], 0, root)
            poses += controlled_nodes(graph, graph['exports'][row['ExportName']], 0, root, controls)
            image = Image.fromarray(compose_preview(poses, pixels, width, height), 'RGBA')
            path = f'{PREFIX}/preview-{row["Level"]}-{key}.png'
            outputs[path] = image
            previews.append(dict(level=int(row['Level']), weapon=key, export=row['ExportName'], path=path,
                                 bounds=PREVIEW_BOUNDS, width=width, height=height, pixelsPerNativeUnit=2,
                                 frame='idle', rgbaSha256=digest(image.tobytes())))
    sounds = {}
    for original in sorted({r['Sound'] for rows in effects.values() for r in rows if r.get('Sound')}):
        path = PREFIX + '/' + original.removeprefix('sfx/')
        outputs[path] = source(original, PINS)
        sounds[original] = dict(path=path, sha256=digest(outputs[path]))

    def spell_stats(row):
        return dict(name=row['Name'], globalId=number(row, 'GlobalID'), radius=number(row, 'Radius'),
                    numberOfHits=number(row, 'NumberOfHits'), timeBetweenHitsMs=number(row, 'TimeBetweenHitsMS'),
                    hitTimeMs=number(row, 'HitTimeMS'), chargingTimeMs=number(row, 'ChargingTimeMS'),
                    deployTimeMs=number(row, 'DeployTimeMS'), randomRadius=number(row, 'RandomRadius'),
                    randomRadiusAffectsOnlyGfx=flag(row, 'RandomRadiusAffectsOnlyGfx'),
                    boostTimeMs=number(row, 'BoostTimeMS'), speedBoost=number(row, 'SpeedBoost'),
                    speedBoost2=number(row, 'SpeedBoost2'), damageBoostPercent=number(row, 'DamageBoostPercent', 0),
                    buildingDamageBoostPercent=number(row, 'BuildingDamageBoostPercent', 0),
                    attackSpeedBoost=number(row, 'AttackSpeedBoost', 0), poisonDps=number(row, 'PoisonDPS', 0),
                    poisonIncreaseSlowly=flag(row, 'PoisonIncreaseSlowly'), poisonAffectAir=flag(row, 'PoisonAffectAir'),
                    boostLinkedToPoison=flag(row, 'BoostLinkedToPoison'), boostDefenders=flag(row, 'BoostDefenders'),
                    heroDamageMultiplier=number(row, 'HeroDamageMultiplier', 100),
                    invisibilityTimeMs=number(row, 'InvisibilityTime', 0),
                    immunities=sorted(k for k in row if k.startswith('Immunity') and row[k] == 'TRUE'),
                    deployEffect=row.get('DeployEffect'), deployEffect2=row.get('DeployEffect2'))

    combat = dict(
        globalId=1000072, size=2, hero=hero,
        levels=[dict(level=number(v, 'BuildingLevel'), townhall=number(v, 'TownHallLevel'), hp=number(v, 'Hitpoints'),
                     body=v['ExportName'], base=v['ExportNameBase'], ruin=v['ExportNameDamaged'],
                     construction=v['ExportNameConstruction'], buildAnim=v['ExportNameBuildAnim'],
                     unlockWeapon=v['UnlockWeaponMode'], destroyEffect=v['DestroyEffect'], hitEffect=v['HitEffect'])
                for v in levels],
        weapons={key: dict(name=rows[0]['Name'], globalId=WEAPONS[key][1], range=number(rows[0], 'AttackRange'),
                           stateLabels={**STATE_LABELS, 'load_end': LOAD_END[key]},
                           attackSpeedMs=number(rows[0], 'AttackSpeed'), coolDownOverrideMs=number(rows[0], 'CoolDownOverride'),
                           airTargets=flag(rows[0], 'AirTargets'), groundTargets=flag(rows[0], 'GroundTargets'),
                           selfAsAoeCenter=flag(rows[0], 'SelfAsAoeCenter'),
                           customTargetHitBuildingInRange=flag(rows[0], 'CustomTargetHitBuildingInRange'),
                           copyOwnerUpgradeLevel=flag(rows[0], 'CopyOwnerUpgradeLevel'),
                           attackCenterOnDeath=flag(rows[0], 'AttackCenterOnDeath'),
                           highlight=[number(rows[0], k, -1) for k in
                                      ('HighlightEffectRed', 'HighlightEffectGreen', 'HighlightEffectBlue')],
                           exports=[r['ExportName'] for r in rows],
                           projectile=dict(name=projectiles[key][0]['Name'], export=projectiles[key][0]['ExportName'],
                                           speed=number(projectiles[key][0], 'Speed'),
                                           startHeight=number(projectiles[key][0], 'StartHeight'),
                                           ballistic=flag(projectiles[key][0], 'IsBallistic'),
                                           ballisticHeight=number(projectiles[key][0], 'BallisticHeight'),
                                           trajectoryStyle=number(projectiles[key][0], 'TrajectoryStyle'),
                                           fixedTravelTimeMs=number(projectiles[key][0], 'FixedTravelTime'),
                                           tracksTarget=projectiles[key][0]['DontTrackTarget'] != 'TRUE',
                                           useTopLayer=flag(projectiles[key][0], 'UseTopLayer'),
                                           particleEmitter=projectiles[key][0].get('ParticleEmitter'),
                                           destroyedEffect=projectiles[key][0]['DestroyedEffect']),
                           spell=spell_stats(spells[key][0]))
                 for key, rows in weapons.items()})
    runtime['levels'] = combat['levels']
    runtime['weapons'] = {k: dict(exports=v['exports'], projectile=v['projectile'], spell=v['spell'],
                                  highlight=v['highlight'], stateLabels=v['stateLabels'])
                          for k, v in combat['weapons'].items()}
    runtime['effects'] = effects
    runtime['particles'] = particles
    runtime['sounds'] = sounds
    catalog = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS, building=building,
                   weapons=weapons, weaponGlobalIds={k: v[1] for k, v in WEAPONS.items()}, projectiles=projectiles,
                   spells=spells, globals=hero, effects=effects, particles=particles, sounds=sounds,
                   graphEvidence=dict(exports=graph['exports'], clips=len(graph['clips']), shapes=len(graph['shapes']),
                                      sha256=digest(json.dumps(graph, sort_keys=True, separators=(',', ':')).encode())),
                   textures=textures, previews=previews,
                   reconstruction=dict(
                       nativePlaybackVerified=False,
                       scope='Four building bodies, all twelve rage/poison/invisibility weapon bodies with their 1,236-frame '
                             'turret_load state timeline, shared base/scaffold/upgrade/ruin, three spell bottles, every '
                             'particle export referenced by the tower, bottle and spell effects, and seven sounds.',
                       excluded='The Earthquake weapon and spell (level-4 mode, absent from campaign placements) and the '
                                'unreferenced spell_tower_<color> exports are retained only as source names.',
                       preview='Base plus weapon body at the idle label frame, density two; registration is local.'))
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
        target = ROOT / 'reference/spell-tower' / (name + '.json')
        # The runtime scene graph is compact; readable source records keep indentation.
        content = (json.dumps(value, separators=(',', ':')) if name == 'runtime' else json.dumps(value, indent=2)) + '\n'
        if args.check:
            require(target.read_text() == content, f'Reference differs: {name}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} original Spell Tower assets and 4 source levels')


if __name__ == '__main__':
    main()
