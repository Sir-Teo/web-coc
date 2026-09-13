#!/usr/bin/env python3
"""Preserve original Castle models and the two No Flight Zone troop mesh families.

Source graphs and packed texels are exact. Preview registration and animation
sampling are local; native engine playback and combat integration are separate.
"""
import argparse
import hashlib
import json
import runpy

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, BUNDLE, BASE, source, digest
from native_art.sc6 import SC6, decode_sctx, require
from native_art.scene_graph import capture_graph, crop_textures

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'sc/buildings.sc': 'f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed',
    'sc/chr_dragon.sc': '9f5a80ca18fe19d9b116c82eaafdde15f326b5d9f4fde51ba542904ec371d9c8',
    'sc/chr_balloon.sc': '7db110cf0ed98808a65550d17c240a0c10753db35958c766987f4b21afa5641d',
    'sc/buildings_2.sctx': 'ff0f766b8d361eeb942384600ace1082a11c7c7404bed41d976fbafbdd2dc622',
    'sc/buildings_8.sctx': '588eba7d5739a5d9b53d3e14f2ab83bd170cad735363a81dd37bea7bcc0bb3bd',
    'sc/buildings_25.sctx': 'c290a82b3940513f16b55dba2305e875d923d4120c5997b6b6908c680ec8ca3d',
    'sc/buildings_37.sctx': 'bf4e486ffcd139075200b4fdb7faa7849973d19878036b6b4d4659d505f5a195',
    'sc/chr_dragon_0.sctx': '8ac4749ec030e8d22f43f19c2b011ac473120cb495dd2b76b33b42454008f205',
    'sc/chr_balloon_0.sctx': '41aeaa3afb6e3da9f33b8c51513f8ae473a1e89c893771b289d219b9a30aa0ef',
}
PREFIX = 'assets/garrison-native'
CASTLE_FIELDS = ['ExportName', 'ExportNameConstruction', 'ExportNameBuildAnim',
                 'ExportNameDamaged', 'ExportNameLocked', 'ExportNameBase']
COINS = ['CoinsBackFull', 'CoinsBackHalf', 'CoinsFrontFull', 'CoinsFrontHalf',
         'CoinsRoofFull', 'CoinsRoofHalf']
EMPTY_CASTLE = {name: False for name in [*COINS, 'badge', 'alliance_name', 'shadow_edit']}
SOURCE_SCENE = runpy.run_path(str(ROOT / 'scripts/import-native-cannon.py'))


def poses(graph, name, frame=0, controls=None, root=None):
    """Independent Python playback with the original additive group boundaries."""
    return SOURCE_SCENE['poses'](graph, name, frame, controls, root)


def points(draws):
    return SOURCE_SCENE['points'](draws)


def build():
    data_importer = runpy.run_path(str(ROOT / 'scripts/import-native-garrison.py'))
    data = data_importer['build']()
    references = {}
    for name, value in data.items():
        encoded = (json.dumps(value, indent=2) + '\n').encode()
        require((ROOT / 'reference/garrison' / (name + '.json')).read_bytes() == encoded,
                'Regenerate the source catalogue before its artwork')
        references[name] = digest(encoded)
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client differs')
    members = {v['file']: v['sha'] for v in fingerprint['files']}
    for path in PINS:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, PINS)).hexdigest() == members[path], f'Fingerprint differs: {path}')
    building_exports = {r[k] for rows in data['native']['buildings'].values() for r in rows
                        for k in CASTLE_FIELDS if r.get(k)}
    building_exports.update(['npc_alliance_castle_base', 'war_alliance_castle_base'])
    specs = dict(
        castle=('sc/buildings.sc', sorted(building_exports), [1273, 1290]),
        dragon7=('sc/chr_dragon.sc', [f'dragon7_fly1_{i}' for i in range(1, 4)], [219]),
        balloon8=('sc/chr_balloon.sc', ['balloon_lvl8_idle1', 'balloon_lvl8_attack1', 'balloon_lvl8_die1'], []))
    worlds, runtimes, outputs = {}, {}, {}
    for family, (path, names, empty) in specs.items():
        sc = SC6(source(path, PINS))
        graph = capture_graph(sc, {name: sc.exports[name] for name in names}, empty_bounds=empty)
        require({b for c in graph['clips'].values() for b in c['blending']} == {0, 8}, 'Unexpected source blend')
        used = sorted({t for commands in graph['shapes'].values() for t, _ in commands})
        images = {t: decode_sctx(source('sc/' + sc.textures[t]['external'], PINS)) for t in used}
        for t, image in images.items():
            require(image.size == (sc.textures[t]['width'], sc.textures[t]['height']), 'Texture dimensions differ')
        assets, textures, runtime = crop_textures(graph, images, f'{PREFIX}/{family}/texture')
        outputs.update(assets)
        worlds[family] = dict(source=path, graph=graph, textures=textures,
            sourceTextures={str(t): 'sc/' + sc.textures[t]['external'] for t in used})
        runtimes[family] = runtime
    cpu = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))
    framing = SOURCE_SCENE['conservative_bounds']
    previews, icons = {}, {}
    for family, world in worlds.items():
        graph = world['graph']
        textures = {int(t): np.array(decode_sctx(source(path, PINS))) / 255 for t, path in world['sourceTextures'].items()}
        bounds = framing(graph, list(graph['exports']))
        width, height = 2 * (bounds[2] - bounds[0]), 2 * (bounds[3] - bounds[1])
        root = np.array([[2, 0, -bounds[0] * 2], [0, 2, -bounds[1] * 2], [0, 0, 1]])
        if family == 'castle':
            cases = [(f'castle-{row["level"]}', row['body'], row['base']) for row in data['catalog']['castles']['Clan Castle']]
            goblin = data['catalog']['castles']['Goblin Castle'][0]
            cases.append(('goblin-castle', goblin['body'], goblin['base']))
        elif family == 'dragon7':
            cases = [(f'dragon-7-view-{i}', f'dragon7_fly1_{i}', None) for i in range(1, 4)]
        else:
            cases = [('balloon-8', 'balloon_lvl8_idle1', None)]
        for key, name, base in cases:
            controls = EMPTY_CASTLE if family == 'castle' else {}
            draws = poses(graph, base, root=root) if base else []
            draws += poses(graph, name, controls=controls, root=root)
            xy = np.array(points(draws))
            require((xy >= 0).all() and (xy < [width, height]).all(), 'Clipped source preview')
            rgba = cpu['compose'](draws, textures, max(width, height))
            rgba[:, :, :3] /= np.where(rgba[:, :, 3:4] > 0, rgba[:, :, 3:4], 1)
            image = Image.fromarray(np.round(np.clip(rgba, 0, 1) * 255).astype(np.uint8), 'RGBA').crop((0, 0, width, height))
            path = f'{PREFIX}/{family}/{key}.png'
            outputs[path] = image
            previews[key] = dict(path=path, family=family, export=name, baseExport=base, controls=controls,
                bounds=bounds, width=width, height=height, pixelsPerNativeUnit=2, rgbaSha256=digest(image.tobytes()))
            box = image.getbbox()
            require(box is not None, 'Empty source preview')
            crop = [box[0] - 8, box[1] - 8, box[2] + 8, box[3] + 8]
            require(crop[0] >= 0 and crop[1] >= 0 and crop[2] <= width and crop[3] <= height, 'Icon padding clips')
            icon = image.crop(crop)
            icon_path = f'{PREFIX}/{family}/{key}-icon.png'
            outputs[icon_path] = icon
            icons[key] = dict(path=icon_path, sourcePortrait=path, crop=crop, width=icon.width,
                              height=icon.height, rgbaSha256=digest(icon.tobytes()))
    native = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS,
        sourceCatalogSha256=references, worlds=worlds, previews=previews, icons=icons,
        reconstruction=dict(liveIntegration=False, nativePlaybackVerified=False,
            scope='Fourteen Clan Castle bodies, Goblin Castle, three bases, ruin/scaffold/construction, all three Dragon 7 source views with nested wing timelines and attack locator, Balloon 8 idle/attack/death.',
            controls='Original coin, badge, name, shadow and edit-shadow controls remain intact. Empty badge/name text and Dragon attack_pivot fields retain their bounds and transforms as nonpainting nodes. No clan emblem or visible text is fabricated.',
            previews='Source frame zero, empty Castle treasury and no badge/name overlay. Two pixels per native unit, conservative per-family bounds, eight-pixel icon padding. Registration is local; the original graph and texture sampling are unchanged.',
            animation='All original timelines, including 94-frame Castle roots, nested Dragon wings and 34-frame Balloon attack, remain literal. Original Castle pixels reveal rising Z sleep markers after frame zero; this root must not be treated as an always-running guarding idle. Native state/clock selection remains unverified. Three Dragon views are not converted into invented uniform directions. Non-looping completion and source ActionFrame conventions need live integration.',
            excluded='Combat, home Castle progression, donations, treasury operations, visible clan names/badges, troop attack/death effects and sound, and resolution of the Dragon death animation remain separate work.'))
    return outputs, dict(art=native, **runtimes)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, references = build()
    folder = ROOT / 'public' / PREFIX
    if args.check:
        require({p.relative_to(ROOT / 'public').as_posix() for p in folder.rglob('*') if p.is_file()} == set(outputs), 'Asset membership differs')
    for path, image in outputs.items():
        target = ROOT / 'public' / path
        if args.check:
            with Image.open(target) as old:
                require(old.mode == 'RGBA' and old.size == image.size and old.tobytes() == image.tobytes(), f'Pixels differ: {path}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target, optimize=True)
    for name, value in references.items():
        path = ROOT / 'reference/garrison' / (name + '.json')
        encoded = json.dumps(value, indent=2) + '\n'
        if args.check:
            require(path.read_text() == encoded, f'Garrison art reference differs: {name}')
        else:
            path.write_text(encoded)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} original Castle and garrison art assets')


if __name__ == '__main__':
    main()
