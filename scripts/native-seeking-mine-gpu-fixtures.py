#!/usr/bin/env python3
"""Independent Seeking Air Mine pixel witnesses from original SC/SCTX textures."""
import argparse
import json
import runpy

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import SC6, decode_sctx, require

cpu = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))
nodes, compose = cpu['nodes'], cpu['compose']


def leaves(poses):
    for pose in poses:
        if 'group' in pose: yield from leaves(pose['group'])
        else: yield pose


def build():
    native = json.loads((ROOT / 'reference/seeking-mine/native.json').read_text())
    graph = native['world']['graph']
    cases = []
    for name, id_ in sorted(graph['exports'].items()):
        clip = graph['clips'][str(id_)]
        if name.startswith('evil_airTrap_setup'): frames = [0, 47, 99, 199]
        elif name.startswith('evil_airTrap_projectile'): frames = [0, 2, 6, 24, 119]
        elif name == 'air_trap': frames = [0, 1, 6, 7, 14, 74]
        elif name == 'gen_appear_fx': frames = [0, 1, 7, 14, 17]
        else: frames = [int(len(clip['timeline']) * .35)]
        for frame in frames:
            cases.append(dict(graph='world', export=name, time=frame / clip['fps']))
    for emitter, frame in [('AirDefence3_hit2', 13), ('small_airTrap_fireExplosion3', 49),
                           ('large_airTrap_lightFlash', 12)]:
        row = native['particles'][emitter][0]
        require(row['AdditiveBlend'] == 'TRUE', 'Source emitter blend differs')
        name = row['ParticleExportName']
        cases.append(dict(graph='world', export=name, emitter=emitter, particleBlend=8,
                          time=frame / graph['clips'][str(graph['exports'][name])]['fps']))
    cases.append(dict(graph='info', export='evil_airtrap_lvl1_info', time=0))
    cell, columns = 400, 6
    width, height = cell * columns, cell * ((len(cases) + columns - 1) // columns)
    background = [48 / 255, 65 / 255, 53 / 255]
    sheet = Image.new('RGBA', (width, height), (48, 65, 53, 255))
    for category in ['world', 'info']:
        graph = native[category]['graph']
        if category == 'world':
            textures = {int(i): np.array(decode_sctx(source(f'sc/buildings_{i}.sctx', native['sources']))) / 255
                        for i in native[category]['textures']}
        else:
            ui = SC6(source('sc/ui.sc', native['sources']),
                     max_decompressed_bytes=native['info']['decompressedSourceBytes'])
            textures = {int(i): np.array(ui.embedded_texture(int(i))) / 255 for i in native['info']['textures']}
        for i, case in enumerate(cases):
            if case['graph'] != category: continue
            id_ = graph['exports'][case['export']]
            frame = int(case['time'] * graph['clips'][str(id_)]['fps'] + 1e-9)
            points = []
            for pose in leaves(nodes(graph, id_, frame, np.eye(3))):
                vertices = np.array(pose['vertices']).reshape(-1, 4)
                points.extend(np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @
                              np.array(pose['matrix']).reshape(2, 3).T)
            if points:
                bounds = np.array(points)
                low, high = bounds.min(axis=0), bounds.max(axis=0)
                scale = min(2, *((cell - 32) / np.maximum(1, high - low)))
                center = (cell - (high + low) * scale) / 2
                root = np.array([[scale, 0, center[0]], [0, scale, center[1]], [0, 0, 1]])
            else:
                # The original trigger and projectile deliberately start empty.
                root = np.eye(3)
            poses = nodes(graph, id_, frame, root)
            if 'particleBlend' in case:
                for pose in poses: pose['blend'] = case['particleBlend']
            image = Image.fromarray(np.round(compose(poses, textures, cell, background) * 255).astype(np.uint8), 'RGBA')
            x, y = i % columns * cell, i // columns * cell
            sheet.paste(image, (x, y))
            case.update(x=x, y=y, root=root[:2].reshape(-1).tolist(), empty=not points,
                        rgbaSha256=digest(image.tobytes()))
        del textures
    return sheet, dict(width=width, height=height, cell=cell, background='#304135',
                       nativePlaybackVerified=False, rgbaSha256=digest(sheet.tobytes()), cases=cases)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    image, manifest = build()
    folder = ROOT / 'tests/fixtures/native-seeking-mine-mesh'
    content = json.dumps(manifest, indent=2) + '\n'
    if args.check:
        require((folder / 'manifest.json').read_text() == content, 'Source witness metadata differs')
        with Image.open(folder / 'reference.png') as old:
            require(old.mode == 'RGBA' and old.size == image.size and old.tobytes() == image.tobytes(), 'Source witness pixels differ')
    else:
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'manifest.json').write_text(content)
        image.save(folder / 'reference.png', optimize=True)
    print(f'{"Verified" if args.check else "Wrote"} {len(manifest["cases"])} independent mine GPU source cases, including {sum(c["empty"] for c in manifest["cases"])} empty opening frames')


if __name__ == '__main__': main()
