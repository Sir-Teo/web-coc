#!/usr/bin/env python3
"""Preserve original rooftop Archer animation records, idle/attack graphs and texels."""
import argparse
import hashlib
import json
from PIL import Image
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import SC6, decode_sctx, require
from native_art.scene_graph import capture_graph, crop_textures
from native_art.source_csv import decoded_rows, animation_blocks
PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'csv/animations.csv': 'b0be152c98d06ccd0689320acfa19b07e04dd2a07fc6a1253558592f67bf29d8',
    'sc/chr_archer.sc': '2acaca98c63b3fef734a424a689ca6cdce5c5af9883a70db455119174833e53d',
    'sc/chr_archer_0.sctx': 'ed7d064ae39b823110d9242714fa8637830e6e96d53db77665b1a6a8b2fa7b61',
}
def build():
    blobs={p:source(p,PINS) for p in PINS}
    members={r['file']:r['sha'] for r in json.loads(blobs['fingerprint.json'])['files']}
    for p,blob in blobs.items():
        if p!='fingerprint.json':require(hashlib.sha1(blob).hexdigest()==members[p],'Fingerprint differs: '+p)
    definition=ROOT/'reference/archer-tower/native.json'
    levels=json.loads(definition.read_text())['levels']
    wanted={r['DefenderCharacter'] for r in levels}
    table=animation_blocks(decoded_rows(blobs['csv/animations.csv']))
    animations={n:table[n] for n in sorted(wanted)}
    require(len(animations)==9,'Resident Archer family count differs')
    sc=SC6(blobs['sc/chr_archer.sc']);exports={}
    for name,block in animations.items():
        for state in ['idle','attack']:
            rows=[r for r in block['rows'] if r['Name']==state]
            require(len(rows)==1,'Ambiguous resident animation')
            row=rows[0]
            require(row['SWF']=='sc/chr_archer.sc' and row['HasDirections']=='TRUE','Unexpected resident asset')
            names={n for n in sc.exports if n.startswith(row['ExportName']+'_')}
            require(names=={row['ExportName']+'_'+str(i) for i in [1,2,3]},'Direction exports differ')
            exports.update({n:sc.exports[n] for n in sorted(names)})
    graph=capture_graph(sc,dict(sorted(exports.items())),allowed_blends=(0,8))
    require({t for commands in graph['shapes'].values() for t,_ in commands}=={0},'Unexpected resident texture')
    image=decode_sctx(blobs['sc/chr_archer_0.sctx'])
    require(image.size==(2036,1022),'Resident texture dimensions differ')
    assets,textures,runtime=crop_textures(graph,{0:image},'assets/archer-tower-native/defenders/texture')
    metadata=dict(sources=PINS,definitionSha256=digest(definition.read_bytes()),animations=animations,
                  levels=[{k:v for k,v in r.items() if k=='BuildingLevel' or k.startswith('Defender')} for r in levels],
                  graph=graph,textures=textures,nativePlaybackVerified=False)
    return assets,{'reference/archer-tower/defenders-source.json':metadata,'reference/archer-tower/defenders-runtime.json':runtime}
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
    assets,documents=build()
    for path,image in assets.items():
        target=ROOT/'public'/path
        if args.check:
            with Image.open(target) as old:require(old.mode==image.mode and old.size==image.size and old.tobytes()==image.tobytes(),'Resident texels differ')
        else:target.parent.mkdir(parents=True,exist_ok=True);image.save(target,optimize=True)
    for path,doc in documents.items():
        target=ROOT/path;text=json.dumps(doc,indent=2)+'\n'
        if args.check:require(target.read_text()==text,'Resident source differs')
        else:target.write_text(text)
    graph=documents['reference/archer-tower/defenders-runtime.json']
    print('Verified' if args.check else 'Wrote',len(graph['exports']),'exports',len(graph['clips']),'clips',sum(len(c['timeline']) for c in graph['clips'].values()),'frames')
