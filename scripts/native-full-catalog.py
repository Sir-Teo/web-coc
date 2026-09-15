#!/usr/bin/env python3
"""Render registered Home Village building/trap portraits from the complete official archive."""
import argparse
import hashlib
import json
import re
from functools import lru_cache
import numpy as np
from PIL import Image
from native_art.bundle import ROOT, BUNDLE, BASE, digest
from native_art.sc6 import SC6, decode_sctx, require
from native_art.source_csv import records, decoded_rows, inherited_levels
from native_art.scene_graph import capture_graph
from native_art.multiply_scene import nodes, compose

ARCHIVE = ROOT/'art/source/native-client-18.400.21'
PREFIX = 'assets/catalog-native'
PINS = {}


def read(path):
    target = ARCHIVE/'files'/path
    if not target.exists(): target = ROOT/'output/native-campaign-source'/path
    data = target.read_bytes()
    require(hashlib.sha1(data).hexdigest() == MEMBERS[path], f'Source mismatch: {path}')
    PINS[path] = digest(data)
    return data


@lru_cache(maxsize=8)
def scene(path): return SC6(read(path), max_decompressed_bytes=512 * 1024 * 1024)


@lru_cache(maxsize=12)
def texture(path): return np.array(decode_sctx(read(path)), dtype=float)/255


@lru_cache(maxsize=8)
def embedded_texture(path,index): return np.array(scene(path).embedded_texture(index),dtype=float)/255


def source_texture(path,index):
    if scene(path).textures[index]['external'] is None:return embedded_texture(path,index)
    return texture(path.removesuffix('.sc')+f'_{index}.sctx')


def graph_for(sc, exports):
    visited, empty = set(), set()
    def visit(i):
        if i in visited: return
        visited.add(i)
        if i in sc.textfields:
            require(sc.text_field(i)['text'] == '', f'Visible text in building artwork: {i}')
            empty.add(i)
        elif i in sc.clips:
            for child in sc.clip(i)['children']: visit(child)
    for name in exports:
        require(name in sc.exports, f'Missing original export: {name}')
        visit(sc.exports[name])
    return capture_graph(sc, {n:sc.exports[n] for n in exports}, empty_bounds=empty, allowed_blends=(0,3,4,8))


def coordinates(poses):
    points=[]
    for pose in poses:
        if 'group' in pose: points.extend(coordinates(pose['group']))
        else:
            v=np.array(pose['vertices']).reshape(-1,4)
            m=np.array(pose['matrix']).reshape(2,3)
            points.extend(np.column_stack([v[:,:2],np.ones(len(v))]) @ m.T)
    return points


def render(components):
    graphs=[(path, name, graph_for(scene(path),[name])) for path,name in components]
    def qualify(poses,path):
        for pose in poses:
            if 'group' in pose: qualify(pose['group'],path)
            else: pose['texture']=f'{path}:{pose["texture"]}'
        return poses
    def sample(root):
        return [p for path,name,graph in graphs for p in qualify(nodes(graph,graph['exports'][name],0,root),path)]
    xy=np.array(coordinates(sample(np.eye(3))))
    require(len(xy)>0,'Empty source portrait')
    low, high=np.floor(xy.min(0)).astype(int)-2,np.ceil(xy.max(0)).astype(int)+2
    w,h=(high-low).tolist()
    require(0 < max(w,h) <= 2048,'Unexpected source bounds')
    root=np.array([[1,0,-low[0]],[0,1,-low[1]],[0,0,1]])
    textures={f'{path}:{t}':source_texture(path,t)
              for path,_,graph in graphs for commands in graph['shapes'].values() for t,_ in commands}
    rgba=compose(sample(root),textures,max(w,h))[:h,:w]
    a=rgba[:,:,3:4]
    rgb=np.divide(rgba[:,:,:3],a,out=np.zeros_like(rgba[:,:,:3]),where=a>0)
    pixels=np.round(np.clip(np.concatenate([rgb,a],axis=2),0,1)*255).astype(np.uint8)
    image=Image.fromarray(pixels,'RGBA')
    return image,dict(width=w,height=h,bounds=[int(x) for x in [*low,*high]],originX=float(-low[0]/w),originY=float(-low[1]/h),rgbaSha256=digest(pixels.tobytes()))


def main():
    global MEMBERS
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--check',action='store_true')
    args=p.parse_args()
    fingerprint=(ROOT/'output/native-campaign-source/fingerprint.json').read_bytes()
    require(digest(fingerprint)=='ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b','Fingerprint differs')
    MEMBERS={r['file']:r['sha'] for r in json.loads(fingerprint)['files']}
    building=records(decoded_rows(read('logic/buildings.csv')))
    traps=records(decoded_rows(read('logic/traps.csv')))
    home_names=list(building)[:list(building).index('Communications mast')]
    trap_names=['Bomb','Spring Trap','Air Bomb','Giant Bomb','Seeking Air Mine','Skeleton Trap','Tornado Trap','Giga Bomb']
    results, errors, reused=[],[],{}
    for category,table,names in [('building',building,home_names),('trap',traps,trap_names)]:
        for name in names:
            slug=re.sub('[^a-z0-9]+','-',name.lower()).strip('-')
            for row in inherited_levels(table[name]):
                level=int(row.get('BuildingLevel',row.get('Level','1')))
                th=level if name=='Town Hall' else int(row.get('TownHallLevel','1'))
                if th>18:continue
                path=row.get('SWF','sc/buildings.sc')
                exports=[row[k] for k in ['ExportNameBase','ExportName'] if row.get(k)]
                record=dict(id=f'{slug}-{level}',name=name,kind=slug,category=category,level=level,townHall=th,
                            source=path,exports=exports,artReferences={k:v for k,v in row.items() if 'Export' in k or k.endswith('SWF')},
                            path=f'{PREFIX}/{slug}/level-{level}.png',frame=0)
                try:
                    components=[]
                    for name_ in exports:
                        matches=[candidate for candidate in dict.fromkeys([path,'sc/building_bases.sc','sc/buildings2.sc'])
                                 if name_ in scene(candidate).exports]
                        require(matches,f'Missing original export: {name_}')
                        # The declared scene owns its exports. Some base exports also
                        # occur in the shared base library; only use it as fallback.
                        components.append((matches[0],name_))
                    record['components']=[dict(source=p,export=n) for p,n in components]
                    key=tuple(components)
                    if key not in reused:
                        image,registration=render(components)
                        reused[key]=(image,registration)
                    image,registration=reused[key]
                    record.update(registration)
                    target=ROOT/'public'/record['path']
                    if args.check:
                        with Image.open(target) as old:require(old.mode==image.mode and old.size==image.size and old.tobytes()==image.tobytes(),f'Portrait pixels differ: {target}')
                    else:
                        target.parent.mkdir(parents=True,exist_ok=True)
                        image.save(target,optimize=True)
                    results.append(record)
                except Exception as exc:
                    record['error']=str(exc);errors.append(record)
                    print(f'ERROR {record["id"]}: {exc}',flush=True)
            print(f'{name}: {len(results)} portraits, {len(errors)} unresolved',flush=True)
    catalog=dict(clientVersion='18.400.21',bundle=BUNDLE,baseUrl=BASE,sources=dict(sorted(PINS.items())),
                 description='Home Village buildings and permanent traps through TH18. Base + body source exports at frame zero; static portraits, not complete weapon/state playback.',
                 nativePlaybackVerified=False,portraits=results,errors=errors)
    for path in ['reference/full-client/catalog.json',f'public/{PREFIX}/catalog.json']:
        target=ROOT/path; data=json.dumps(catalog,indent=2)+'\n'
        if args.check:require(target.read_text()==data,'Catalog differs')
        else:target.parent.mkdir(parents=True,exist_ok=True);target.write_text(data)
    print(f'{len(results)} portraits; {len(reused)} distinct source compositions; {len(errors)} unresolved',flush=True)
    require(not errors,'Some source previews could not be reconstructed; see catalog errors')

if __name__=='__main__': main()
