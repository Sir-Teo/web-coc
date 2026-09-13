#!/usr/bin/env python3
"""Preserve original Archer Tower tiers and referenced weapon/effect definitions."""
import argparse
import hashlib
import json
from native_art.bundle import ROOT, BUNDLE, source
from native_art.source_csv import decoded_rows, records, inherited_levels
from native_art.sc6 import require

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
    'logic/projectiles.csv': '71cda0e457ad88a6772f6421a22419b24d6bcf78d0ed305f09184404889a72dc',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'csv/particle_emitters.csv': '8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef',
}

def build():
    blobs = {p: source(p, PINS) for p in PINS}
    fingerprint = json.loads(blobs['fingerprint.json'])
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client differs')
    members = {r['file']: r['sha'] for r in fingerprint['files']}
    for p, blob in blobs.items():
        if p != 'fingerprint.json':
            require(hashlib.sha1(blob).hexdigest() == members[p], 'Fingerprint differs: ' + p)
    tables = {p: records(decoded_rows(blob)) for p, blob in blobs.items() if p.endswith('.csv')}
    rows = tables['logic/buildings.csv']['Archer Tower']
    levels = inherited_levels(rows)
    require(len(levels) == 21 and levels[0]['GlobalID'] == '1000009', 'Archer Tower identity differs')
    require([int(r['BuildingLevel']) for r in levels] == list(range(1,22)), 'Tier sequence differs')
    projectiles = {n: tables['logic/projectiles.csv'][n] for n in sorted({r[k] for r in levels for k in ('Projectile','AltProjectile') if r.get(k)})}
    all_effects = tables['logic/effects.csv']
    pending = {v for r in [*levels, *[r for rs in projectiles.values() for r in rs]] for k,v in r.items() if 'Effect' in k and v in all_effects}
    effects = {}
    while pending:
        name = pending.pop()
        if name in effects: continue
        effects[name] = all_effects[name]
        pending.update(r['SpawnEffect'] for r in effects[name] if r.get('SpawnEffect'))
    effects = dict(sorted(effects.items()))
    names = sorted({r['ParticleEmitter'] for rs in [*effects.values(),*projectiles.values()] for r in rs if r.get('ParticleEmitter')})
    particles = {n: tables['csv/particle_emitters.csv'][n] for n in names}
    return dict(clientVersion=fingerprint['version'], bundle=BUNDLE, sources=PINS, name='Archer Tower', globalId=1000009,
                rows=rows, levels=levels, projectiles=projectiles, effects=effects, particles=particles)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    document = build()
    target = ROOT / 'reference/archer-tower/native.json'
    data = json.dumps(document, indent=2) + '\n'
    if args.check:
        require(target.read_text() == data, 'Archer Tower source differs')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(data)
    print(('Verified' if args.check else 'Wrote'), len(document['levels']), 'tiers,', len(document['projectiles']), 'projectiles,', len(document['effects']), 'effects,', len(document['particles']), 'emitters')
