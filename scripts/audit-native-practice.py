#!/usr/bin/env python3
"""Audit every withheld Practice layout without changing its coordinates or enabling it.

The report covers board bounds and captured source coverage, not complete combat parity.
Source level files are absent from the fingerprint and have their own SHA-256 pins below.
CSV inputs retain the character/Practice imports' pins. Guide targets are checked across
all 19 lessons, including fielded levels with the existing clamping fallback.
--check reproduces the report.
"""
import argparse
import json
import re

from native_art.bundle import ROOT, BUNDLE, source, digest
from native_art.source_csv import decoded_rows, records, inherited_levels

LEVEL_PINS = {
    'level/challenge_th8_gowiva.json': '46cd91aaf600acdf9796700037aa31396bdfa551672d689f2cee4dfd752143af',
    'level/challenge_th12_yeti.json': '5dda28a591f971f243e2da5411d9e5b4ef0918fab9d59ee2b62fd4e4609c20da',
    'level/challenge_th13_hybrid.json': '60cab4d57544c39db0a4dbd227febd749f90b2236bb9e8f5fb642048cc173639',
    'level/challenge_th9_babydqw.json': '70ab5cd66af8a7e5bad617d3ca8acff1ddb6e3eda4f69eeba7847f4d84f86dfa',
    'level/challenge_th10_miner.json': '586d8256e3e0e312f9e3aa250bc96ea0eee83883c7ab5d2d49d82717559b78c0',
    'level/challenge_th12_dragbat.json': '0408d834cb35d49afb9d2dddfef5af38befacb4d5b5812d620b619587568c4a6',
}
TARGET = ROOT / 'reference/practice/readiness.json'


def scalar(name):
    text = (ROOT / 'src/game/grid.ts').read_text()
    matches = re.findall(rf'^export const {name} = (\d+);$', text, re.MULTILINE)
    if len(matches) != 1:
        raise ValueError(f'Cannot resolve current grid constant {name}')
    return int(matches[0])


def build():
    campaign = json.loads((ROOT / 'reference/campaign/catalog.json').read_text())
    practice = json.loads((ROOT / 'reference/practice/catalog.json').read_text())
    coverage_bytes = (ROOT / 'reference/characters/catalog.json').read_bytes()
    coverage = json.loads(coverage_bytes)
    pins = json.loads((ROOT / 'reference/characters/art.json').read_text())['sources']
    pins.update(practice['sources'])
    if campaign['bundle'] != BUNDLE or coverage['bundle'] != BUNDLE:
        raise ValueError('Source bundle differs')
    used = {}

    def read(path):
        pin = LEVEL_PINS[path] if path in LEVEL_PINS else pins[path]
        data = source(path, {path: pin})
        used[path] = pin
        return data

    npcs = records(decoded_rows(read('logic/npcs.csv')))
    characters = records(decoded_rows(read('logic/characters.csv')))
    guide_steps = records(decoded_rows(read('csv/deploy_steps.csv')))
    identities = {}
    for path in ['logic/buildings.csv', 'logic/traps.csv']:
        for rows in records(decoded_rows(read(path))).values():
            row = rows[0]
            identities[int(row['GlobalID'])] = (row['Name'], inherited_levels(rows))
    captured = {value['animation'].replace(' ', '') for value in coverage['graphs'].values()
                if value['animation']}
    names = {level['id']: level['name'] for level in practice['levels']}
    board, offset = scalar('MAP_SIZE'), scalar('BUILD_MIN')
    guide_levels = []
    for lesson in practice['levels']:
        outside, maximum = [], 0
        for entry in npcs[lesson['id']]:
            step = entry.get('DeploySteps')
            if not step:
                continue
            for point in guide_steps[step]:
                if 'PosX' not in point:
                    continue
                x, y = int(point['PosX']) + offset, int(point['PosY']) + offset
                maximum = max(maximum, x + 1, y + 1)
                if x < 1 or y < 1 or x > board - 1 or y > board - 1:
                    outside.append(dict(step=step, unit=point.get('DeployType'),
                                        sourceX=int(point['PosX']), sourceY=int(point['PosY']),
                                        convertedX=x, convertedY=y,
                                        exact=point.get('ForceExactLocation') == 'TRUE'))
        guide_levels.append(dict(id=lesson['id'], name=lesson['name'], stage=lesson['stage'],
                                 minimumBoardForUnclampedTargets=maximum,
                                 clampedTargets=outside))
    levels = []
    for name in sorted(campaign['withheld']):
        rows = npcs[name]
        row = rows[0]
        path = row['LevelFile']
        # A full parse: no unexplained trailing material is accepted.
        layout = json.loads(read(path))
        outside, width, height = [], 0, 0
        for entity in layout['buildings'] + layout['traps']:
            identity, definitions = identities[entity['data']]
            level = entity.get('lvl', 0) + 1
            if not 1 <= level <= len(definitions):
                raise ValueError(f'Unknown source footprint level: {identity} {level}')
            size, depth = int(definitions[level - 1]['Width']), int(definitions[level - 1]['Height'])
            if size != depth:
                raise ValueError(f'Non-square source footprint needs explicit support: {identity}')
            x, y = entity['x'] + offset, entity['y'] + offset
            right, bottom = x + size, y + size
            width, height = max(width, right), max(height, bottom)
            if x < 0 or y < 0 or right > board or bottom > board:
                outside.append(dict(data=entity['data'], name=identity, level=level, sourceId=entity['id'],
                                    sourceX=entity['x'], sourceY=entity['y'], size=size,
                                    convertedX=x, convertedY=y, right=right, bottom=bottom))
        defenders = []
        for entry in rows:
            if not entry.get('AllianceUnitType'):
                continue
            character, level = entry['AllianceUnitType'], int(entry['AllianceUnitLevel'])

            def resolve(kind):
                matches = [r for r in inherited_levels(characters[kind])
                           if int(r['VisualLevel']) == level]
                if len(matches) != 1:
                    raise ValueError(f'Ambiguous source level: {kind} {level}')
                return matches[0]

            unit = resolve(character)
            defensive = unit.get('DefensiveTroop', character)
            unit = resolve(defensive)
            animation = unit['Animation']
            retained = any(int(r.get('VisualLevel', 0)) == level
                           for r in coverage['characters'].get(defensive, []))
            ability = unit.get('SpecialAbilities')
            defenders.append(dict(character=character, level=level,
                                  count=int(entry['AllianceUnitCount']),
                                  defensiveCharacter=defensive, animation=animation,
                                  animationCaptured=animation.replace(' ', '') in captured,
                                  combatRowRetained=retained,
                                  ability=ability,
                                  abilityRetained=not ability or ability in coverage['specialAbilities']))
        levels.append(dict(id=name, name=names[name], sourceLayout=path,
                           useFullMapSize=row.get('UseFullMapSize') == 'TRUE',
                           minimumBoardAtCurrentOffset=dict(width=width, height=height),
                           outsideFootprints=outside, defenders=defenders))
    if {entry['sourceLayout'] for entry in levels} != set(LEVEL_PINS):
        raise ValueError('Withheld level membership changed; update the audit explicitly')
    return dict(clientVersion='18.400.21', bundle=BUNDLE,
                scope='Footprints, guide targets and captured source coverage; not a combat-parity certificate.',
                grid=dict(mapSize=board, sourceOffset=offset),
                coverageCatalogSha256=digest(coverage_bytes), sources=dict(sorted(used.items())),
                levels=levels, guideLevels=guide_levels,
                minimumSharedGuideBoard=max(level['minimumBoardForUnclampedTargets']
                                            for level in guide_levels))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = build()
    encoded = json.dumps(result, indent=2) + '\n'
    if args.check:
        if TARGET.read_text() != encoded:
            raise SystemExit('Practice readiness audit differs')
    else:
        TARGET.write_text(encoded)
    print(f'{"Verified" if args.check else "Wrote"} {len(result["levels"])} withheld layouts, '
          f'{len(result["guideLevels"])} guide audits; minimum unclamped guide board '
          f'{result["minimumSharedGuideBoard"]}')


if __name__ == '__main__':
    main()
