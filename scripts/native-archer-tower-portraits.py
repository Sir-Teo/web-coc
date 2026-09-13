#!/usr/bin/env python3
"""Source-rendered tower/resident portraits using the explicit local rooftop projection."""
import argparse
import json
import numpy as np
from PIL import Image
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import decode_sctx, require
from native_art.multiply_scene import nodes, compose


def leaves(poses):
    for pose in poses:
        if 'group' in pose:
            yield from leaves(pose['group'])
        else:
            yield pose


def build():
    folder = ROOT / 'reference/archer-tower'
    body = json.loads((folder / 'buildings-source.json').read_text())
    resident = json.loads((folder / 'defenders-source.json').read_text())
    definitions = json.loads((folder / 'native.json').read_text())
    textures = {}
    for metadata, prefix, offset in [(body, 'buildings', 0), (resident, 'chr_archer', 1000)]:
        for texture in metadata['textures']:
            blob = source(f'sc/{prefix}_{texture}.sctx', metadata['sources'])
            textures[int(texture) + offset] = np.array(decode_sctx(blob)) / 255
    images, rows = {}, []
    for row in definitions['levels']:
        level = int(row['BuildingLevel'])
        require(int(row['DefenderCount']) == 1, 'Unsupported resident count')
        animation = next(r for r in resident['animations'][row['DefenderCharacter']]['rows'] if r['Name'] == 'idle')
        defender_export = animation['ExportName'] + '_3'
        resident_root = np.array([[1, 0, 0], [0, 1, 60 - float(row['DefenderZ']) * .5], [0, 0, 1]])

        def sample(root):
            poses = []
            for name in [row['ExportNameBase'], row['ExportName']]:
                poses += nodes(body['graph'], body['graph']['exports'][name], 0, root)
            defenders = nodes(resident['graph'], resident['graph']['exports'][defender_export], 0, root @ resident_root)
            for pose in leaves(defenders):
                pose['texture'] += 1000
            return poses + defenders

        points = []
        for pose in leaves(sample(np.eye(3))):
            vertices = np.array(pose['vertices']).reshape(-1, 4)
            matrix = np.array(pose['matrix']).reshape(2, 3)
            points.extend(np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ matrix.T)
        xy = np.array(points)
        low = np.floor(xy.min(0)).astype(int) - 2
        high = np.ceil(xy.max(0)).astype(int) + 2
        width, height = ((high - low) * 2).tolist()
        root = np.array([[2, 0, -2 * low[0]], [0, 2, -2 * low[1]], [0, 0, 1]])
        premul = compose(sample(root), textures, max(width, height), screen_space_edges=True)[:height, :width]
        alpha = premul[:, :, 3:4]
        straight = np.divide(premul[:, :, :3], alpha, out=np.zeros_like(premul[:, :, :3]), where=alpha > 0)
        rgba = np.round(np.clip(np.concatenate([straight, alpha], axis=2), 0, 1) * 255).astype(np.uint8)
        path = f'assets/archer-tower-native/portrait/{level}.png'
        images[path] = Image.fromarray(rgba, 'RGBA')
        rows.append(dict(level=level, path=path, width=width, height=height, scale=2,
                         bounds=[int(low[0]), int(low[1]), int(high[0]), int(high[1])],
                         bodyExport=row['ExportName'], baseExport=row['ExportNameBase'], residentExport=defender_export,
                         residentRoot=resident_root[:2].reshape(-1).tolist(), rgbaSha256=digest(rgba.tobytes())))
    return images, dict(sourceSha256={name: digest((folder / name).read_bytes()) for name in ['native.json', 'buildings-source.json', 'defenders-source.json']},
                        nativePlaybackVerified=False, projection='Local village convention: y=60-DefenderZ*0.5; idle direction 3, frame zero.', portraits=rows)


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
    target = ROOT / 'reference/archer-tower/portraits.json'
    document = json.dumps(metadata, indent=2) + '\n'
    if args.check:
        require(target.read_text() == document, 'Portrait metadata differs')
    else:
        target.write_text(document)
    print('Verified original Archer Tower portraits' if args.check else 'Wrote original Archer Tower portraits')
