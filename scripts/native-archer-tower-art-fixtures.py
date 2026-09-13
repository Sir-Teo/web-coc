#!/usr/bin/env python3
"""Independent source pixels for every retained Archer Tower export and clip frame."""
import argparse
import hashlib
import json
import math
from pathlib import Path
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

def points(poses):
    result = []
    for pose in leaves(poses):
        vertices = np.array(pose['vertices']).reshape(-1, 4)
        matrix = np.array(pose['matrix']).reshape(2, 3)
        result.extend(np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ matrix.T)
    return result

def build(family, check=False):
    metadata = json.loads((ROOT / f'reference/archer-tower/{family}-source.json').read_text())
    graph = metadata['graph']
    pins = metadata['sources']
    fp = json.loads(source('fingerprint.json', pins))
    members = {r['file']: r['sha'] for r in fp['files']}
    for path in pins:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, pins)).hexdigest() == members[path], 'Fingerprint differs')
    textures = {int(t): np.array(decode_sctx(source(f'sc/{"chr_archer" if family == "defenders" else family}_{t}.sctx', pins))) / 255
                for t in metadata['textures']}
    cases = [dict(family=family, export=n, frame=0, controls={}) for n in graph['exports']]
    witness_exports = dict(graph['exports'])
    for id_, clip in graph['clips'].items():
        name = 'witness_clip_' + id_
        witness_exports[name] = int(id_)
        cases.extend(dict(family=family, export=name, frame=f, controls={}) for f in range(len(clip['timeline'])))
    inputs = [Path(__file__), ROOT / f'reference/archer-tower/{family}-source.json',
              ROOT / 'scripts/native_art/sc6.py', ROOT / 'scripts/native_art/multiply_scene.py']
    signature = digest(b''.join(p.read_bytes() for p in inputs) + np.__version__.encode())
    checkpoint_dir = ROOT / 'output/playtest/archer-source-checkpoints'
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    folder = ROOT / f'tests/fixtures/native-archer-tower-{family}'
    if not check: folder.mkdir(parents=True, exist_ok=True)
    index = []
    for start in range(0, len(cases), 160):
        batch = cases[start:start + 160]
        category = 'archer-tower-' + family + '-' + str(start // 160 + 1)
        cell, width = 300, 2400
        height = math.ceil(len(batch) / 8) * cell
        image_path, document_path = folder / (category + '.png'), folder / (category + '.json')
        checkpoint = checkpoint_dir / (category + '.json')
        if not check and checkpoint.exists() and image_path.exists() and document_path.exists():
            saved = json.loads(checkpoint.read_text())
            if saved == dict(input=signature, image=digest(image_path.read_bytes()), document=digest(document_path.read_bytes())):
                index.append(dict(category=category,cases=len(batch),width=width,height=height))
                print(f'Reused {start + len(batch)}/{len(cases)} verified {family} source cases', flush=True)
                continue
        sheet = Image.new('RGBA', (width, height), (48,65,53,255))
        for i, case in enumerate(batch):
            id_ = witness_exports[case['export']]
            def sample(root):
                base = nodes(graph, graph['exports'][case['base']], 0, root) if case.get('base') else []
                return base + nodes(graph, id_, case['frame'], root)
            xy = points(sample(np.eye(3)))
            root = np.eye(3)
            if xy:
                low, high = np.array(xy).min(axis=0), np.array(xy).max(axis=0)
                scale = min(2, *((cell - 32) / np.maximum(1, high - low)))
                center = (cell - (high + low) * scale) / 2
                root = np.array([[scale,0,center[0]],[0,scale,center[1]],[0,0,1]])
            rgba = np.round(compose(sample(root), textures, cell, [48/255,65/255,53/255], screen_space_edges=True)*255).astype(np.uint8)
            x,y = i%8*cell, i//8*cell
            sheet.paste(Image.fromarray(rgba, 'RGBA'), (x,y))
            case.update(x=x,y=y,time=case['frame']/graph['clips'][str(id_)]['fps'],root=root[:2].reshape(-1).tolist(),
                        empty=not xy,rasterEmpty=bool(np.all(rgba[:,:,:3]==[48,65,53])),rgbaSha256=digest(rgba.tobytes()))
        document = dict(category=category,width=width,height=height,cell=cell,background='#304135',nativePlaybackVerified=False,cases=batch)
        text = json.dumps(document, indent=2) + '\n'
        if check:
            with Image.open(image_path) as old:
                require(old.mode == sheet.mode and old.size == sheet.size and old.tobytes() == sheet.tobytes(), 'Source pixels differ: ' + str(image_path))
            require(document_path.read_text() == text, 'Source document differs: ' + str(document_path))
        else:
            temporary = image_path.with_suffix('.png.part')
            sheet.save(temporary, format='PNG', optimize=True)
            temporary.replace(image_path)
            document_path.write_text(text)
            checkpoint.write_text(json.dumps(dict(input=signature, image=digest(image_path.read_bytes()), document=digest(document_path.read_bytes()))))
        sheet.close()
        index.append(dict(category=category,cases=len(batch),width=width,height=height))
        print(f'Rendered {start + len(batch)}/{len(cases)} original {family} source cases', flush=True)
    index_path = folder / 'index.json'
    text = json.dumps(index, indent=2) + '\n'
    if check: require(index_path.read_text() == text, 'Source index differs')
    else: index_path.write_text(text)

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');parser.add_argument('--family',choices=['buildings','characters','defenders'],required=True);args=parser.parse_args()
    build(args.family, args.check)
    print(('Verified' if args.check else 'Wrote')+' complete Archer Tower artwork witnesses')
