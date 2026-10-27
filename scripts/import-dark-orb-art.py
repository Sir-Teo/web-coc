#!/usr/bin/env python3
"""Retain the Minion Prince's original Dark Orb contact effect and presentation references.

PYTHONPATH=scripts python scripts/import-dark-orb-art.py [--check]
"""
import argparse
import importlib.util
import json

from native_art.bundle import ROOT
from native_art.effect_library import Collector, Library, write_pack
from native_art.opaque_mask import OpaqueMaskScene
from native_art.sc6 import require


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('dark_orb_catalog', ROOT / 'scripts/native-full-catalog.py')
    art = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(art)
    lib = Library(art)
    current, profiles = {}, []
    rows = lib.table('logic/special_abilities.csv')['MinionAttackAbility']
    for row in rows:
        current.update(row)
        profiles.append({key: current[key] for key in ['ActivationEffect', 'HitEffect', 'ProjectileOnActivation']})
    require(all(profile == profiles[0] for profile in profiles), 'Dark Orb presentation changes with level')
    profile = profiles[0]
    projectile = lib.table('logic/projectiles.csv')[profile['ProjectileOnActivation']][0]
    profile.update(SpawnEffect=projectile['SpawnEffect'], DestroyedEffect=projectile['DestroyedEffect'])
    activation = lib.effects[profile['ActivationEffect']]
    require(all(row.get('Sound') and not row.get('ParticleEmitter') and not row.get('SWF') for row in activation),
            'Expected a sound-only Dark Orb activation')
    collector = Collector(lib)
    collector.effect(profile['HitEffect'])
    require(not collector.missing, f'Missing Dark Orb source: {collector.missing}')
    prefix = 'assets/dark-orb-native/contact'
    result = write_pack(lib, collector, ROOT / 'public' / prefix, prefix, dict(kind='dark-orb-contact'), args.check)
    require(not result['skipped'], f'Dark Orb exports missing: {result["skipped"]}')
    # The full-client catalog records this crystal as skipped: its root uses a mask.
    # Its mask samples one fully opaque texel, so exact polygon clipping retains
    # the original animated meshes without a raster atlas or a new GPU pipeline.
    scene_path = projectile['SWF']
    original_scene = lib.scene
    masked = OpaqueMaskScene(original_scene(scene_path), projectile['ExportName'],
                             lambda texture: lib.texture(scene_path, texture))
    lib.scene = lambda path: masked if path == scene_path else original_scene(path)
    flight = Collector(lib)
    flight.export(scene_path, projectile['ExportName'])
    flight_prefix = 'assets/dark-orb-native/projectile'
    flight_result = write_pack(lib, flight, ROOT / 'public' / flight_prefix, flight_prefix,
                              dict(kind='dark-orb-projectile', projectiles={profile['ProjectileOnActivation']:
                                   dict(projectile, exports=[projectile['ExportName']])}), args.check)
    require(not flight_result['skipped'], f'Dark Orb masked body missing: {flight_result["skipped"]}')
    index = dict(clientVersion='18.400.21', generator='scripts/import-dark-orb-art.py',
                 sources=dict(sorted(art.PINS.items())), ability='MinionAttackAbility', abilityLevelCount=len(rows),
                 profile=profile, effects={profile['HitEffect']: 'dark-orb'},
                 projectiles={profile['ProjectileOnActivation']: 'dark-orb-flight'},
                 packs={'dark-orb': dict(path=f'{prefix}/graph.json', sha256=result['sha256'], bytes=result['bytes']),
                        'dark-orb-flight': dict(path=f'{flight_prefix}/graph.json', sha256=flight_result['sha256'], bytes=flight_result['bytes'])},
                 conventions=dict(contact='Independent source effect at the captured building or defender contact.',
                                  projectile='Opaque convex source mask compiled to clipped native meshes; original portal and final impact reuse the full-client catalogs.'))
    target = ROOT / 'reference/dark-orb/effects.json'
    serialized = json.dumps(index, indent=2) + '\n'
    if args.check:
        require(target.read_text() == serialized, 'Dark Orb effect index differs')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(serialized)
    print(f'{"Verified" if args.check else "Wrote"} original Dark Orb: {result["bytes"]:,} contact + {flight_result["bytes"]:,} flight bytes')


if __name__ == '__main__':
    main()
