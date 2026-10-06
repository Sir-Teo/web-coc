#!/usr/bin/env python3
"""Import the client's village feedback sounds: collecting, building, upgrades and buttons.

Each sound comes from a named row of `logic/effects.csv` (its `Sound`, `Volume`, `MinPitch` and
`MaxPitch`), except the button click, which the client's interface plays directly from
`sfx/button_click.ogg`. The Ogg files are copied unchanged to public/assets/audio/village-native
and every source must match its SHA-256 in reference/full-client/manifest.json.

Sources are read from the local client archive when present
(art/source/native-client-18.400.21/files), otherwise downloaded from the pinned bundle.
"""
import argparse
import csv
import hashlib
import io
import json
import lzma
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = '7f04bdfdc4124b1f49308423bb8f4aa8b137aae3'
BASE = f'https://game-assets.clashofclans.com/{BUNDLE}/'
ARCHIVE = ROOT / 'art/source/native-client-18.400.21/files'
CACHE = ROOT / 'output/native-campaign-source'
TARGET = ROOT / 'reference/village-sounds/sounds.json'
AUDIO = 'assets/audio/village-native'
# The effects this game plays, by the client's own names.
EFFECTS = [
    'Collect Gold', 'Collect Elixir', 'Collect Dark Elixir', 'Collect Diamonds',
    'Start Building', 'Building Ready', 'Start Hero Upgrade', 'Hero Upgrade Finished',
    'Troop Upgrade Start', 'Troop Upgrade Finished', 'Generic Pick Up', 'Boost Start',
    'TH Upgrade Jingle',
]
CLICK = 'sfx/button_click.ogg'


def require(condition, message):
    if not condition:
        raise SystemExit(f'Village sound import: {message}')


def source(path, pins):
    require(path in pins, f'{path} is not in the client manifest')
    local = ARCHIVE / path
    if local.exists():
        data = local.read_bytes()
    else:
        target = CACHE / path
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix(target.suffix + '.part')
            subprocess.run(['curl', '--fail', '--silent', '--show-error', '--retry', '2',
                            BASE + path, '-o', str(temporary)], check=True)
            temporary.replace(target)
        data = target.read_bytes()
    require(hashlib.sha256(data).hexdigest() == pins[path], f'Source checksum differs: {path}')
    return data


def rows(blob):
    if blob.startswith(b'Sig:'):
        blob = blob[68:]
    if not blob.startswith(b'"'):
        blob = lzma.decompress(blob[:9] + b'\0' * 4 + blob[9:])
    return list(csv.reader(io.StringIO(blob.decode('utf-8-sig'))))


def build():
    manifest = json.loads((ROOT / 'reference/full-client/manifest.json').read_text())
    pins = {f['path']: f['sha256'] for f in manifest['files']}
    table = rows(source('logic/effects.csv', pins))
    headers, name, found = table[0], None, {}
    for values in table[2:]:
        if values and values[0]:
            name = values[0]
        row = dict(zip(headers, values))
        # An effect's first row that names a sound is the one it plays.
        if name in EFFECTS and name not in found and row.get('Sound'):
            found[name] = dict(sound=row['Sound'], volume=int(row['Volume']) / 100,
                               minPitch=int(row['MinPitch']) / 100,
                               maxPitch=int(row['MaxPitch']) / 100)
    require(set(found) == set(EFFECTS), f'Missing effects: {sorted(set(EFFECTS) - set(found))}')
    files, sounds = {}, {}
    for path in sorted({e['sound'] for e in found.values()} | {CLICK}):
        blob = source(path, pins)
        target = f'{AUDIO}/{path.split("/")[-1]}'
        files[ROOT / 'public' / target] = blob
        sounds[path] = dict(path=target, bytes=len(blob), sha256=pins[path])
    sources = {p: pins[p] for p in ['logic/effects.csv', *sounds]}
    catalog = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=sources,
                   effects={n: found[n] for n in EFFECTS}, click=CLICK, sounds=sounds)
    files[TARGET] = (json.dumps(catalog, indent=2) + '\n').encode()
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for path, data in build().items():
        if args.check:
            require(path.exists() and path.read_bytes() == data, f'{path.relative_to(ROOT)} differs')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    print('Village sounds reproduce the client.' if args.check else f'Wrote {TARGET.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
