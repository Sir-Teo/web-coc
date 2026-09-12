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
npcs = [g for g in groups(table('logic/npcs.csv'))
        if re.fullmatch(r'npc\d+', g[0].get('MapInstanceName', ''))]
npcs.sort(key=lambda g: int(g[0]['MapInstanceName'][3:]))
assert len(npcs) == 90
assert [g[0]['MapInstanceName'] for g in npcs] == [f'npc{i}' for i in range(1, 91)]
paths = ['logic/npcs.csv', 'logic/buildings.csv', 'logic/traps.csv',
         'localization/texts.csv', 'localization/texts_patch.csv']
paths += [g[0]['LevelFile'] for g in npcs]
paths += ['logic/obstacles.csv', 'logic/decos.csv']
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    sources = dict(zip(paths, (digest(data) for data in pool.map(read_source, paths))))
translations = {r['TID']: r['EN'] for path in paths[3:5] for r in table(path) if r.get('EN')}
ids = {g[0]['Name']: i + 1 for i, g in enumerate(npcs)}
layouts = [dict(stage=i + 1, **layout(g[0]['LevelFile'])) for i, g in enumerate(npcs)]
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
for i, group in enumerate(npcs):
    row = group[0]
    stages.append(dict(stage=i + 1, id=row['Name'], name=translations[row['TID']],
                       dependencies=[ids[r['MapDependencies']] for r in group if 'MapDependencies' in r],
                       gold=int(row.get('Gold', 0)), elixir=int(row.get('Elixir', 0)),
                       darkElixir=int(row.get('DarkElixir', 0)),
                       recommendedTownHall=int(row.get('minRecommendedTHLevel', 0)) or None,
                       nativeRows=group))
npc_columns = ['Name', 'GlobalID', 'BuildingClass', 'SecondaryTargetingClass',
               'Width', 'Height', 'BuildingLevel', 'Hitpoints', 'HousingSpace',
               'DPS', 'AttackSpeed', 'AttackRange', 'AirTargets', 'GroundTargets',
               'ExportName', 'ExportNameNpc']
building_groups = {g[0]['Name']: g for g in groups(table('logic/buildings.csv'))}
npc_buildings = {name: [{k: row[k] for k in npc_columns if k in row}
                       for row in building_groups[name][:8 if name == 'Town Hall' else 1]]
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
def compact_entity(b):
    return [b['data'], b['x'], b['y'], b.get('lvl', 0) + 1]
runtime = dict(stages=[dict(stage=s['stage'], name=s['name'], dependencies=s['dependencies'],
                           alwaysUnlocked=s['nativeRows'][0].get('AlwaysUnlocked') == 'TRUE',
                           gold=s['gold'], elixir=s['elixir'], darkElixir=s['darkElixir'],
                           recommendedTownHall=s['recommendedTownHall'],
                           allianceDefenders=[r for r in s['nativeRows'] if any(k.startswith('Alliance') for k in r)],
                           buildings=[compact_entity(b) for b in v['buildings']],
                           traps=[compact_entity(b) for b in v['traps']],
                           obstacles=[compact_entity(b) for b in v['obstacles']],
                           decos=[compact_entity(b) for b in v['decos']],
                           # Keep active mode fields explicit; unsupported modes cannot silently vanish.
                           activeModes=[b for b in v['buildings'] + v['traps']
                                        if any(b.get(k) for k in ['attack_mode', 'air_mode', 'dir', 'direction'])])
                      for s, v in zip(stages, layouts)], combat=combat, scenery=scenery)
outputs = {
    'catalog.json': json.dumps(dict(bundle=BUNDLE, stages=stages, entities=entities), indent=2) + '\n',
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
print(f'{"Verified" if args.check else "Wrote"} 90 villages, {len(used)} building/trap types, '
      f'{sum(len(v["buildings"]) for v in layouts)} building placements; {len(sources)} pinned sources.')
