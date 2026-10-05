#!/usr/bin/env python3
"""Import the Helper Hut's helpers: their levels, Town Hall requirements, gem costs and work.

`logic/villager_apprentices.csv` has one block of rows per helper. A level's `BoostTimeSeconds`
is how long one assignment works and `BoostMultiplier` how many extra seconds of progress each
working second adds; `Cost` (in `CostResource`, gems) buys that level. `VILLAGERS_COOLDOWN_TIME`
in `logic/globals.csv` is the rest after each assignment. English names and help text come from
`localization/texts.csv`.

Sources are read from the local client archive when present
(art/source/native-client-18.400.21/files), otherwise downloaded from the pinned bundle, and must
match the SHA-256 in reference/full-client/manifest.json.
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
FILES = ('logic/villager_apprentices.csv', 'logic/globals.csv', 'localization/texts.csv')
ARCHIVE = ROOT / 'art/source/native-client-18.400.21/files'
CACHE = ROOT / 'output/native-campaign-source'
TARGET = ROOT / 'reference/helpers/catalog.json'
IDS = {'BUILDER': 'builder', 'RESEARCHER': 'lab', 'ALCHEMIST': 'alchemist',
       'PROSPECTOR': 'prospector'}


def require(condition, message):
    if not condition:
        raise SystemExit(f'Helper import: {message}')


def source(path, pin):
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
    require(hashlib.sha256(data).hexdigest() == pin, f'Source checksum differs: {path}')
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
    for path in FILES:
        require(path in pins, f'{path} is not in the client manifest')
    texts = {r[0]: r[1] for r in rows(source(FILES[2], pins[FILES[2]]))[2:] if len(r) > 1}
    globals_ = {r[0]: r for r in rows(source(FILES[1], pins[FILES[1]]))[2:] if r and r[0]}
    cooldown = int(globals_['VILLAGERS_COOLDOWN_TIME'][1])
    table = rows(source(FILES[0], pins[FILES[0]]))
    headers = table[0]
    helpers, current = [], None
    for values in table[2:]:
        row = dict(zip(headers, values))
        if row['Name']:
            current = dict(id=IDS[row['Type']], name=texts[row['TID']],
                           info=texts[row['InfoTID']], type=row['Type'],
                           costResource=row['CostResource'], levels=[])
            helpers.append(current)
        require(current is not None, 'Level row before its helper')
        current['levels'].append(dict(
            level=len(current['levels']) + 1,
            townHall=int(row['RequiredTownHallLevel']),
            multiplier=int(row['BoostMultiplier'] or 0),
            seconds=int(row['BoostTimeSeconds'] or 0),
            cost=int(row['Cost'] or 0),
        ))
    return dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE,
                sources={p: pins[p] for p in FILES}, cooldownSeconds=cooldown, helpers=helpers)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    text = json.dumps(build(), indent=2, ensure_ascii=False) + '\n'
    if parser.parse_args().check:
        require(TARGET.exists() and TARGET.read_text() == text, 'Committed catalog differs')
        print('Helper catalog reproduces the client rows.')
        return
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(text)
    print(f'Wrote {TARGET.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
