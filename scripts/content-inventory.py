#!/usr/bin/env python3
"""Count this game's content against the pinned client, so the gap is measured not guessed.

Every home-village troop, spell, hero and building the pinned tables define is listed with
whether this game implements it. Implemented sets are read from the committed references and
the running source, never from a hand-written list here, so the inventory cannot quietly
drift from the game. Records the client itself disables (`DisableProduction`) are summoned or
defensive variants a player never trains; they are counted separately rather than as gaps.
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
PINS = {
    'logic/characters.csv': '5c3acc5b46ff9e7978f406b540264e65c93a846b69d03cd43326a9853703cb89',
    'logic/spells.csv': '385159e00327e6a1567cd91f1585b4ed0717d3f4475f0823398243482598289d',
    'logic/heroes.csv': '658c9721fb0fd5488b69ca3555ef5597d521f28dde95af051a2a98ccbdd65197',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
    'logic/character_items.csv': '66e644c62331a026aec3795980d9a37af95e2120d67dfbad380c729f3645ebad',
    'logic/traps.csv': '757ca07de02b26b2071b52bb3cb495df2f0ae879731a859d3102ca3552dd528c',
}
TARGET = ROOT / 'docs/CONTENT-INVENTORY.md'
# The Builder Base is not modelled at all, so its village column is not a gap in this game.
HOME_VILLAGE = '0'


def require(condition, message):
    if not condition:
        raise SystemExit(f'Content inventory: {message}')


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
    digest = hashlib.sha256(data).hexdigest()
    require(digest == PINS[path], f'Source checksum differs: {path}')
    return data


def records(path):
    blob = source(path)
    if blob.startswith(b'Sig:'):
        blob = blob[68:]
    if not blob.startswith(b'"'):
        blob = lzma.decompress(blob[:9] + b'\0' * 4 + blob[9:])
    decoded = list(csv.reader(io.StringIO(blob.decode('utf-8-sig'))))
    headers = decoded[0]
    result, name = {}, None
    for row in decoded[2:]:
        if not any(row):
            continue
        if row[0]:
            name = row[0]
            result[name] = []
        inherited = dict(result[name][-1]) if result[name] else {}
        inherited.update({k: v for k, v in zip(headers, row) if v})
        result[name].append(inherited)
    return result


def mapped(script, constant):
    """The original record names a local importer maps its own keys onto.

    The literal may be written on one line or many, so the closing brace is found by
    matching rather than by anchoring to the start of a line.
    """
    text = (ROOT / 'scripts' / script).read_text()
    start = re.search(rf'^{constant} = \{{', text, re.M)
    require(start is not None, f'Cannot read {constant} from {script}')
    depth, at = 0, start.end() - 1
    for index in range(at, len(text)):
        depth += {'{': 1, '}': -1}.get(text[index], 0)
        if not depth:
            return set(re.findall(r":\s*'([^']+)'", text[at:index]))
    raise SystemExit(f'Content inventory: unterminated {constant} in {script}')


def implemented_buildings():
    """The original names src/game/townhall-catalog.ts maps this game's buildings onto."""
    text = (ROOT / 'src/game/townhall-catalog.ts').read_text()
    match = re.search(r'export const SOURCE_NAME[^=]*= \{(.*?)^\};', text, re.S | re.M)
    require(match is not None, 'Cannot read SOURCE_NAME from townhall-catalog.ts')
    return set(re.findall(r":\s*'([^']+)'", match.group(1)))


def implemented_heroes():
    """The heroes the running game offers, read from its own roster module."""
    text = (ROOT / 'src/game/hero-roster.ts').read_text()
    require('OFFERED' in text, 'Cannot read OFFERED from hero-roster.ts')
    match = re.search(r'export const OFFERED[^=]*=\s*\[(.*?)\]', text, re.S)
    require(match is not None, 'Cannot read OFFERED from hero-roster.ts')
    keys = set(re.findall(r"'([^']+)'", match.group(1)))
    catalog = json.loads((ROOT / 'reference/heroes/catalog.json').read_text())['heroes']
    return {catalog[key]['name'] for key in keys}


def playable(rows):
    """A record a player can actually field: home village, not a summoned or defensive form."""
    first = rows[0]
    return first.get('VillageType', '0') == HOME_VILLAGE and first.get('DisableProduction') != 'TRUE'


def section(title, table, have, note=''):
    """One inventory section: every playable record, with whether this game implements it."""
    rows = {name: rs for name, rs in table.items() if playable(rs)}
    done = sorted(n for n in rows if n in have)
    missing = sorted(n for n in rows if n not in have)
    unknown = sorted(n for n in have if n not in rows)
    require(not unknown, f'{title}: implemented records absent from the source: {unknown}')
    lines = [f'## {title}', '',
             f'**{len(done)} of {len(rows)}** implemented. '
             f'{sum(len(rows[n]) for n in done):,} of {sum(len(r) for r in rows.values()):,} '
             f'levels.{note}', '',
             '| Record | Levels | This game |', '| --- | --- | --- |']
    for name in done + missing:
        lines.append(f'| {name} | {len(rows[name])} | {"yes" if name in done else "—"} |')
    lines.append('')
    return lines, len(done), len(rows)


def build():
    characters = records('logic/characters.csv')
    spells = records('logic/spells.csv')
    heroes = records('logic/heroes.csv')
    buildings = records('logic/buildings.csv')
    traps = records('logic/traps.csv')
    items = records('logic/character_items.csv')

    have_items = mapped('import-native-equipment.py', 'ITEMS')

    lines = ['# Content inventory', '',
             f'Counted from the pinned public client **18.400.21**, bundle `{BUNDLE}`, by '
             '`scripts/content-inventory.py`. Every home-village record the source defines is '
             'listed here with whether this game implements it, so the remaining gap is a '
             'measured number rather than a remembered one. Regenerate with:', '',
             '```sh', 'python3 scripts/content-inventory.py', '```', '',
             'Records the client itself disables — summoned troops, defensive variants, '
             'internal spell effects — are excluded: a player never trains them, so they are '
             'not gaps. Builder Base content is excluded for the same reason, as that village '
             'is not modelled.', '']

    totals = []
    for title, table, have, note in [
        ('Troops', characters, mapped('import-native-troops.py', 'TROOPS'), ''),
        ('Spells', spells, mapped('import-native-troops.py', 'SPELLS'), ''),
        ('Heroes', heroes, implemented_heroes(), ''),
        ('Buildings', buildings, implemented_buildings() & set(buildings), ''),
        ('Traps', traps, implemented_buildings() & set(traps), ''),
        ('Hero equipment', items, have_items,
         ' `UNUSED*` placeholders are counted; the client ships them.'),
    ]:
        body, done, total = section(title, table, have)
        lines += body
        totals.append((title, done, total))

    summary = ['## Summary', '', '| Area | Implemented | Source | Remaining |',
               '| --- | --- | --- | --- |']
    for title, done, total in totals:
        summary.append(f'| {title} | {done} | {total} | {total - done} |')
    summary.append('')
    return '\n'.join(lines[:10] + summary + lines[10:]) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true',
                        help='verify the committed inventory instead of rewriting it')
    arguments = parser.parse_args()
    text = build()
    if arguments.check:
        require(TARGET.exists(), 'Missing docs/CONTENT-INVENTORY.md')
        require(TARGET.read_text() == text, 'Committed inventory differs from the source')
        print('Content inventory reproduces.')
        return
    TARGET.write_text(text)
    print(f'Wrote {TARGET.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
