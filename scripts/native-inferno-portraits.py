#!/usr/bin/env python3
"""Original transparent Inferno portraits and source-coordinate registration."""
import argparse
import json
import runpy
import numpy as np
from PIL import Image
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import decode_sctx, require
from native_art.multiply_scene import nodes, compose


def build():
    meta = json.loads((ROOT / 'reference/inferno/art-source.json').read_text())
    graph = meta['graph']
    textures = {int(t): np.array(decode_sctx(source(f'sc/buildings_{t}.sctx', meta['sources']))) / 255 for t in meta['textures']}
    points = runpy.run_path(str(ROOT / 'scripts/native-inferno-art-fixtures.py'))['points']
    images, rows = {}, []
    for level in range(1, 13):
        for mode in ['single', 'multi']:
            name = f'dark_tower_lvl{level}' + ('_multi' if mode == 'multi' else '')
            def sample(root):
                return nodes(graph, graph['exports']['dark_tower_base'], 0, root) + nodes(graph, graph['exports'][name], 0, root)
            xy = np.array(points(sample(np.eye(3))))
            low, high = np.floor(xy.min(0)).astype(int) - 2, np.ceil(xy.max(0)).astype(int) + 2
            width, height = (high - low).tolist()
            root = np.array([[1, 0, -low[0]], [0, 1, -low[1]], [0, 0, 1]])
            premul = compose(sample(root), textures, max(width, height))[:height, :width]
            alpha = premul[:, :, 3:4]
            straight = np.divide(premul[:, :, :3], alpha, out=np.zeros_like(premul[:, :, :3]), where=alpha > 0)
            rgba = np.round(np.clip(np.concatenate([straight, alpha], axis=2), 0, 1) * 255).astype(np.uint8)
            path = f'assets/inferno-native/portrait/{level}-{mode}.png'
            images[path] = Image.fromarray(rgba, 'RGBA')
            rows.append(dict(level=level, mode=mode, path=path, width=width, height=height,
                             bounds=[int(low[0]), int(low[1]), int(high[0]), int(high[1])],
                             originX=float(-low[0]/width), originY=float(-low[1]/height), rgbaSha256=digest(rgba.tobytes())))
    return images, dict(sourceSha256=digest((ROOT/'reference/inferno/art-source.json').read_bytes()),
                        nativePlaybackVerified=False, portraits=rows)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    images, metadata = build()
    for path, image in images.items():
        target = ROOT / 'public' / path
        if args.check:
            with Image.open(target) as old:
                require(old.mode == image.mode and old.size == image.size and old.tobytes() == image.tobytes(), 'Portrait pixels differ')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target, optimize=True)
    path = ROOT / 'reference/inferno/portraits.json'
    data = json.dumps(metadata, indent=2) + '\n'
    if args.check:
        require(path.read_text() == data, 'Portrait registration differs')
    else:
        path.write_text(data)
    print('Verified original Inferno portraits' if args.check else 'Wrote original Inferno portraits')
