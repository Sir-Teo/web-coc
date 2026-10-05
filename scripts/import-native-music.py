#!/usr/bin/env python3
"""Import the original Home Village and battle music.

The default Home scenery (`HomeDefault` in logic/village_backgrounds.csv) names no music of its
own, so the client plays its classic home theme, `music/home_music_part_1..3.ogg`. Battles use
the planning, combat, battle-intro, victory and defeat files that `csv/assets.csv` preloads.
Each file is read from the local client archive when present
(art/source/native-client-18.400.21/files), otherwise downloaded from the pinned bundle, must
match the SHA-256 in reference/full-client/manifest.json, and is copied byte for byte.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = '7f04bdfdc4124b1f49308423bb8f4aa8b137aae3'
BASE = f'https://game-assets.clashofclans.com/{BUNDLE}/'
ARCHIVE = ROOT / 'art/source/native-client-18.400.21/files'
CACHE = ROOT / 'output/native-campaign-source'
PUBLIC = 'assets/audio/music/'
REFERENCE = ROOT / 'reference/music'
TRACKS = {
    'home': ['music/home_music_part_1.ogg', 'music/home_music_part_2.ogg',
             'music/home_music_part_3.ogg'],
    'planning': ['music/combat_planning_music.mp3'],
    'combat': ['music/combat_music.ogg'],
    'intro': ['music/new_battle_intro_01.mp3'],
    'victory': ['music/winwinwin.mp3'],
    'defeat': ['music/battle_lost_02.mp3'],
}


def require(condition, message):
    if not condition:
        raise SystemExit(f'Music import: {message}')


def source(path, pin):
    local = ARCHIVE / path
    if local.exists():
        data = local.read_bytes()
    else:
        target = CACHE / path
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix(target.suffix + '.part')
            subprocess.run(['curl', '--fail', '--silent', '--show-error', '--retry', '2',
                            BASE + path, '-o', str(temporary)], check=True)
            temporary.replace(target)
        data = target.read_bytes()
    require(hashlib.sha256(data).hexdigest() == pin, f'Source checksum differs: {path}')
    return data


def build():
    manifest = json.loads((ROOT / 'reference/full-client/manifest.json').read_text())
    pins = {f['path']: f['sha256'] for f in manifest['files']}
    files, tracks = {}, {}
    for scene, paths in TRACKS.items():
        tracks[scene] = []
        for path in paths:
            require(path in pins, f'{path} is not in the client manifest')
            blob = source(path, pins[path])
            public = PUBLIC + path.split('/')[-1]
            files['public/' + public] = blob
            tracks[scene].append(dict(source=path, path=public, bytes=len(blob),
                                      sha256=pins[path]))
    catalog = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE,
                   scope='Default Home scenery music and Home Village battle music, unaltered.',
                   tracks=tracks)
    files['reference/music/catalog.json'] = (json.dumps(catalog, indent=2) + '\n').encode()
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true',
                        help='verify the committed files instead of rewriting them')
    arguments = parser.parse_args()
    files = build()
    for name, data in files.items():
        path = ROOT / name
        if arguments.check:
            require(path.exists() and path.read_bytes() == data, f'{name} differs from the source')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    print(f'{"Verified" if arguments.check else "Wrote"} {len(files) - 1} original music files')


if __name__ == '__main__':
    main()
