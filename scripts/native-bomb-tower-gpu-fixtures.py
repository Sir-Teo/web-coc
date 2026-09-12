#!/usr/bin/env python3
"""Independent original-texture witnesses for the Bomb Tower asset foundation."""
import argparse
import copy
import json
import runpy

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import decode_sctx, require

# The independent CPU compositor already used for the Tesla source witnesses.
# It does not import the TypeScript player or use its packed texture pixels.
reference = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))
nodes, compose = reference['nodes'], reference['compose']


def leaves(poses):
    for pose in poses:
        if 'group' in pose: yield from leaves(pose['group'])
        else: yield pose


def build():
    native = json.loads((ROOT / 'reference/bombtower/native.json').read_text())
    graphs = {key: copy.deepcopy(native[key]['graph']) for key in ['body', 'defender']}
    for clip in graphs['defender']['clips'].values():
        clip['frames'] = [[p for p in frame if clip['names'][p[0]] != 'ability_on'] for frame in clip['frames']]
    textures = {
        key: {int(t): np.array(decode_sctx(source(f'sc/{prefix}_{t}.sctx', native['sources']))) / 255
              for t in native[key]['textures']}
        for key, prefix in [('body', 'buildings'), ('defender', 'chr_b_skeleton')]
    }
    cases = [dict(graph='body', export=name, time=5 / 30 if name.startswith('bomb_tower_bomb') else 0, controls={})
             for name in sorted(graphs['body']['exports'])]
    cases += [dict(graph='defender', export=name, time=(11 if '_attack' in name else 47) / 24,
                   controls={'ability_on': False}) for name in sorted(graphs['defender']['exports'])]
    cases += [dict(graph='defender', export='b_skeleton2_attack1_2', time=frame / 24,
                   controls={'ability_on': False}) for frame in [0, 20]]
    cell, columns = 400, 6
    width, height = columns * cell, ((len(cases) + columns - 1) // columns) * cell
    sheet = Image.new('RGBA', (width, height), (48, 65, 53, 255))
    for i, case in enumerate(cases):
        graph = graphs[case['graph']]
        id_ = graph['exports'][case['export']]
        frame = int(case['time'] * graph['clips'][str(id_)]['fps'] + 1e-9)
        unplaced = nodes(graph, id_, frame, np.eye(3))
        points = []
        for pose in leaves(unplaced):
            matrix = np.array(pose['matrix']).reshape(2, 3)
            vertices = np.array(pose['vertices']).reshape(-1, 4)
            points.extend(np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ matrix.T)
        require(points, 'Empty source witness')
        bounds = np.array(points)
        low, high = bounds.min(axis=0), bounds.max(axis=0)
        scale = min(2, *((cell - 32) / np.maximum(1, high - low)))
        center = (cell - (high + low) * scale) / 2
        root = np.array([[scale, 0, center[0]], [0, scale, center[1]], [0, 0, 1]])
        poses = nodes(graph, id_, frame, root)
        pixels = np.round(compose(poses, textures[case['graph']], cell, [48 / 255, 65 / 255, 53 / 255]) * 255).astype(np.uint8)
        image = Image.fromarray(pixels, 'RGBA')
        x, y = i % columns * cell, i // columns * cell
        sheet.paste(image, (x, y))
        case.update(x=x, y=y, root=root[:2].reshape(-1).tolist(), rgbaSha256=digest(image.tobytes()))
    return sheet, dict(width=width, height=height, cell=cell, background='#304135',
                       nativePlaybackVerified=False, rgbaSha256=digest(sheet.tobytes()), cases=cases)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    image, manifest = build()
    folder = ROOT / 'tests/fixtures/native-bomb-tower-mesh'
    content = json.dumps(manifest, indent=2) + '\n'
    if args.check:
        require((folder / 'manifest.json').read_text() == content, 'Source witness metadata differs')
        with Image.open(folder / 'reference.png') as old:
            require(old.mode == 'RGBA' and old.size == image.size and old.tobytes() == image.tobytes(), 'Source witness pixels differ')
    else:
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'manifest.json').write_text(content)
        image.save(folder / 'reference.png', optimize=True)
    print(f'{"Verified" if args.check else "Wrote"} {len(manifest["cases"])} independent Bomb Tower GPU source cases')


if __name__ == '__main__': main()
