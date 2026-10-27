#!/usr/bin/env python3
"""Retain Meteor Staff's original attached casting aura, falling meteor and impact/crater.

PYTHONPATH=scripts python scripts/import-meteor-staff-art.py [--check] [--download-missing]
"""
import argparse
import hashlib
import importlib.util
import json
import urllib.request

from native_art.bundle import ROOT, BASE
from native_art.effect_library import Collector, Library, write_pack
from native_art.sc6 import require


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--download-missing', action='store_true')
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('meteor_staff_catalog', ROOT / 'scripts/native-full-catalog.py')
    art = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(art)
    lib = Library(art)
    read_source = art.read

    def read(path):
        cache = ROOT / 'output/native-campaign-source' / path
        if args.download_missing and not (art.ARCHIVE / 'files' / path).exists() and not cache.exists():
            require(path in art.MEMBERS, f'Unpinned source path: {path}')
            data = urllib.request.urlopen(BASE + path, timeout=30).read()
            require(hashlib.sha1(data).hexdigest() == art.MEMBERS[path], f'Source mismatch: {path}')
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(data)
        return read_source(path)

    art.read = read
    abilities, current = [], {}
    for level, row in enumerate(lib.table('logic/special_abilities.csv')['MPMeteorStaff'], 1):
        current.update(row)
        require(current['CastSpell'] == 'MPMeteorStaffSpell' and int(current['CastSpellLevel']) == level,
                'Meteor Staff ability-to-spell mapping changed')
        abilities.append(dict(current))
    require(len({row['ActivationEffect'] for row in abilities}) == 1, 'Meteor Staff activation changes with tier')
    levels, current = [], {}
    collector = Collector(lib)
    for level, row in enumerate(lib.table('logic/spells.csv')['MPMeteorStaffSpell'], 1):
        current.update(row)
        profile = {key: current[key] for key in ['PreDeployEffect', 'DeployEffect']}
        profile.update(level=level, deploySeconds=int(current['DeployTimeMS']) / 1000,
                       pulseSeconds=sum(int(current[key]) for key in ['DeployTimeMS', 'ChargingTimeMS', 'HitTimeMS']) / 1000,
                       ActivationEffect=abilities[level-1]['ActivationEffect'])
        impact = lib.effects[profile['DeployEffect']][0]
        profile.update(SpawnEffect=impact['SpawnEffect'], spawnDelaySeconds=int(impact.get('SpawnEffectDelay', '0')) / 1000)
        require(not any(row.get('SpawnEffect') for row in lib.effects[profile['SpawnEffect']]),
                'Meteor Staff has a deeper spawned effect chain')
        levels.append(profile)
        for key in ['ActivationEffect', 'PreDeployEffect', 'DeployEffect']:
            collector.effect(profile[key])
    require(len(levels) == len(abilities), 'Meteor Staff tier count changed')
    activation = lib.effects[levels[0]['ActivationEffect']][0]
    require(activation['AttachToParent'] == 'TRUE' and activation['DetachAfterStart'] == 'FALSE' and
            activation['DestroyWhenParentDies'] == 'FALSE', 'Expected an attached, death-independent casting aura')
    for key in ['PreDeployEffect', 'DeployEffect']:
        effect = lib.effects[levels[0][key]][0]
        require(effect['DetachAfterStart'] == 'TRUE' and effect['DestroyWhenParentDies'] == 'FALSE',
                f'Expected a detached stationary Meteor Staff {key}')
    require(not collector.missing, f'Missing Meteor Staff source: {collector.missing}')
    prefix = 'assets/meteor-staff-native/effects'
    result = write_pack(lib, collector, ROOT / 'public' / prefix, prefix,
                        dict(kind='meteor-staff-effects', spell='MPMeteorStaffSpell'), args.check)
    require(not result['skipped'], f'Meteor Staff exports missing: {result["skipped"]}')
    impact = lib.effects[levels[0]['DeployEffect']][0]
    index = dict(clientVersion='18.400.21', generator='scripts/import-meteor-staff-art.py',
                 sources=dict(sorted(art.PINS.items())), ability='MPMeteorStaff', spell='MPMeteorStaffSpell',
                 abilityLevelCount=len(abilities), spellLevels=levels,
                 shake={key: impact[key] for key in ['CameraShake', 'CameraShakeTimeMS', 'CameraShakeInReplay']},
                 effects={name: 'meteor-staff' for name in sorted(collector.effects)},
                 packs={'meteor-staff': dict(path=f'{prefix}/graph.json', sha256=result['sha256'], bytes=result['bytes'])},
                 conventions=dict(activation='Attached to the casting Prince; retain the final attached point after Recall.',
                                  phases='Source falling meteor begins on cast; impact begins at deployment, before the later damage pulse.',
                                  spawn='The impact root spawns its crater and residue at the source SpawnEffectDelay.',
                                  timelines='Retain animated descendants of static aura and residue exports.'))
    target = ROOT / 'reference/meteor-staff/effects.json'
    serialized = json.dumps(index, indent=2) + '\n'
    if args.check:
        require(target.read_text() == serialized, 'Meteor Staff effect index differs')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(serialized)
    print(f'{"Verified" if args.check else "Wrote"} original Meteor Staff: {result["bytes"]:,} bytes')


if __name__ == '__main__':
    main()
