#!/usr/bin/env python3
"""Reproduce the campaign reference from pinned, public Supercell client data.

Run from the repository root. --check compares without changing the reference.
Raw downloads remain in output/; this importer writes data, not executable code.
Native artwork has a separate, source-attributed extraction pipeline.
"""
import argparse
import concurrent.futures
import csv
import hashlib
import io
import json
import lzma
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'reference/campaign'
CACHE = ROOT / 'output/native-campaign-source'
BUNDLE = '7f04bdfdc4124b1f49308423bb8f4aa8b137aae3'
BASE = f'https://game-assets.clashofclans.com/{BUNDLE}/'
# This exact pinned source has an unrelated, malformed suffix after its complete
# root object. Accept only that known suffix; never silently truncate other files.
TAILS = {'level/npc22.json': 'help_opened":false,"bool_layout_edit_shown_erase":false}'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_source(path):
    target = CACHE / path
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + '.part')
        subprocess.run(['curl', '--fail', '--silent', '--show-error', '--retry', '2',
                        BASE + path, '-o', str(temporary)], check=True)
        temporary.replace(target)
    data = target.read_bytes()
    if path in expected and digest(data) != expected[path]:
        raise ValueError(f'Source checksum changed: {path}')
    return data


def table(path):
    data = read_source(path)
    if data.startswith(b'Sig:'):
        data = data[68:]
    if not data.startswith(b'"'):
        data = lzma.decompress(data[:9] + b'\0' * 4 + data[9:])
    return list(csv.DictReader(io.StringIO(data.decode('utf-8-sig'))))[1:]


def groups(rows):
    result = []
    for row in rows:
        if row['Name']:
            result.append([])
        if result:
            result[-1].append({k: v for k, v in row.items() if v})
    return result


def layout(path):
    raw = read_source(path).decode('utf-8')
    value, end = json.JSONDecoder().raw_decode(raw)
    tail = raw[end:].strip()
    if tail != TAILS.get(path, ''):
        raise ValueError(f'Unexpected JSON suffix: {path}')
    # Preserve the complete main-village entities, including unknown native
    # modes and defending-unit arrays. Never use saved alternate/war layouts.
    return {key: value.get(key, []) for key in ['buildings', 'traps', 'obstacles', 'decos']}


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
manifest_path = DEST / 'provenance.json'
expected = json.loads(manifest_path.read_text())['sources'] if manifest_path.exists() else {}
records = groups(table('logic/npcs.csv'))
npcs = [g for g in records if re.fullmatch(r'npc\d+', g[0].get('MapInstanceName', ''))]
npcs.sort(key=lambda g: int(g[0]['MapInstanceName'][3:]))
assert len(npcs) == 90
assert [g[0]['MapInstanceName'] for g in npcs] == [f'npc{i}' for i in range(1, 91)]
# The client's own single-player Challenges, the only other Home Village maps it ships.
# They carry no MapInstanceName and no MapDependencies; their Town Hall comes from the
# record name, which is the only place the source states it.
CHALLENGE = re.compile(r'CHALLENGE_TH(\d+)_[A-Z0-9]+')
# Three Challenges post Clan Castle defenders at levels whose animation graphs this game has
# never captured (Balloon 5, Lava Hound 5, Ice Golem 5). Releasing them is not possible and
# substituting another level is not allowed, so those three stay out of the campaign entirely
# rather than shipping as locked entries. See docs/CAMPAIGN-RULES.md.
# Three more are drawn on the client's larger UseFullMapSize board and reach one tile past
# this game's 48-tile simulation grid. Shifting or rescaling a layout is never allowed, so
# they stay out too.
WITHHELD = {
    'CHALLENGE_TH8_GOWIVA': 'Balloon 5 garrison',
    'CHALLENGE_TH12_YETI': 'Lava Hound 5 and Baby Dragon 6 garrison',
    'CHALLENGE_TH13_HYBRID': 'Ice Golem 5 garrison',
    'CHALLENGE_TH9_BABYDQW': 'UseFullMapSize layout exceeds the 48-tile grid',
    'CHALLENGE_TH10_MINER': 'UseFullMapSize layout exceeds the 48-tile grid',
    'CHALLENGE_TH12_DRAGBAT': 'UseFullMapSize layout exceeds the 48-tile grid',
}
challenges = [g for g in records if CHALLENGE.fullmatch(g[0]['Name'])]
challenges.sort(key=lambda g: (int(CHALLENGE.fullmatch(g[0]['Name']).group(1)), g[0]['Name']))
assert len(challenges) == 19
assert set(WITHHELD) <= {g[0]['Name'] for g in challenges}
challenges = [g for g in challenges if g[0]['Name'] not in WITHHELD]
villages = npcs + challenges
paths = ['logic/npcs.csv', 'logic/buildings.csv', 'logic/traps.csv',
         'localization/texts.csv', 'localization/texts_patch.csv']
paths += [g[0]['LevelFile'] for g in villages]
paths += ['logic/obstacles.csv', 'logic/decos.csv']
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    sources = dict(zip(paths, (digest(data) for data in pool.map(read_source, paths))))
translations = {r['TID']: r['EN'] for path in paths[3:5] for r in table(path) if r.get('EN')}
ids = {g[0]['Name']: i + 1 for i, g in enumerate(villages)}
layouts = [dict(stage=i + 1, **layout(g[0]['LevelFile'])) for i, g in enumerate(villages)]
used = {b['data'] for v in layouts for key in ['buildings', 'traps'] for b in v[key]}
entities = {}
for path in paths[1:3]:
    for g in groups(table(path)):
        row = g[0]
        gid = int(row['GlobalID'])
        if gid in used:
            entities[str(gid)] = {k: row[k] for k in ['Name', 'Width', 'Height', 'TID'] if k in row}
assert used == {int(k) for k in entities}
stages = []
for i, group in enumerate(villages):
    row = group[0]
    challenge = CHALLENGE.fullmatch(row['Name'])
    stages.append(dict(stage=i + 1, id=row['Name'], name=translations[row['TID']],
                       family='challenge' if challenge else 'goblin',
                       dependencies=[ids[r['MapDependencies']] for r in group if 'MapDependencies' in r],
                       gold=int(row.get('Gold', 0)), elixir=int(row.get('Elixir', 0)),
                       darkElixir=int(row.get('DarkElixir', 0)),
                       recommendedTownHall=int(row.get('minRecommendedTHLevel', 0))
                       or (int(challenge.group(1)) if challenge else 0) or None,
                       nativeRows=group))
npc_columns = ['Name', 'GlobalID', 'BuildingClass', 'SecondaryTargetingClass',
               'Width', 'Height', 'BuildingLevel', 'Hitpoints', 'HousingSpace',
               'DPS', 'AttackSpeed', 'AttackRange', 'AirTargets', 'GroundTargets',
               'ExportName', 'ExportNameNpc']
building_groups = {g[0]['Name']: g for g in groups(table('logic/buildings.csv'))}
# Goblin identities exist only on the Goblin map, so their levels come from those layouts
# alone. A Challenge village's Town Hall is an ordinary Home Village Town Hall.
goblin_layouts = layouts[:len(npcs)]
npc_buildings = {name: [{k: row[k] for k in npc_columns if k in row}
                       for row in building_groups[name][:max(b.get('lvl', 0) + 1 for v in goblin_layouts for b in v['buildings']
                                  if b['data'] == int(building_groups[name][0]['GlobalID']))]]
                 for name in ['Town Hall', 'Goblin Hut', 'Tutorial Cannon']}
combat = {}
for path in ['logic/buildings.csv', 'logic/traps.csv']:
    for group in groups(table(path)):
        first = group[0]
        gid = int(first['GlobalID'])
        if gid not in used:
            continue
        combat[gid] = dict(name=first['Name'], size=int(first['Width']),
                           hp=[int(row.get('Hitpoints', 1)) for row in group],
                           dps=[int(row.get('DPS', 0)) for row in group])
        # Collision width for the client's sub-tile pathfinder (traps have none).
        if 'BuildingW' in first:
            combat[gid]['collision'] = int(first['BuildingW'])
scenery = {}
for path, family in [('logic/obstacles.csv', 8000000), ('logic/decos.csv', 18000000)]:
    for index, group in enumerate(groups(table(path))):
        row = group[0]
        scenery[family + index] = dict(name=row['Name'], size=int(row['Width']),
                                      export=row['ExportName'], passable=row.get('Passable') == 'TRUE' or row.get('IsFadedAndPassableInCombat') == 'TRUE',
                                      faded=row.get('IsFadedAndPassableInCombat') == 'TRUE',
                                      passableEdge=int(row.get('PassableSubtilesAtEdge', 0)))
used_scenery = {b['data'] for v in layouts for key in ['obstacles', 'decos'] for b in v[key]}
scenery = {i: s for i, s in scenery.items() if i in used_scenery}
assert used_scenery == set(scenery)
# Eagle Artillery, Scattershot, Spell Tower, Goblin Hall, Goblin Castle, Foreboding Cave, Goblin Boss TH.
LATE_STATE_IDS = {1000031, 1000067, 1000072, 1000017, 1000061, 1000062, 1000069}
LATE_STATE_FIELDS = ['data', 'x', 'y', 'lvl', 'ammo', 'wp_lvl', 'mode', 'attack_mode_weapon']


def compact_entity(b):
    return [b['data'], b['x'], b['y'], b.get('lvl', 0) + 1]
runtime = dict(stages=[dict(stage=s['stage'], name=s['name'], family=s['family'],
                           dependencies=s['dependencies'],
                           alwaysUnlocked=s['nativeRows'][0].get('AlwaysUnlocked') == 'TRUE',
                           gold=s['gold'], elixir=s['elixir'], darkElixir=s['darkElixir'],
                           recommendedTownHall=s['recommendedTownHall'],
                           allianceDefenders=[r for r in s['nativeRows'] if any(k.startswith('Alliance') for k in r)],
                           # Heroes that defend the village, named by the source with a level
                           # but never a position.
                           defendingHeroes=[dict(hero=r['DefendingHero'], level=int(r['DefendingHeroLevel']))
                                            for r in s['nativeRows'] if 'DefendingHero' in r],
                           buildings=[compact_entity(b) for b in v['buildings']],
                           traps=[compact_entity(b) for b in v['traps']],
                           obstacles=[compact_entity(b) for b in v['obstacles']],
                           decos=[compact_entity(b) for b in v['decos']],
                           # Inferno false mode flags and ammo are meaningful, not inactive metadata.
                           infernoStates=[b for b in v['buildings'] if b['data'] == 1000027],
                           # Keep active mode fields explicit; unsupported modes cannot silently vanish.
                           activeModes=[b for b in v['buildings'] + v['traps']
                                        if any(b.get(k) for k in ['attack_mode', 'air_mode', 'dir', 'direction'])],
                           # Late campaign weapons, ammunition and bunker modes. Only the current
                           # single-player selection is kept; war/draft alternatives are excluded.
                           lateStates=[{k: b[k] for k in LATE_STATE_FIELDS if k in b}
                                       for b in v['buildings'] + v['traps'] if b['data'] in LATE_STATE_IDS])
                      for s, v in zip(stages, layouts)], combat=combat, scenery=scenery)
outputs = {
    'catalog.json': json.dumps(dict(bundle=BUNDLE, withheld=WITHHELD, stages=stages,
                                    entities=entities), indent=2) + '\n',
    'layouts.jsonl': ''.join(json.dumps(v, separators=(',', ':')) + '\n' for v in layouts),
    'npc-buildings.json': json.dumps(npc_buildings, indent=2) + '\n',
    'runtime.json': json.dumps(runtime, separators=(',', ':')) + '\n',
}
outputs['provenance.json'] = json.dumps(dict(
    clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, retrieved='2026-09-11',
    sources=sources, acceptedJsonSuffixes=TAILS,
    outputs={k: digest(v.encode()) for k, v in outputs.items()}), indent=2) + '\n'
for name, content in outputs.items():
    target = DEST / name
    if args.check:
        assert target.read_text() == content, f'Generated reference differs: {name}'
    else:
        target.write_text(content)
print(f'{"Verified" if args.check else "Wrote"} {len(villages)} villages '
      f'({len(npcs)} Goblin map, {len(challenges)} Challenge, {len(WITHHELD)} withheld), '
      f'{len(used)} building/trap types, '
      f'{sum(len(v["buildings"]) for v in layouts)} building placements; {len(sources)} pinned sources.')
