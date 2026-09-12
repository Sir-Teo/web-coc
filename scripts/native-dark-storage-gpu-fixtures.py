#!/usr/bin/env python3
"""Independent source-texture witnesses for each storage level at three fill states."""
import argparse
import json
import numpy as np
from PIL import Image
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import decode_sctx, rasterize, require
from native_art.scene_graph import graph_draws


def build():
    native = json.loads((ROOT / 'reference/dark-storage/native.json').read_text())
    runtime = json.loads((ROOT / 'reference/dark-storage/runtime.json').read_text())
    textures = {42: np.array(decode_sctx(source('sc/buildings_42.sctx', native['sources']))) / 255}
    cell, width, height = 200, 1400, 1200
    sheet = Image.new('RGBA', (width, height), (48, 65, 53, 255))
    root = np.array([[1.1, 0, 100], [0, 1.1, 50], [0, 0, 1]], dtype=float)
    cases = []
    for level in range(1, 14):
        name = f'darkelixir_storage_level{level}'
        for frame in [0, 79, 159]:
            id_ = native['graph']['exports'][name]
            controls = {'resource': frame}
            canvas = np.ones((cell, cell, 4), dtype=float)
            canvas[:, :, :3] = [48 / 255, 65 / 255, 53 / 255]
            for t, v, m, c, b in graph_draws(native['graph'], id_, 0, controls, matrix=root):
                xy = np.column_stack([v[:, :2], np.ones(len(v))]) @ m.T
                require((xy[:, :2] >= 0).all() and (xy[:, :2] < cell).all() and b == 0, 'Fixture bounds/blend differs')
                rgba = np.array(rasterize([(t, v, m, c)], textures, [0, 0, cell, cell])) / 255
                canvas[:, :, :3] = rgba[:, :, :3] * rgba[:, :, 3:4] + canvas[:, :, :3] * (1 - rgba[:, :, 3:4])
            image = Image.fromarray(np.round(canvas * 255).astype(np.uint8), 'RGBA')
            x, y = len(cases) % 7 * cell, len(cases) // 7 * cell
            sheet.paste(image, (x, y))
            poses = [dict(texture=t, vertices=v.reshape(-1).tolist(), matrix=m[:2].reshape(-1).tolist(),
                          multiply=c[0].tolist(), add=c[1].tolist(), blend=b)
                     for t, v, m, c, b in graph_draws(runtime, id_, 0, controls, matrix=root)]
            cases.append(dict(level=level, export=name, frame=frame, x=x, y=y, root=root[:2].reshape(-1).tolist(),
                              rgbaSha256=digest(image.tobytes()), poses=poses))
    return sheet, dict(width=width, height=height, cell=cell, background='#304135',
                       rgbaSha256=digest(sheet.tobytes()), cases=cases)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    image, manifest = build()
    folder = ROOT / 'tests/fixtures/native-dark-storage-mesh'
    text = json.dumps(manifest, indent=2) + '\n'
    if args.check:
        require((folder / 'manifest.json').read_text() == text, 'Storage GPU poses differ')
        with Image.open(folder / 'reference.png') as existing:
            require(existing.mode == 'RGBA' and existing.size == image.size and existing.tobytes() == image.tobytes(),
                    'Storage source reference differs')
    else:
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'manifest.json').write_text(text)
        image.save(folder / 'reference.png', optimize=True)
    print(f'{"Verified" if args.check else "Wrote"} {len(manifest["cases"])} independent storage GPU source cases')


if __name__ == '__main__':
    main()
