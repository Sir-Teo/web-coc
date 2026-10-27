#!/usr/bin/env python3
"""Retain Electro Boots' original passive activation, emitter and camera impulse.

PYTHONPATH=scripts python scripts/import-electro-boots-art.py [--check]
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
    spec = importlib.util.spec_from_file_location('electro_boots_catalog', ROOT / 'scripts/native-full-catalog.py')
    art = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(art)
    lib = Library(art)
    current, profiles = {}, []
    rows = lib.table('logic/special_abilities.csv')['Electro Boots Aura']
    for row in rows:
        current.update(row)
        profiles.append(dict(ActivationEffect=current['ActivationEffect']))
    require(all(profile == profiles[0] for profile in profiles), 'Electro Boots activation changes with level')
    profile = profiles[0]
    activation = lib.effects[profile['ActivationEffect']][0]
    require(activation.get('AttachToParent') == 'FALSE' and activation.get('DestroyWhenParentDies') == 'FALSE',
            'Expected an independent activation at the captured origin')
    collector = Collector(lib)
    collector.effect(profile['ActivationEffect'])
    require(not collector.missing, f'Missing Electro Boots source: {collector.missing}')
    prefix = 'assets/electro-boots-native/activation'
    result = write_pack(lib, collector, ROOT / 'public' / prefix, prefix,
                        dict(kind='electro-boots-activation'), args.check)
    require(not result['skipped'], f'Electro Boots exports missing: {result["skipped"]}')
    index = dict(clientVersion='18.400.21', generator='scripts/import-electro-boots-art.py',
                 sources=dict(sorted(art.PINS.items())), ability='Electro Boots Aura', abilityLevelCount=len(rows),
                 profile=profile,
                 shake={key: activation[key] for key in ['CameraShake', 'CameraShakeTimeMS', 'CameraShakeInReplay']},
                 effects={profile['ActivationEffect']: 'electro-boots'},
                 packs={'electro-boots': dict(path=f'{prefix}/graph.json', sha256=result['sha256'], bytes=result['bytes'])},
                 conventions=dict(activation='Independent stationary effect at passive deployment or aura resurrection; no manual activation.'))
    target = ROOT / 'reference/electro-boots/effects.json'
    serialized = json.dumps(index, indent=2) + '\n'
    if args.check:
        require(target.read_text() == serialized, 'Electro Boots effect index differs')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(serialized)
    print(f'{"Verified" if args.check else "Wrote"} original Electro Boots: {result["bytes"]:,} bytes')


if __name__ == '__main__':
    main()
