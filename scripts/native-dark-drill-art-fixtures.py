#!/usr/bin/env python3
"""Independent source pixels for every retained Dark Elixir Drill export and clip frame."""
import argparse
import hashlib
import json
import math
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

def build():
    metadata = json.loads((ROOT / 'reference/dark-drill/art-source.json').read_text())
    graph = metadata['graph']
    pins = metadata['sources']
    fp = json.loads(source('fingerprint.json', pins))
    members = {r['file']: r['sha'] for r in fp['files']}
    for path in pins:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, pins)).hexdigest() == members[path], 'Fingerprint differs')
    textures = {int(t): np.array(decode_sctx(source(f'sc/buildings_{t}.sctx', pins))) / 255
                for t in metadata['textures']}
    cases = [dict(family='dark-drill', export=n, frame=0, controls={}) for n in graph['exports']]
    witness_exports = dict(graph['exports'])
    for id_, clip in graph['clips'].items():
        name = 'witness_clip_' + id_
        witness_exports[name] = int(id_)
        cases.extend(dict(family='dark-drill', export=name, frame=f, controls={}) for f in range(len(clip['timeline'])))
    images, documents = {}, {}
    index = []
    for start in range(0, len(cases), 160):
        batch = cases[start:start + 160]
        category = 'dark-drill-art-' + str(start // 160 + 1)
        cell, width = 300, 2400
        height = math.ceil(len(batch) / 8) * cell
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
            rgba = np.round(compose(sample(root), textures, cell, [48/255,65/255,53/255])*255).astype(np.uint8)
            x,y = i%8*cell, i//8*cell
            sheet.paste(Image.fromarray(rgba, 'RGBA'), (x,y))
            case.update(x=x,y=y,time=case['frame']/graph['clips'][str(id_)]['fps'],root=root[:2].reshape(-1).tolist(),
                        empty=not xy,rasterEmpty=bool(np.all(rgba[:,:,:3]==[48,65,53])),rgbaSha256=digest(rgba.tobytes()))
        folder = 'tests/fixtures/native-dark-drill-art/'
        images[folder+category+'.png'] = sheet
        documents[folder+category+'.json'] = dict(category=category,width=width,height=height,cell=cell,background='#304135',nativePlaybackVerified=False,cases=batch)
        index.append(dict(category=category,cases=len(batch),width=width,height=height))
        print(f'Rendered {start + len(batch)}/{len(cases)} original Drill source cases', flush=True)
    documents['tests/fixtures/native-dark-drill-art/index.json'] = index
    return images, documents

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
    images,documents=build()
    for path,im in images.items():
        target=ROOT/path
        if args.check:
            with Image.open(target) as old: require(old.mode==im.mode and old.size==im.size and old.tobytes()==im.tobytes(),'Source pixels differ: '+path)
        else:
            target.parent.mkdir(parents=True,exist_ok=True);im.save(target,optimize=True)
    for path,doc in documents.items():
        target=ROOT/path;data=json.dumps(doc,indent=2)+'\n'
        if args.check: require(target.read_text()==data,'Source document differs: '+path)
        else:
            target.parent.mkdir(parents=True,exist_ok=True);target.write_text(data)
    print(('Verified' if args.check else 'Wrote')+' complete Dark Elixir Drill artwork witnesses')
