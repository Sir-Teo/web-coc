#!/usr/bin/env python3
"""Import the pinned league table: trophy bands and the daily Star Bonus each one pays.

`leagues.csv` gives every league its trophy band and its own Star Bonus reward, including
the Common, Rare and Epic Ore that is the original's ordinary income for hero equipment.
`globals.csv` gives the stars the bonus costs and how long it takes to come back.
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
PINS = {
    'logic/leagues.csv': 'a057b99d04e1c0c8c7989dfc1f8cd4031b0c9569acea7848153ea876233211af',
    'logic/globals.csv': '16210fc28bfb86d00ea04d581a99fe98e128172017b2d4f637b8848c0cf20087',
}
REFERENCE = ROOT / 'reference/leagues'
SETTINGS = {
    'stars': 'STAR_BONUS_STAR_COUNT',
    'cooldownMinutes': 'STAR_BONUS_COOLDOWN_MINUTES',
}
REWARDS = {
    'gold': 'GoldRewardStarBonus', 'elixir': 'ElixirRewardStarBonus',
    'dark': 'DarkElixirRewardStarBonus', 'shiny': 'CommonOreRewardStarBonus',
    'glowy': 'RareOreRewardStarBonus', 'starry': 'EpicOreRewardStarBonus',
}


def require(condition, message):
    if not condition:
        raise SystemExit(f'League import: {message}')


def source(path):
    require(path in PINS, f'Unpinned source requested: {path}')
    target = ROOT / 'output/native-campaign-source' / path
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + '.part')
        subprocess.run(['curl', '--fail', '--silent', '--show-error', '--retry', '2',
                        BASE + path, '-o', str(temporary)], check=True)
        temporary.replace(target)
    data = target.read_bytes()
    require(hashlib.sha256(data).hexdigest() == PINS[path], f'Source checksum differs: {path}')
    return data


def table(path):
    blob = source(path)
    if blob.startswith(b'Sig:'):
        blob = blob[68:]
    if not blob.startswith(b'"'):
        blob = lzma.decompress(blob[:9] + b'\0' * 4 + blob[9:])
    decoded = list(csv.reader(io.StringIO(blob.decode('utf-8-sig'))))
    headers = decoded[0]
    require(headers[0] == 'Name', f'Missing table header: {path}')
    return headers, [row for row in decoded[2:] if row and row[0]]


def build():
    headers, rows = table('logic/leagues.csv')
    index = {name: position for position, name in enumerate(headers)}
    missing = [column for column in (*REWARDS.values(), 'PlacementLimitLow', 'PlacementLimitHigh',
                                     'UseStarBonus') if column not in index]
    require(not missing, f'Absent league columns: {missing}')

    def cell(row, column, default=0):
        value = row[index[column]]
        return int(value) if value not in ('', None) else default

    leagues = []
    for row in rows:
        leagues.append(dict(
            name=row[0],
            trophies=cell(row, 'PlacementLimitLow'),
            until=cell(row, 'PlacementLimitHigh'),
            starBonus=row[index['UseStarBonus']].upper() == 'TRUE',
            reward={key: cell(row, column) for key, column in REWARDS.items()},
        ))
    require(leagues[0]['trophies'] == 0, 'The first league does not start at zero trophies')
    for previous, league in zip(leagues, leagues[1:]):
        require(league['trophies'] == previous['until'] + 1,
                f'League bands leave a gap at {league["name"]}')

    settings_headers, settings_rows = table('logic/globals.csv')
    value_at = settings_headers.index('NumberValue')
    settings = {row[0]: row[value_at] for row in settings_rows}
    missing = [name for name in SETTINGS.values() if name not in settings]
    require(not missing, f'Absent Star Bonus settings: {missing}')
    bonus = {key: int(settings[name]) for key, name in SETTINGS.items()}

    return dict(
        clientVersion='18.400.21',
        bundle=BUNDLE,
        baseUrl=BASE,
        sources=dict(sorted(PINS.items())),
        scope='Trophy bands and the daily Star Bonus each league pays, ore included.',
        starBonus=bonus,
        leagues=leagues,
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
        require(target.exists(), 'Missing reference/leagues/catalog.json')
        require(target.read_text() == text, 'Committed league catalog differs from the source')
        print(f'League catalog reproduces {len(catalog["leagues"])} leagues, '
              f'a {catalog["starBonus"]["stars"]}-star bonus and a '
              f'{catalog["starBonus"]["cooldownMinutes"]}-minute cooldown.')
        return
    REFERENCE.mkdir(parents=True, exist_ok=True)
    target.write_text(text)
    print(f'Wrote {target.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
