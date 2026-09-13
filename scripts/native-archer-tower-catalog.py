#!/usr/bin/env python3
"""Derive numeric base progression and explicit weapon fields from pinned Archer Tower rows."""
import argparse
import json
from native_art.bundle import ROOT, digest
from native_art.sc6 import require


def build():
    path = ROOT / 'reference/archer-tower/native.json'
    source = json.loads(path.read_text())
    levels = []
    for row in source['levels']:
        def weapon(prefix):
            return dict(dps=int(row[prefix + 'DPS']), intervalMs=int(row[prefix + 'AttackSpeed']),
                        range=int(row[prefix + 'AttackRange']), projectile=row[prefix + 'Projectile'],
                        airTargets=row[prefix + 'AirTargets'] == 'TRUE', groundTargets=row[prefix + 'GroundTargets'] == 'TRUE')
        seconds = sum(int(row.get('BuildTime' + unit, '0')) * scale for unit, scale in [('D', 86400), ('H', 3600), ('M', 60), ('S', 1)])
        levels.append(dict(level=int(row['BuildingLevel']), hp=int(row['Hitpoints']), cost=int(row['BuildCost']),
                           seconds=seconds, townHall=int(row['TownHallLevel']), resource=row['BuildResource'],
                           width=int(row['Width']), height=int(row['Height']), weapon=weapon(''), alternateWeapon=weapon('Alt')))
    require([row['level'] for row in levels] == list(range(1, 22)), 'Tier sequence differs')
    return dict(sourceSha256=digest(path.read_bytes()), units=dict(intervalMs='milliseconds', range='100 source units per map tile'),
                scope='Base levels and explicit source weapon fields. Gearing eligibility, alternate-mode arithmetic and mini-level bonuses are separate.', levels=levels)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data = json.dumps(build(), indent=2) + '\n'
    path = ROOT / 'reference/archer-tower/catalog.json'
    if args.check:
        require(path.read_text() == data, 'Archer Tower numeric catalog differs')
    else:
        path.write_text(data)
    print('Verified Archer Tower numeric catalog' if args.check else 'Wrote Archer Tower numeric catalog')
