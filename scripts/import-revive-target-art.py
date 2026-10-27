#!/usr/bin/env python3
"""Retain the original winged-heart Revive target indicator.

PYTHONPATH=scripts python scripts/import-revive-target-art.py [--check] [--download-missing]
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
    spec = importlib.util.spec_from_file_location('revive_target_catalog', ROOT / 'scripts/native-full-catalog.py')
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
    name = 'hero_revive_indicator'
    collector = Collector(lib)
    collector.effect(name)
    require(not collector.missing, f'Missing Revive indicator source: {collector.missing}')
    prefix = 'assets/revive-native/target'
    result = write_pack(lib, collector, ROOT / 'public' / prefix, prefix, dict(kind='revive-target-effects'), args.check)
    require(not result['skipped'], f'Revive indicator exports missing: {result["skipped"]}')
    index = dict(clientVersion='18.400.21', generator='scripts/import-revive-target-art.py', sources=dict(sorted(art.PINS.items())),
                 effects={name: 'target'},
                 packs={'target': dict(path=f'{prefix}/graph.json', sha256=result['sha256'], bytes=result['bytes'])},
                 conventions=dict(lifecycle='The source finite 200-second marker is shown only while a Hero remains eligible and Revive is available.',
                                  placement='Source offsets and scale use the shared native isometric projection adapter.'))
    target = ROOT / 'reference/revive/effects.json'
    serialized = json.dumps(index, indent=2) + '\n'
    if args.check:
        require(target.read_text() == serialized, 'Revive target effect index differs')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(serialized)
    print(f'{"Verified" if args.check else "Wrote"} original Revive target indicator: {result["bytes"]:,} bytes')


if __name__ == '__main__':
    main()
