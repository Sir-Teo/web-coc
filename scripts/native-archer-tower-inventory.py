#!/usr/bin/env python3
"""Audit reachable original Archer Tower display objects before importing textures."""
import argparse
import hashlib
import json
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import SC6, require
from native_art.source_csv import inherited_levels
PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'sc/buildings.sc': 'f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed',
    'sc/characters.sc': '0e23bd3745176fe7db3d61e490d9da07c63a42e95462f514d6eac696314c3798',
}
def build():
    path = ROOT / 'reference/archer-tower/native.json'
    definition = json.loads(path.read_text())
    fingerprint = json.loads(source('fingerprint.json', PINS))
    members = {r['file']:r['sha'] for r in fingerprint['files']}
    exports = {}
    def add(swf, name):
        require(swf in PINS, 'Unpinned scene: ' + str(swf))
        exports.setdefault(swf,set()).add(name)
    for row in definition['levels']:
        for key,value in row.items():
            if 'ExportName' in key: add(row['SWF'],value)
    for group in ['projectiles','effects','particles']:
        for rows in definition[group].values():
            for row in inherited_levels(rows):
                for field,swf in [('ExportName','SWF'),('ShadowExportName','ShadowSWF'),('ParticleExportName','ParticleSwf')]:
                    if row.get(field): add(row.get(swf),row[field])
    scenes = {}
    for swf,names in sorted(exports.items()):
        blob = source(swf,PINS)
        require(hashlib.sha1(blob).hexdigest()==members[swf], 'Fingerprint differs')
        sc = SC6(blob)
        require(names <= sc.exports.keys(), 'Unresolved export: '+str(names-sc.exports.keys()))
        ids = {name:sc.exports[name] for name in sorted(names)}
        shapes,clips,textures,modifiers,textfields = set(),{},set(),set(),set()
        def visit(id_,ancestors=()):
            require(id_ not in ancestors,'Recursive display object')
            if id_ in shapes or id_ in clips or id_ in modifiers or id_ in textfields: return
            if id_ in sc.shapes:
                shapes.add(id_); textures.update(t for t,_ in sc.commands(id_))
            elif id_ in sc.modifiers: modifiers.add(id_)
            elif id_ in sc.textfields: textfields.add(id_)
            else:
                c=sc.clip(id_)
                clips[id_]=dict(fps=c['fps'],frames=len(c['frames']),names=c['names'],blends=sorted(set(c['blending'])),labels=[[i,v] for i,v in enumerate(c['labels']) if v])
                for child in c['children']: visit(child,(*ancestors,id_))
        for id_ in ids.values(): visit(id_)
        scenes[swf]=dict(exports=ids,shapes=sorted(shapes),clips={str(k):v for k,v in sorted(clips.items())},modifiers=sorted(modifiers),textfields=sorted(textfields),textures=[dict(index=t,file='sc/'+sc.textures[t]['external'],width=sc.textures[t]['width'],height=sc.textures[t]['height']) for t in sorted(textures)])
    return dict(sources=PINS,definitionSha256=digest(path.read_bytes()),scenes=scenes)
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
    doc=build();text=json.dumps(doc,indent=2)+'\n';path=ROOT/'reference/archer-tower/art-inventory.json'
    if args.check: require(path.read_text()==text,'Archer Tower inventory differs')
    else: path.write_text(text)
    for swf,s in doc['scenes'].items(): print(swf,len(s['exports']),'exports',len(s['clips']),'clips',len(s['shapes']),'shapes',sum(c['frames'] for c in s['clips'].values()),'frames',len(s['textures']),'textures','modifiers',s['modifiers'],'textfields',s['textfields'])
