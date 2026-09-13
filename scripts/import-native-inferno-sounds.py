#!/usr/bin/env python3
"""Pin and preserve original Inferno Ogg samples and effect audio settings."""
import argparse, hashlib, json
from native_art.bundle import ROOT, source, digest
PINS = {'sfx/beam_up_02.ogg': '4db923a60de1a0a18862199ca13fd509d106091549b088483e2e3a384a443fa6', 'sfx/building_destroyed_01.ogg': 'fd8295765aa86ff5c7c6be1159cd8fc97aed3c858c29fbdb1af5e3d5c5ce7f04', 'sfx/darktower_noammo_02.ogg': '5b4a3248619f151b8e3680b254be5702e51d7aec25e3b7450b391d363ae26215', 'sfx/darktower_pickup_01.ogg': '61d596a5951c5db4b6640c4250b1cd0ff5a98c613402d2d923f37c6758ce1e1d', 'sfx/darktower_place_01.ogg': '3e85489b45465f312041a2060307411155f24d18a2d069b510617264f589e4b6', 'sfx/darktower_reload_01.ogg': '0745acfd7294456046fd88cb3efb3fcb8c3b9b817bb9d01635d8d43802539173', 'sfx/laser_loop_02.ogg': 'e954f6fe9012932ab48cabc6b6e1aa10e4d6f1ee26376915fd40582cc87e8dd0', 'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b'}

def build():
    fp=json.loads(source('fingerprint.json', PINS)); members={r['file']:r['sha'] for r in fp['files']}
    definition=ROOT/'reference/inferno/native.json'; original=json.loads(definition.read_text())
    effects={n:rows for n,rows in original['effects'].items() if any(r.get('Sound') for r in rows)}
    required={r['Sound'] for rows in effects.values() for r in rows if r.get('Sound')}
    assert required == set(PINS)-{'fingerprint.json'}
    files={};sounds={}
    for name in sorted(required):
        blob=source(name,PINS);assert hashlib.sha1(blob).hexdigest()==members[name]
        path='assets/audio/inferno-native/'+name.split('/')[-1]
        files['public/'+path]=blob;sounds[name]=dict(path=path,bytes=len(blob),sha256=digest(blob))
    files['reference/inferno/sounds.json']=(json.dumps(dict(sources=PINS,definitionSha256=digest(definition.read_bytes()),effects=effects,sounds=sounds),indent=2)+'\n').encode()
    return files

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
    for name,data in build().items():
        path=ROOT/name
        if args.check:assert path.read_bytes()==data,name
        else:path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
    print('Verified original Inferno audio' if args.check else 'Wrote original Inferno audio')
