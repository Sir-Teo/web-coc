#!/usr/bin/env python3
"""Original level-1 Inferno models: independent Multiply source-pixel qualification."""
import argparse
import hashlib
import json
import math
import numpy as np
from PIL import Image
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import SC6, decode_sctx, require
from native_art.scene_graph import capture_graph, crop_textures
from native_art.multiply_scene import nodes, compose

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'sc/buildings.sc': 'f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed',
    'sc/buildings_8.sctx': '588eba7d5739a5d9b53d3e14f2ab83bd170cad735363a81dd37bea7bcc0bb3bd',
    'sc/buildings_28.sctx': '4f25555390bd05b262fd4b0eec96bf89cc97db8d2d4e862afb791f0713962f40',
}
EXPORTS = ['dark_tower_lvl1', 'dark_tower_lvl1_multi', 'dark_tower_base']

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
    fp = json.loads(source('fingerprint.json', PINS))
    members = {r['file']: r['sha'] for r in fp['files']}
    for path in PINS:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, PINS)).hexdigest() == members[path], 'Fingerprint differs')
    sc = SC6(source('sc/buildings.sc', PINS))
    graph = capture_graph(sc, {n: sc.exports[n] for n in EXPORTS}, allowed_blends=(0, 3, 4, 8))
    used = {t for ss in graph['shapes'].values() for t, _ in ss}
    require(used == {8, 28}, 'Source texture membership differs')
    decoded = {t: decode_sctx(source(f'sc/buildings_{t}.sctx', PINS)) for t in used}
    textures = {t: np.array(im) / 255 for t, im in decoded.items()}
    assets, packed, runtime = crop_textures(graph, decoded, 'assets/inferno-multiply-native/texture')
    # Both visible descendant cycles are 20 and 50 frames at 24 fps. Empty
    # locator timelines do not add a visual phase; they are covered separately.
    cases = [dict(family='inferno', export=n, frame=f, controls={}, base='dark_tower_base') for n in EXPORTS[:2] for f in range(100)]
    cases.append(dict(family='inferno', export='dark_tower_base', frame=0, controls={}))
    witness_exports = dict(graph['exports'])
    for id_, clip in graph['clips'].items():
        name = 'witness_clip_' + id_
        witness_exports[name] = int(id_)
        cases.extend(dict(family='inferno', export=name, frame=f, controls={}) for f in range(len(clip['timeline'])))
    images = {'public/' + p: im for p, im in assets.items()}
    documents = {
        'reference/inferno/multiply-runtime.json': runtime,
        'reference/inferno/multiply-source.json': dict(sources=PINS, graph=graph, textures=packed, nativePlaybackVerified=False, combinedFrames=100),
    }
    index = []
    for start in range(0, len(cases), 160):
        batch = cases[start:start + 160]
        category = 'inferno-multiply-' + str(start // 160 + 1)
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
        folder = 'tests/fixtures/native-inferno-multiply/'
        images[folder+category+'.png'] = sheet
        documents[folder+category+'.json'] = dict(category=category,width=width,height=height,cell=cell,background='#304135',nativePlaybackVerified=False,cases=batch)
        index.append(dict(category=category,cases=len(batch),width=width,height=height))
    documents['tests/fixtures/native-inferno-multiply/index.json'] = index
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
    print(('Verified' if args.check else 'Wrote')+' original Inferno Multiply witnesses')
