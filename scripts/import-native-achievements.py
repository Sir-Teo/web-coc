#!/usr/bin/env python3
"""Import the pinned Home Village achievements with their English names.

`achievements.csv` has one row per achievement tier. Rows sharing a title TID and action
form one achievement; `Level` orders its tiers, `Action`/`ActionData`/`ActionDataLevel` say what
counts, `ActionCount` is the tier's target and `ExpReward`/`DiamondReward` its prize.
`UIGroup` 0 is the Home Village; Builder Base (1) and Clan Capital (2) rows and rows the
client marks `Deprecated` are left out. Text comes from `localization/texts.csv`, with
`texts_patch.csv` applied over it.

Sources are read from the local client archive when present
(art/source/native-client-18.400.21/files), otherwise downloaded from the pinned bundle.
Either way each must match the SHA-256 recorded in reference/full-client/manifest.json.
"""
import argparse
import csv
import hashlib
import io
import json
import lzma
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = '7f04bdfdc4124b1f49308423bb8f4aa8b137aae3'
BASE = f'https://game-assets.clashofclans.com/{BUNDLE}/'
ACHIEVEMENTS = 'logic/achievements.csv'
TEXTS = 'localization/texts.csv'
PATCH = 'localization/texts_patch.csv'
ARCHIVE = ROOT / 'art/source/native-client-18.400.21/files'
CACHE = ROOT / 'output/native-campaign-source'
REFERENCE = ROOT / 'reference/achievements'


def require(condition, message):
    if not condition:
        raise SystemExit(f'Achievement import: {message}')


def pins():
    manifest = json.loads((ROOT / 'reference/full-client/manifest.json').read_text())
    entries = {f['path']: f['sha256'] for f in manifest['files']}
    for path in (ACHIEVEMENTS, TEXTS, PATCH):
        require(path in entries, f'{path} is not in the client manifest')
    return {path: entries[path] for path in (ACHIEVEMENTS, TEXTS, PATCH)}


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
    pin = pins()
    texts = {}
    for path in (TEXTS, PATCH):
        for row in rows(source(path, pin[path]))[2:]:
            if len(row) > 1 and row[0]:
                texts[row[0]] = row[1]
    table = rows(source(ACHIEVEMENTS, pin[ACHIEVEMENTS]))
    headers = table[0]
    for column in ('Name', 'Level', 'Deprecated', 'TID', 'InfoTID', 'Action', 'ActionCount',
                   'ActionData', 'ActionDataLevel', 'ExpReward', 'DiamondReward',
                   'CompletedTID', 'UIGroup', 'UIPriority'):
        require(column in headers, f'Absent {column} column')
    families = {}
    for values in table[2:]:
        if not values or not values[0]:
            continue
        row = dict(zip(headers, values))
        if row['UIGroup'] != '0' or row['Deprecated'] == 'TRUE':
            continue
        title = row['TID']
        require(re.fullmatch(r'TID_ACHIEVEMENT_\w+_TITLE(_\d+)?', title) is not None,
                f'Unexpected title TID {title!r}')
        require(title in texts and row['InfoTID'] in texts, f'Missing text for {row["Name"]}')
        # Both account-binding achievements share one title; their actions tell them apart.
        family = families.setdefault((title, row['Action']), dict(
            id=re.sub(r'_title(?=_\d+$|$)', '', title[len('TID_ACHIEVEMENT_'):].lower()),
            title=texts[title],
            action=row['Action'],
            data=row['ActionData'] or None,
            dataLevel=int(row['ActionDataLevel']) if row['ActionDataLevel'] else None,
            priority=int(row['UIPriority'] or 0),
            completed=texts.get(row['CompletedTID']) if row['CompletedTID'] else None,
            tiers=[],
        ))
        require(family['action'] == row['Action'] and family['data'] == (row['ActionData'] or None)
                or row['Action'] == 'unit_unlock',
                f'{row["Name"]} changes action within {title}')
        count = int(row['ActionCount'])
        family['tiers'].append(dict(
            level=int(row['Level']),
            count=count,
            **({'unit': row['ActionData']} if row['Action'] == 'unit_unlock' else {}),
            xp=int(row['ExpReward']),
            gems=int(row['DiamondReward']),
            info=texts[row['InfoTID']].replace('<number>', f'{count:,}')
            .replace('<name>', row['ActionData']),
        ))
    titles = [title for title, _ in families]
    for (title, action), family in families.items():
        if titles.count(title) > 1:
            family['id'] += '_' + action
    achievements = sorted(families.values(), key=lambda f: (-f['priority'], f['id']))
    for family in achievements:
        family['tiers'].sort(key=lambda t: t['level'])
        require([t['level'] for t in family['tiers']] == list(range(len(family['tiers']))),
                f'{family["id"]} tiers are not contiguous from 0')
        if family['action'] == 'unit_unlock':
            family['data'] = None
        for tier in family['tiers']:
            del tier['level']
    require(len({f['id'] for f in achievements}) == len(achievements), 'Duplicate achievement ids')
    return dict(
        clientVersion='18.400.21',
        bundle=BUNDLE,
        baseUrl=BASE,
        sources=pin,
        scope='Current Home Village achievements (UIGroup 0, not deprecated), tiers in order.',
        achievements=achievements,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true',
                        help='verify the committed reference instead of rewriting it')
    arguments = parser.parse_args()
    catalog = build()
    target = REFERENCE / 'catalog.json'
    text = json.dumps(catalog, indent=2, ensure_ascii=False) + '\n'
    if arguments.check:
        require(target.exists(), 'Missing reference/achievements/catalog.json')
        require(target.read_text() == text, 'Committed achievement catalog differs from the source')
        print(f'Achievement catalog reproduces {len(catalog["achievements"])} achievements.')
        return
    REFERENCE.mkdir(parents=True, exist_ok=True)
    target.write_text(text)
    print(f'Wrote {target.relative_to(ROOT)} ({len(catalog["achievements"])} achievements)')


if __name__ == '__main__':
    main()
