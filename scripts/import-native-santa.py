#!/usr/bin/env python3
"""Reconstruct native Santa Trap, sleigh, presents, smoke/debris and sound sources.

Uses scripts/native_art/requirements.txt. --check compares metadata and pixels.
This preserves source facts; engine spell timing and allegiance need separate validation.
"""
import argparse
import csv
import io
import json
import lzma

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, BUNDLE, BASE, SOURCES, digest, source
from native_art.sc6 import SC6, decode_sctx, require
from native_art.atlas import atlas_group, root_track, verify_root_track

PINS = {
    **SOURCES,
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'logic/spells.csv': '385159e00327e6a1567cd91f1585b4ed0717d3f4475f0823398243482598289d',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'csv/particle_emitters.csv': '8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
    'sfx/santa.ogg': 'db39b55a2dbab00ebcee0bd58f150b15c0c65f316ab2555300f4ab0f8550450d',
    'sfx/mage_deploy_06.ogg': 'be2a90a7ca629ed8ebf3718be96cff3b448f55e7ae007494e95ec4aa0c258d79',
    'sfx/xmastree.ogg': '0416c3bf0218896c140698544178c4d4e5090219542fcbcc9bc51f7a918c97d3',
    'sfx/cannon_fire3.ogg': '51fc989854ab92f3c2941196f56ef845ec23ebb8966276b2a1515c9d14232e86',
}


def table(path):
    raw = source(path, PINS)
    if raw.startswith(b'Sig:'):
        raw = raw[68:]
    if not raw.startswith(b'"'):
        raw = lzma.decompress(raw[:9] + b'\0' * 4 + raw[9:])
    return list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))[1:]


def groups(rows):
    result = {}
    for row in rows:
        if row['Name']:
            name = row['Name']
            require(name not in result, 'Duplicate named source record')
            result[name] = []
        result[name].append({k: v for k, v in row.items() if v})
    return result


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client fingerprint differs')
    trap = groups(table('logic/traps.csv'))['SantaTrap'][0]
    spells = groups(table('logic/spells.csv'))
    spell = spells[trap['Spell']]
    require(trap['GlobalID'] == '12000007' and spell[0]['GlobalID'] == '26000006', 'Santa identity differs')
    effects = groups(table('logic/effects.csv'))
    selected = {name: effects[name] for name in [trap['Effect'], *[spell[0][k] for k in
                ('DeployEffect', 'DeployEffect2', 'ChargingEffect', 'HitEffect')]]}
    particles = groups(table('csv/particle_emitters.csv'))
    particle_names = sorted({r['ParticleEmitter'] for rows in selected.values() for r in rows if r.get('ParticleEmitter')})
    selected_particles = {name: particles[name] for name in particle_names}
    sc = SC6(source('sc/buildings.sc', PINS))
    textures = {}
    for index in (39, 66):
        descriptor = sc.textures[index]
        image = decode_sctx(source('sc/' + descriptor['external'], PINS))
        require(image.size == (descriptor['width'], descriptor['height']), 'SC6/SCTX dimensions differ')
        textures[index] = np.array(image, dtype=np.float64) / 255
    configurations = {
        'trap': ({'setup': trap['ExportName'], 'spent': trap['ExportNameBroken'], 'trigger': trap['ExportNameTriggered']}, False),
        'sleigh': ({'hogs': 17302, 'santa-loaded': 17304, 'santa-empty': 17306}, False),
        'shadow': ({'flight': 'xmas_spell_shadow'}, True),
        'presents': ({f'gift{i}': f'xmas_bomb{i}' for i in (1, 2, 3)}, False),
        'particles': ({'gift-shadow': 'xmas_bomb_shadow', 'smoke1': 'd4_red', 'smoke2': 'd2_red',
                       'debris1': 'gift_debris_1', 'debris2': 'gift_debris_2'}, False),
    }
    outputs, art = {}, {}
    for name, (exports, travel) in configurations.items():
        images, metadata = atlas_group(sc, textures, exports, f'assets/effects/santa-native/{name}', travel=travel)
        outputs.update(images)
        art[name] = metadata
    # A registered setup preview avoids exposing an atlas as a UI image.
    trap_art = art['trap']
    for state in ('setup', 'spent'):
        f = trap_art['frames'][trap_art['clips'][state]['frames'][0]]
        page = outputs[trap_art['pages'][f['page']]['path']]
        x, y = (f['cell'] % trap_art['columns'] * trap_art['width'], f['cell'] // trap_art['columns'] * trap_art['height'])
        outputs[f'assets/effects/santa-native/{state}.png'] = page.crop((x, y, x + trap_art['width'], y + trap_art['height']))
    sounds = {}
    for name, original in [('call', 'mage_deploy_06'), ('sleigh', 'santa'), ('drop', 'xmastree'), ('impact', 'cannon_fire3')]:
        src = f'sfx/{original}.ogg'
        path = f'assets/effects/santa-native/{name}.ogg'
        outputs[path] = source(src, PINS)
        sounds[name] = dict(source=src, path=path, sha256=digest(outputs[path]))
    flight = root_track(sc, 'xmas_spell')
    verify_root_track(sc, flight)
    metadata = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS,
                    trap=trap, spell=spell, legacySpell=spells['xmas'], effects=selected,
                    particles=selected_particles, groups=art, tracks={'sleigh': flight}, sounds=sounds,
                    reconstruction=dict(sampling='premultiplied bilinear at pixel centers',
                        nestedTimelines='elapsed frames since continuous placement; loop subclips',
                        travel='sleigh root scene graph retains every child transform, color and phase; shadow translation track retained separately',
                        nativePlaybackVerified=False, spellEngineVerified=False))
    return outputs, metadata


def runtime_reference(metadata):
    """Only rendering/timing data enters the game bundle; source evidence stays separate."""
    groups = {}
    for name, group in metadata['groups'].items():
        groups[name] = dict(width=group['width'], height=group['height'], columns=group['columns'],
                            pixelsPerNativeUnit=group['pixelsPerNativeUnit'], bounds=group['bounds'],
                            pages=[dict(path=p['path'], frames=p['frames']) for p in group['pages']],
                            frames=[[f['page'], f['cell']] for f in group['frames']],
                            clips={k: dict(fps=c['fps'], frames=c['frames']) for k, c in group['clips'].items()})
        if name == 'shadow':
            groups[name]['offsets'] = group['clips']['flight']['offsets']
    sleigh = metadata['groups']['sleigh']
    by_id = {c['id']: c for c in sleigh['clips'].values()}
    flight = []
    for frame in metadata['tracks']['sleigh']['frames']:
        poses = []
        for p in frame:
            require(p['multiply'][:3] == [1, 1, 1] and p['add'] == [0, 0, 0, 0], 'Unexpected sleigh tint')
            # Preserve the brief native shear as Santa tips his sack at frames 111–117.
            poses.append([by_id[p['id']]['frames'][p['frame']], *p['matrix'], p['multiply'][3]])
        flight.append(poses)
    trap, spell = metadata['trap'], metadata['spell'][0]
    return dict(groups=groups, flight=flight, flightFps=metadata['tracks']['sleigh']['fps'],
                trap=dict(trigger=float(trap['TriggerRadius']) / 100, actionFrame=int(trap['ActionFrame'])),
                spell={k: int(spell[k]) for k in ['DeployTimeMS', 'ChargingTimeMS', 'HitTimeMS', 'NumberOfHits',
                      'TimeBetweenHitsMS', 'Damage', 'Radius', 'RandomRadius', 'DeployEffect2Delay']},
                sounds=metadata['sounds'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, metadata = build()
    reference = ROOT / 'reference/santa-trap/native.json'
    references = {reference: metadata, reference.with_name('runtime.json'): runtime_reference(metadata)}
    for path, value in outputs.items():
        target = ROOT / 'public' / path
        if args.check:
            if isinstance(value, bytes):
                require(target.read_bytes() == value, f'Native sound differs: {path}')
            else:
                with Image.open(target) as existing:
                    require(existing.mode == 'RGBA' and existing.size == value.size and existing.tobytes() == value.tobytes(),
                            f'Native Santa pixels differ: {path}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(value, bytes):
                target.write_bytes(value)
            else:
                value.save(target, optimize=True)
    if args.check:
        shipped = {str(p.relative_to(ROOT / 'public')) for p in
                   (ROOT / 'public/assets/effects/santa-native').iterdir() if p.is_file()}
        require(shipped == set(outputs), 'Unexpected or missing native Santa assets')
    for path, value in references.items():
        content = json.dumps(value, indent=2) + '\n'
        if args.check:
            require(path.read_text() == content, f'Native Santa metadata differs: {path.name}')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} native Santa assets and reference metadata')


if __name__ == '__main__':
    main()
