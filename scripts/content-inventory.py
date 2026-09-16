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
    'logic/townhall_levels.csv': '2d596bcd08433924c3e566f79f380eb2260076f87c5b5dd30c9ab6f2c3f41472',
}
TARGET = ROOT / 'docs/CONTENT-INVENTORY.md'
# The Builder Base is not modelled at all, so its village column is not a gap in this game.
HOME_VILLAGE = '0'
# A village always has exactly one Town Hall, so the tier table never counts it. It is the one
# building a player owns that has no count column.
UNCOUNTED = 'Town Hall'


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


def decoded(blob):
    if blob.startswith(b'Sig:'):
        blob = blob[68:]
    if not blob.startswith(b'"'):
        blob = lzma.decompress(blob[:9] + b'\0' * 4 + blob[9:])
    return list(csv.reader(io.StringIO(blob.decode('utf-8-sig'))))


def records(path):
    decoded_rows = decoded(source(path))
    headers = decoded_rows[0]
    result, name = {}, None
    for row in decoded_rows[2:]:
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


def runtime_map(file, constant):
    text = (ROOT / 'src/game' / file).read_text()
    match = re.search(rf'(?:export )?const {constant}[^=]*=\s*\{{(.*?)\}}', text, re.S)
    require(match is not None, f'Cannot read {constant} from {file}')
    return set(re.findall(r":\s*'([^']+)'", match.group(1)))


def implemented_heroes():
    return runtime_map('native-hero-data.ts', 'HERO_SOURCE')


def playable(rows):
    """A record a player can actually field: home village, not a summoned or defensive form."""
    first = rows[0]
    return first.get('VillageType', '0') == HOME_VILLAGE and first.get('DisableProduction') != 'TRUE'


def ownable():
    """Buildings and traps a player can actually own, named by the Town Hall tier table.

    `buildings.csv` also holds hero altars, troop and spell cages, the goblin campaign's own
    buildings, tutorial props, Town Hall teasers and explicit placeholders. None of those is a
    building a village builds, and counting them as missing content would be wrong. The tier
    table settles it: it has one count column per ownable entity, so a record the player can
    own is one that column names.
    """
    rows = decoded(source('logic/townhall_levels.csv'))
    require(rows and rows[0][0] == 'Name', 'Missing Town Hall tier header')
    # A header with no positive count is a retired/internal entity, not an ownable gap.
    return {name for index, name in enumerate(rows[0]) if any(index < len(row) and row[index].isdigit() and int(row[index]) > 0 for row in rows[2:])} | {UNCOUNTED}


def section(title, table, have, pinned, note=''):
    """One inventory section: every playable record, what is pinned, and what is implemented.

    `pinned` is the set whose complete original levels a reference catalog already carries.
    Pinning is the cheap half and implementing is the expensive one, so counting them apart
    keeps a catalogued but unplayable record from reading as finished work.
    """
    rows = {name: rs for name, rs in table.items() if playable(rs)}
    done = sorted(n for n in rows if n in have)
    missing = sorted(n for n in rows if n not in have)
    unknown = sorted(n for n in have if n not in rows)
    require(not unknown, f'{title}: implemented records absent from the source: {unknown}')
    stray = sorted(n for n in pinned if n not in rows)
    require(not stray, f'{title}: pinned records absent from the source: {stray}')
    levels = sum(len(r) for r in rows.values())
    lines = [f'## {title}', '',
             f'**{len(pinned)} of {len(rows)}** pinned, **{len(done)} of {len(rows)}** '
             f'implemented; {sum(len(rows[n]) for n in done):,} of {levels:,} levels '
             f'playable.{note}', '',
             '| Record | Levels | Pinned | This game |', '| --- | --- | --- | --- |']
    for name in done + missing:
        lines.append(f'| {name} | {len(rows[name])} | {"yes" if name in pinned else "—"} '
                     f'| {"yes" if name in done else "—"} |')
    lines.append('')
    return lines, len(done), len(rows), len(pinned)


def catalogued(path, *keys):
    """Record names a committed reference catalog carries."""
    data = json.loads((ROOT / path).read_text())
    for key in keys:
        data = data[key]
    return set(data)


def build():
    characters = records('logic/characters.csv')
    spells = records('logic/spells.csv')
    heroes = records('logic/heroes.csv')
    buildings = records('logic/buildings.csv')
    traps = records('logic/traps.csv')
    items = records('logic/character_items.csv')

    native = json.loads((ROOT / 'reference/full-client/combat.json').read_text())
    progression = json.loads((ROOT / 'reference/full-client/progression.json').read_text())
    have_items = {n for n, rows in native['items'].items() if rows[0].get('Deprecated') != 'TRUE'}
    # Seasonal gifts and disabled prototypes are not permanent playable content.
    spells = {n: r for n, r in spells.items() if n not in {'Santas Surprise', 'BagOfFrostmites', 'Debris Explosion 2', 'Yellow Card', 'SantaSurprise', 'Santa\'s Surprise', 'Birthday2017'}}
    items = {n: r for n, r in items.items() if not n.lower().startswith('unused') and r[0].get('Deprecated') != 'TRUE'}
    characters = {n: r for n, r in characters.items() if not n.lower().startswith('unused') and n != 'Air Troop Launcher'}

    lines = ['# Content inventory', '',
             f'Counted from the pinned public client **18.400.21**, bundle `{BUNDLE}`, by '
             '`scripts/content-inventory.py`. Every home-village record the source defines is '
             'listed here with whether this game implements it, so the remaining gap is a '
             'measured number rather than a remembered one. Regenerate with:', '',
             '```sh', 'python3 scripts/content-inventory.py', '```', '',
             'Records the client itself disables — summoned troops, defensive variants, '
             'internal spell effects — are excluded: a player never trains them, so they are '
             'not gaps. Builder Base content is excluded for the same reason, as that village '
             'is not modelled. Seasonal troops (no normal Barracks unlock or donation disabled), seasonal/internal spells and unused prototypes are also excluded. Registry coverage does not imply every behavior is complete; see EXPERIENCE-PARITY.md.', '']

    troop_roster = catalogued('reference/troops/catalog.json', 'roster')
    spell_roster = catalogued('reference/troops/catalog.json', 'spellRoster')
    hero_roster = {h['name'] for h in
                   json.loads((ROOT / 'reference/heroes/catalog.json').read_text())['heroes']
                   .values()}
    item_roster = catalogued('reference/equipment/catalog.json', 'roster')
    # The Town Hall catalog tables only the entities this game builds, so for buildings and
    # traps pinning and implementing are the same step.
    building_names = implemented_buildings() | {row['name'] for row in progression['buildings'].values()}
    # Imported seasonal traps use their own pinned reference packs.
    for folder in ['freeze-trap', 'shrink-trap', 'pumpkin-bomb', 'santa-trap']:
        reference = json.loads((ROOT / 'reference' / folder / 'native.json').read_text())
        def names(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    if key == 'Name' and isinstance(item, str) and item in traps and playable(traps[item]): yield item
                    else: yield from names(item)
            elif isinstance(value, list):
                for item in value: yield from names(item)
        building_names.update(names(reference))
    own = ownable()
    # Counts and level gates are pinned for every ownable entity, built or not.
    gated = catalogued('reference/townhall/catalog.json', 'gates') | {UNCOUNTED}

    groups = {
        'troops': {n for n, r in characters.items() if r[0].get('ProductionBuilding') != 'Siege Workshop' and r[0].get('EnabledBySuperLicence') != 'TRUE' and int(r[0].get('BarrackLevel', '0')) > 0 and r[0].get('DisableDonate') != 'TRUE' and playable(r)},
        'siege': {n for n, r in characters.items() if r[0].get('ProductionBuilding') == 'Siege Workshop' and playable(r)},
        'super': {n for n, r in characters.items() if r[0].get('EnabledBySuperLicence') == 'TRUE' and playable(r)},
    }
    totals = []
    for title, table, have, pinned, note in [
        ('Troops', {n: r for n, r in characters.items() if n in groups['troops']},
         runtime_map('native-units.ts', 'TROOP_SOURCE') & set(groups['troops']),
         set(progression['troopDefs'][k]['Name'] for k in progression['troopDefs']) & set(groups['troops']), ''),
        ('Siege machines', {n: r for n, r in characters.items() if n in groups['siege']},
         runtime_map('native-units.ts', 'TROOP_SOURCE') & set(groups['siege']),
         set(progression['troopDefs'][k]['Name'] for k in progression['troopDefs']) & set(groups['siege']), ''),
        ('Super troops', {n: r for n, r in characters.items() if n in groups['super']},
         runtime_map('native-units.ts', 'TROOP_SOURCE') & set(groups['super']),
         set(progression['troopDefs'][k]['Name'] for k in progression['troopDefs']) & set(groups['super']), ''),
        ('Spells', spells, set(json.loads((ROOT / 'reference/troops/catalog.json').read_text())['spells'].values()) | runtime_map('troop-progression.ts', 'NATIVE_SPELL_NAMES'), spell_roster & set(spells), ''),
        ('Heroes', heroes, implemented_heroes(), hero_roster, ''),
        ('Pets', {n: [{**r[0], 'DisableProduction': 'FALSE'}, *r[1:]] for n, r in native['pets'].items() if n != 'Phoenix Egg'},
         runtime_map('native-hero-data.ts', 'PET_SOURCE'), set(native['pets']) - {'Phoenix Egg'}, ''),
        ('Buildings', {n: r for n, r in buildings.items() if n in own},
         building_names & set(buildings) & own, gated & set(buildings) & own, ''),
        ('Traps', {n: r for n, r in traps.items() if n in own},
         building_names & set(traps) & own, gated & set(traps) & own, ''),
        ('Hero equipment', items, have_items, item_roster & set(items),
         ' Deprecated/unused prototype rows are excluded; ability behavior is tracked separately in EXPERIENCE-PARITY.md.'),
    ]:
        body, done, total, held = section(title, table, have, pinned, note)
        lines += body
        totals.append((title, done, total, held))

    npc = (ROOT / 'src/game/npc-buildings.ts').read_text()
    entries = re.findall(r"'([^']+)': \{\s*globalId: (\d+),\s*kind: '[^']+',\s*name: '([^']+)'", npc)
    lines += ['## Campaign identities', '', 'These additional runtime identities are counted separately from ownable Home Village records.', '', '| Runtime key | Name | Source global ID |', '| --- | --- | --- |']
    lines += [f'| {key} | {name} | {gid} |' for key, gid, name in entries]
    lines.append('')

    summary = ['## Summary', '', '| Area | Pinned | Implemented | Source | Left to implement |',
               '| --- | --- | --- | --- | --- |']
    for title, done, total, held in totals:
        summary.append(f'| {title} | {held} | {done} | {total} | {total - done} |')
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
