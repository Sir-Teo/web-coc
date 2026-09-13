#!/usr/bin/env python3
"""Pin and preserve original Archer Tower Ogg samples and effect audio settings."""
import argparse, hashlib, json
from native_art.bundle import ROOT, source, digest
PINS = {'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b', 'sfx/archer_tower_pick_01.ogg': '64c823500a439327f30eed056b712257347d7b368a8e7bc42d6ae24df3ec7d71', 'sfx/archer_tower_place_02.ogg': '3aa9d058c7208c2ac7f284831de5fb583816d6e7a0ef1a9b137a7ce2d2996dd7', 'sfx/arrow_hit_07.ogg': 'f331fbb1d307973e4adfc2b673fd167f636e2babb887a90c1c0d3c1481581db3', 'sfx/arrow_hit_07v2.ogg': '24012a7b5afc5834cba6cfaa4873dc9a7fd1d65f3fa293b7bcd2a67b439a3b56', 'sfx/arrow_hit_07v3.ogg': '05790e6c00742cfab1ab746a8bce34a4d74cb1c86ec6c34fd13b5e1fdfb144b9', 'sfx/bow_target.ogg': '6ce1662bd07978da29bdd4d2dd89cd242164b3808d1dcc9ed8911065c2b6aa2b', 'sfx/building_destroyed_01.ogg': 'fd8295765aa86ff5c7c6be1159cd8fc97aed3c858c29fbdb1af5e3d5c5ce7f04', 'sfx/explosive_arrow_01v2.ogg': '2743212b46001112a8dedbc1aee1c944389d21f3f1144ba9e1c5edf3a9b79e4e', 'sfx/generic_hit_01.ogg': '5fca48e71d21be79eb6d40a1ca1ad3a002e3d69ba72388b2eb6a4d2ec10e5934'}

def build():
    fp=json.loads(source('fingerprint.json', PINS)); members={r['file']:r['sha'] for r in fp['files']}
    definition=ROOT/'reference/archer-tower/native.json'; original=json.loads(definition.read_text())
    effects={n:rows for n,rows in original['effects'].items() if any(r.get('Sound') for r in rows)}
    required={r['Sound'] for rows in effects.values() for r in rows if r.get('Sound')}
    assert required == set(PINS)-{'fingerprint.json'}
    files={};sounds={}
    for name in sorted(required):
        blob=source(name,PINS);assert hashlib.sha1(blob).hexdigest()==members[name]
        path='assets/audio/archer-tower-native/'+name.split('/')[-1]
        files['public/'+path]=blob;sounds[name]=dict(path=path,bytes=len(blob),sha256=digest(blob))
    files['reference/archer-tower/sounds.json']=(json.dumps(dict(sources=PINS,definitionSha256=digest(definition.read_bytes()),effects=effects,sounds=sounds),indent=2)+'\n').encode()
    return files

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
    for name,data in build().items():
        path=ROOT/name
        if args.check:assert path.read_bytes()==data,name
        else:path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
    print('Verified original Archer Tower audio' if args.check else 'Wrote original Archer Tower audio')
