#!/usr/bin/env python3
"""Retain original Recall disappearance and redeployment effects.

PYTHONPATH=scripts python scripts/import-recall-unit-art.py [--check] [--download-missing]
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
    spec = importlib.util.spec_from_file_location('recall_unit_catalog', ROOT / 'scripts/native-full-catalog.py')
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
    # The named effects are an explicit presentation adapter for the model's Recall transitions.
    phases = {'disappear': ['Recall Disappear'],
              'redeploy': ['RecallRedeployAuraGround', 'RecallRedeployAuraTop']}
    collector = Collector(lib)
    profiles = {}
    for phase, names in phases.items():
        profiles[phase] = []
        for name in names:
            collector.effect(name)
            row = lib.effects[name][0]
            scale = int(row.get('LifeTimeScale', '100')) / 100
            profiles[phase].append(dict(effect=name, timeScale=int(scale) if scale.is_integer() else scale))
    require(not collector.missing, f'Missing Recall transition source: {collector.missing}')
    prefix = 'assets/recall-native/units'
    result = write_pack(lib, collector, ROOT / 'public' / prefix, prefix, dict(kind='recall-unit-effects'), args.check)
    require(not result['skipped'], f'Recall transition exports missing: {result["skipped"]}')
    index = dict(clientVersion='18.400.21', generator='scripts/import-recall-unit-art.py', sources=dict(sorted(art.PINS.items())),
                 effects={name: 'units' for name in sorted(collector.effects)},
                 packs={'units': dict(path=f'{prefix}/graph.json', sha256=result['sha256'], bytes=result['bytes'])},
                 phases=profiles,
                 conventions=dict(events='Named source effects map explicitly to primary unit Recall and redeployment transitions.',
                                  time='Each effect samples source time at battle age divided by its LifeTimeScale percentage.',
                                  placement='Retained map positions use the shared native isometric projection adapter.'))
    target = ROOT / 'reference/recall/effects.json'
    serialized = json.dumps(index, indent=2) + '\n'
    if args.check:
        require(target.read_text() == serialized, 'Recall unit effect index differs')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(serialized)
    print(f'{"Verified" if args.check else "Wrote"} original Recall unit effects: {result["bytes"]:,} bytes')


if __name__ == '__main__':
    main()
