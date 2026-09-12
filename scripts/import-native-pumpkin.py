#!/usr/bin/env python3
"""Reconstruct the pinned native Pumpkin Bomb setup and trigger atlas.

Install scripts/native_art/requirements.txt in an isolated Python environment.
--check verifies RGBA pixels and metadata without changing committed files.
Raw source downloads stay in output/native-campaign-source.
"""
import argparse
import csv
import io
import json
import lzma
import math

import numpy as np
from PIL import Image
from native_art.sc6 import SC6, decode_sctx, rasterize, require

from native_art.bundle import ROOT, BUNDLE, BASE, SOURCES, digest, source


def build():
    raw = source('logic/traps.csv')
    require(raw.startswith(b'Sig:'), 'Unexpected trap table container')
    raw = raw[68:]
    rows = list(csv.DictReader(io.StringIO(lzma.decompress(raw[:9] + b'\0' * 4 + raw[9:]).decode('utf-8-sig'))))[1:]
    trap = next(row for row in rows if row['Name'] == 'Halloweenbomb')
    trap = {k: v for k, v in trap.items() if v}
    require(trap['GlobalID'] == '12000003' and trap['SWF'] == 'sc/buildings.sc', 'Unexpected trap identity')
    sc = SC6(source(trap['SWF']))
    exports = [trap['ExportName'], trap['ExportNameTriggered']]
    clips, draws = {}, []
    for name in exports:
        clip = sc.clip(sc.exports[name])
        clips[name] = dict(id=clip['id'], fps=clip['fps'], firstFrame=len(draws), count=len(clip['frames']),
                           labels=[dict(frame=i, name=label) for i, label in enumerate(clip['labels']) if label])
        for frame in range(len(clip['frames'])):
            draws.append(list(sc.draw_list(clip['id'], frame)))
    textures = {}
    for index in sorted({d[0] for frame in draws for d in frame}):
        descriptor = sc.textures[index]
        image = decode_sctx(source('sc/' + descriptor['external']))
        require(image.size == (descriptor['width'], descriptor['height']), 'SC6/SCTX dimensions differ')
        textures[index] = np.array(image, dtype=np.float64) / 255
    points = np.concatenate([np.column_stack([v[:, :2], np.ones(len(v))]) @ m.T
                             for frame in draws for _, v, m, _ in frame])
    bounds = [math.floor(points[:, 0].min()) - 2, math.floor(points[:, 1].min()) - 2,
              math.ceil(points[:, 0].max()) + 2, math.ceil(points[:, 1].max()) + 2]
    # The source UV region has more texels than its movie-clip coordinate span.
    # Rasterize at 2× to retain those texels; runtime world size remains unchanged.
    density = 2
    width, height = (bounds[2] - bounds[0]) * density, (bounds[3] - bounds[1]) * density
    columns = 8
    atlas = Image.new('RGBA', (width * columns, height * math.ceil(len(draws) / columns)))
    frames = []
    for i, draw in enumerate(draws):
        scaled = [(i, v, np.diag([density, density, 1]) @ m, c) for i, v, m, c in draw]
        image = rasterize(scaled, textures, [v * density for v in bounds])
        atlas.paste(image, (i % columns * width, i // columns * height))
        frames.append(dict(index=i, rgbaSha256=digest(image.tobytes()), alphaBounds=image.getbbox()))
    metadata = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=SOURCES,
                    trap=trap, clips=clips, textureIndices=sorted(textures),
                    atlas=dict(path='assets/buildings/pumpkin-bomb-native.png', width=width,
                               pixelsPerNativeUnit=density,
                               height=height, columns=columns, frames=len(draws), bounds=bounds,
                               rgbaSha256=digest(atlas.tobytes())), frames=frames,
                    reconstruction=dict(sampling='premultiplied bilinear at pixel centers',
                                        nestedTimelines='elapsed frames since continuous placement; loop subclips',
                                        nativePlaybackVerified=False))
    return atlas, metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    atlas, metadata = build()
    image_path = ROOT / 'public' / metadata['atlas']['path']
    data_path = ROOT / 'reference/pumpkin-bomb/native.json'
    content = json.dumps(metadata, indent=2) + '\n'
    if args.check:
        require(data_path.read_text() == content, 'Pumpkin metadata differs')
        with Image.open(image_path) as existing:
            require(existing.mode == 'RGBA' and existing.size == atlas.size
                    and existing.tobytes() == atlas.tobytes(), 'Pumpkin atlas pixels differ')
    else:
        image_path.parent.mkdir(parents=True, exist_ok=True)
        data_path.parent.mkdir(parents=True, exist_ok=True)
        atlas.save(image_path, optimize=True)
        data_path.write_text(content)
    print(f'{"Verified" if args.check else "Wrote"} {len(metadata["frames"])} native frames, '
          f'{atlas.width}×{atlas.height}, RGBA SHA-256 {metadata["atlas"]["rgbaSha256"]}')


if __name__ == '__main__':
    main()
