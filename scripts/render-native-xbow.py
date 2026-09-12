#!/usr/bin/env python3
"""Render X-Bow source contact sheets; optionally compare cropped/native sampling.

This diagnostic compositor uses an opaque background for additive layers. It
does not establish native engine aiming conventions or in-game camera scale.
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from native_art.bundle import ROOT, source
from native_art.sc6 import decode_sctx, rasterize, require
from native_art.scene_graph import graph_draws


def render(graph, textures, export, direction, clock=0, native_uv=False, bounds=None):
    id_ = graph['exports'][export]
    fps = graph['clips'][str(id_)]['fps']
    draws = list(graph_draws(graph, id_, math.floor(clock * fps + 1e-9), {'turret': direction, 'ammo': direction}))
    # A shared coordinate frame keeps every level and targeting mode registered.
    bounds, density = bounds or [-110, -45, 110, 175], 2
    canvas = np.ones(((bounds[3] - bounds[1]) * density, (bounds[2] - bounds[0]) * density, 4), dtype=float)
    canvas[:, :, :3] = np.array([48, 65, 53]) / 255
    for texture, vertices, matrix, color, blend in draws:
        points = np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ matrix.T
        require((points[:, :2] >= bounds[:2]).all() and (points[:, :2] <= bounds[2:]).all(),
                f'Diagnostic viewport clips native geometry: {export}')
        if not native_uv:
            vertices[:, 2:] *= 65535
        image = rasterize([(texture, vertices, np.diag([density, density, 1]) @ matrix, color)],
                          textures, [v * density for v in bounds])
        rgba = np.array(image) / 255
        if blend == 8:
            canvas[:, :, :3] = np.minimum(1, canvas[:, :, :3] + rgba[:, :, :3] * rgba[:, :, 3:4])
        else:
            canvas[:, :, :3] = rgba[:, :, :3] * rgba[:, :, 3:4] + canvas[:, :, :3] * (1 - rgba[:, :, 3:4])
    return Image.fromarray(np.round(canvas * 255).astype(np.uint8), 'RGBA')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true', help='compare the original source sampling for every displayed pose')
    parser.add_argument('--output', type=Path, default=ROOT / 'output/playtest')
    args = parser.parse_args()
    metadata = json.loads((ROOT / 'reference/xbow/native.json').read_text())
    runtime = json.loads((ROOT / 'reference/xbow/runtime.json').read_text())
    textures = {int(i): np.array(Image.open(ROOT / 'public' / t['path'])) / 255 for i, t in runtime['textures'].items()}
    originals = {int(i): np.array(decode_sctx(source(f'sc/buildings_{i}.sctx', metadata['sources']))) / 255
                 for i in runtime['textures']} if args.verify else None
    font_path = Path('/System/Library/Fonts/Supplemental/Arial.ttf')
    font = ImageFont.truetype(str(font_path), 23) if font_path.exists() else ImageFont.load_default()
    stats = []
    args.output.mkdir(parents=True, exist_ok=True)
    for mode in ('ground', 'air'):
        sheet = Image.new('RGBA', (440 * 4, 480 * 4), (29, 39, 33, 255))
        pen = ImageDraw.Draw(sheet)
        for level in range(1, 14):
            export = f'rapidfire_turret_lvl{level}' + ('_air' if mode == 'air' else '')
            pose = render(runtime, textures, export, 230, .7)
            x, y = (level - 1) % 4 * 440, (level - 1) // 4 * 480
            sheet.paste(pose, (x, y + 40))
            pen.text((x + 18, y + 10), f'Level {level} / {mode} / frame 230', font=font, fill=(240, 234, 210))
            if originals is not None:
                expected = render(metadata['graph'], originals, export, 230, .7, native_uv=True)
                error = np.abs(np.array(pose).astype(int) - np.array(expected).astype(int))
                require(not error.any(), f'Cropped/native sampling differs: {export}')
                stats.append(dict(export=export, direction=230, time=.7, maxChannelError=int(error.max())))
        sheet.save(args.output / f'xbow-{mode}-levels.png')
    sheet = Image.new('RGBA', (440 * 4, 480 * 4), (29, 39, 33, 255))
    pen = ImageDraw.Draw(sheet)
    for index in range(16):
        air = index >= 8
        frame = (index % 8) * 45
        export = 'rapidfire_turret_lvl3' + ('_air' if air else '')
        pose = render(runtime, textures, export, frame)
        x, y = index % 4 * 440, index // 4 * 480
        sheet.paste(pose, (x, y + 40))
        pen.text((x + 18, y + 10), f'Level 3 / {"air" if air else "ground"} / frame {frame}', font=font, fill=(240, 234, 210))
        if originals is not None:
            expected = render(metadata['graph'], originals, export, frame, native_uv=True)
            error = np.abs(np.array(pose).astype(int) - np.array(expected).astype(int))
            require(not error.any(), f'Cropped/native aiming sample differs: {export}:{frame}')
            stats.append(dict(export=export, direction=frame, time=0, maxChannelError=int(error.max())))
    sheet.save(args.output / 'xbow-direction-study.png')
    sheet = Image.new('RGBA', (1400, 1120), (29, 39, 33, 255))
    pen = ImageDraw.Draw(sheet)
    for level in range(1, 8):
        export = 'rapidfire_arrow_ammo' + (f'_lvl{level}' if level > 1 else '')
        for row, frame in enumerate([0, 7, 14, 21]):
            time, bounds = frame / 24, [-50, -85, 50, 35]
            pose = render(runtime, textures, export, 0, time, bounds=bounds)
            x, y = (level - 1) * 200, row * 280
            sheet.paste(pose, (x, y + 40))
            pen.text((x + 10, y + 10), f'Bolt {level} / f{frame}', font=font, fill=(240, 234, 210))
            if originals is not None:
                expected = render(metadata['graph'], originals, export, 0, time, native_uv=True, bounds=bounds)
                error = np.abs(np.array(pose).astype(int) - np.array(expected).astype(int))
                require(not error.any(), f'Cropped/native projectile differs: {export}:{frame}')
                stats.append(dict(export=export, direction=0, time=time, maxChannelError=int(error.max())))
    sheet.save(args.output / 'xbow-projectile-study.png')
    sheet = Image.new('RGBA', (1760, 480), (29, 39, 33, 255))
    pen = ImageDraw.Draw(sheet)
    for column, export in enumerate(['rapidfire_base', 'npc_rapidfire_base', 'war_rapidfire_base', 'bolt_projectile_shadow']):
        pose = render(runtime, textures, export, 0)
        sheet.paste(pose, (column * 440, 40))
        pen.text((column * 440 + 10, 10), export, font=font, fill=(240, 234, 210))
        if originals is not None:
            expected = render(metadata['graph'], originals, export, 0, native_uv=True)
            error = np.abs(np.array(pose).astype(int) - np.array(expected).astype(int))
            require(not error.any(), f'Cropped/native foundation differs: {export}')
            stats.append(dict(export=export, direction=0, time=0, maxChannelError=int(error.max())))
    sheet.save(args.output / 'xbow-foundation-study.png')
    if args.verify:
        (args.output / 'xbow-source-sampling-verification.json').write_text(json.dumps(dict(poses=stats), indent=2) + '\n')
    print(f'Rendered five X-Bow contact sheets; {len(stats)} original/cropped comparisons exact')


if __name__ == '__main__':
    main()
