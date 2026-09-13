#!/usr/bin/env python3
"""Independent Cannon pixel witnesses, paged to stay within GPU canvas limits."""
import argparse
import json
import runpy
import numpy as np
from PIL import Image
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import decode_sctx, require
body = runpy.run_path(str(ROOT / 'scripts/import-native-cannon.py'))
cpu = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))


def case_groups(native):
    graph = native['world']['graph']
    rows = native['buildings']['Cannon']
    inherited, levels = {}, []
    for row in rows:
        inherited.update(row)
        levels.append(inherited.copy())
    direction, details, effects = [], [], []
    body_names = {r[k] for r in rows for k in body['BODY_FIELDS'] if r.get(k)}
    controlled = set()
    for row in levels:
        level = int(row['BuildingLevel'])
        for field in ['ExportName', *(['AlternateExportName'] if level >= 7 else [])]:
            name = row[field]
            controlled.add(name)
            root = graph['clips'][str(graph['exports'][name])]
            turret = graph['clips'][str(root['children'][root['names'].index('turret')])]
            # Includes unique one-frame transitions; never replace the source timeline by 36 equal bins.
            phases = [turret['timeline'].index(pattern) for pattern in sorted(set(turret['timeline']))]
            for phase in sorted(set([*phases, len(turret['timeline']) - 1])):
                direction.append(dict(export=name, time=0, controls=dict(turret=phase, gearup=False),
                    category='direction', level=level, mode='normal' if field == 'ExportName' else 'alternate', base=row['ExportNameBase']))
            if level >= 7:
                details.append(dict(export=name, time=0, controls=dict(turret=137, gearup=0), category='gearup-control', base=row['ExportNameBase']))
            if level in (1, 14, 15, 21):
                details.append(dict(export=name, time=0, controls=dict(turret=False, gearup=False), category='disabled-control'))
            if level in (14, 15):
                for frame in (5, 10, 20, 30, 60, 90, 120, 240, 359):
                    details.append(dict(export=name, time=frame / root['fps'], controls=dict(turret=137, gearup=False), category='animated-parent', base=row['ExportNameBase']))
    for name in sorted(body_names - controlled):
        clip = graph['clips'][str(graph['exports'][name])]
        for frame in [clip['timeline'].index(i) for i in sorted(set(clip['timeline']))]:
            details.append(dict(export=name, time=frame / clip['fps'], controls={}, category='construction-base-rubble'))
    for name in sorted(set(graph['exports']) - body_names):
        clip = graph['clips'][str(graph['exports'][name])]
        for frame in sorted({0, len(clip['timeline']) // 2, len(clip['timeline']) - 1}):
            effects.append(dict(export=name, time=frame / clip['fps'], controls={}, category='source-effect'))
    for emitter, variants in native['particles'].items():
        for i, row in enumerate(variants):
            clip = graph['clips'][str(graph['exports'][row['ParticleExportName']])]
            effects.append(dict(export=row['ParticleExportName'], time=int(len(clip['timeline']) * .35) / clip['fps'],
                controls={}, category='emitter-variant', emitter=emitter, variant=i,
                particleBlend=8 if row.get('AdditiveBlend', variants[0]['AdditiveBlend']) == 'TRUE' else 0))
    groups = [(f'body-{i // 240 + 1}', direction[i:i+240]) for i in range(0, len(direction), 240)]
    groups.extend([('details', details), ('effects', effects)])
    require({case['export'] for _, cases in groups for case in cases} == set(graph['exports']), 'Missing source export coverage')
    return groups


def build(native, category, cases, textures):
    graph = native['world']['graph']
    cell, columns = 300, 8
    width, height = cell * columns, cell * ((len(cases) + columns - 1) // columns)
    require(height <= 12000, 'Source witness page exceeds the supported GPU canvas height')
    sheet = Image.new('RGBA', (width, height), (48, 65, 53, 255))
    for i, case in enumerate(cases):
        clip = graph['clips'][str(graph['exports'][case['export']])]
        frame = int(case['time'] * clip['fps'] + 1e-9)
        def sample(root):
            poses = body['poses'](graph, case['base'], root=root) if case.get('base') else []
            poses += body['poses'](graph, case['export'], frame, case['controls'], root)
            if 'particleBlend' in case:
                for pose in poses: pose['blend'] = case['particleBlend']
            return poses
        points = body['points'](sample(np.eye(3)))
        if points:
            box = np.array(points)
            low, high = box.min(axis=0), box.max(axis=0)
            scale = min(2, *((cell - 32) / np.maximum(1, high - low)))
            center = (cell - (high + low) * scale) / 2
            root = np.array([[scale, 0, center[0]], [0, scale, center[1]], [0, 0, 1]])
        else: root = np.eye(3)
        rgba = cpu['compose'](sample(root), textures, cell, [48/255,65/255,53/255])
        image = Image.fromarray(np.round(rgba * 255).astype(np.uint8), 'RGBA')
        x, y = i % columns * cell, i // columns * cell
        sheet.paste(image, (x, y))
        case.update(x=x, y=y, root=root[:2].reshape(-1).tolist(), empty=not points, rgbaSha256=digest(image.tobytes()))
    return sheet, dict(category=category, width=width, height=height, cell=cell, background='#304135',
        nativePlaybackVerified=False, rgbaSha256=digest(sheet.tobytes()), cases=cases)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    native=json.loads((ROOT/'reference/cannon/native.json').read_text())
    textures={int(i):np.array(decode_sctx(source(f'sc/buildings_{i}.sctx',native['sources'])))/255 for i in native['world']['textures']}
    folder=ROOT/'tests/fixtures/native-cannon-mesh'
    folder.mkdir(parents=True,exist_ok=True)
    index=[]
    for category,cases in case_groups(native):
        image,manifest=build(native,category,cases,textures)
        path=folder/(category+'.png')
        encoded=json.dumps(manifest,indent=2)+'\n'
        if args.check:
            with Image.open(path) as old: require(old.mode=='RGBA' and old.size==image.size and old.tobytes()==image.tobytes(),'Source witness pixels differ')
            require(path.with_suffix('.json').read_text()==encoded,'Source witness metadata differs')
        else:
            image.save(path,optimize=True)
            path.with_suffix('.json').write_text(encoded)
        index.append(dict(category=category,cases=len(cases),width=manifest['width'],height=manifest['height']))
        print(f'{"Verified" if args.check else "Wrote"} {len(cases)} independent Cannon {category} pixel witnesses',flush=True)
    encoded=json.dumps(index,indent=2)+'\n'
    if args.check:require((folder/'index.json').read_text()==encoded,'Witness index differs')
    else:(folder/'index.json').write_text(encoded)

if __name__=='__main__':main()
