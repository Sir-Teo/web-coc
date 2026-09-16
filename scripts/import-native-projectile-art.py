#!/usr/bin/env python3
"""Build lazy-loadable original projectile flight packs for every client projectile row used in battle.

Rows come from reference/full-client/combat.json ``projectiles`` (troops, spells, heroes, pets and
defenses). Each row resolves its logic/projectiles.csv SWF + ExportName (or the numbered direction
roots declared by DirectionCount) and ShadowSWF + ShadowExportName. Rows whose flight art is identical
share one pack. Trail emitters and Effect / SpawnEffect / DestroyedEffect / BounceEffect records are
shared effect packs built by scripts/import-native-effect-art.py; each row keeps their names.

    PYTHONPATH=scripts output/native-art-venv/bin/python scripts/import-native-projectile-art.py [--check]
"""
import argparse
import importlib.util
import json

from native_art.bundle import ROOT
from native_art.effect_library import Collector, Library, sync_pack_dirs, unique_ids, write_pack
from native_art.sc6 import require

OUTPUT = ROOT / 'public/assets/projectiles-native'
INDEX = ROOT / 'reference/full-client/projectile-art.json'
PREFIX = 'assets/projectiles-native'
# Presentation and flight columns the browser needs; gameplay numbers stay in combat.json.
COLUMNS = ['SWF', 'ExportName', 'ShadowSWF', 'ShadowExportName', 'ScaleTimeline', 'DirectionCount', 'ParticleEmitter',
           'RotateEmitter', 'Effect', 'RotateEffect', 'SpawnEffect', 'Speed', 'StartHeight', 'StartOffset', 'IsBallistic',
           'UseRotate', 'DirectionFrame', 'PlayOnce', 'UseTopLayer', 'Scale', 'BallisticHeight', 'TrajectoryStyle',
           'FixedTravelTime', 'DamageDelay', 'DestroyedEffect', 'BounceEffect', 'ProjectileEffectOffset', 'HitSpell',
           '3D', 'UseParentAnimation3D', 'StartOffsetFromGunBone']
NOTES = dict(
    placement='Local village projection shared with the native defense renderers: source x/y units are 1/100 tile '
              '(0.32 px/unit across, 0.16 px/unit down), altitude units draw at 0.8 px, art at 1.2x.',
    rotation='UseRotate art points along source +Y; it follows the projected flight tangent (atan2 - 90 degrees).',
    directions='DirectionCount rows use numbered roots (_1.._N, half the declared count) mirrored for leftward '
               'flight, like troop direction roots. DirectionFrame rows play their timeline on the flight clock.',
    ballistic='IsBallistic arcs use BallisticHeight source units as the peak altitude of a parabola between the '
              'StartHeight launch point and the target; native TrajectoryStyle curves are not reconstructed.',
    shadow='ShadowExportName draws on the ground under the flight point when declared.',
    effects='Trail emitters and projectile effects are shared packs listed in reference/full-client/effect-art.json.')


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / file)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    art = module('art', 'native-full-catalog.py')
    lib = Library(art)
    groups, order = {}, []
    for name, row in lib.projectile_rows().items():
        collector = Collector(lib)
        exports = lib.directional(row['SWF'], row['ExportName'])
        require(exports, f'Missing projectile art {row["SWF"]}:{row["ExportName"]}')
        for export in exports:
            collector.export(row['SWF'], export)
        if row.get('ShadowExportName'):
            collector.export(row.get('ShadowSWF') or row['SWF'], row['ShadowExportName'])
        key = collector.signature()
        if key not in groups:
            groups[key] = dict(collector=collector, rows={})
            order.append(key)
        entry = {k: row[k] for k in COLUMNS if k in row}
        entry['exports'] = exports
        groups[key]['rows'][name] = entry
    ids = unique_ids([next(iter(groups[key]['rows'])) for key in order])
    packs, projectiles = {}, {}
    for key in order:
        group = groups[key]
        pack_id = ids[next(iter(group['rows']))]
        result = write_pack(lib, group['collector'], OUTPUT / pack_id, f'{PREFIX}/{pack_id}',
                            dict(kind='projectile', projectiles=group['rows']), args.check)
        packs[pack_id] = dict(path=f'{PREFIX}/{pack_id}/graph.json', sha256=result['sha256'], bytes=result['bytes'],
                              projectiles=list(group['rows']), **({'skipped': result['skipped']} if result['skipped'] else {}))
        for name in group['rows']:
            projectiles[name] = pack_id
    sync_pack_dirs(OUTPUT, packs, args.check)
    total = sum(p['bytes'] for p in packs.values())
    index = dict(clientVersion='18.400.21', generator='scripts/import-native-projectile-art.py', conventions=NOTES,
                 sources=dict(sorted(art.PINS.items())), totalBytes=total, packs=packs, projectiles=projectiles)
    serialized = json.dumps(index, indent=2) + '\n'
    if args.check:
        require(INDEX.read_text() == serialized, 'Projectile art index differs')
        print(f'check passed: {len(projectiles)} rows in {len(packs)} packs, {total:,} bytes')
    else:
        INDEX.write_text(serialized)
        print(f'{len(projectiles)} projectile rows in {len(packs)} packs, {total:,} bytes')


if __name__ == '__main__':
    main()
