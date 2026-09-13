#!/usr/bin/env python3
"""Independent Mortar pixel witnesses sampled from original SC/SCTX inputs."""
import argparse
import json
import runpy

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import decode_sctx, require

body = runpy.run_path(str(ROOT / 'scripts/import-native-mortar.py'))
cpu = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))


def leaves(poses):
    for pose in poses:
        if 'group' in pose: yield from leaves(pose['group'])
        else: yield pose


def build(native, category):
    graph = native['world']['graph']
    rows = native['buildings']['Mortar']
    body_names = {r[k] for r in rows for k in body['BODY_FIELDS'] if r.get(k)}
    cases = []
    if category == 'body':
        for level in range(1, 19):
            for direction in range(8):
                cases.append(dict(export=f'mortar_lvl{level}', time=0,
                    controls=dict(turret=direction * 45, gearup=False),
                    category='direction', base='mortar_base'))
            if level >= 5:
                cases.append(dict(export=f'mortar_lvl{level}', time=0,
                    controls=dict(turret=137, gearup=0), category='gearup-control'))
            if level >= 15:
                cases.append(dict(export=f'mortar_lvl{level}', time=0,
                    controls=dict(turret=360, gearup=False), category='last-source-frame'))
        for level in (1, 18):
            cases.append(dict(export=f'mortar_lvl{level}', time=0,
                controls=dict(turret=False, gearup=False), category='disabled-controls'))
        for name in sorted(body_names - {r['ExportName'] for r in rows}):
            clip = graph['clips'][str(graph['exports'][name])]
            for frame in range(len(clip['timeline'])):
                cases.append(dict(export=name, time=frame / clip['fps'], controls={}, category='construction-base-rubble'))
    else:
        for name in sorted(set(graph['exports']) - body_names):
            clip = graph['clips'][str(graph['exports'][name])]
            count = len(clip['timeline'])
            frames = sorted({0, count // 2, count - 1})
            for frame in frames:
                cases.append(dict(export=name, time=frame / clip['fps'], controls={}, category='source-effect'))
        for emitter, variants in native['particles'].items():
            for index, row in enumerate(variants):
                name = row['ParticleExportName']
                clip = graph['clips'][str(graph['exports'][name])]
                frame = int(len(clip['timeline']) * .35)
                cases.append(dict(export=name, time=frame / clip['fps'], controls={},
                    category='emitter-variant', emitter=emitter, variant=index,
                    particleBlend=8 if row.get('AdditiveBlend', variants[0]['AdditiveBlend']) == 'TRUE' else 0))
    cell, columns = 300, 8
    width, height = cell * columns, cell * ((len(cases) + columns - 1) // columns)
    background = [48 / 255, 65 / 255, 53 / 255]
    sheet = Image.new('RGBA', (width, height), (48, 65, 53, 255))
    textures = {int(i): np.array(decode_sctx(source(f'sc/buildings_{i}.sctx', native['sources']))) / 255
                for i in native['world']['textures']}
    for i, case in enumerate(cases):
        id_ = graph['exports'][case['export']]
        frame = int(case['time'] * graph['clips'][str(id_)]['fps'] + 1e-9)
        def sample(root):
            if category == 'body':
                poses = body['poses'](graph, case['base'], root=root) if case.get('base') else []
                return poses + body['poses'](graph, case['export'], frame, case['controls'], root)
            poses = cpu['nodes'](graph, id_, frame, root)
            if 'particleBlend' in case:
                for pose in poses: pose['blend'] = case['particleBlend']
            return poses
        points = body['points'](list(leaves(sample(np.eye(3)))))
        if points:
            bounds = np.array(points)
            low, high = bounds.min(axis=0), bounds.max(axis=0)
            scale = min(2, *((cell - 32) / np.maximum(1, high - low)))
            center = (cell - (high + low) * scale) / 2
            root = np.array([[scale, 0, center[0]], [0, scale, center[1]], [0, 0, 1]])
        else:
            root = np.eye(3)
        pixels = cpu['compose'](sample(root), textures, cell, background)
        image = Image.fromarray(np.round(pixels * 255).astype(np.uint8), 'RGBA')
        x, y = i % columns * cell, i // columns * cell
        sheet.paste(image, (x, y))
        case.update(x=x, y=y, root=root[:2].reshape(-1).tolist(), empty=not points,
                    rgbaSha256=digest(image.tobytes()))
    expected = body_names if category == 'body' else set(graph['exports']) - body_names
    require({c['export'] for c in cases} == expected, 'Incomplete original export coverage')
    return sheet, dict(category=category, width=width, height=height, cell=cell, background='#304135',
        nativePlaybackVerified=False, rgbaSha256=digest(sheet.tobytes()), cases=cases)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    native = json.loads((ROOT / 'reference/mortar/native.json').read_text())
    folder = ROOT / 'tests/fixtures/native-mortar-mesh'
    for category in ('body', 'effects'):
        image, manifest = build(native, category)
        content = json.dumps(manifest, indent=2) + '\n'
        if args.check:
            require((folder / f'{category}.json').read_text() == content, 'Mortar source metadata differs')
            with Image.open(folder / f'{category}.png') as old:
                require(old.mode == 'RGBA' and old.size == image.size and old.tobytes() == image.tobytes(), 'Mortar source pixels differ')
        else:
            folder.mkdir(parents=True, exist_ok=True)
            (folder / f'{category}.json').write_text(content)
            image.save(folder / f'{category}.png', optimize=True)
        print(f'{"Verified" if args.check else "Wrote"} {len(manifest["cases"])} independent Mortar {category} pixel witnesses; {sum(c["empty"] for c in manifest["cases"])} empty', flush=True)


if __name__ == '__main__': main()
