#!/usr/bin/env python3
"""Retain original Overgrowth roots per footprint and bottle/landing/field art in a cast pack.

PYTHONPATH=scripts python scripts/import-overgrowth-art.py [--check] [--download-missing]
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
    spec = importlib.util.spec_from_file_location('overgrowth_catalog', ROOT / 'scripts/native-full-catalog.py')
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
    spell_rows = lib.table('logic/spells.csv')['Overgrowth']
    effects, packs, phases = {}, {}, {}
    for size in [2, 3, 4]:
        key = str(size)
        names = {stage: f'entangle_spell_{stage}_{size}x{size}' for stage in ['start', 'deployed', 'stop']}
        collector = Collector(lib)
        for effect in names.values():
            collector.effect(effect)
        require(not collector.missing, f'Missing source records: {collector.missing}')
        prefix = f'assets/overgrowth-native/{size}x{size}'
        result = write_pack(lib, collector, ROOT / 'public' / prefix, prefix, dict(kind='overgrowth-effects'), args.check)
        require(not result['skipped'], f'Overgrowth exports missing: {result["skipped"]}')
        packs[key] = dict(path=f'{prefix}/graph.json', sha256=result['sha256'], bytes=result['bytes'])
        graph = json.loads((ROOT / 'public' / prefix / 'graph.json').read_text())['scenes']['buildings']
        timings = {}
        for stage, effect in names.items():
            effects[effect] = key
            row = lib.effects[effect][0]
            clip = graph['clips'][str(graph['exports'][row['ExportName']])]
            timings[stage] = dict(effect=effect, export=row['ExportName'], frames=len(clip['timeline']), fps=clip['fps'], seconds=len(clip['timeline']) / clip['fps'])
        phases[key] = timings
    spell_levels, current = [], {}
    collector = Collector(lib)
    for level, row in enumerate(spell_rows, 1):
        current.update(row)
        profile = {key: current[key] for key in ['PreDeployEffect', 'DeployEffect', 'DeployEffect2']}
        profile.update(level=level, deploySeconds=int(current['DeployTimeMS']) / 1000,
                       pulseSeconds=sum(int(current[key]) for key in ['DeployTimeMS', 'ChargingTimeMS', 'HitTimeMS']) / 1000)
        spell_levels.append(profile)
        for name in [profile[key] for key in ['PreDeployEffect', 'DeployEffect', 'DeployEffect2']]:
            collector.effect(name)
            effects[name] = 'cast'
    require(not collector.missing, f'Missing cast source: {collector.missing}')
    prefix = 'assets/overgrowth-native/cast'
    result = write_pack(lib, collector, ROOT / 'public' / prefix, prefix, dict(kind='overgrowth-cast-effects'), args.check)
    require(not result['skipped'], f'Cast exports missing: {result["skipped"]}')
    packs['cast'] = dict(path=f'{prefix}/graph.json', sha256=result['sha256'], bytes=result['bytes'])
    index = dict(clientVersion='18.400.21', generator='scripts/import-overgrowth-art.py', sources=dict(sorted(art.PINS.items())),
                 effects=effects, packs=packs, phases=phases, spellLevels=spell_levels,
                 conventions=dict(lifecycle='The original root clips are retained unchanged. External root lifetime selects start, deployed and stop phases.',
                                  placement='Source effect offsets use the shared native isometric projection adapter.'))
    target = ROOT / 'reference/overgrowth/effects.json'
    serialized = json.dumps(index, indent=2) + '\n'
    if args.check:
        require(target.read_text() == serialized, 'Overgrowth effect index differs')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(serialized)
    print(f'{"Verified" if args.check else "Wrote"} original Overgrowth roots and cast: {sum(p["bytes"] for p in packs.values()):,} bytes')


if __name__ == '__main__':
    main()
