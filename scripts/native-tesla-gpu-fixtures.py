#!/usr/bin/env python3
"""Independent original-texture sampler for native Tesla transparency groups."""
import argparse
import json

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import decode_sctx, rasterize, require


def nodes(graph, id_, frame, matrix, multiply=None, add=None, path=None):
    """Retain group boundaries; do not derive source witnesses from the JS player."""
    key = str(id_)
    path = key if path is None else path
    multiply = np.ones(4) if multiply is None else multiply
    add = np.zeros(4) if add is None else add
    if key in graph['shapes']:
        return [dict(key=f'{path}:{i}', texture=t, vertices=v, matrix=matrix[:2].reshape(-1).tolist(),
                     multiply=multiply.tolist(), add=add.tolist(), blend=0)
                for i, (t, v) in enumerate(graph['shapes'][key])]
    clip = graph['clips'][key]
    result = []
    for slot, transform, tint in clip['frames'][clip['timeline'][frame % len(clip['timeline'])]]:
        child = str(clip['children'][slot])
        placed = frame
        while placed > 0 and any(p[0] == slot for p in clip['frames'][clip['timeline'][(placed - 1) % len(clip['timeline'])]]):
            placed -= 1
        phase = frame - placed
        if child in graph['clips']: phase = phase * graph['clips'][child]['fps'] // clip['fps']
        m = matrix @ np.vstack([np.array(graph['matrices'][transform]).reshape(2, 3), [0, 0, 1]])
        color = np.array(graph['colors'][tint])
        mul, plus = multiply * color[:4], multiply * color[4:] + add
        mode = clip['blending'][slot]
        if mode == 8 and child in graph['clips'] and graph['clips'][child]['children']:
            require((mul[:3] == 1).all() and (plus == 0).all(), 'Unsupported group RGB transform')
            result.append(dict(key=f'{path}/{slot}', group=nodes(graph, int(child), phase, m, path=f'{path}/{slot}'),
                               multiply=mul.tolist(), add=plus.tolist(), blend=8))
        else:
            nested = nodes(graph, int(child), phase, m, mul, plus, f'{path}/{slot}')
            for node in nested:
                if mode: node['blend'] = mode
            result.extend(nested)
    return result


def compose(poses, textures, cell, background=None):
    canvas = np.zeros((cell, cell, 4), dtype=float)
    if background is not None:
        canvas[:, :, :3], canvas[:, :, 3] = background, 1
    for pose in poses:
        if 'group' in pose:
            rgba = compose(pose['group'], textures, cell) * pose['multiply'][3]
        else:
            matrix = np.vstack([np.array(pose['matrix']).reshape(2, 3), [0, 0, 1]])
            vertices = np.array(pose['vertices']).reshape(-1, 4)
            xy = np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ matrix.T
            require((xy[:, :2] >= 0).all() and (xy[:, :2] < cell).all(), 'Tesla source fixture clips a polygon')
            rgba = np.array(rasterize([(pose['texture'], vertices, matrix,
                                      (np.array(pose['multiply']), np.array(pose['add'])))],
                                     textures, [0, 0, cell, cell])) / 255
            rgba[:, :, :3] *= rgba[:, :, 3:4]
        alpha = rgba[:, :, 3:4]
        canvas[:, :, :3] = np.minimum(1, canvas[:, :, :3] + rgba[:, :, :3]) if pose['blend'] == 8 else rgba[:, :, :3] + canvas[:, :, :3] * (1 - alpha)
        canvas[:, :, 3:4] = alpha + canvas[:, :, 3:4] * (1 - alpha)
    # Match the RGBA8 intermediate framebuffer boundary, not its individual leaves.
    return np.round(np.clip(canvas, 0, 1) * 255) / 255


def build():
    native = json.loads((ROOT / 'reference/tesla/native.json').read_text())
    runtime = json.loads((ROOT / 'reference/tesla/runtime.json').read_text())
    textures = {int(i): np.array(decode_sctx(source(f'sc/buildings_{i}.sctx', native['sources']))) / 255
                for i in runtime['textures']}
    cases = [
        dict(export='teslatower_lvl1', time=4 / 24),
        dict(export='teslatower_lvl1', time=13 / 24),
        dict(export='teslatower_lvl7', time=17 / 24),
        dict(export='teslatower_lvl8_setup', time=8 / 24),
        dict(export='teslatower_lvl9_setup', time=9 / 24),
        dict(export='teslatower_lvl10_setup', time=7 / 24),
        dict(export='teslatower_lvl14_setup', time=7 / 24),
        dict(export='teslatower_lvl15_setup', time=9 / 24),
        dict(export='teslatower_lvl17_setup', time=8 / 24),
        dict(export='teslatower_lvl7_attack', time=8 / 30),
        dict(export='tesla_appear_fx', time=9 / 24),
        dict(export='teslatower_lvl17_setup', time=10 / 24),
    ]
    cell, width, height = 400, 1600, 1200
    background = [48 / 255, 65 / 255, 53 / 255]
    sheet = Image.new('RGBA', (width, height))
    for i, case in enumerate(cases):
        id_ = native['graph']['exports'][case['export']]
        frame = int(case['time'] * native['graph']['clips'][str(id_)]['fps'] + 1e-9)
        root = np.array([[2, 0, 200], [0, 2, 180], [0, 0, 1]], dtype=float)
        if i == 11: root[:2, :2] = [[1.8, .3], [-.2, 1.9]]
        original = nodes(native['graph'], id_, frame, root)
        image = Image.fromarray(np.round(compose(original, textures, cell, background) * 255).astype(np.uint8), 'RGBA')
        x, y = i % 4 * cell, i // 4 * cell
        sheet.paste(image, (x, y))
        case.update(x=x, y=y, root=root[:2].reshape(-1).tolist(), rgbaSha256=digest(image.tobytes()),
                    poses=nodes(runtime, id_, frame, root))
    return sheet, dict(width=width, height=height, cell=cell, background='#304135',
                       composition='Isolated premultiplied RGBA8 groups; additive RGB and source-over alpha',
                       nativeEngineCompositingVerified=False, rgbaSha256=digest(sheet.tobytes()), cases=cases)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    image, manifest = build()
    folder = ROOT / 'tests/fixtures/native-tesla-mesh'
    content = json.dumps(manifest, indent=2) + '\n'
    if args.check:
        require((folder / 'manifest.json').read_text() == content, 'Tesla source poses differ')
        with Image.open(folder / 'reference.png') as old:
            require(old.mode == 'RGBA' and old.size == image.size and old.tobytes() == image.tobytes(), 'Tesla source pixels differ')
    else:
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'manifest.json').write_text(content)
        image.save(folder / 'reference.png', optimize=True)
    print(f'{"Verified" if args.check else "Wrote"} 12 independent Tesla GPU source cases')


if __name__ == '__main__': main()
