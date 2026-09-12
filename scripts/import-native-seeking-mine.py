#!/usr/bin/env python3
"""Preserve Seeking Air Mine source art, Info portrait, effects and eight levels.

Requires scripts/native_art/requirements.txt. --check reconstructs all retained
graphs, sampling pixels and original sounds from the pinned public client.
"""
import argparse
import csv
import hashlib
import io
import json
import lzma
import runpy

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, BUNDLE, BASE, SOURCES, digest, source
from native_art.sc6 import SC6, decode_sctx, require
from native_art.scene_graph import capture_graph, crop_textures

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'sc/buildings.sc': SOURCES['sc/buildings.sc'],
    'sc/buildings_8.sctx': '588eba7d5739a5d9b53d3e14f2ab83bd170cad735363a81dd37bea7bcc0bb3bd',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
    'sc/buildings_66.sctx': SOURCES['sc/buildings_66.sctx'],
    'sc/ui.sc': '200abb4f7e79b0cc78b829e891b644d21653168ec4892dc864cb6d81c30109b0',
    'logic/traps.csv': SOURCES['logic/traps.csv'],
    'logic/projectiles.csv': '71cda0e457ad88a6772f6421a22419b24d6bcf78d0ed305f09184404889a72dc',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'csv/particle_emitters.csv': '8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef',
    'sfx/air_trap.ogg': 'f9534f6b251241313fc1fd037f3ce82262cf9c64a494e147c9496d7e40a638c8',
    'sfx/bad_move_06.ogg': '8cd8ba9ed2b8605e72f0c36c1d8308adb3f784a2040f53f036b93323de9f3b69',
    'sfx/cannon_drop2.ogg': 'b50b98444dd9aa6af9fbbffd5966fbb9be8d4234aa5a34137cc85b44fd0d9d4a',
    'sfx/cannon_fire3.ogg': '51fc989854ab92f3c2941196f56ef845ec23ebb8966276b2a1515c9d14232e86',
    'sfx/wall_pickup_01.ogg': 'de5a84c06e812bf78a05984f84d0eaa85a226854f3473d77458458e6aa8f1fec',
}
PREFIX = 'assets/buildings/seeking-mine-native'
UI_DECOMPRESSED_BYTES = 108270988


def table(path):
    blob = source(path, PINS)
    if blob.startswith(b'Sig:'): blob = blob[68:]
    if not blob.startswith(b'"'): blob = lzma.decompress(blob[:9] + b'\0' * 4 + blob[9:])
    result, name = {}, ''
    for row in list(csv.DictReader(io.StringIO(blob.decode('utf-8-sig'))))[1:]:
        if row['Name']:
            name = row['Name']
            require(name not in result, 'Duplicate source record')
            result[name] = []
        require(name and None not in row, 'Invalid source row')
        result[name].append({k: v for k, v in row.items() if v})
    return result


def inherited(rows):
    result, current = [], {}
    for row in rows:
        current.update(row)
        result.append(current.copy())
    return result


def portrait(graph, textures, name, bounds):
    # Independent CPU sampling of the original textures, not the packed output.
    cpu = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))
    matrix = np.array([[2, 0, -bounds[0] * 2], [0, 2, -bounds[1] * 2], [0, 0, 1]])
    poses = cpu['nodes'](graph, graph['exports'][name], 0, matrix)
    pixels = cpu['compose'](poses, textures, 480)
    pixels[:, :, :3] /= np.where(pixels[:, :, 3:4] > 0, pixels[:, :, 3:4], 1)
    image = Image.fromarray(np.round(np.clip(pixels, 0, 1) * 255).astype(np.uint8), 'RGBA')
    return image.crop((0, 0, (bounds[2] - bounds[0]) * 2, (bounds[3] - bounds[1]) * 2))


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client differs')
    manifest = {v['file']: v['sha'] for v in fingerprint['files']}
    for path in PINS:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, PINS)).hexdigest() == manifest[path], f'Fingerprint differs: {path}')
    trap = table('logic/traps.csv')['Seeking Air Mine']
    require(trap[0]['GlobalID'] == '12000006' and len(trap) == 8, 'Mine identity/levels differ')
    levels = inherited(trap)
    all_projectiles = table('logic/projectiles.csv')
    projectiles = {name: all_projectiles[name] for name in sorted({v['Projectile'] for v in levels})}
    all_effects = table('logic/effects.csv')
    pending = sorted({v for row in levels for k, v in row.items() if 'Effect' in k})
    effects = {}
    while pending:
        name = pending.pop()
        if name in effects: continue
        effects[name] = all_effects[name]
        pending += [r['SpawnEffect'] for r in effects[name] if r.get('SpawnEffect')]
    effects = dict(sorted(effects.items()))
    all_particles = table('csv/particle_emitters.csv')
    emitters = {r['ParticleEmitter'] for rows in [*effects.values(), *projectiles.values()]
                for r in rows if r.get('ParticleEmitter')}
    particles = {name: all_particles[name] for name in sorted(emitters)}
    names = {v for row in levels for k, v in row.items() if 'ExportName' in k}
    names |= {v for rows in projectiles.values() for row in rows for k, v in row.items() if 'ExportName' in k}
    names |= {r['ParticleExportName'] for rows in particles.values() for r in rows}
    sc = SC6(source('sc/buildings.sc', PINS))
    graph = capture_graph(sc, {name: sc.exports[name] for name in sorted(names)})
    used = {t for commands in graph['shapes'].values() for t, _ in commands}
    require(used == {8, 39, 66}, 'Mine source texture membership differs')
    images = {t: decode_sctx(source('sc/' + sc.textures[t]['external'], PINS)) for t in sorted(used)}
    for t, im in images.items():
        require(im.size == (sc.textures[t]['width'], sc.textures[t]['height']), 'Texture dimensions differ')
    outputs, textures, runtime = crop_textures(graph, images, PREFIX + '/world')
    previews = {}
    pixels = {t: np.array(im) / 255 for t, im in images.items()}
    bounds = [-52, -70, 52, 60]
    for row in levels:
        name = row['ExportName']
        if name in previews: continue
        path = f'{PREFIX}/preview-{row["Level"]}.png'
        image = portrait(graph, pixels, name, bounds)
        outputs[path] = image
        previews[name] = dict(path=path, bounds=bounds, width=image.width, height=image.height,
                              pixelsPerNativeUnit=2, rgbaSha256=digest(image.tobytes()))
    del pixels, images
    # This one source exceeds the default 100 MiB guard by ~3.3 MiB. Its exact
    # SHA and bounded decoded size are checked; the global default stays intact.
    ui = SC6(source('sc/ui.sc', PINS), max_decompressed_bytes=UI_DECOMPRESSED_BYTES)
    require({r['BigPicture'] for r in levels} == {'evil_airtrap_lvl1_info'} and
            {r['BigPictureSWF'] for r in levels} == {'sc/ui.sc'}, 'Info source differs')
    name = levels[0]['BigPicture']
    root = ui.clip(ui.exports[name])
    require(root['names'] == ['', 'bounds'] and root['children'] == [15044, 16136], 'Info children differ')
    info_graph = capture_graph(ui, {name: ui.exports[name]}, empty_bounds=[16136])
    info_used = {t for commands in info_graph['shapes'].values() for t, _ in commands}
    require(info_used == {2, 4, 5}, 'Info embedded texture membership differs')
    images = {t: ui.embedded_texture(t) for t in sorted(info_used)}
    info_outputs, info_textures, info_runtime = crop_textures(info_graph, images, PREFIX + '/info')
    outputs.update(info_outputs)
    info_bounds = [-90, -120, 90, 90]
    info_image = portrait(info_graph, {t: np.array(im) / 255 for t, im in images.items()}, name, info_bounds)
    info_path = PREFIX + '/info.png'
    outputs[info_path] = info_image
    sounds = {}
    for original in sorted({r['Sound'] for rows in effects.values() for r in rows if r.get('Sound')}):
        path = PREFIX + '/' + original.removeprefix('sfx/')
        outputs[path] = source(original, PINS)
        sounds[original] = dict(path=path, sha256=digest(outputs[path]))
    combat = dict(levels=[dict(level=int(v['Level']), damage=int(v['Damage']), cost=int(v['BuildCost']),
                    seconds=sum(int(v[k]) * scale for k, scale in [('BuildTimeD', 86400), ('BuildTimeH', 3600), ('BuildTimeM', 60)]),
                    townhall=int(v['TownHallLevel']), setup=v['ExportName'], projectile=v['Projectile']) for v in levels],
                  triggerRadius=int(levels[0]['TriggerRadius']), damageRadius=int(levels[0]['DamageRadius']),
                  minHousing=int(levels[0]['MinTriggerHousingLimit']), actionFrame=int(levels[0]['ActionFrame']),
                  triggerFps=graph['clips'][str(graph['exports'][levels[0]['ExportNameTriggered']])]['fps'],
                  airTrigger=levels[0]['AirTrigger'] == 'TRUE', groundTrigger=levels[0]['GroundTrigger'] == 'TRUE',
                  size=int(levels[0]['Width']),
                  trigger=levels[0]['ExportNameTriggered'], upgrade=levels[0]['ExportNameBuildAnim'],
                  broken=levels[0]['ExportNameBroken'],
                  projectiles={name: dict(export=rows[0]['ExportName'], shadow=rows[0]['ShadowExportName'],
                    speed=int(rows[0]['Speed']), startHeight=int(rows[0]['StartHeight']),
                    startOffset=int(rows[0]['StartOffset']), scale=int(rows[0]['Scale']),
                    playOnce=rows[0]['PlayOnce'] == 'TRUE', emitter=rows[0]['ParticleEmitter'])
                    for name, rows in projectiles.items()})
    metadata = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS,
                    trap=trap, projectiles=projectiles, effects=effects, particles=particles,
                    world=dict(graph=graph, textures=textures),
                    info=dict(graph=info_graph, textures=info_textures, path=info_path, bounds=info_bounds,
                              width=info_image.width, height=info_image.height, pixelsPerNativeUnit=2,
                              rgbaSha256=digest(info_image.tobytes()), decompressedSourceBytes=UI_DECOMPRESSED_BYTES),
                    previews=previews, sounds=sounds,
                    reconstruction=dict(nativePlaybackVerified=False, liveIntegration=False,
                        scope='Eight source levels, four setup/projectile families, upgrade/spent/reveal/shadow clips, all referenced particles, original Info portrait and five sounds.',
                        emptyBounds='The Info root contains one explicitly empty TextField named bounds. Its source rectangle and placement remain metadata; it paints no pixels.',
                        timing='Trigger ActionFrame=7 and original clip=24 fps. The local simulation derives a 7/24-second release from these fields; native action-frame and projectile handoff semantics remain unverified.'))
    print(f'World: {len(graph["exports"])} exports, {len(graph["clips"])} clips, {len(graph["shapes"])} shapes, {len(textures)} textures', flush=True)
    print(f'Info: original 360x420 portrait, three embedded ASTC textures, empty bounds retained', flush=True)
    return outputs, dict(native=metadata, runtime=runtime, info=info_runtime, combat=combat,
                         effects=dict(effects=effects, particles=particles, sounds=sounds))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, references = build()
    if args.check:
        folder = ROOT / 'public' / PREFIX
        require({p.relative_to(ROOT / 'public').as_posix() for p in folder.rglob('*') if p.is_file()} == set(outputs), 'Asset membership differs')
    for name, value in outputs.items():
        target = ROOT / 'public' / name
        if args.check:
            if isinstance(value, bytes): require(target.read_bytes() == value, f'Sound bytes differ: {name}')
            else:
                with Image.open(target) as old:
                    require(old.mode == 'RGBA' and old.size == value.size and old.tobytes() == value.tobytes(), f'Pixels differ: {name}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(value, bytes): target.write_bytes(value)
            else: value.save(target, optimize=True)
    for name, value in references.items():
        target = ROOT / 'reference/seeking-mine' / (name + '.json')
        content = json.dumps(value, indent=2) + '\n'
        if args.check: require(target.read_text() == content, f'Reference differs: {name}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} native Seeking Air Mine assets and eight source levels')


if __name__ == '__main__': main()
