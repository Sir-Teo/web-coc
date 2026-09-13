#!/usr/bin/env python3
"""Pin and preserve original Dark Elixir Drill Ogg samples and effect audio settings."""
import argparse, hashlib, json
from native_art.bundle import ROOT, source, digest
PINS = {'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b', 'sfx/building_destroyed_01.ogg': 'fd8295765aa86ff5c7c6be1159cd8fc97aed3c858c29fbdb1af5e3d5c5ce7f04', 'sfx/dark_drill_pickup_02.ogg': '0aed0e8230ea083a3970e1072ada56ee59b544c38df5bee9b468ffac579a730f', 'sfx/dark_drill_place_07.ogg': 'b6162168a5c7204a66f2a6e419c2093e572b2c799f30b39ff8d29665bd0b9585'}

def build():
    fp=json.loads(source('fingerprint.json', PINS)); members={r['file']:r['sha'] for r in fp['files']}
    definition=ROOT/'reference/dark-drill/native.json'; original=json.loads(definition.read_text())
    effects={n:rows for n,rows in original['effects'].items() if any(r.get('Sound') for r in rows)}
    required={r['Sound'] for rows in effects.values() for r in rows if r.get('Sound')}
    assert required == set(PINS)-{'fingerprint.json'}
    files={};sounds={}
    for name in sorted(required):
        blob=source(name,PINS);assert hashlib.sha1(blob).hexdigest()==members[name]
        path='assets/audio/dark-drill-native/'+name.split('/')[-1]
        files['public/'+path]=blob;sounds[name]=dict(path=path,bytes=len(blob),sha256=digest(blob))
    files['reference/dark-drill/sounds.json']=(json.dumps(dict(sources=PINS,definitionSha256=digest(definition.read_bytes()),effects=effects,sounds=sounds),indent=2)+'\n').encode()
    return files

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
    for name,data in build().items():
        path=ROOT/name
        if args.check:assert path.read_bytes()==data,name
        else:path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
    print('Verified original Dark Elixir Drill audio' if args.check else 'Wrote original Dark Elixir Drill audio')
