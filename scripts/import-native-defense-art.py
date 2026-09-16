#!/usr/bin/env python3
"""Build lazy-loadable battle presentation packs for the Town Hall 11-18 defenses and new traps.

Each ``public/assets/defenses-native/<kind>/graph.json`` keeps, per building level, the declared effect
columns and weapon/spell/special-ability references (effects themselves are shared packs from
scripts/import-native-effect-art.py), plus the original timelines that are not building bodies:
Eagle Artillery ExportNameBeamStart/ExportNameBeamEnd and the 2D DefenderCharacter animations (Archer12,
Archer13, SuperWizard) with their idle/attack direction roots.

    PYTHONPATH=scripts output/native-art-venv/bin/python scripts/import-native-defense-art.py [--check]
"""
import argparse
import importlib.util
import json

from native_art.bundle import ROOT
from native_art.effect_library import Collector, Library, scene_id, sync_pack_dirs, write_pack
from native_art.sc6 import require
from native_art.source_csv import animation_blocks, decoded_rows

OUTPUT = ROOT / 'public/assets/defenses-native'
INDEX = ROOT / 'reference/full-client/defense-art.json'
PREFIX = 'assets/defenses-native'
DEFENDER_STATES = ('idle', 'attack')
NOTES = dict(
    defenders='DefenderCharacter rows are 2D animation blocks (csv/animations.csv). Count and DefenderZ are source '
              'values; the horizontal spacing of multiple rooftop defenders is a local layout (not in the tables).',
    beams='ExportNameBeamStart/End play at the launcher and the landing point with their WarmUp/Loop/Fade labels.',
    bodies='Building bodies, turret and attack frames stay in the village packs (scripts/import-native-village-art.py).')


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / file)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def defender(lib, blocks, name, collector):
    """First declared variant of the idle and attack states with numbered direction roots."""
    require(name in blocks, f'Missing defender animation {name}')
    states = {}
    for event in blocks[name]['rows']:
        state = event['Name'].lower()
        if state not in DEFENDER_STATES or state in states:
            continue
        path = event.get('SWF') or 'sc/characters.sc'
        exports = lib.directional(path, event['ExportName'])
        require(exports, f'Missing {path}:{event["ExportName"]}')
        for export in exports:
            collector.export(path, export)
        states[state] = dict(scene=scene_id(path), exports=exports, scale=float(event.get('Scale') or 100) / 100,
                             actionFrame=int(event.get('ActionFrame') or 0), loop=event.get('Looping') == 'TRUE')
    require(set(states) == set(DEFENDER_STATES), f'{name} lacks idle/attack states')
    return states


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    art = module('art', 'native-full-catalog.py')
    lib = Library(art)
    blocks = animation_blocks(decoded_rows(art.read('csv/animations.csv')))
    packs = {}
    for kind, entry in lib.defense_references().items():
        collector = Collector(lib)
        defenders, beams = {}, {}
        for level in entry['levels']:
            name = level.get('DefenderCharacter')
            if name and name not in defenders:
                defenders[name] = defender(lib, blocks, name, collector)
            for column in ('ExportNameBeamStart', 'ExportNameBeamEnd'):
                if level.get(column):
                    collector.export(level.get('SWF') or 'sc/buildings.sc', level[column])
                    beams[level[column]] = scene_id(level.get('SWF') or 'sc/buildings.sc')
        meta = dict(kind=kind, levels=entry['levels'], weapons=entry['weapons'], spells=entry['spells'],
                    abilities=entry['abilities'], defenders=defenders, beams=beams)
        result = write_pack(lib, collector, OUTPUT / kind, f'{PREFIX}/{kind}', meta, args.check)
        require(not result['skipped'], f'{kind}: unsupported source exports {result["skipped"]}')
        packs[kind] = dict(path=f'{PREFIX}/{kind}/graph.json', sha256=result['sha256'], bytes=result['bytes'],
                           levels=len(entry['levels']), defenders=sorted(defenders), beams=sorted(beams))
        print(f'{kind}: {len(entry["levels"])} levels, defenders {sorted(defenders) or "-"}, '
              f'{result["bytes"]:,} bytes', flush=True)
    sync_pack_dirs(OUTPUT, packs, args.check)
    total = sum(p['bytes'] for p in packs.values())
    index = dict(clientVersion='18.400.21', generator='scripts/import-native-defense-art.py', conventions=NOTES,
                 sources=dict(sorted(art.PINS.items())), totalBytes=total, kinds=packs)
    serialized = json.dumps(index, indent=2) + '\n'
    if args.check:
        require(INDEX.read_text() == serialized, 'Defense art index differs')
        print(f'check passed: {len(packs)} kinds, {total:,} bytes')
    else:
        INDEX.write_text(serialized)
        print(f'{len(packs)} kinds, {total:,} bytes')


if __name__ == '__main__':
    main()
