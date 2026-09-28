#!/usr/bin/env python3
"""Import the pinned experience table: the XP each chief level needs to reach the next.

`experience_levels.csv` has one row per level. `ExpPoints` is the experience needed to
advance from that level to the next; the last row is the level cap.

The source is read from the local client archive when it is present
(art/source/native-client-18.400.21/files), otherwise downloaded from the pinned bundle.
Either way it must match the SHA-256 recorded in reference/full-client/manifest.json.
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
PATH = 'logic/experience_levels.csv'
ARCHIVE = ROOT / 'art/source/native-client-18.400.21/files'
CACHE = ROOT / 'output/native-campaign-source'
REFERENCE = ROOT / 'reference/experience'


def require(condition, message):
    if not condition:
        raise SystemExit(f'Experience import: {message}')


def pinned_sha256():
    manifest = json.loads((ROOT / 'reference/full-client/manifest.json').read_text())
    entry = next((f for f in manifest['files'] if f['path'] == PATH), None)
    require(entry is not None, f'{PATH} is not in the client manifest')
    return entry['sha256']


def source(pin):
    local = ARCHIVE / PATH
    if local.exists():
        data = local.read_bytes()
    else:
        target = CACHE / PATH
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix(target.suffix + '.part')
            subprocess.run(['curl', '--fail', '--silent', '--show-error', '--retry', '2',
                            BASE + PATH, '-o', str(temporary)], check=True)
            temporary.replace(target)
        data = target.read_bytes()
    require(hashlib.sha256(data).hexdigest() == pin, f'Source checksum differs: {PATH}')
    return data


def table(blob):
    if blob.startswith(b'Sig:'):
        blob = blob[68:]
    if not blob.startswith(b'"'):
        blob = lzma.decompress(blob[:9] + b'\0' * 4 + blob[9:])
    decoded = list(csv.reader(io.StringIO(blob.decode('utf-8-sig'))))
    headers = decoded[0]
    require(headers[0] == 'Name', 'Missing table header')
    return headers, [row for row in decoded[2:] if row and row[0]]


def build():
    pin = pinned_sha256()
    headers, rows = table(source(pin))
    require('ExpPoints' in headers, f'Absent ExpPoints column; headers are {headers}')
    at = headers.index('ExpPoints')
    levels = []
    for row in rows:
        require(row[0].isdigit(), f'Unexpected level name {row[0]!r}')
        levels.append(dict(level=int(row[0]), points=int(row[at] or 0)))
    require([l['level'] for l in levels] == list(range(1, len(levels) + 1)),
            'Levels are not contiguous from 1')
    return dict(
        clientVersion='18.400.21',
        bundle=BUNDLE,
        baseUrl=BASE,
        sources={PATH: pin},
        scope='XP needed at each chief level to reach the next; the last level is the cap.',
        levels=levels,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true',
                        help='verify the committed reference instead of rewriting it')
    arguments = parser.parse_args()
    catalog = build()
    target = REFERENCE / 'catalog.json'
    text = json.dumps(catalog, indent=2) + '\n'
    if arguments.check:
        require(target.exists(), 'Missing reference/experience/catalog.json')
        require(target.read_text() == text, 'Committed experience catalog differs from the source')
        print(f'Experience catalog reproduces {len(catalog["levels"])} chief levels.')
        return
    REFERENCE.mkdir(parents=True, exist_ok=True)
    target.write_text(text)
    print(f'Wrote {target.relative_to(ROOT)} ({len(catalog["levels"])} levels)')


if __name__ == '__main__':
    main()
