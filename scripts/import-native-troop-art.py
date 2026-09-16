#!/usr/bin/env python3
"""Retain source walk/idle/attack/death timelines and direction roots for playable troops."""
import argparse,importlib.util,json,hashlib,re
from native_art.bundle import ROOT,digest
from native_art.source_csv import records,decoded_rows,inherited_levels,animation_blocks
from native_art.scene_graph import crop_textures
from native_art.sc6 import require,decode_sctx
from PIL import Image

def module(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
art=module('art','native-full-catalog.py');data=module('data','import-native-progression.py')

def main():
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
 raw=(art.ARCHIVE/'fingerprint.json').read_bytes();require(digest(raw)=='ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b','Fingerprint differs');art.MEMBERS={r['file']:r['sha'] for r in json.loads(raw)['files']}
 chars=records(decoded_rows(art.read('logic/characters.csv')));animations=animation_blocks(decoded_rows(art.read('csv/animations.csv')));index={}
 for kind,name in data.TROOPS.items():
  if kind in data.SIEGE_TROOPS or kind in data.SUPER_TROOPS:continue # owned by import-native-unit-art.py
  levels=[];groups={}
  for row in inherited_levels(chars[name]):
   animation=row['Animation'];require(animation in animations,f'Missing animation {animation}');states={}
   for event in animations[animation]['rows']:
    state=event['Name'].lower()
    if state not in ['walk','idle','attack','die'] or state in states:continue
    prefix=event['ExportName'];path=event.get('SWF') or 'sc/characters.sc'
    if not prefix:continue
    sc=art.scene(path);exports=([prefix] if prefix in sc.exports else sorted([n for n in sc.exports if re.fullmatch(re.escape(prefix)+r'_\d+',n)],key=lambda n:int(n.rsplit('_',1)[1])))
    require(exports,f'Missing {path}:{prefix}');sceneId=path.split('/')[-1].removesuffix('.sc');groups.setdefault(path,set()).update(exports)
    states[state]=dict(scene=sceneId,exports=exports,scale=float(event.get('Scale') or 100)/100,actionFrame=int(event.get('ActionFrame') or 0),loop=event.get('Looping')=='TRUE')
   require('idle' in states or 'walk' in states,f'Missing locomotion for {animation}')
   levels.append(dict(level=len(levels)+1,animation=animation,states=states))
  scenes={}
  for path,exports in groups.items():
   sceneId=path.split('/')[-1].removesuffix('.sc');graph=art.graph_for(art.scene(path),sorted(exports));used={t for commands in graph['shapes'].values() for t,_ in commands}
   decoded={t:(art.scene(path).embedded_texture(t) if art.scene(path).textures[t]['external'] is None else decode_sctx(art.read('sc/'+art.scene(path).textures[t]['external']))) for t in used}
   images,_,runtime=crop_textures(graph,decoded,f'assets/troops-native/{kind}/{sceneId}')
   for relative,image in images.items():
    target=ROOT/'public'/relative
    if args.check:
     with Image.open(target) as old:require(old.mode==image.mode and old.size==image.size and old.tobytes()==image.tobytes(),'Texture differs')
    else:target.parent.mkdir(parents=True,exist_ok=True);image.save(target,optimize=True)
   scenes[sceneId]=runtime
  result=dict(kind=kind,levels=levels,scenes=scenes)
  target=ROOT/f'public/assets/troops-native/{kind}/graph.json';serialized=json.dumps(result,separators=(',',':'))+'\n'
  if args.check:require(target.read_text()==serialized,'Native graph differs')
  else:target.parent.mkdir(parents=True,exist_ok=True);target.write_text(serialized)
  index[kind]=dict(path=f'assets/troops-native/{kind}/graph.json',sha256=digest(serialized.encode()),levels=len(levels));print(f'{kind}: {len(levels)} original animation tiers',flush=True)
 result=dict(clientVersion='18.400.21',sources=dict(sorted(art.PINS.items())),troops=index);target=ROOT/'reference/full-client/troop-art.json';serialized=json.dumps(result,indent=2)+'\n'
 if args.check:require(target.read_text()==serialized,'Index differs')
 else:target.write_text(serialized)
if __name__=='__main__':main()
