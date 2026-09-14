#!/usr/bin/env python3
"""Reconstruct the native level 1–5 Skeleton Trap art and preserve its source rows.

Uses scripts/native_art/requirements.txt. --check compares metadata and pixels.
"""
import argparse
import csv
import io
import json
import lzma
import math
import struct

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, BUNDLE, BASE, SOURCES, digest, source

# The trap's own spawned characters. Level 5 releases the level 2 skeleton; every other
# tier releases the level 1. Blank cells inherit within a named record.
SPAWNED = {'logic/characters.csv':
          '5c3acc5b46ff9e7978f406b540264e65c93a846b69d03cd43326a9853703cb89'}
SPAWNED_NAMES = ('Trap Skeleton', 'Trap Air Skeleton')
from native_art.sc6 import SC6, decode_sctx, rasterize, require


def spawned():
    """Hitpoints and damage of each spawned skeleton level, straight from the source."""
    raw = source('logic/characters.csv', SPAWNED)[68:]
    text = lzma.decompress(raw[:9] + b'\0' * 4 + raw[9:]).decode('utf-8-sig')
    decoded = list(csv.reader(io.StringIO(text)))
    headers, name, records = decoded[0], None, {}
    for row in decoded[2:]:
        if not any(row):
            continue
        if row[0]:
            name = row[0]
            records[name] = []
        if name in SPAWNED_NAMES:
            inherited = dict(records[name][-1]) if records[name] else {}
            inherited.update({k: v for k, v in zip(headers, row) if v})
            records[name].append(inherited)
    result = {}
    for key in SPAWNED_NAMES:
        require(key in records and len(records[key]) >= 2, f'Absent spawned character: {key}')
        result['air' if 'Air' in key else 'ground'] = [
            dict(level=index + 1, hp=int(row['Hitpoints']), dps=int(row['DPS']),
                 speed=int(row['Speed']) / 100, range=int(row['AttackRange']) / 100,
                 rate=int(row['AttackSpeed']) / 1000)
            for index, row in enumerate(records[key])]
    return result


def build():
    raw = source('logic/traps.csv')[68:]
    rows = list(csv.DictReader(io.StringIO(lzma.decompress(raw[:9] + b'\0' * 4 + raw[9:]).decode('utf-8-sig'))))[1:]
    selected, active = [], False
    for row in rows:
        if row['Name']:
            active = row['Name'] == 'Skeleton Trap'
        if active:
            selected.append({k: v for k, v in row.items() if v})
    require(len(selected) == 5 and selected[0]['GlobalID'] == '12000008', 'Unexpected Skeleton Trap rows')
    sc = SC6(source('sc/buildings.sc'))
    texture = decode_sctx(source('sc/buildings_66.sctx'))
    require(texture.size == (sc.textures[66]['width'], sc.textures[66]['height']), 'Texture dimensions differ')
    textures = {66: np.array(texture, dtype=np.float64) / 255}
    metadata = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=SOURCES | SPAWNED,
                    rows=selected, supportedLevels=[1, 2, 3, 4, 5], tiers={},
                    spawned=spawned(),
                    reconstruction=dict(sampling='premultiplied bilinear at pixel centers',
                                        nestedTimelines='elapsed frames since continuous placement; loop subclips',
                                        nativePlaybackVerified=False))
    outputs = {}
    for tier in (1, 3, 5):
        row = selected[tier - 1]
        names = {state: row[key] for state, key in [('ground', 'ExportName'), ('air', 'ExportNameAir'),
                  ('spent', 'ExportNameBroken'), ('ground-trigger', 'ExportNameTriggered'), ('air-trigger', 'ExportNameTriggeredAir')]}
        clips, draws = {}, {}
        for state, name in names.items():
            clip = sc.clip(sc.exports[name])
            require(clip['fps'] == 24 and not any(clip['labels']), 'Unexpected trap animation timing')
            clips[state] = dict(export=name, id=clip['id'], fps=clip['fps'], count=len(clip['frames']))
            draws[state] = [list(sc.draw_list(clip['id'], frame)) for frame in range(len(clip['frames']))]
        points = np.concatenate([np.column_stack([v[:, :2], np.ones(len(v))]) @ m.T
                                 for frames in draws.values() for frame in frames for _, v, m, _ in frame])
        bounds = [math.floor(points[:, 0].min()) - 2, math.floor(points[:, 1].min()) - 2,
                  math.ceil(points[:, 0].max()) + 2, math.ceil(points[:, 1].max()) + 2]
        density, columns = 2, 8
        width, height = (bounds[2] - bounds[0]) * density, (bounds[3] - bounds[1]) * density
        frames, hashes, images, rendered = [], {}, [], {}
        for state, animation in draws.items():
            timeline = []
            for frame in animation:
                require(all(t in textures for t, _, _, _ in frame), 'Unexpected unpinned texture')
                # Most source frames hold the same pose. Avoid repeating raster work.
                draw_key = digest(b''.join(struct.pack('<II', t, len(v)) + v.tobytes() + m.tobytes() + c[0].tobytes() + c[1].tobytes()
                                           for t, v, m, c in frame))
                if draw_key not in rendered:
                    scaled = [(t, v, np.diag([density, density, 1]) @ m, c) for t, v, m, c in frame]
                    rendered[draw_key] = rasterize(scaled, textures, [v * density for v in bounds])
                image = rendered[draw_key]
                key = digest(image.tobytes())
                if key not in hashes:
                    index = len(images)
                    hashes[key] = index
                    images.append(image)
                    frames.append(dict(index=index, rgbaSha256=key, alphaBounds=image.getbbox()))
                timeline.append(hashes[key])
            clips[state]['frames'] = timeline
            if state in ('ground', 'air', 'spent'):
                outputs[f'assets/buildings/skeleton-trap-native/{tier}-{state}.png'] = images[timeline[0]]
        atlas = Image.new('RGBA', (width * columns, height * math.ceil(len(images) / columns)))
        for i, image in enumerate(images):
            atlas.paste(image, (i % columns * width, i // columns * height))
        path = f'assets/buildings/skeleton-trap-native/{tier}-atlas.png'
        outputs[path] = atlas
        metadata['tiers'][tier] = dict(atlas=dict(path=path, width=width, height=height, columns=columns,
                                                frames=len(images), bounds=bounds, pixelsPerNativeUnit=density,
                                                rgbaSha256=digest(atlas.tobytes())), clips=clips, frames=frames)
        print(f'Tier {tier}: {sum(len(v) for v in draws.values())} timeline frames, {len(images)} unique, {width}×{height} cells', flush=True)
    return outputs, metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, metadata = build()
    content = json.dumps(metadata, indent=2) + '\n'
    path = ROOT / 'reference/skeleton-trap/native.json'
    for name, image in outputs.items():
        target = ROOT / 'public' / name
        if args.check:
            with Image.open(target) as existing:
                require(existing.mode == 'RGBA' and existing.size == image.size and existing.tobytes() == image.tobytes(),
                        f'Native Skeleton Trap pixels differ: {name}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target, optimize=True)
    if args.check:
        require(path.read_text() == content, 'Native Skeleton Trap metadata differs')
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} native Skeleton Trap images and reference metadata')


if __name__ == '__main__':
    main()
