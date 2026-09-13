#!/usr/bin/env python3
"""Independent full-SCTX witnesses for Castle and No Flight Zone troop meshes."""
import argparse
import json
import runpy

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import decode_sctx, require

art = runpy.run_path(str(ROOT / 'scripts/import-native-garrison-art.py'))
cpu = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))


def case_groups(native):
    graph = native['worlds']['castle']['graph']
    bodies, details, troops = [], [], []
    castle_names = {f'alliance_castle_lvl{i}' for i in range(1, 15)}
    for level in range(1, 15):
        name = f'alliance_castle_lvl{level}'
        root = graph['clips'][str(graph['exports'][name])]
        phases = {root['timeline'].index(i) for i in set(root['timeline'])}
        phases.add(len(root['timeline']) - 1)
        for phase in sorted(phases):
            bodies.append(dict(family='castle', export=name, frame=phase,
                controls=art['EMPTY_CASTLE'].copy(), category='root-pattern', base='alliance_castle_base'))
        for state in ('Half', 'Full'):
            controls = art['EMPTY_CASTLE'].copy()
            for coin in art['COINS']:
                if coin.endswith(state): controls.pop(coin)
            details.append(dict(family='castle', export=name, frame=18, controls=controls,
                                category='treasury-' + state.lower(), base='alliance_castle_base'))
        if level in (1, 5, 14):
            for coin in art['COINS']:
                for phase in (0, 18, 50, 93):
                    controls = art['EMPTY_CASTLE'].copy()
                    controls.pop(coin)
                    details.append(dict(family='castle', export=name, frame=phase, controls=controls,
                                        category='individual-coin-control', control=coin))
    # Every frame of both 35-frame nested gold glints, with the full-treasury
    # controls enabled. The parent source timeline also continues independently.
    for phase in range(35):
        controls = art['EMPTY_CASTLE'].copy()
        for coin in art['COINS']:
            if coin.endswith('Full'): controls.pop(coin)
        details.append(dict(family='castle', export='alliance_castle_lvl5', frame=phase,
                            controls=controls, category='nested-treasury-glints'))
    for name in sorted(set(graph['exports']) - castle_names):
        for controls in ({}, {'shadow_edit': False}, {'shadow': False}, {'base': False}):
            details.append(dict(family='castle', export=name, frame=0, controls=controls,
                                category='base-construction-scaffold-ruin'))
    for view in range(1, 4):
        for phase in range(32):
            troops.append(dict(family='dragon7', export=f'dragon7_fly1_{view}', frame=phase,
                                controls={}, category='nested-wing-and-glow'))
        troops.append(dict(family='dragon7', export=f'dragon7_fly1_{view}', frame=15,
                            controls={'attack_pivot': False}, mirror=True, category='mirrored-locator-control'))
    for action, count in [('idle', 37), ('attack', 34), ('die', 11)]:
        for phase in range(count):
            troops.append(dict(family='balloon8', export=f'balloon_lvl8_{action}1', frame=phase,
                                controls={}, category='balloon-' + action))
    groups = [(f'castle-{i // 240 + 1}', bodies[i:i+240]) for i in range(0, len(bodies), 240)]
    groups.extend([('castle-controls', details), ('troops', troops)])
    for family, world in native['worlds'].items():
        require({c['export'] for _, cases in groups for c in cases if c['family'] == family} ==
                set(world['graph']['exports']), 'Missing source export coverage')
    return groups


def build(native, category, cases, textures):
    cell, columns = 300, 8
    width, height = cell * columns, cell * ((len(cases) + columns - 1) // columns)
    require(height <= 12000, 'Witness page exceeds GPU canvas limit')
    sheet = Image.new('RGBA', (width, height), (48, 65, 53, 255))
    for index, case in enumerate(cases):
        graph = native['worlds'][case['family']]['graph']
        clip = graph['clips'][str(graph['exports'][case['export']])]
        case['time'] = case['frame'] / clip['fps']
        def sample(root):
            draws = art['poses'](graph, case['base'], root=root) if case.get('base') else []
            return draws + art['poses'](graph, case['export'], case['frame'], case['controls'], root)
        mirror = -1 if case.get('mirror') else 1
        points = art['points'](sample(np.diag([mirror, 1, 1])))
        if points:
            box = np.array(points)
            low, high = box.min(axis=0), box.max(axis=0)
            scale = min(2, *((cell - 32) / np.maximum(1, high - low)))
            center = (cell - (high + low) * scale) / 2
            root = np.array([[scale * mirror, 0, center[0]], [0, scale, center[1]], [0, 0, 1]])
        else:
            root = np.eye(3)
        rgba = cpu['compose'](sample(root), textures[case['family']], cell, [48/255, 65/255, 53/255])
        image = Image.fromarray(np.round(rgba * 255).astype(np.uint8), 'RGBA')
        x, y = index % columns * cell, index // columns * cell
        sheet.paste(image, (x, y))
        case.update(x=x, y=y, root=root[:2].reshape(-1).tolist(), empty=not points, rgbaSha256=digest(image.tobytes()))
    return sheet, dict(category=category, width=width, height=height, cell=cell, background='#304135',
        nativePlaybackVerified=False, rgbaSha256=digest(sheet.tobytes()), cases=cases)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    native = json.loads((ROOT / 'reference/garrison/art.json').read_text())
    textures = {family: {int(t): np.array(decode_sctx(source(path, native['sources']))) / 255
                        for t, path in w['sourceTextures'].items()} for family, w in native['worlds'].items()}
    folder = ROOT / 'tests/fixtures/native-garrison-mesh'
    folder.mkdir(parents=True, exist_ok=True)
    index = []
    for category, cases in case_groups(native):
        image, manifest = build(native, category, cases, textures)
        path = folder / (category + '.png')
        encoded = json.dumps(manifest, indent=2) + '\n'
        if args.check:
            with Image.open(path) as old:
                require(old.mode == 'RGBA' and old.size == image.size and old.tobytes() == image.tobytes(), 'Source witness pixels differ')
            require(path.with_suffix('.json').read_text() == encoded, 'Source witness metadata differs')
        else:
            image.save(path, optimize=True)
            path.with_suffix('.json').write_text(encoded)
        index.append(dict(category=category, cases=len(cases), width=manifest['width'], height=manifest['height']))
        print(f'{"Verified" if args.check else "Wrote"} {len(cases)} independent garrison {category} pixel witnesses', flush=True)
    encoded = json.dumps(index, indent=2) + '\n'
    if args.check:
        require((folder / 'index.json').read_text() == encoded, 'Witness index differs')
    else:
        (folder / 'index.json').write_text(encoded)


if __name__ == '__main__':
    main()
