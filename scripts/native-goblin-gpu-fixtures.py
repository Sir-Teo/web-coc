#!/usr/bin/env python3
"""Independent source pixels and poses for Goblin flags, buildings and foundations."""
import argparse
import json
import numpy as np
from PIL import Image
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import decode_sctx, rasterize, require
from native_art.scene_graph import graph_draws


def build():
    native = json.loads((ROOT / 'reference/goblin-buildings/native.json').read_text())
    runtime = json.loads((ROOT / 'reference/goblin-buildings/runtime.json').read_text())
    textures = {t: np.array(decode_sctx(source(f'sc/buildings_{t}.sctx', native['sources']))) / 255 for t in [8, 37]}
    cell, width, height = 240, 960, 720
    sheet = Image.new('RGBA', (width, height), (48, 65, 53, 255))
    root = np.array([[1, 0, 120], [0, 1, 30], [0, 0, 1]], dtype=float)
    cases = [dict(export='goblin_townhall_lvl1', time=frame / 24) for frame in range(0, 24, 3)]
    cases += [dict(export=name, time=0) for name in ['goblin_hut_lvl1', 'goblin_townhall_base', 'goblin_hut_base']]
    cases += [dict(export='goblin_townhall_lvl1', time=1200.375)]
    for index, case in enumerate(cases):
        name, time = case['export'], case['time']
        id_, frame = native['graph']['exports'][name], int(time * 24 + 1e-9)
        canvas = np.ones((cell, cell, 4), dtype=float)
        canvas[:, :, :3] = [48 / 255, 65 / 255, 53 / 255]
        for t, v, m, c, b in graph_draws(native['graph'], id_, frame, {}, matrix=root):
            xy = np.column_stack([v[:, :2], np.ones(len(v))]) @ m.T
            require((xy[:, :2] >= 0).all() and (xy[:, :2] < cell).all() and b == 0, 'Fixture clips source polygons')
            rgba = np.array(rasterize([(t, v, m, c)], textures, [0, 0, cell, cell])) / 255
            canvas[:, :, :3] = rgba[:, :, :3] * rgba[:, :, 3:4] + canvas[:, :, :3] * (1 - rgba[:, :, 3:4])
        image = Image.fromarray(np.round(canvas * 255).astype(np.uint8), 'RGBA')
        x, y = index % 4 * cell, index // 4 * cell
        sheet.paste(image, (x, y))
        poses = [dict(texture=t, vertices=v.reshape(-1).tolist(), matrix=m[:2].reshape(-1).tolist(),
                      multiply=c[0].tolist(), add=c[1].tolist(), blend=b)
                 for t, v, m, c, b in graph_draws(runtime, id_, frame, {}, matrix=root)]
        case.update(x=x, y=y, root=root[:2].reshape(-1).tolist(), rgbaSha256=digest(image.tobytes()), poses=poses)
    return sheet, dict(width=width, height=height, cell=cell, background='#304135', rgbaSha256=digest(sheet.tobytes()), cases=cases)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    image, manifest = build()
    folder = ROOT / 'tests/fixtures/native-goblin-mesh'
    text = json.dumps(manifest, indent=2) + '\n'
    if args.check:
        require((folder / 'manifest.json').read_text() == text, 'Goblin GPU pose witnesses differ')
        with Image.open(folder / 'reference.png') as existing:
            require(existing.mode == 'RGBA' and existing.size == image.size and existing.tobytes() == image.tobytes(), 'Goblin GPU pixels differ')
    else:
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'manifest.json').write_text(text)
        image.save(folder / 'reference.png', optimize=True)
    print(f'{"Verified" if args.check else "Wrote"} {len(manifest["cases"])} independent Goblin GPU source cases')


if __name__ == '__main__': main()
