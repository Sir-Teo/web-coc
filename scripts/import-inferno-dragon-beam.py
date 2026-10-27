#!/usr/bin/env python3
"""Retain the pinned Inferno Dragon beam rows; reuse the already imported Inferno graph."""
import argparse
import csv
import hashlib
import io
import json
import lzma
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    manifest = json.loads((ROOT / 'reference/full-client/manifest.json').read_text())
    pins = {}

    def table(path):
        entry = next(row for row in manifest['files'] if row['path'] == path)
        cache = ROOT / 'output/native-campaign-source' / path
        if not cache.exists():
            data = urllib.request.urlopen(manifest['baseUrl'] + path, timeout=30).read()
            assert hashlib.sha256(data).hexdigest() == entry['sha256'], path
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(data)
        data = cache.read_bytes()
        assert hashlib.sha256(data).hexdigest() == entry['sha256'], path
        pins[path] = entry['sha256']
        if data.startswith(b'Sig:'):
            data = data[68:]
        if not data.startswith(b'"'):
            data = lzma.decompress(data[:9] + b'\0' * 4 + data[9:])
        rows = list(csv.reader(io.StringIO(data.decode('utf-8-sig'))))
        result = {}
        current = None
        for row in rows[2:]:
            if not row:
                continue
            if row[0]:
                current = row[0]
            if current is not None:
                result.setdefault(current, []).append({k: v for k, v in zip(rows[0], row) if v})
        return result

    row = table('logic/characters.csv')['Inferno Dragon'][0]
    character = {key: row[key] for key in (
        'Name', 'AttackEffect', 'AttackEffectLv2', 'AttackEffectLv3', 'HitEffect',
        'TransitionEffectLv2', 'TransitionEffectLv3', 'TargetedEffectOffset',
    )}
    all_effects = table('logic/effects.csv')
    effects = {row[key]: all_effects[row[key]] for key in (
        'AttackEffect', 'AttackEffectLv2', 'AttackEffectLv3',
        'TransitionEffectLv2', 'TransitionEffectLv3',
    )}
    all_emitters = table('csv/particle_emitters.csv')
    emitters = {effect[0]['ParticleEmitter']: all_emitters[effect[0]['ParticleEmitter']] for effect in effects.values()}
    graph = json.loads((ROOT / 'reference/inferno/art-runtime.json').read_text())
    for emitter in emitters.values():
        assert emitter[0]['ParticleExportName'] in graph['exports']
    sounds = {}
    for key in ('TransitionEffectLv2', 'TransitionEffectLv3'):
        path = effects[row[key]][0]['Sound']
        entry = next(item for item in manifest['files'] if item['path'] == path)
        cache = ROOT / 'output/native-campaign-source' / path
        if not cache.exists():
            data = urllib.request.urlopen(manifest['baseUrl'] + path, timeout=30).read()
            assert hashlib.sha256(data).hexdigest() == entry['sha256'], path
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(data)
        data = cache.read_bytes()
        assert hashlib.sha256(data).hexdigest() == entry['sha256'], path
        relative = 'assets/audio/inferno-dragon-native/' + Path(path).name
        target = ROOT / 'public' / relative
        if args.check:
            assert target.read_bytes() == data, path
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        sounds[path] = dict(path=relative, bytes=len(data), sha256=entry['sha256'])
    document = dict(clientVersion=manifest['clientVersion'], sources=pins, character=character,
                    effects=effects, particles=emitters,
                    sounds=sounds,
                    graph='reference/inferno/art-runtime.json')
    target = ROOT / 'reference/inferno-dragon/beam.json'
    text = json.dumps(document, indent=2) + '\n'
    if args.check:
        assert target.read_text() == text, 'Beam reference differs'
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
    print('Verified pinned Inferno Dragon beam rows' if args.check else 'Wrote pinned Inferno Dragon beam rows')


if __name__ == '__main__':
    main()
