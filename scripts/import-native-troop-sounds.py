#!/usr/bin/env python3
"""Import the attacking troops' and spells' own sounds: deploying, attacking, dying and casting.

Each troop row of `logic/characters.csv` names its `DeployEffect`, `AttackEffect` and
`DieEffect`; each effect's rows in `logic/effects.csv` that name a `Sound` give the Ogg file, its
volume, pitch range and delay. Those rows are alternative takes of one sound (the files are
numbered takes, such as `barb_deploy_11`, `barb_deploy_11v2` and `barb_deploy_11v3`), so the game
plays one of them per event. A troop whose effect changes with level (the Wizard's attack,
the Valkyrie's) keeps one effect per level. Destroyed buildings play the client's
`Building Destroyed` effect; every Home Village destroy effect uses the same sound.

Each spell row of `logic/spells.csv` names its `PreDeployEffect` (the bottle falling),
`DeployEffect` and `DeployEffect2` (it landing), `ChargingEffect` and `HitEffect` (each pulse);
those that vary by level keep one effect per level, as troops do.

The troops are the trainable and spawned units of src/game/native-units.ts (`TROOP_SOURCE` and
`SPAWN_SOURCE`); the spells are those of reference/troops/catalog.json and the native roster in
src/game/troop-progression.ts (`NATIVE_SPELL_NAMES`). The Ogg files are copied unchanged to public/assets/audio/troops-native and
every source must match its SHA-256 in reference/full-client/manifest.json. Sources are read
from the local client archive when present (art/source/native-client-18.400.21/files),
otherwise downloaded from the pinned bundle.

  python3 scripts/import-native-troop-sounds.py           # write the catalog and sounds
  python3 scripts/import-native-troop-sounds.py --check   # verify both reproduce
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
ARCHIVE = ROOT / 'art/source/native-client-18.400.21/files'
CACHE = ROOT / 'output/native-campaign-source'
TARGET = ROOT / 'reference/troop-sounds/sounds.json'
AUDIO = 'assets/audio/troops-native'
EVENTS = {'deploy': 'DeployEffect', 'attack': 'AttackEffect', 'die': 'DieEffect'}
SPELL_EVENTS = {
    'preDeploy': 'PreDeployEffect', 'deploy': 'DeployEffect', 'deploy2': 'DeployEffect2',
    'charging': 'ChargingEffect', 'hit': 'HitEffect',
}
DESTROYED = 'Building Destroyed'


def require(condition, message):
    if not condition:
        raise SystemExit(f'Troop sound import: {message}')


def source(path, pins):
    require(path in pins, f'{path} is not in the client manifest')
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
    require(hashlib.sha256(data).hexdigest() == pins[path], f'Source checksum differs: {path}')
    return data


def records(blob):
    """Named records with their continuation rows; blank cells are not inherited."""
    if blob.startswith(b'Sig:'):
        blob = blob[68:]
    if not blob.startswith(b'"'):
        blob = lzma.decompress(blob[:9] + b'\0' * 4 + blob[9:])
    table = list(csv.reader(io.StringIO(blob.decode('utf-8-sig'))))
    headers, result, name = table[0], {}, None
    for values in table[2:]:
        if not any(values):
            continue
        if values[0]:
            name = values[0]
            require(name not in result, f'Duplicate record {name}')
            result[name] = []
        result[name].append({k: v for k, v in zip(headers, values) if v})
    return result


def units():
    """Game keys and client names of the trainable and spawned troops."""
    text = (ROOT / 'src/game/native-units.ts').read_text()
    found = {}
    for block in ('TROOP_SOURCE', 'SPAWN_SOURCE'):
        body = re.search(rf'export const {block} = \{{(.*?)\}} as const;', text, re.S)
        require(body, f'Missing {block}')
        found.update(re.findall(r"^\s+(\w+): '([^']+)',", body.group(1), re.M))
    require(len(found) > 50, 'Too few troops read from native-units.ts')
    return found


def spell_names():
    """Client names of the spells this game casts."""
    names = dict(json.loads((ROOT / 'reference/troops/catalog.json').read_text())['spells'])
    text = (ROOT / 'src/game/troop-progression.ts').read_text()
    body = re.search(r'const NATIVE_SPELL_NAMES = \{(.*?)\} as const;', text, re.S)
    require(body, 'Missing NATIVE_SPELL_NAMES')
    names.update(re.findall(r"^\s+(\w+): '([^']+)',", body.group(1), re.M))
    require(len(names) > 15, 'Too few spells read')
    return names


def build():
    manifest = json.loads((ROOT / 'reference/full-client/manifest.json').read_text())
    pins = {f['path']: f['sha256'] for f in manifest['files']}
    characters = records(source('logic/characters.csv', pins))
    spells_table = records(source('logic/spells.csv', pins))
    effects = records(source('logic/effects.csv', pins))

    def takes(name):
        rows = [row for row in effects.get(name, []) if row.get('Sound')]
        return [dict(sound=row['Sound'], volume=int(row.get('Volume', 100)) / 100,
                     minPitch=int(row.get('MinPitch', 100)) / 100,
                     maxPitch=int(row.get('MaxPitch', 100)) / 100,
                     delay=int(row.get('SoundDelay', 0)) / 1000) for row in rows]

    used = {}

    def entries(rows, events):
        entry = {}
        for event, column in events.items():
            # A level row names its effect only when it changes; carry the last one forward.
            levels, current = [], None
            for row in rows:
                current = row.get(column, current)
                levels.append(current if current and takes(current) else None)
            if not any(levels):
                continue
            entry[event] = levels[0] if len(set(levels)) == 1 else levels
            for effect in filter(None, levels):
                used[effect] = takes(effect)
        return entry

    troops = {}
    for key, name in sorted(units().items()):
        rows = characters.get(name)
        require(rows, f'Absent character {name}')
        entry = entries(rows, EVENTS)
        if entry:
            troops[key] = dict(name=name, **entry)
    spells = {}
    for key, name in sorted(spell_names().items()):
        rows = spells_table.get(name)
        require(rows, f'Absent spell {name}')
        entry = entries(rows, SPELL_EVENTS)
        if entry:
            spells[name] = dict(key=key, **entry)
    used[DESTROYED] = takes(DESTROYED)
    require(used[DESTROYED], 'Building Destroyed names no sound')

    files, sounds = {}, {}
    for path in sorted({take['sound'] for rows in used.values() for take in rows}):
        blob = source(path, pins)
        target = f'{AUDIO}/{path.split("/")[-1]}'
        files[ROOT / 'public' / target] = blob
        sounds[path] = dict(path=target, bytes=len(blob), sha256=pins[path])
    sources = {p: pins[p] for p in ['logic/characters.csv', 'logic/spells.csv', 'logic/effects.csv',
                                    *sounds]}
    catalog = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=sources,
                   troops=troops, spells=spells, destroyed=DESTROYED,
                   effects=dict(sorted(used.items())), sounds=sounds)
    files[TARGET] = (json.dumps(catalog, indent=2) + '\n').encode()
    return files, catalog


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    files, catalog = build()
    for path, data in files.items():
        if args.check:
            require(path.exists() and path.read_bytes() == data, f'{path.relative_to(ROOT)} differs')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    total = sum(s['bytes'] for s in catalog['sounds'].values())
    print(f'{len(catalog["troops"])} troops, {len(catalog["spells"])} spells, '
          f'{len(catalog["effects"])} effects, '
          f'{len(catalog["sounds"])} sounds ({total / 1048576:.2f} MB)'
          + (' reproduce the client.' if args.check else f'; wrote {TARGET.relative_to(ROOT)}'))


if __name__ == '__main__':
    main()
