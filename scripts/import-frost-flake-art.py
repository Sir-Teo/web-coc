#!/usr/bin/env python3
"""Retain the Royal Champion's original Frost Flake activation and flight/sound references.

PYTHONPATH=scripts python scripts/import-frost-flake-art.py [--check]
"""
import argparse
import importlib.util
import json

from native_art.bundle import ROOT
from native_art.effect_library import Collector, Library, write_pack
from native_art.sc6 import require


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('frost_flake_catalog', ROOT / 'scripts/native-full-catalog.py')
    art = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(art)
    lib = Library(art)
    current, profiles = {}, []
    rows = lib.table('logic/special_abilities.csv')['FrostBlast']
    for row in rows:
        current.update(row)
        profiles.append({key: current[key] for key in ['ActivationEffect', 'ProjectileOnActivation']})
    require(all(profile == profiles[0] for profile in profiles), 'Frost Flake presentation changes with level')
    profile = profiles[0]
    projectile = lib.table('logic/projectiles.csv')[profile['ProjectileOnActivation']][0]
    profile.update(ParticleEmitter=projectile['ParticleEmitter'], DestroyedEffect=projectile['DestroyedEffect'])
    activation = lib.effects[profile['ActivationEffect']][0]
    require(activation.get('AttachToParent') == 'FALSE' and activation.get('DestroyWhenParentDies') == 'FALSE',
            'Expected an independent activation at the captured origin')
    hit = lib.effects[profile['DestroyedEffect']]
    require(all(row.get('Sound') and not row.get('SWF') and not row.get('ParticleEmitter') for row in hit),
            'Expected a sound-only projectile impact')
    collector = Collector(lib)
    collector.effect(profile['ActivationEffect'])
    require(not collector.missing, f'Missing Frost Flake source: {collector.missing}')
    prefix = 'assets/frost-flake-native/activation'
    result = write_pack(lib, collector, ROOT / 'public' / prefix, prefix,
                        dict(kind='frost-flake-activation'), args.check)
    require(not result['skipped'], f'Frost Flake exports missing: {result["skipped"]}')
    index = dict(clientVersion='18.400.21', generator='scripts/import-frost-flake-art.py',
                 sources=dict(sorted(art.PINS.items())), ability='FrostBlast', abilityLevelCount=len(rows), profile=profile,
                 effects={profile['ActivationEffect']: 'frost-flake'},
                 packs={'frost-flake': dict(path=f'{prefix}/graph.json', sha256=result['sha256'], bytes=result['bytes'])},
                 conventions=dict(activation='Independent, stationary source effect at the captured activation time and position.',
                                  projectile='Body and trail reuse the full-client catalogs; DestroyedEffect declares sound only.'))
    target = ROOT / 'reference/frost-flake/effects.json'
    serialized = json.dumps(index, indent=2) + '\n'
    if args.check:
        require(target.read_text() == serialized, 'Frost Flake effect index differs')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(serialized)
    print(f'{"Verified" if args.check else "Wrote"} original Frost Flake: {result["bytes"]:,} bytes')


if __name__ == '__main__':
    main()
