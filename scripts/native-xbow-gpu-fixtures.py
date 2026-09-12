#!/usr/bin/env python3
"""Independent source sampler and pose witnesses for the native GPU renderer."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import decode_sctx, rasterize, require
from native_art.scene_graph import graph_draws


def build():
    native = json.loads((ROOT / 'reference/xbow/native.json').read_text())
    runtime = json.loads((ROOT / 'reference/xbow/runtime.json').read_text())
    textures = {int(i): np.array(decode_sctx(source(f'sc/buildings_{i}.sctx', native['sources']))) / 255
                for i in runtime['textures']}
    cases = [
        dict(export='rapidfire_turret_lvl1', direction=0, time=0),
        dict(export='rapidfire_turret_lvl3_air', direction=230, time=0),
        dict(export='rapidfire_turret_lvl4', direction=80, time=1.2),
        dict(export='rapidfire_turret_lvl5_air', direction=310, time=1.8),
        dict(export='rapidfire_turret_lvl13', direction=120, time=0),
        dict(export='rapidfire_turret_lvl4_upgrade_air', direction=180, time=.7),
        dict(export='rapidfire_arrow_ammo_lvl3', direction=0, time=0),
        dict(export='rapidfire_arrow_ammo_lvl4', direction=0, time=7 / 24),
        dict(export='rapidfire_arrow_ammo_lvl5', direction=0, time=14 / 24),
        dict(export='rapidfire_arrow_ammo_lvl6', direction=0, time=21 / 24),
        dict(export='rapidfire_arrow_ammo_lvl7', direction=0, time=21 / 24),
        dict(export='rapidfire_turret_lvl3', direction=359, time=1024),
    ]
    width, height, cell = 1600, 1200, 400
    sheet = Image.new('RGBA', (width, height), (48, 65, 53, 255))
    for index, case in enumerate(cases):
        id_ = native['graph']['exports'][case['export']]
        frame = int(case['time'] * native['graph']['clips'][str(id_)]['fps'] + 1e-9)
        controls = {'turret': case['direction'], 'ammo': case['direction']}
        projectile = 'arrow_ammo' in case['export']
        # Source units are magnified to two output pixels; projectile trails need
        # extra vertical room. The last case exercises an additional affine shear.
        root = np.array([[2, 0, 200], [0, 2, 235 if projectile else 80], [0, 0, 1]], dtype=float)
        if index == 11:
            root[:2, :2] = [[1.9, .15], [-.1, 1.7]]
        canvas = np.ones((cell, cell, 4), dtype=float)
        canvas[:, :, :3] = [48 / 255, 65 / 255, 53 / 255]
        draws = list(graph_draws(native['graph'], id_, frame, controls, matrix=root))
        for texture, vertices, matrix, color, blend in draws:
            xy = np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ matrix.T
            require((xy[:, :2] >= 0).all() and (xy[:, :2] < cell).all(), 'Source fixture clips a polygon')
            rgba = np.array(rasterize([(texture, vertices, matrix, color)], textures, [0, 0, cell, cell])) / 255
            rgb, alpha = rgba[:, :, :3], rgba[:, :, 3:4]
            canvas[:, :, :3] = (np.minimum(1, canvas[:, :, :3] + rgb * alpha) if blend == 8 else
                                 rgb * alpha + canvas[:, :, :3] * (1 - alpha))
        x, y = index % 4 * cell, index // 4 * cell
        image = Image.fromarray(np.round(canvas * 255).astype(np.uint8), 'RGBA')
        sheet.paste(image, (x, y))
        case.update(x=x, y=y, root=root[:2].reshape(-1).tolist(), rgbaSha256=digest(image.tobytes()))
        case['poses'] = [dict(texture=t, vertices=v.reshape(-1).tolist(), matrix=m[:2].reshape(-1).tolist(),
                             multiply=c[0].tolist(), add=c[1].tolist(), blend=b)
                         for t, v, m, c, b in graph_draws(runtime, id_, frame, controls, matrix=root)]
    return sheet, dict(width=width, height=height, cell=cell, background='#304135',
                       rgbaSha256=digest(sheet.tobytes()), cases=cases)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    image, manifest = build()
    folder = ROOT / 'tests/fixtures/native-xbow-mesh'
    text = json.dumps(manifest, indent=2) + '\n'
    if args.check:
        require((folder / 'manifest.json').read_text() == text, 'Native GPU pose witnesses differ')
        with Image.open(folder / 'reference.png') as existing:
            require(existing.mode == 'RGBA' and existing.size == image.size and existing.tobytes() == image.tobytes(),
                    'Native GPU source reference differs')
    else:
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'manifest.json').write_text(text)
        image.save(folder / 'reference.png', optimize=True)
    print(f'{"Verified" if args.check else "Wrote"} 12 independent native GPU source cases')


if __name__ == '__main__':
    main()
