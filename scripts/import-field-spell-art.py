#!/usr/bin/env python3
"""Retain original spell fields, reusing verified source packs.

PYTHONPATH=scripts python scripts/import-field-spell-art.py [--check] [--download-missing]
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
    spec = importlib.util.spec_from_file_location('field_spell_catalog', ROOT / 'scripts/native-full-catalog.py')
    art = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(art)
    fingerprint = art.ARCHIVE / 'fingerprint.json'
    if not fingerprint.exists():
        fingerprint = ROOT / 'output/native-campaign-source/fingerprint.json'
    lib = Library(art, fingerprint)
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
    def particle_tail(name):
        # Retained fields contain finite particle rows only. Match the runtime's conservative
        # emission + maximum-life bound without importing a mesh graph into combat code.
        rows = lib.effects[name]
        longest = 0
        for own in rows:
            row = {**rows[0], **own}
            require(not own.get('SWF'), f'Expected particle-only durable field: {name}')
            require(int(row.get('LifeTimeScale', '100')) == 100, f'Unexpected durable field time scale: {name}')
            emitter = own.get('ParticleEmitter')
            if emitter:
                source = lib.emitters[emitter][0]
                longest = max(longest, (int(own.get('EmitterDelayMs', '0')) + int(source['EmissionTime']) +
                                       max(int(source['MinLife']), int(source['MaxLife']))) / 1000)
        return longest

    existing = json.loads((ROOT / 'reference/full-client/effect-art.json').read_text())
    effects, packs, spells, external = {}, {}, {}, {}
    for spell, key in [('Rage', 'rage'), ('Haste', 'haste'), ('Healing', 'heal'), ('Poison', 'poison'),
                       ('Clone', 'clone'), ('Invisibility', 'invisibility'), ('Recall', 'recall'),
                       ('Lightning', 'lightning'), ('Earthquake', 'earthquake'),
                       ('Skeleton Spell', 'skeleton'), ('Bat Spell', 'bat')]:
        profiles, current, names = [], {}, set()
        for level, row in enumerate(lib.table('logic/spells.csv')[spell], 1):
            current.update(row)
            profile = {k: current[k] for k in ['PreDeployEffect', 'DeployEffect', 'DeployEffect2', 'ChargingEffect'] if current.get(k)}
            profile.update(level=level, deploySeconds=int(current['DeployTimeMS']) / 1000,
                           pulseSeconds=sum(int(current[k]) for k in ['DeployTimeMS', 'ChargingTimeMS', 'HitTimeMS']) / 1000)
            if current.get('ChargingEffect'):
                profile['chargingTargeted'] = any(row.get('Targeted') == 'TRUE' for row in lib.effects[current['ChargingEffect']])
            if current.get('HitEffect'):
                profile['HitEffect'] = current['HitEffect']
                radius = int(current.get('RandomRadius', '0'))
                profile['hitRadiusTiles'] = radius // 100 if radius % 100 == 0 else radius / 100
                profile['graphicsOnlyRadius'] = current.get('RandomRadiusAffectsOnlyGfx') == 'TRUE'
            if spell in ['Earthquake', 'Skeleton Spell', 'Bat Spell']:
                profile['retainSeconds'] = round(profile['deploySeconds'] + max(
                    particle_tail(profile[k]) for k in ['DeployEffect', 'DeployEffect2'] if profile.get(k)), 3)
            profiles.append(profile)
            names.update(profile[k] for k in ['PreDeployEffect', 'DeployEffect', 'DeployEffect2', 'ChargingEffect', 'HitEffect'] if profile.get(k))
        spells[spell] = dict(key=key, levels=profiles)
        collector = Collector(lib)
        for name in sorted(names):
            old_id = existing['effects'].get(name)
            if old_id:
                if name not in external:
                    old = existing['packs'][old_id]
                    graph_path = ROOT / 'public' / old['path']
                    data = json.loads(graph_path.read_text())
                    require(list(data['effects']) == [name], f'Expected one reused effect: {name}')
                    reused = Collector(lib)
                    reused.effect(name)
                    # Always read-only: verify the existing graph and decoded pixels against source.
                    result = write_pack(lib, reused, graph_path.parent, str(graph_path.parent.relative_to(ROOT / 'public')),
                                        dict(kind=data['kind']), True)
                    require(result['sha256'] == old['sha256'] and result['bytes'] == old['bytes'], f'Reused pack differs: {name}')
                    external[name] = old
                continue
            collector.effect(name)
            effects[name] = key
        require(not collector.missing, f'Missing source effects: {collector.missing}')
        prefix = f'assets/field-spells-native/{key}'
        result = write_pack(lib, collector, ROOT / 'public' / prefix, prefix,
                            dict(kind='field-spell-effects', spell=spell), args.check)
        require(not result['skipped'], f'Missing exports: {result["skipped"]}')
        packs[key] = dict(path=f'{prefix}/graph.json', sha256=result['sha256'], bytes=result['bytes'])
    index = dict(clientVersion='18.400.21', generator='scripts/import-field-spell-art.py', sources=dict(sorted(art.PINS.items())),
                 effects=effects, packs=packs, spells=spells, externalEffects=external,
                 conventions=dict(lifecycle='Source cast phases retain original finite emitter lifetimes; combat pulse timing is unchanged.',
                                  reuse='Existing effects are verified against source without modifying their packs.',
                                  placement='Source offsets use the shared native isometric projection adapter.'))
    target = ROOT / 'reference/field-spells/effects.json'
    serialized = json.dumps(index, indent=2) + '\n'
    if args.check:
        require(target.read_text() == serialized, 'Field spell index differs')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(serialized)
    print(f'{"Verified" if args.check else "Wrote"} original field spells: {sum(p["bytes"] for p in packs.values()):,} new bytes; '
          f'{sum(p["bytes"] for p in external.values()):,} existing bytes reused')


if __name__ == '__main__':
    main()
