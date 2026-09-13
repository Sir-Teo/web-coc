#!/usr/bin/env python3
"""Preserve campaign garrisons and Clan Castle data from the pinned public client.

This source foundation does not enable unsupported campaign combat or clans.
"""
import argparse
import hashlib
import json
import re

from native_art.bundle import ROOT, BUNDLE, BASE, source
from native_art.sc6 import require
from native_art.source_csv import decoded_rows, records, animation_blocks, inherited_levels

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
    'logic/characters.csv': '5c3acc5b46ff9e7978f406b540264e65c93a846b69d03cd43326a9853703cb89',
    'logic/globals.csv': '16210fc28bfb86d00ea04d581a99fe98e128172017b2d4f637b8848c0cf20087',
    'logic/npcs.csv': '99dfcaeb4a622f76d4ed29ce444eedef88e92b49b8e0c574b34eea74e1278d6a',
    'csv/animations.csv': 'b0be152c98d06ccd0689320acfa19b07e04dd2a07fc6a1253558592f67bf29d8',
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
GLOBALS = [
    'CLAN_CASTLE_RADIUS', 'BUNKER_SEARCH_TIME', 'CASTLE_DEFENDER_SEARCH_RADIUS',
    'ALLIANCE_ALERT_RADIUS', 'IGNORE_ALLIANCE_ALERT_FOR_NON_VALID_TARGETS',
    'ENABLE_DEFENDING_ALLIANCE_TROOP_JUMP', 'BATTLELOG_STORES_CLAN_CASTLE_TROOPS_SEPARATELY',
    'ALLOW_CLANCASTLE_DEPLOY_ON_OBSTACLES',
]


def table(path):
    return records(decoded_rows(source(path, PINS)))


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client differs')
    members = {v['file']: v['sha'] for v in fingerprint['files']}
    for path in PINS:
        if path != 'fingerprint.json':
            data = source(path, PINS)
            # This fingerprint omits the entire level/ directory. Those public
            # layout bytes have independent SHA-256 pins, not SHA-1 membership.
            if path.startswith('level/'):
                require(path not in members, 'Layout fingerprint membership changed')
            else:
                require(hashlib.sha1(data).hexdigest() == members[path], f'Fingerprint differs: {path}')
    npcs = [rows for rows in table('logic/npcs.csv').values()
            if re.fullmatch(r'npc\d+', rows[0].get('MapInstanceName', ''))]
    npcs.sort(key=lambda rows: int(rows[0]['MapInstanceName'][3:]))
    require([rows[0]['MapInstanceName'] for rows in npcs] == [f'npc{i}' for i in range(1, 91)],
            'Campaign map identity differs')
    garrisons, raw_npcs, raw_castles = [], {}, {}
    for rows in npcs:
        roster = [row for row in rows if row.get('AllianceUnitType')]
        if not roster:
            continue
        first = rows[0]
        stage = int(first['MapInstanceName'][3:])
        layout = json.loads(source(first['LevelFile'], PINS))
        castles = [b for b in layout['buildings'] if b['data'] in (1000014, 1000061)]
        raw_npcs[first['Name']] = rows
        raw_castles[first['LevelFile']] = castles
        garrisons.append(dict(stage=stage, stageIndex=stage - 1, npc=first['Name'], source=first['LevelFile'],
            roster=[dict(character=r['AllianceUnitType'], sourceLevel=int(r['AllianceUnitLevel']),
                         count=int(r['AllianceUnitCount'])) for r in roster],
            castles=[dict(sourceId=b['id'], globalId=b['data'], level=b['lvl'] + 1,
                          x=b['x'], y=b['y']) for b in castles]))
    require([g['stage'] for g in garrisons] == [57, 68, 70, 73, 74, 75, 77, 78, 84, 90], 'Garrison stages differ')
    all_characters = table('logic/characters.csv')
    names = {r['character'] for g in garrisons for r in g['roster']}
    # Preserve explicit defensive substitutions, without applying an unverified
    # NPC level-to-visual-level conversion to those later campaign families.
    names.update(r['DefensiveTroop'] for n in list(names) for r in all_characters[n] if r.get('DefensiveTroop'))
    characters = {name: all_characters[name] for name in sorted(names)}
    building_table = table('logic/buildings.csv')
    buildings = {name: building_table[name] for name in ['Clan Castle', 'Goblin Castle']}
    globals_ = table('logic/globals.csv')
    globals_ = {name: globals_[name] for name in GLOBALS}
    blocks = animation_blocks(decoded_rows(source('csv/animations.csv', PINS)))
    focus, animations = [], {}
    for name, level in [('Dragon', 7), ('Balloon', 8)]:
        row = inherited_levels(characters[name])[level - 1]
        require(int(row['VisualLevel']) == level, 'Focus troop visual level differs')
        matches = [key for key in blocks if key.replace(' ', '') == row['Animation'].replace(' ', '')]
        require(len(matches) == 1, 'Ambiguous animation name')
        animation = matches[0]
        animations[animation] = blocks[animation]
        focus.append(dict(character=name, sourceLevel=level, visualLevel=int(row['VisualLevel']),
            globalId=int(row['GlobalID']), housing=int(row['HousingSpace']), hp=int(row['Hitpoints']),
            dps=int(row['DPS']), sourceSpeed=int(row['Speed']), attackRange=int(row['AttackRange']),
            intervalMs=int(row['AttackSpeed']), damageRadius=int(row.get('DamageRadius', 0)),
            selfAsAoeCenter=row.get('SelfAsAoeCenter') == 'TRUE', flying=row.get('IsFlying') == 'TRUE',
            airTargets=row.get('AirTargets') == 'TRUE', groundTargets=row.get('GroundTargets') == 'TRUE',
            newTargetAttackDelayMs=int(row.get('NewTargetAttackDelay', 0)),
            deathDamage=int(row.get('DieDamage', 0)), deathRadius=int(row.get('DieDamageRadius', 0)),
            deathDelayMs=int(row.get('DieDamageDelay', 0)), deathEffect=row.get('DieDamageEffect'),
            animation=animation))
    castles = {}
    for name, rows in buildings.items():
        castles[name] = [dict(level=int(r['BuildingLevel']), globalId=int(r['GlobalID']),
            hp=int(r['Hitpoints']), size=int(r['Width']), townhall=int(r['TownHallLevel']),
            housing=int(r['HousingSpace']), spellHousing=int(r['HousingSpaceAlt']),
            siegeHousing=int(r['HousingSpaceSiege']), cost=int(r['BuildCost']), resource=r['BuildResource'],
            seconds=sum(int(r[k]) * scale for k, scale in [('BuildTimeD', 86400), ('BuildTimeH', 3600),
                                                         ('BuildTimeM', 60), ('BuildTimeS', 1)]),
            body=r['ExportName'], base=r['ExportNameBase'], construction=r['ExportNameConstruction'],
            scaffold=r['ExportNameBuildAnim'], rubble=r['ExportNameDamaged'], locked=r['ExportNameLocked'])
            for r in inherited_levels(rows)]
    native = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS,
        fingerprintMembership={path: members[path] for path in PINS if path in members},
        buildings=buildings, characters=characters, globals=globals_, animations=animations,
        npcs=raw_npcs, layoutCastles=raw_castles,
        reconstruction=dict(liveIntegration=False, nativePlaybackVerified=False,
            scope='All ten campaign alliance rosters, exact Castle placements, fourteen Clan Castle tiers, Goblin Castle, complete source character families and the two No Flight Zone animation blocks.',
            levels='AllianceUnitLevel is retained as sourceLevel. No Flight Zone Dragon 7 and Balloon 8 match both row ordinal and VisualLevel; later family resolution is intentionally not inferred. Super Minion has a shifted VisualLevel sequence and an explicit DefensiveTroop substitution.',
            capacity='Campaign counts remain literal, including rosters exceeding ordinary Castle capacity and stages with no Castle building. No home caps or synthesized Castle are applied.',
            animation='Block-specific headers, types, empty cells and event variants are retained. Dragon death has a blank SWF; it is not assumed to be in chr_dragon.sc. ActionFrame, radius units, exit cadence and engine playback need separate corroboration.'))
    return dict(native=native, catalog=dict(garrisons=garrisons, castles=castles, noFlightZone=focus))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for name, value in build().items():
        path = ROOT / 'reference/garrison' / (name + '.json')
        encoded = json.dumps(value, indent=2) + '\n'
        if args.check:
            require(path.read_text() == encoded, f'Garrison reference differs: {name}')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(encoded)
    print(f'{"Verified" if args.check else "Wrote"} ten campaign garrisons and fifteen Castle source levels')


if __name__ == '__main__':
    main()
