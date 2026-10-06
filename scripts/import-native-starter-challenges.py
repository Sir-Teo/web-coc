#!/usr/bin/env python3
"""Import the client's Starter Challenges: their tasks, points and 26 reward tiers.

`logic/starter_pass.csv` lists the challenges in order with the Town Hall that reveals each
(`TownHallUnlock`, which is one below the Town Hall named in the task: TH2 tasks read 1), and in
its first rows the reward tiers (`TierScores`, `RewardType`, `RewardAmount`).
`logic/starter_pass_tasks.csv` gives each task's type, how its progress counts (`Best` or
`Accumulative`), its points (`Score`), its targets (`Quantity`, `Quantity2`) and its subject
(`Data1`: a building, troop or resource). Titles and descriptions come from
`localization/texts.csv`, with the client's <num>, <num2> and <building> placeholders filled in;
building names come from their `TID` in `logic/buildings.csv`.

Every source is downloaded from the pinned bundle into output/native-campaign-source and must
match its SHA-256 in reference/full-client/manifest.json.

  python3 scripts/import-native-starter-challenges.py           # write the catalog
  python3 scripts/import-native-starter-challenges.py --check   # verify it reproduces
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
CACHE = ROOT / 'output/native-campaign-source'
TARGET = ROOT / 'reference/starter-challenges/catalog.json'
SOURCES = ['logic/starter_pass.csv', 'logic/starter_pass_tasks.csv', 'logic/buildings.csv',
           'localization/texts.csv']
REWARDS = {'Gold': 'gold', 'Elixir': 'elixir', 'Diamonds': 'gems'}
# The client's own line: "Starter Pass ends when you reach Town Hall 7".
END_TEXT = 'TID_STARTER_PASS_TIMER_TEXT'


def require(condition, message):
    if not condition:
        raise SystemExit(f'Starter Challenges import: {message}')


def source(path, pins):
    require(path in pins, f'{path} is not in the client manifest')
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


def table(blob):
    if blob.startswith(b'Sig:'):
        blob = blob[68:]
    if not blob.startswith(b'"'):
        blob = lzma.decompress(blob[:9] + b'\0' * 4 + blob[9:])
    rows = list(csv.reader(io.StringIO(blob.decode('utf-8-sig'))))
    return rows[0], [row for row in rows[2:] if any(row)]


def build():
    manifest = json.loads((ROOT / 'reference/full-client/manifest.json').read_text())
    pins = {f['path']: f['sha256'] for f in manifest['files']}
    headers, rows = table(source('localization/texts.csv', pins))
    texts = {row[0]: row[1] for row in rows if row[0]}
    headers, rows = table(source('logic/buildings.csv', pins))
    names = {}
    for row in rows:
        record = dict(zip(headers, row))
        if record['Name'] and record.get('TID'):
            names[record['Name']] = texts.get(record['TID'], record['Name'])

    headers, rows = table(source('logic/starter_pass_tasks.csv', pins))
    tasks = {}
    for row in rows:
        record = {k: v for k, v in zip(headers, row) if v}
        require(record.get('Name') and record['Name'] not in tasks, 'Unnamed or repeated task')
        tasks[record['Name']] = record

    headers, rows = table(source('logic/starter_pass.csv', pins))
    require(rows[0][0] == 'StarterPass', 'Missing StarterPass record')
    tiers, order = [], []
    for row in rows:
        record = {k: v for k, v in zip(headers, row) if v}
        require(not record.get('Prerequisite'), 'A challenge names a prerequisite')
        order.append((record['Tasks'], int(record['TownHallUnlock'])))
        if 'TierScores' in record:
            kind = record['RewardType']
            reward = ({'kind': REWARDS[kind]} if kind in REWARDS
                      else {'kind': 'item', 'item': kind})
            tiers.append(dict(score=int(record['TierScores']), reward=dict(
                reward, amount=int(record['RewardAmount']))))
    require(len(tiers) == 26, f'Expected 26 reward tiers, read {len(tiers)}')
    require([t['score'] for t in tiers] == sorted(t['score'] for t in tiers), 'Tiers out of order')

    challenges = []
    for name, unlock in order:
        task = tasks.get(name)
        require(task, f'Absent task {name}')
        require(not task.get('Disabled'), f'Disabled task {name}')
        quantity, second = int(task['Quantity']), task.get('Quantity2')
        building = task.get('Data1', '')

        def fill(text):
            return (text.replace('<num2>', f'{int(second or quantity):,}')
                    .replace('<num>', f'{quantity:,}')
                    .replace('<building>', names.get(building, building)))

        challenge = dict(
            id=name,
            title=texts[task['TID']],
            info=fill(texts[task['InfoTID']]),
            type=task['TaskType'],
            progress=task['ProgressType'].lower(),
            score=int(task['Score']),
            quantity=quantity,
            townhall=unlock + 1,
        )
        if second:
            challenge['quantity2'] = int(second)
        if building:
            challenge['subject'] = building
        challenges.append(challenge)
    require(texts.get(END_TEXT, '').endswith('Town Hall 7'), 'The end Town Hall moved')
    return dict(
        clientVersion='18.400.21',
        bundle=BUNDLE,
        baseUrl=BASE,
        sources={p: pins[p] for p in SOURCES},
        title=texts['TID_STARTER_PASS'],
        endText=texts[END_TEXT],
        endTownHall=7,
        tiers=tiers,
        challenges=challenges,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    catalog = build()
    text = json.dumps(catalog, indent=2, ensure_ascii=False) + '\n'
    if args.check:
        require(TARGET.exists() and TARGET.read_text() == text, 'The committed catalog differs')
    else:
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        TARGET.write_text(text)
    points = sum(c['score'] for c in catalog['challenges'])
    print(f'{len(catalog["challenges"])} challenges worth {points:,} points and '
          f'{len(catalog["tiers"])} tiers' + (' reproduce the client.' if args.check else
                                               f'; wrote {TARGET.relative_to(ROOT)}'))


if __name__ == '__main__':
    main()
