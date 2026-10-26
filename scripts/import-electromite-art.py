#!/usr/bin/env python3
"""Retain the Electromite's source targeted lightning and impact particles as two lazy packs.

PYTHONPATH=scripts python scripts/import-electromite-art.py [--check] [--download-missing]
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
    spec = importlib.util.spec_from_file_location('electromite_catalog', ROOT / 'scripts/native-full-catalog.py')
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
    character = lib.table('logic/characters.csv')['Electromite'][0]
    columns = ['Name', 'Animation', 'DeployEffect', 'AttackEffect', 'HitEffect', 'DieEffect', 'TargetedEffectOffset']
    character = {key: character[key] for key in columns if key in character}
    effects, packs = {}, {}
    for key, column in [('attack', 'AttackEffect'), ('hit', 'HitEffect')]:
        effect = character[column]
        collector = Collector(lib)
        collector.effect(effect)
        require(not collector.missing, f'{effect}: missing source records {collector.missing}')
        require(collector.exports, f'{effect}: no source art')
        prefix = f'assets/electromite-native/{key}'
        result = write_pack(lib, collector, ROOT / 'public' / prefix, prefix, dict(kind='electromite-effects'), args.check)
        require(not result['skipped'], f'{effect}: source exports could not be retained')
        packs[key] = dict(path=f'{prefix}/graph.json', sha256=result['sha256'], bytes=result['bytes'])
        effects[effect] = key
    index = dict(clientVersion='18.400.21', generator='scripts/import-electromite-art.py',
                 character=character, sources=dict(sorted(art.PINS.items())), effects=effects, packs=packs,
                 conventions=dict(targeted='Original targeted particles use the shared native effect stretch adapter; '
                                  'the client attachment and beam stretching code is not in the tables.',
                                  sounds='Source samples already ship in reference/troop-sounds/sounds.json.'))
    target = ROOT / 'reference/electromite/effects.json'
    serialized = json.dumps(index, indent=2) + '\n'
    if args.check:
        require(target.read_text() == serialized, 'Electromite effect index differs')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(serialized)
    print(f'{"Verified" if args.check else "Wrote"} original Electromite lightning/impact: {sum(p["bytes"] for p in packs.values()):,} bytes')


if __name__ == '__main__':
    main()
