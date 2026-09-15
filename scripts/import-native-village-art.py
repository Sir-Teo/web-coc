#!/usr/bin/env python3
"""Build lazy-loadable native building timelines for the expanded village."""
import argparse,importlib.util,json,hashlib
from native_art.bundle import ROOT,digest
from native_art.source_csv import records,decoded_rows,inherited_levels
from native_art.scene_graph import crop_textures
from native_art.sc6 import require,decode_sctx
from PIL import Image

def module(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
art=module('art','native-full-catalog.py');data=module('data','import-native-progression.py')
KINDS=['townhall','goldmine','collector','goldstorage','elixirstorage','barracks','laboratory','spellfactory','herohall','blacksmith','builder','camp','airdefense','bomb','giantbomb','airbomb','springtrap','wall']
KINDS += list(data.EXTRA)
FIELDS=['ExportName','ExportNameBase','ExportNameConstruction','ExportNameBuildAnim','ExportNameDamaged','ExportNameBroken','ExportNameTriggered']

def main():
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
 raw=(art.ARCHIVE/'fingerprint.json').read_bytes();require(digest(raw)=='ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b','Fingerprint differs');art.MEMBERS={r['file']:r['sha'] for r in json.loads(raw)['files']}
 tables={t:records(decoded_rows(art.read(f'logic/{t}.csv'))) for t in ['buildings','traps']};index={}
 for kind in KINDS:
  name={**data.MAPPING,**data.TRAPS}[kind];levels=[];groups={}
  for row in inherited_levels(tables['traps' if kind in data.TRAPS else 'buildings'][name]):
   refs={}
   for field in FIELDS:
    if not row.get(field):continue
    export=row[field];paths=list(dict.fromkeys([row['SWF'],'sc/building_bases.sc','sc/buildings2.sc']))
    path=next((p for p in paths if export in art.scene(p).exports),None);require(path is not None,f'Missing {export}')
    sceneId=path.split('/')[-1].removesuffix('.sc');groups.setdefault(path,set()).add(export);refs[field]=dict(scene=sceneId,export=export)
   levels.append(dict(level=int(row.get('BuildingLevel',row.get('Level',1))),refs=refs))
  scenes={}
  for path,exports in groups.items():
   sceneId=path.split('/')[-1].removesuffix('.sc');graph=art.graph_for(art.scene(path),sorted(exports));used={t for commands in graph['shapes'].values() for t,_ in commands}
   decoded={t:decode_sctx(art.read(path.removesuffix('.sc')+f'_{t}.sctx')) for t in used}
   images,_,runtime=crop_textures(graph,decoded,f'assets/village-native/{kind}/{sceneId}')
   for relative,image in images.items():
    target=ROOT/'public'/relative
    if args.check:
     with Image.open(target) as old:require(old.mode==image.mode and old.size==image.size and old.tobytes()==image.tobytes(),'Texture differs')
    else:target.parent.mkdir(parents=True,exist_ok=True);image.save(target,optimize=True)
   scenes[sceneId]=runtime
  result=dict(kind=kind,levels=levels,scenes=scenes)
  target=ROOT/f'public/assets/village-native/{kind}/graph.json';serialized=json.dumps(result,separators=(',',':'))+'\n'
  if args.check:require(target.read_text()==serialized,'Native graph differs')
  else:target.parent.mkdir(parents=True,exist_ok=True);target.write_text(serialized)
  index[kind]=dict(path=f'assets/village-native/{kind}/graph.json',sha256=digest(serialized.encode()),levels=len(levels));print(f'{kind}: {len(levels)} complete source level/state references',flush=True)
 result=dict(clientVersion='18.400.21',sources=dict(sorted(art.PINS.items())),buildings=index);target=ROOT/'reference/full-client/village-art.json';serialized=json.dumps(result,indent=2)+'\n'
 if args.check:require(target.read_text()==serialized,'Index differs')
 else:target.write_text(serialized)
if __name__=='__main__':main()
