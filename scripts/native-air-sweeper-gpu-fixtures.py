#!/usr/bin/env python3
"""Independent original-texture witnesses for Air Sweeper controllable parts."""
import argparse
import json
import runpy

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import decode_sctx, require

sampler = runpy.run_path(str(ROOT / 'scripts/import-native-air-sweeper.py'))
poses, points = sampler['poses'], sampler['points']
compose = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))['compose']


def build():
    native = json.loads((ROOT / 'reference/air-sweeper/native.json').read_text())
    graph = native['world']['graph']
    cases = []
    for level in range(1, 8):
        for direction in range(8):
            cases.append(dict(export=f'air_mortar_lvl{level}', time=0,
                controls=dict(turret=direction * 45, turret_sector=direction * 45, turret_load=0),
                category='direction', base='windmachine_base'))
    for level in range(1, 8):
        cases.append(dict(export=f'air_mortar_lvl{level}_upgrade', time=0,
            controls=dict(turret=level * 49, turret_sector=(level - 1) * 45, turret_load=0), category='upgrade'))
    for name in ['air_mortar_const', 'air_mortar_upg', 'windmachine_base', 'dummy_particle']:
        cases.append(dict(export=name, time=0, controls={}, category='construction-base-projectile'))
    for name in ['destroyedBuilding_2s_pit_wood', 'destroyedBuilding_2s_pit_rockwood']:
        clip = graph['clips'][str(graph['exports'][name])]
        for frame in range(len(clip['timeline'])):
            cases.append(dict(export=name, time=frame / clip['fps'], controls={}, category='rubble'))
    for frame in [0, 27, 111, 222, 223, 224, 225, 240, 269, 298, 313, 314, *range(315, 325)]:
        cases.append(dict(export='air_mortar_lvl7', time=0,
            controls=dict(turret=17, turret_sector=315, turret_load=frame), category='loading'))
    for controls in [dict(turret=359, turret_sector=0, turret_load=314),
                     dict(turret=False, turret_sector=False, turret_load=320)]:
        cases.append(dict(export='air_mortar_lvl1', time=0, controls=controls, category='independent-controls'))
    for emitter, rows in native['particles'].items():
        for variant, row in enumerate(rows):
            name = row['ParticleExportName']
            clip = graph['clips'][str(graph['exports'][name])]
            require(row.get('AdditiveBlend', rows[0]['AdditiveBlend']) == 'FALSE', 'Unexpected emitter blend')
            cases.append(dict(export=name, time=int(len(clip['timeline']) * .35) / clip['fps'],
                controls={}, category='particle', emitter=emitter, variant=variant))
    require({c['export'] for c in cases} == set(graph['exports']), 'Incomplete original export coverage')
    cell, columns = 300, 8
    width, height = cell * columns, cell * ((len(cases) + columns - 1) // columns)
    background = [48 / 255, 65 / 255, 53 / 255]
    sheet = Image.new('RGBA', (width, height), (48, 65, 53, 255))
    textures = {int(i): np.array(decode_sctx(source(f'sc/buildings_{i}.sctx', native['sources']))) / 255
                for i in native['world']['textures']}
    for i, case in enumerate(cases):
        fps = graph['clips'][str(graph['exports'][case['export']])]['fps']
        frame = int(case['time'] * fps + 1e-9)
        def sample(root=None):
            result = poses(graph, case['base'], root=root) if case.get('base') else []
            return result + poses(graph, case['export'], frame, case['controls'], root)
        xy = points(sample())
        if xy:
            bounds = np.array(xy)
            low, high = bounds.min(axis=0), bounds.max(axis=0)
            # The native dummy is about half a source unit wide. Magnify that
            # marker so CPU pixel-center and GPU edge rules cannot reduce the
            # entire comparison to one boundary pixel. Other art remains <=2x.
            scale = min(32 if case['export'] == 'dummy_particle' else 2,
                        *((cell - 32) / np.maximum(1, high - low)))
            center = (cell - (high + low) * scale) / 2
            root = np.array([[scale, 0, center[0]], [0, scale, center[1]], [0, 0, 1]])
        else:
            root = np.eye(3)
        image = Image.fromarray(np.round(compose(sample(root), textures, cell, background) * 255).astype(np.uint8), 'RGBA')
        x, y = i % columns * cell, i // columns * cell
        sheet.paste(image, (x, y))
        case.update(x=x, y=y, root=root[:2].reshape(-1).tolist(), empty=not xy, rgbaSha256=digest(image.tobytes()))
    return sheet, dict(width=width, height=height, cell=cell, background='#304135',
        nativePlaybackVerified=False, rgbaSha256=digest(sheet.tobytes()), cases=cases)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    image, manifest = build()
    folder = ROOT / 'tests/fixtures/native-air-sweeper-mesh'
    content = json.dumps(manifest, indent=2) + '\n'
    if args.check:
        require((folder / 'manifest.json').read_text() == content, 'Air Sweeper source metadata differs')
        with Image.open(folder / 'reference.png') as old:
            require(old.mode == 'RGBA' and old.size == image.size and old.tobytes() == image.tobytes(), 'Air Sweeper source pixels differ')
    else:
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'manifest.json').write_text(content)
        image.save(folder / 'reference.png', optimize=True)
    print(f'{"Verified" if args.check else "Wrote"} {len(manifest["cases"])} independent Air Sweeper pixel witnesses; {sum(c["empty"] for c in manifest["cases"])} empty')


if __name__ == '__main__': main()
