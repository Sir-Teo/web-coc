#!/usr/bin/env python3
"""Import native character families for campaign garrisons from the pinned public client.

One graph per original character file retains every view of the captured animation
blocks: polygon meshes, nested timelines, additive groups and empty locators remain
literal, and textures copy the original SCTX sampling regions. Source rows, animation
blocks, projectiles, special abilities and bunker placements are recorded separately.
Native executable playback, facing and action-frame conventions are not claimed.
"""
import argparse
import hashlib
import json
import re
import runpy

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, BUNDLE, BASE, source, digest
from native_art.sc6 import SC6, decode_sctx, require
from native_art.scene_graph import capture_graph, crop_textures
from native_art.source_csv import decoded_rows, records, animation_blocks, inherited_levels

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'logic/characters.csv': '5c3acc5b46ff9e7978f406b540264e65c93a846b69d03cd43326a9853703cb89',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
    'logic/npcs.csv': '99dfcaeb4a622f76d4ed29ce444eedef88e92b49b8e0c574b34eea74e1278d6a',
    'logic/projectiles.csv': '71cda0e457ad88a6772f6421a22419b24d6bcf78d0ed305f09184404889a72dc',
    'logic/special_abilities.csv': 'c978dd90ff2335e60d988f3476d78bec72672e8c074344d149096e89951181eb',
    'logic/spells.csv': '385159e00327e6a1567cd91f1585b4ed0717d3f4475f0823398243482598289d',
    'csv/animations.csv': 'b0be152c98d06ccd0689320acfa19b07e04dd2a07fc6a1253558592f67bf29d8',
    'sc/chr_goblin.sc': '93ec098325e99927fa2cb9c76a422347da1e2ef611d14b15e40f8d3af560cbe9',
    'sc/chr_goblin_0.sctx': 'd9338b5b527b972794650abccdacbc4ee5e9f21a22d4779949ab4e00b80b87ae',
    'sc/chr_archer.sc': '2acaca98c63b3fef734a424a689ca6cdce5c5af9883a70db455119174833e53d',
    'sc/chr_archer_0.sctx': 'ed7d064ae39b823110d9242714fa8637830e6e96d53db77665b1a6a8b2fa7b61',
    'sc/chr_dragon.sc': '9f5a80ca18fe19d9b116c82eaafdde15f326b5d9f4fde51ba542904ec371d9c8',
    'sc/chr_dragon_0.sctx': '8ac4749ec030e8d22f43f19c2b011ac473120cb495dd2b76b33b42454008f205',
    'sc/chr_pekka.sc': 'fb6ba238c798c5c119df7ee9764c2338f7eecd3710df0431707c4e2bb0754de9',
    'sc/chr_pekka_0.sctx': 'f20951105380679aa1d9931a1c2020b75d5428d46cabd680dc11f837a23af2e3',
    'sc/chr_valkyrie.sc': '53d87bb9e6170780a87e1fdd3636902d592faa4daceeffcb74f7e9a867626df9',
    'sc/chr_valkyrie_0.sctx': '916b87c3b85a64154fec5fe71da3e3912370fd0e0b1f3fd2d2157776c097f521',
    'sc/chr_headhunter.sc': '20b94df2871a5d467d2662001aa02e10ac63d81c38dc6642cb4571d3dfe0810f',
    'sc/chr_headhunter_0.sctx': 'b1319af66acedfa66078c270dfbe7af8a1fe6781751762465ba00de2a2a2daa4',
    'sc/chr_super_minion.sc': 'b8874ddd6fb3228bad6cd8a3e5eb28fcbabc00b6a1916b899b59f6b7adf97e13',
    'sc/chr_super_minion_0.sctx': '35dbcd6ea7a48eeba8a97c3c7b01a9d5f15775a3b0639a53eb0af155ee410148',
    'sc/chr_baby_dragon.sc': '11a499e8dd7c262f2f6b20ce3bccb8a3a3305ced3a21c5df0af36185d2134943',
    'sc/chr_baby_dragon_0.sctx': 'd46efeaa5cd061b12f0c6ae09a8f905aaaca7b8dfb6ac5ed0873d1875667534b',
    'sc/characters.sc': '0e23bd3745176fe7db3d61e490d9da07c63a42e95462f514d6eac696314c3798',
    'sc/characters_7.sctx': 'e90c58ec5665bb886b64b2d2518fdf3aac08f229ba25dd913a2d89cc3e86c039',
    'sc/buildings.sc': 'f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
    # Remaining defending families, the Ghost Trap's Royal Ghost and the Defending Builder.
    'logic/traps.csv': '757ca07de02b26b2071b52bb3cb495df2f0ae879731a859d3102ca3552dd528c',
    'logic/globals.csv': '16210fc28bfb86d00ea04d581a99fe98e128172017b2d4f637b8848c0cf20087',
    'sc/chr_electro_dragon.sc': '7ea186f126e53981d7ed9ab816ac8eb5e0eaec48e66b3d204ca17ba5a4ad5fca',
    'sc/chr_electro_dragon_0.sctx': '6117167427d5ce6a6c2f59480412d91ac45beeae76586ab507a8a8ad78871adc',
    'sc/chr_electro_dragon_1.sctx': '1da851e78819c190ba1ca49bf828108f5f3bd39562ace7852d81c0689c94063c',
    'sc/chr_golem.sc': '0e2fb6935e7cee3a2dcd36ccd0d3a5e74ee618978fef71e94d732815f4819abc',
    'sc/chr_golem_0.sctx': 'e9ea7073b3a88336d6ca0f719d06be487e372e55115fe256d622f0e595703c40',
    'sc/chr_witch.sc': 'f9bbd8cbd8f1cafe34857e452780f4984c9395828d382c43b1d3d5cc1146142e',
    'sc/chr_witch_0.sctx': '2872edd72e19a03a9259e46bd8cecef8e103232f241d82891f59b785d12bfa97',
    'sc/chr_skeleton.sc': '08ad67f9ba5d5d89f97883e05e1c0b423d8cbcb6e7f8031a0a3e7b70a0bae268',
    'sc/chr_skeleton_0.sctx': '96ee254c9d9f6735c29b90ddb403d015999dcc36f063b66fdd3001a7a37d21c5',
    'sc/chr_skeleton_1.sctx': 'be8c000338c47c9ffd224b35f379c9c80f97eaf87268fac06f050d9db6d0eb24',
    'sc/chr_bowler.sc': '0efb03fbcfdb45cccdb118eaf771427bc54c62a5f154a1d10500f1f8e387178c',
    'sc/chr_bowler_0.sctx': '15bfaad87cac69010e7b4bc480ad663abba125f2c4537b915981a77e52b01186',
    'sc/chr_lava_hound.sc': 'ddc9037df98e63dfa6b2743bd3a4349b027aec50f8ac69408e6b16c3f6d3d9d4',
    'sc/chr_lava_hound_0.sctx': '0446b6b5f8d6732d4f0a1c16b96d6cc48b9bf8697e1d4038e9ee4ef7131ec86d',
    'sc/chr_lava_hound_1.sctx': 'a401a14aa108dd0274961d70ae8f542e64b3090f74d1600165095891eae83652',
    'sc/chr_electro_titan.sc': '1ccaeaf2c73f59f927c5285340ec728f25a4e3e80719084bec8a5e0883bf6566',
    'sc/chr_electro_titan_0.sctx': 'c03c2b8d0312642c2091528abcdc12802bd7335a11a14303ef37bee73848e83a',
    'sc/chr_royale_ghost.sc': '631197637f845d22021a48c041074f3ef50951b100916ec2ac0a5bca36db202c',
    'sc/chr_royale_ghost_0.sctx': '08a9c99e02529b087800b62bc9de88d7d80cc316984fde94b514255c4c1b70f2',
    'sc/chr_worker.sc': 'b2e3e50390a1994fa6dec0a490392591e584aec81b49d3a1006b41e184a34cab',
    'sc/chr_worker_0.sctx': '6f01598f31076c26bdee9554497b45d97f5620e44d51bb3eb5d10e3b4756e0d7',
    # The Bowler's trollBoulder_lvl3 views and shadow sample this shared buildings texture.
    'sc/buildings_6.sctx': '68d97a39c2bfbcf94f820f4091c078a9516f41dafe27744e7de26e30864d1ffc',
    # Public layout files are absent from this client fingerprint; they carry SHA-256 pins only.
    'level/npc55.json': '1ea0d18c26f39093b1449a7bf1df9c019b8fb640807ac95758eadad3d7f2bc16',
    'level/npc66.json': 'e8a2e3cd40ef3f82e64164dd8c15fc4f943e235c37e995c0bfe89e5aa3aa28ce',
    'level/npc68.json': '301c90be309c47f2a97ecd0626c311c537eaa10a22d52a488b7babb3c7c90ab9',
    'level/npc71.json': '46584d6240b5a7e4f332f18b5b2cc6ce667964a2b7234c6673881bd541b523dd',
    'level/npc72.json': 'a0a93ee8f17704041648acc3c50d54ba72b6991031ff49554ba49e8edf7fe26f',
    'level/npc73.json': '8df9207ead61fefe1e859f0a4028b269278ea47bfd1fa2b3e7d2647d52f72652',
    'level/npc75.json': '13828545831d36659ef84b2cbcb5eb2a018b64cdbe8ca688efc296414ef6052e',
    'level/npc76.json': '6ed166976eb92f57f07d3cbe01ebb3d374a34a150fca74e8c0c39db3af558703',
    'level/npc82.json': '4526c34c7fd29a41443f6e15631911a3cce39746e01298a82a3d5abe3f99cc75',
    'level/npc88.json': '0d95076b27684819a67b2952074495e814e81b86ab182761ce0c56213f156579',
}
PREFIX = 'assets/characters-native'
# One captured graph per original character file. The first group is animated by the
# runtime now; MOMMA (pekka9) and Golden Dragon (dragonx) share already-pinned files.
FAMILIES = {
    'goblin': dict(swf='sc/chr_goblin.sc', animations=['Goblin7']),
    'archer': dict(swf='sc/chr_archer.sc', animations=['Archer9']),
    'dragon': dict(swf='sc/chr_dragon.sc', animations=['Dragon5', 'Golden Dragon']),
    'pekka': dict(swf='sc/chr_pekka.sc', animations=['PEKKA8', 'MOMMA']),
    'valkyrie': dict(swf='sc/chr_valkyrie.sc', animations=['WarriorGirl_lvl4']),
    'headhunter': dict(swf='sc/chr_headhunter.sc', animations=['HeadHunter_lvl3']),
    'super_minion': dict(swf='sc/chr_super_minion.sc', animations=['SuperMinion']),
    'baby_dragon': dict(swf='sc/chr_baby_dragon.sc', animations=['Baby Dragon 6']),
    # Remaining roster families, their secondary/summoned troops, the Ghost Trap's Royal Ghost and
    # the Builder's Hut Defending Builder. GolemSmall_lvl6 (Golemite) names exactly the Golem_lvl6
    # exports at a different Scale, so it reuses that graph instead of duplicating its texture.
    'electro_dragon': dict(swf='sc/chr_electro_dragon.sc', animations=['ElectroDragon_lvl3']),
    'golem': dict(swf='sc/chr_golem.sc', animations=['Golem_lvl6'], aliases={'GolemSmall_lvl6': 'Golem_lvl6'}),
    'witch': dict(swf='sc/chr_witch.sc', animations=['Necromancer_lvl2']),
    'skeleton': dict(swf='sc/chr_skeleton.sc', animations=['Skeleton']),
    'bowler': dict(swf='sc/chr_bowler.sc', animations=['Troll_lvl3']),
    'lava_hound': dict(swf='sc/chr_lava_hound.sc', animations=['ADSeeker_lvl6', 'TinyBaby_lvl1']),
    'electro_titan': dict(swf='sc/chr_electro_titan.sc', animations=['ElectroTitan_lvl2']),
    'royale_ghost': dict(swf='sc/chr_royale_ghost.sc', animations=['Prototype_Ghost']),
    'worker': dict(swf='sc/chr_worker.sc', animations=['Defending Builder']),
}
# Projectile exports live in the character files above or in shared original files.
PROJECTILES = ['Arrow_small_darkElixirFire2', 'Headhunter_Card_lvl3', 'super_gargoyle_projectile',
               'super_gargoyle_projectile_big', 'babydragon_projectile_lvl3']
# Later projectiles form their own graphs, so the earlier per-file projectile graphs stay intact.
# Rows with DirectionCount name three original views (`_1`..`_3`).
PROJECTILE_GROUPS = {'witch': ['Witch_projectile'], 'bowler': ['trollBoulder_lvl3'],
                     'lava-hound': ['hound_projectile', 'tinyhound_projectile']}
# Rows that spawn characters outside rosters: the Ghost Trap and armed Builder's Huts.
TRAP_SPAWNERS = ['Ghost Trap']
DEFENCE_TROOP_BUILDINGS = ['Builders Hut']
# Globals the pinned older engine read for these mechanics; absence is recorded as evidence.
ABSENT_GLOBALS = ['CHAINED_PROJECTILE_BOUNCE_COUNT']
# Globals the Defending Builder's repairs read: healer slot percentages and the post-damage delay.
REPAIR_GLOBALS = ['HEAL_STACK_PERCENT', 'ALLOW_REPAIR_AFTER_DAMAGE_TICKS']
SHARED_PROJECTILE_FILES = {'sc/characters.sc': 'projectiles-characters', 'sc/buildings.sc': 'projectiles-buildings'}
VIEWS = (1, 2, 3)
# Economy/UI columns are not needed for combat or presentation; everything else is kept.
OMIT_COLUMNS = {'TID', 'InfoTID', 'IconSWF', 'IconExportName', 'BigPicture', 'BigPictureSWF',
                'UpgradeTimeH', 'UpgradeTimeM', 'UpgradeResource', 'UpgradeCost', 'BarrackLevel',
                'LaboratoryLevel', 'ProductionBuilding', 'PreviewScenario', 'AltPreviewScenario',
                'StatBars', 'StrengthWeight', 'UnitsInCamp', 'DisableDonate', 'CustomDefenderIcon'}
SOURCE_SCENE = runpy.run_path(str(ROOT / 'scripts/import-native-cannon.py'))
COMPOSE = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))['compose']


def table(path):
    return records(decoded_rows(source(path, PINS)))


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def block_named(blocks, name):
    """Character rows reference blocks ignoring spaces (for example 'Baby Dragon 6')."""
    matches = [key for key in blocks if key.replace(' ', '') == name.replace(' ', '')]
    require(len(matches) == 1, f'Ambiguous or missing animation block: {name}')
    return matches[0]


def block_exports(block, swf):
    """Directional rows name three original views; non-directional rows name one export."""
    result = []
    for row in block['rows']:
        if row.get('SWF') != swf:
            # The common death export has an empty SWF and is imported by the garrison foundation.
            # The Defending Builder's die row names `temp_dummya4`, an empty one-frame clip in the
            # common sc/characters.sc (its row also sets DeathShowTimeMS=1): nothing to capture.
            require(row.get('SWF') == '' and row['ExportName'] in ('barbarian_death_1', 'temp_dummya4'),
                    f'Unexpected animation file {row.get("SWF")} for {row["ExportName"]}')
            continue
        names = ([f'{row["ExportName"]}_{v}' for v in VIEWS] if row['HasDirections'] == 'TRUE'
                 else [row['ExportName']])
        result.extend(n for n in names if n not in result)
    return result


def reachable_text_fields(sc, ids):
    found = set()

    def walk(id_, ancestors=()):
        require(id_ not in ancestors and len(ancestors) < 32, 'Recursive display object')
        if id_ in sc.textfields:
            require(sc.text_field(id_)['text'] == '', 'Visible text in a character graph')
            found.add(id_)
        elif id_ not in sc.shapes:
            for child in sc.clip(id_)['children']:
                walk(child, (*ancestors, id_))

    for id_ in ids:
        walk(id_)
    return sorted(found)


def reachable_shapes(graph, names):
    found, stack = set(), [graph['exports'][name] for name in names]
    while stack:
        key = str(stack.pop())
        if key in graph['shapes']:
            found.add(key)
        elif key in graph['clips']:
            stack.extend(graph['clips'][key]['children'])
    return found


def shadow_shapes(graph, images, names):
    """Original ground shadows are shapes whose sampled texels are all black RGB with alpha.

    Only shapes reachable from character animation exports are considered; projectile
    shadows (for example gargoyle_arrow_shadow) belong to their projectile rows.
    """
    result = {}
    reachable = reachable_shapes(graph, names)
    for id_, commands in graph['shapes'].items():
        if id_ not in reachable:
            continue
        black, alpha = True, 0
        for texture, vertices in commands:
            image = images[texture]
            height, width = image.shape[:2]
            uv = np.array(vertices).reshape(-1, 4)[:, 2:] / 65535 * [width, height]
            left, top = np.floor(uv.min(axis=0)).astype(int)
            right, bottom = np.ceil(uv.max(axis=0)).astype(int)
            region = image[top:bottom, left:right]
            visible = region[..., 3] > 0
            if visible.any():
                alpha = max(alpha, int(region[..., 3].max()))
                black &= int(region[visible][:, :3].max()) == 0
        if black and alpha:
            result[id_] = alpha
    return result


def compact_rows(rows):
    return [dict(row=i + 1, **{k: v for k, v in row.items() if k not in OMIT_COLUMNS})
            for i, row in enumerate(inherited_levels(rows))]


def resolve_level(characters, name, level):
    """AllianceUnitLevel names a VisualLevel. Row ordinals are retained as evidence only."""
    rows = inherited_levels(characters[name])
    matches = [i for i, row in enumerate(rows) if int(row['VisualLevel']) == level]
    require(len(matches) == 1, f'Unresolved visual level: {name} {level}')
    return matches[0] + 1, rows[matches[0]]


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client differs')
    members = {v['file']: v['sha'] for v in fingerprint['files']}
    for path in PINS:
        if path == 'fingerprint.json':
            continue
        data = source(path, PINS)
        if path.startswith('level/'):
            require(path not in members, 'Layout fingerprint membership changed')
        else:
            require(hashlib.sha1(data).hexdigest() == members[path], f'Fingerprint differs: {path}')
    characters = table('logic/characters.csv')
    projectiles = table('logic/projectiles.csv')
    abilities = table('logic/special_abilities.csv')
    spells = table('logic/spells.csv')
    buildings = table('logic/buildings.csv')
    blocks = animation_blocks(decoded_rows(source('csv/animations.csv', PINS)))
    npcs = table('logic/npcs.csv')

    # Evidence for the level convention across every NPC roster in this client.
    evidence = []
    for npc, rows in sorted(npcs.items()):
        for row in rows:
            if not row.get('AllianceUnitType'):
                continue
            name, level = row['AllianceUnitType'], int(row['AllianceUnitLevel'])
            levels = inherited_levels(characters[name])
            visual = [int(r['VisualLevel']) for r in levels]
            if visual != list(range(1, len(levels) + 1)):
                evidence.append(dict(npc=npc, character=name, allianceUnitLevel=level, rows=len(levels),
                                     visualLevels=[visual[0], visual[-1]],
                                     rowOrdinalInRange=level <= len(levels),
                                     visualLevelResolves=visual.count(level) == 1))
    require(any(not e['rowOrdinalInRange'] and e['visualLevelResolves'] for e in evidence),
            'Level convention evidence changed')

    bunker_ids = {int(rows[0]['GlobalID']): name for name, rows in buildings.items()
                  if any(r.get('Bunker') == 'TRUE' for r in rows)}
    campaign = sorted((rows for rows in npcs.values() if re.fullmatch(r'npc\d+', rows[0].get('MapInstanceName', ''))),
                      key=lambda rows: int(rows[0]['MapInstanceName'][3:]))
    require([rows[0]['MapInstanceName'] for rows in campaign] == [f'npc{i}' for i in range(1, 91)],
            'Campaign map identity differs')
    rosters, needed = [], set()
    for rows in campaign:
        roster = [row for row in rows if row.get('AllianceUnitType')]
        if not roster:
            continue
        first = rows[0]
        stage = int(first['MapInstanceName'][3:])
        layout = json.loads(source(first['LevelFile'], PINS))
        bunkers = [dict(globalId=b['data'], name=bunker_ids[b['data']], sourceId=b['id'], level=b['lvl'] + 1,
                        x=b['x'], y=b['y'], mode=b.get('mode')) for b in layout['buildings'] if b['data'] in bunker_ids]
        members = []
        for row in roster:
            name, level = row['AllianceUnitType'], int(row['AllianceUnitLevel'])
            ordinal, inherited = resolve_level(characters, name, level)
            resolved = inherited.get('DefensiveTroop', name)
            if resolved != name:
                ordinal, inherited = resolve_level(characters, resolved, level)
            needed.update([name, resolved])
            members.append(dict(character=name, sourceLevel=level, count=int(row['AllianceUnitCount']),
                                defensiveCharacter=resolved, row=ordinal, animation=inherited['Animation']))
        rosters.append(dict(stage=stage, stageIndex=stage - 1, npc=first['Name'], layout=first['LevelFile'],
                            bunkers=bunkers, members=members))
    require([r['stageIndex'] for r in rosters] == [56, 67, 69, 72, 73, 74, 76, 77, 83, 89], 'Garrison stages differ')
    # Characters spawned outside rosters: Ghost Trap spawns and armed Builder's Hut defence troops.
    traps = table('logic/traps.csv')
    trap_spawners = {}
    for name in TRAP_SPAWNERS:
        rows = inherited_levels(traps[name])
        trap_spawners[name] = [{k: v for k, v in row.items() if k not in OMIT_COLUMNS and not k.startswith('Build')}
                               for row in traps[name]]
        for row in rows:
            for key in ('SpawnedCharGround', 'SpawnedCharAir'):
                if row.get(key):
                    needed.add(row[key])
    defence_troops = {}
    for name in DEFENCE_TROOP_BUILDINGS:
        rows = inherited_levels(buildings[name])
        defence_troops[name] = [{k: row[k] for k in ('GlobalID', 'BuildingLevel', 'DefenceTroopCharacter', 'DefenceTroopLevel',
                                                     'DefenceTroopCount', 'WakeUpSpace', 'WakeUpSpeed') if row.get(k)}
                                for row in rows]
        needed.update(row['DefenceTroopCharacter'] for row in rows if row.get('DefenceTroopCharacter'))
    globals_table = table('logic/globals.csv')
    require(not any(name in globals_table for name in ABSENT_GLOBALS), 'Expected absent global is present')
    repair_globals = {}
    for name in REPAIR_GLOBALS:
        rows = globals_table[name]
        if 'NumberArray' in rows[0]:
            require(all(set(row) <= {'Name', 'NumberArray'} for row in rows), f'Unexpected {name} cells')
            repair_globals[name] = [int(row['NumberArray']) for row in rows]
        else:
            require(len(rows) == 1 and set(rows[0]) == {'Name', 'NumberValue'}, f'Unexpected {name} cells')
            repair_globals[name] = int(rows[0]['NumberValue'])
    # Summoned, secondary and defensive rows that later garrison families will need.
    for name in list(needed):
        for row in inherited_levels(characters[name]):
            for key in ('SecondaryTroop', 'SummonTroop', 'DefensiveTroop'):
                if row.get(key):
                    needed.add(row[key])

    graphs, sources, outputs, previews, icons = {}, {}, {}, {}, {}
    used_animations, used_projectiles, used_abilities, used_spells = {}, {}, {}, {}
    # One graph per animation block keeps each roster's runtime texture compact; projectile
    # exports are grouped by their original file.
    specs, aliases = [], {}
    for family, spec in FAMILIES.items():
        for animation in spec['animations']:
            key = block_named(blocks, animation)
            used_animations[key] = blocks[key]
            specs.append((f'{family}/{slug(key)}', spec['swf'], block_exports(blocks[key], spec['swf']), key))
        for alias, target in spec.get('aliases', {}).items():
            key, target = block_named(blocks, alias), block_named(blocks, target)
            require(set(block_exports(blocks[key], spec['swf'])) == set(block_exports(blocks[target], spec['swf'])),
                    f'Alias {alias} does not name the same exports as {target}')
            used_animations[key] = blocks[key]
            aliases[key] = next(k for k, _, _, a in specs if a == target)
    projectile_exports = {}
    for name in PROJECTILES:
        row = projectiles[name][0]
        used_projectiles[name] = projectiles[name]
        projectile_exports.setdefault(row['SWF'], []).append(row['ExportName'])
        if row.get('ShadowExportName'):
            projectile_exports.setdefault(row['ShadowSWF'], []).append(row['ShadowExportName'])
    for swf, names in sorted(projectile_exports.items()):
        specs.append((f'projectiles/{slug(swf.split("/")[-1][:-3])}', swf, sorted(set(names)), None))
    for group, members_ in PROJECTILE_GROUPS.items():
        names, swfs = [], set()
        for name in members_:
            row = projectiles[name][0]
            used_projectiles[name] = projectiles[name]
            views = VIEWS if int(row.get('DirectionCount') or 0) else (None,)
            names.extend(row['ExportName'] if v is None else f'{row["ExportName"]}_{v}' for v in views)
            swfs.add(row['SWF'])
            if row.get('ShadowExportName'):
                require(row['ShadowSWF'] == row['SWF'], 'Projectile shadow in another file')
                names.append(row['ShadowExportName'])
        require(len(swfs) == 1, f'Projectile group spans files: {group}')
        specs.append((f'projectiles/{group}', swfs.pop(), sorted(set(names)), None))
    for name in sorted(needed):
        for row in inherited_levels(characters[name]):
            ability = row.get('SpecialAbilities')
            if ability and ability in abilities:
                used_abilities[ability] = abilities[ability]
                for level in inherited_levels(abilities[ability]):
                    for key in ('PoisonOnHitSpell', 'SelfSpell'):
                        if level.get(key):
                            used_spells[level[key]] = spells[level[key]]
            if row.get('AuraSpell'):
                used_spells[row['AuraSpell']] = spells[row['AuraSpell']]
    files, decoded = {}, {}
    for key, swf, names, animation in specs:
        if swf not in files:
            files[swf] = SC6(source(swf, PINS))
        sc = files[swf]
        wanted = {name: sc.exports[name] for name in names}
        empty = reachable_text_fields(sc, wanted.values())
        # Projectile shadows may use the original multiply (3) blend, which the renderer supports.
        graph = capture_graph(sc, wanted, empty_bounds=empty,
                              **({} if animation else dict(allowed_blends=(0, 3, 4, 8))))
        used = sorted({t for commands in graph['shapes'].values() for t, _ in commands})
        for t in used:
            path = 'sc/' + sc.textures[t]['external']
            if path not in decoded:
                decoded[path] = decode_sctx(source(path, PINS))
                require(decoded[path].size == (sc.textures[t]['width'], sc.textures[t]['height']), 'Texture dimensions differ')
        images = {t: decoded['sc/' + sc.textures[t]['external']] for t in used}
        assets, textures, runtime = crop_textures(graph, images, f'{PREFIX}/{key}/texture')
        outputs.update(assets)
        arrays = {t: np.array(image) for t, image in images.items()}
        shadows = shadow_shapes(graph, arrays, names) if animation else {}
        require(not animation or len(shadows) == 1, f'Expected one original ground shadow in {key}')
        graphs[key] = dict(**runtime, shadowShapes=sorted(int(s) for s in shadows))
        sources[key] = dict(source=swf, animation=animation, graph=graph, textures=textures,
                            sourceTextures={str(t): 'sc/' + sc.textures[t]['external'] for t in used},
                            shadowShapeMaxAlpha=shadows, emptyTextFields=empty)
        if not animation:
            continue
        # Frame zero of the idle row, facing the viewer when directional.
        idle = next(r for r in blocks[animation]['rows'] if r['Name'] == 'idle')
        export = f'{idle["ExportName"]}_3' if idle['HasDirections'] == 'TRUE' else idle['ExportName']
        bounds = SOURCE_SCENE['conservative_bounds'](graph, [export])
        width, height = 2 * (bounds[2] - bounds[0]), 2 * (bounds[3] - bounds[1])
        require(0 < width <= 512 and 0 < height <= 512, 'Preview exceeds the sampling budget')
        root = np.array([[2, 0, -bounds[0] * 2], [0, 2, -bounds[1] * 2], [0, 0, 1]])
        draws = SOURCE_SCENE['poses'](graph, export, root=root)
        xy = np.array(SOURCE_SCENE['points'](draws))
        require((xy >= 0).all() and (xy < [width, height]).all(), 'Clipped source preview')
        rgba = COMPOSE(draws, {t: arrays[t] / 255 for t in used}, max(width, height))
        rgba[:, :, :3] /= np.where(rgba[:, :, 3:4] > 0, rgba[:, :, 3:4], 1)
        image = Image.fromarray(np.round(np.clip(rgba, 0, 1) * 255).astype(np.uint8), 'RGBA').crop((0, 0, width, height))
        path = f'{PREFIX}/{key}/preview.png'
        outputs[path] = image
        previews[key] = dict(path=path, animation=animation, export=export, bounds=bounds, width=width,
                             height=height, pixelsPerNativeUnit=2, rgbaSha256=digest(image.tobytes()))
        box = image.getbbox()
        require(box is not None, 'Empty source preview')
        crop = [box[0] - 8, box[1] - 8, box[2] + 8, box[3] + 8]
        require(crop[0] >= 0 and crop[1] >= 0 and crop[2] <= width and crop[3] <= height, 'Icon padding clips')
        icon = image.crop(crop)
        icons[key] = dict(path=f'{PREFIX}/{key}/icon.png', sourcePortrait=path, crop=crop,
                          width=icon.width, height=icon.height, rgbaSha256=digest(icon.tobytes()))
        outputs[icons[key]['path']] = icon

    for roster in rosters:
        for member in roster['members']:
            block = block_named(blocks, member['animation'])
            # Every roster block is retained, including families whose art is imported elsewhere
            # (No Flight Zone) or not yet (later families), so their timing stays source-bound.
            used_animations[block] = blocks[block]
            member['swf'] = sorted({r['SWF'] for r in blocks[block]['rows'] if r.get('SWF')})
            member['graph'] = next((key for key, _, _, animation in specs if animation == block), None)
    catalog = dict(
        clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE,
        levelResolution=dict(
            rule='AllianceUnitLevel selects the unique row whose VisualLevel equals it; a DefensiveTroop row then replaces the character at the same VisualLevel.',
            evidence=evidence),
        bunkers={str(gid): dict(name=name, rows=[{k: v for k, v in r.items() if k in (
            'GlobalID', 'BuildingLevel', 'BuildingClass', 'Width', 'Height', 'Bunker', 'HousingSpace', 'Hitpoints', 'ExportName')}
            for r in inherited_levels(buildings[name])]) for gid, name in sorted(bunker_ids.items())},
        rosters=rosters,
        characters={name: compact_rows(characters[name]) for name in sorted(needed)},
        animations={name: used_animations[name] for name in sorted(used_animations)},
        projectiles={name: used_projectiles[name] for name in sorted(used_projectiles)},
        specialAbilities={name: used_abilities[name] for name in sorted(used_abilities)},
        spells={name: used_spells[name] for name in sorted(used_spells)},
        graphs={key: dict(swf=swf, animation=animation, exports=names) for key, swf, names, animation in specs},
        sharedDeath=dict(export='barbarian_death_1', graph='reference/garrison/dragon-death.json',
                         resolution='Die rows have an empty SWF; the common sc/characters.sc export is imported by the garrison foundation.'),
        # Blocks that name exactly another captured block's exports (at their own Scale).
        graphAliases=dict(sorted(aliases.items())),
        projectileGroups=PROJECTILE_GROUPS,
        trapSpawners=trap_spawners,
        defenceTroops=defence_troops,
        absentGlobals=ABSENT_GLOBALS,
        repairGlobals=repair_globals)
    art = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS,
               fingerprintMembership={path: members[path] for path in PINS if path in members},
               worlds=sources, previews=previews, icons=icons,
               reconstruction=dict(
                   nativePlaybackVerified=False,
                   graphs='Every view of each captured animation block, projectile export and projectile shadow. Empty locators and text fields remain nonpainting nodes.',
                   shadows='The single black-RGB shape with nonzero alpha in each character file is recorded as its original ground shadow for separate rendering.',
                   previews='Frame zero of the idle row (view 3 when directional), two pixels per native unit, conservative export bounds, eight-pixel icon padding. Registration is local.'))
    documents = {'reference/characters/catalog.json': catalog, 'reference/characters/art.json': art}
    for key, graph in graphs.items():
        documents[f'reference/characters/{key}.json'] = graph
    return outputs, documents


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, documents = build()
    folder = ROOT / 'public' / PREFIX
    if args.check:
        require({p.relative_to(ROOT / 'public').as_posix() for p in folder.rglob('*') if p.is_file()} == set(outputs),
                'Character asset membership differs')
        require({p.relative_to(ROOT).as_posix() for p in (ROOT / 'reference/characters').rglob('*.json')} == set(documents),
                'Character reference membership differs')
    for path, image in sorted(outputs.items()):
        target = ROOT / 'public' / path
        if args.check:
            with Image.open(target) as old:
                require(old.mode == 'RGBA' and old.size == image.size and old.tobytes() == image.tobytes(), f'Pixels differ: {path}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target, optimize=True)
    for path, document in sorted(documents.items()):
        target = ROOT / path
        encoded = json.dumps(document, indent=2) + '\n'
        if args.check:
            require(target.read_text() == encoded, f'Character reference differs: {path}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(encoded)
    print(f'{"Verified" if args.check else "Wrote"} {len(documents)} character references and {len(outputs)} assets')


if __name__ == '__main__':
    main()
