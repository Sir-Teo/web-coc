#!/usr/bin/env python3
"""Retain the Warden Fireball activation and three original area-explosion tiers.

PYTHONPATH=scripts python scripts/import-fireball-art.py [--check]
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
    spec = importlib.util.spec_from_file_location('fireball_catalog', ROOT / 'scripts/native-full-catalog.py')
    art = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(art)
    lib = Library(art)
    current, levels, effects, shakes = {}, [], {}, {}
    collector = Collector(lib)
    for level, row in enumerate(lib.table('logic/special_abilities.csv')['GrandWardenFireball'], 1):
        current.update(row)
        profile = {key: current[key] for key in ['ActivationEffect', 'HitEffect', 'ProjectileOnActivation']}
        profile['level'] = level
        levels.append(profile)
        for key in ['ActivationEffect', 'HitEffect']:
            name = profile[key]
            collector.effect(name)
            effects[name] = 'fireball'
            effect = lib.effects[name][0]
            shakes[name] = {key: effect.get(key, '0' if key != 'CameraShakeInReplay' else 'FALSE')
                            for key in ['CameraShake', 'CameraShakeTimeMS', 'CameraShakeInReplay']}
    require(not collector.missing, f'Missing Fireball source: {collector.missing}')
    prefix = 'assets/fireball-native/effects'
    result = write_pack(lib, collector, ROOT / 'public' / prefix, prefix,
                        dict(kind='warden-fireball-effects'), args.check)
    require(not result['skipped'], f'Fireball exports missing: {result["skipped"]}')
    index = dict(clientVersion='18.400.21', generator='scripts/import-fireball-art.py',
                 sources=dict(sorted(art.PINS.items())), effects=effects,
                 packs=dict(fireball=dict(path=f'{prefix}/graph.json', sha256=result['sha256'], bytes=result['bytes'])),
                 levels=levels, shakes=shakes,
                 conventions=dict(lifecycle='Activation at launch; area explosion at the resolved source projectile impact.',
                                  flight='Original projectile body, source, trail and destroyed effects reuse the full-client catalogs.'))
    target = ROOT / 'reference/fireball/effects.json'
    serialized = json.dumps(index, indent=2) + '\n'
    if args.check:
        require(target.read_text() == serialized, 'Fireball effect index differs')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(serialized)
    print(f'{"Verified" if args.check else "Wrote"} original Warden Fireball: {result["bytes"]:,} bytes')


if __name__ == '__main__':
    main()
