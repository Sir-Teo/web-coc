#!/usr/bin/env python3
"""Independent Wizard Tower witnesses sampled from original SC/SCTX textures."""
import argparse
import json
import runpy

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import decode_sctx, require

cpu = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))
nodes, compose = cpu['nodes'], cpu['compose']


def leaves(poses):
    for pose in poses:
        if 'group' in pose: yield from leaves(pose['group'])
        else: yield pose


def build(native, category):
    section = native[category]
    graph = section['graph']
    cases = []
    for name, id_ in sorted(graph['exports'].items()):
        clip = graph['clips'][str(id_)]
        count = len(clip['timeline'])
        if category == 'defender' and '_attack' in name: frames = [0, 14, 23]
        elif count == 1: frames = [0]
        else: frames = sorted({0, 1, count // 2, count - 1})
        for frame in frames:
            cases.append(dict(export=name, time=frame / clip['fps']))
    cell, columns = 240, 6
    width, height = cell * columns, cell * ((len(cases) + columns - 1) // columns)
    background = [48 / 255, 65 / 255, 53 / 255]
    sheet = Image.new('RGBA', (width, height), (48, 65, 53, 255))
    textures = {int(i): np.array(decode_sctx(source(section['source'].replace('.sc', f'_{i}.sctx'), native['sources']))) / 255
                for i in section['textures']}
    for i, case in enumerate(cases):
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
            root = np.eye(3)
        poses = nodes(graph, id_, frame, root)
        image = Image.fromarray(np.round(compose(poses, textures, cell, background) * 255).astype(np.uint8), 'RGBA')
        x, y = i % columns * cell, i // columns * cell
        sheet.paste(image, (x, y))
        case.update(x=x, y=y, root=root[:2].reshape(-1).tolist(), empty=not points,
                    rgbaSha256=digest(image.tobytes()))
    return sheet, dict(category=category, width=width, height=height, cell=cell, background='#304135',
                       nativePlaybackVerified=False, rgbaSha256=digest(sheet.tobytes()), cases=cases)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    native = json.loads((ROOT / 'reference/wizard-tower/native.json').read_text())
    folder = ROOT / 'tests/fixtures/native-wizard-tower-mesh'
    for category in ['body', 'defender', 'effectArt']:
        image, manifest = build(native, category)
        content = json.dumps(manifest, indent=2) + '\n'
        metadata, pixels = folder / f'{category}.json', folder / f'{category}.png'
        if args.check:
            require(metadata.read_text() == content, 'Source witness metadata differs')
            with Image.open(pixels) as old:
                require(old.mode == 'RGBA' and old.size == image.size and old.tobytes() == image.tobytes(), 'Source witness pixels differ')
        else:
            folder.mkdir(parents=True, exist_ok=True)
            metadata.write_text(content)
            image.save(pixels, optimize=True)
        print(f'{"Verified" if args.check else "Wrote"} {len(manifest["cases"])} independent {category} cases, '
              f'{sum(c["empty"] for c in manifest["cases"])} empty frames', flush=True)


if __name__ == '__main__': main()
