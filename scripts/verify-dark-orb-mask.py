#!/usr/bin/env python3
"""Compare all 30 Dark Orb frames with independent source content plus an opaque mask.

The reference renders the original, unclipped strips and then applies the mask.
No reference pixels use the clipping compiler. --previews saves examples under
output/playtest/; the default command only verifies the source reconstruction.
"""
import argparse
import importlib.util
import json

import numpy as np
from PIL import Image

from native_art.bundle import ROOT
from native_art.effect_library import Library
from native_art.multiply_scene import compose, nodes
from native_art.opaque_mask import OpaqueMaskScene
from native_art.sc6 import rasterize
from native_art.scene_graph import capture_graph


def points(poses):
    result = []
    for pose in poses:
        if 'group' in pose:
            result.extend(points(pose['group']))
        else:
            vertices = np.array(pose['vertices']).reshape(-1, 4)
            matrix = np.vstack([np.array(pose['matrix']).reshape(2, 3), [0, 0, 1]])
            result.extend((np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ matrix.T)[:, :2])
    return result


def preview(path, rgba):
    straight = rgba.copy()
    straight[:, :, :3] = np.divide(straight[:, :, :3], straight[:, :, 3:4],
                                  out=np.zeros_like(straight[:, :, :3]), where=straight[:, :, 3:4] > 0)
    Image.fromarray(np.round(np.clip(straight, 0, 1)*255).astype(np.uint8), 'RGBA').save(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--previews', action='store_true')
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('mask_source_audit', ROOT/'scripts/native-full-catalog.py')
    art = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(art)
    lib = Library(art)
    source = lib.scene('sc/characters.sc')
    name = 'vfx_chr_DarkOrb_Crystal'
    root = source.exports[name]
    original = source.clip(root)

    class Unmasked:
        def __getattr__(self, key):
            return getattr(source, key)

        def clip(self, id_):
            if id_ != root:
                return source.clip(id_)
            # Keep the original content, removing only the mask control markers
            # and its separate geometry. Apply that geometry after composition.
            return dict(original, children=original['children'][3:-1], names=original['names'][3:-1],
                        blending=original['blending'][3:-1],
                        frames=[[(slot-3, matrix, color) for slot, matrix, color in frame[3:-1]]
                                for frame in original['frames']])

    raw = capture_graph(Unmasked(), {name: root}, allowed_blends=(0, 3, 4, 8))
    masked = capture_graph(OpaqueMaskScene(source, name, lambda texture: lib.texture('sc/characters.sc', texture)),
                           {name: root}, allowed_blends=(0, 3, 4, 8))
    mask_draws = list(source.draw_list(original['children'][1], 0))
    indices = {texture for shape in raw['shapes'].values() for texture, _ in shape}
    indices.update(draw[0] for draw in mask_draws)
    textures = {texture: np.array(lib.texture('sc/characters.sc', texture), dtype=float)/255 for texture in indices}
    cell = 192
    results = []
    folder = ROOT/'output/playtest'
    if args.previews:
        folder.mkdir(parents=True, exist_ok=True)
    for frame in range(len(original['frames'])):
        xy = np.array(points(nodes(raw, root, frame, np.eye(3))))
        low, high = xy.min(axis=0), xy.max(axis=0)
        scale = (cell-8)/max(high-low)
        matrix = np.array([[scale, 0, 4-low[0]*scale], [0, scale, 4-low[1]*scale], [0, 0, 1]])
        uncut = compose(nodes(raw, root, frame, matrix), textures, cell, screen_space_edges=True)
        mask_instance = list(source.instances(root, frame))[1]
        mask = np.array(rasterize(source.draw_list(mask_instance['id'], mask_instance['frame'],
                                                  matrix @ mask_instance['matrix']), textures,
                                  [0, 0, cell, cell], screen_space_edges=True))/255
        expected = uncut*mask[:, :, 3:4]
        actual = compose(nodes(masked, root, frame, matrix), textures, cell, screen_space_edges=True)
        delta = np.abs(actual-expected)*255
        results.append(dict(frame=frame, maxError=float(delta.max()), meanError=float(delta.mean())))
        if args.previews and frame in (0, 14, 29):
            preview(folder/f'dark-orb-mask-source-{frame}.png', expected)
            preview(folder/f'dark-orb-mask-compiled-{frame}.png', actual)
    if any(result['maxError'] != 0 for result in results):
        print(json.dumps(results, indent=2))
        raise SystemExit('Masked source pixels differ')
    print(f'Verified all {len(results)} original Dark Orb frames: exact RGBA equality with independently masked source pixels.')


if __name__ == '__main__':
    main()
