#!/usr/bin/env python3
"""Preserve original garrison effect rows and byte-identical Ogg samples."""
import argparse
import hashlib
import json
from native_art.bundle import ROOT, source
from native_art.source_csv import decoded_rows, records

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'sfx/balloon_deploy_02.ogg': '5b500926fbd61606eb3afc3991cb85e9636fe1bbc56751a85a7305df4e8c9f66',
    'sfx/balloon_die_01.ogg': 'df9c4635294089581c5f08441bc6365ad2ce384916aa76addd5585dc36d140be',
    'sfx/balloon_hit_01.ogg': 'e5571225ed7054ad0e9825d03c5cfb49d2857a79b073b5b49ca54ac0e656a484',
    'sfx/cannon_fire3.ogg': '51fc989854ab92f3c2941196f56ef845ec23ebb8966276b2a1515c9d14232e86',
    'sfx/dragon_attack_01.ogg': 'f9016714972eddc5291fd98e597f5c70488ce1cf4994f758386d5fe198b619b6',
    'sfx/dragon_deploy_01.ogg': '7b48aac8ead8b04989901b50f838dd83c1c09cd1b0c9e87272c742e28e77cd8d',
    'sfx/dragon_die_01.ogg': '704b6afaa96cbc6f7e5c578c15bbb83749a4ef9bd7a58a1d62f7e5c22b0d0460',
}
BINDINGS = {
    'dragon': dict(deploy='Dragon Deploy', attack='Dragon Attack', hit='Dragon Hit', die='Dragon Die'),
    'balloon': dict(deploy='Balloon Goblin Deploy', attack='Balloon Goblin Attack', hit='Balloon Goblin Hit', die='Balloon Goblin Die', deathDamage='Dark Balloon Exposion'),
}

def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    members = {row['file']: row['sha'] for row in fingerprint['files']}
    blobs = {path: source(path, PINS) for path in PINS}
    for path, blob in blobs.items():
        if path != 'fingerprint.json':
            assert hashlib.sha1(blob).hexdigest() == members[path], path
    effects = records(decoded_rows(blobs['logic/effects.csv']))
    effects = {name: effects[name] for name in sorted({name for binding in BINDINGS.values() for name in binding.values()})}
    sounds = {}
    files = {}
    for path, blob in blobs.items():
        if not path.endswith('.ogg'):
            continue
        output = 'assets/audio/garrison-native/' + path.split('/')[-1]
        sounds[path] = dict(path=output, bytes=len(blob), sha256=PINS[path])
        files['public/' + output] = blob
    for rows in effects.values():
        for row in rows:
            if row.get('Sound'):
                assert row['Sound'] in sounds
    manifest = dict(clientVersion=fingerprint['version'], sources=PINS, bindings=BINDINGS, effects=effects, sounds=sounds)
    files['reference/garrison/sounds.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    return files

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for name, blob in build().items():
        path = ROOT / name
        if args.check:
            assert path.read_bytes() == blob, name
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(blob)
    print('Verified original garrison effect rows and seven sound files' if args.check else 'Wrote original garrison sounds')
