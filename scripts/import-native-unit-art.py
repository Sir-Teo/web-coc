#!/usr/bin/env python3
"""Retain every declared source animation state and direction root for spawned units, siege machines and super troops."""
import argparse,importlib.util,json,re
from functools import lru_cache
from native_art.bundle import ROOT,digest
from native_art.source_csv import records,decoded_rows,inherited_levels,animation_blocks
from native_art.scene_graph import crop_textures
from native_art.sc6 import require,decode_sctx
from PIL import Image

def module(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
art=module('art','native-full-catalog.py');data=module('data','import-native-progression.py')

SECONDARY={'golemite':'Golemite','lavapup':'Lava Pup','skeleton':'Skeleton','bear':'Bear','yetimite':'Yetimite','meteormite':'Meteormite','ruinknight':'Ruin Knight','firemite':'Firemite Spawn','electromite':'Electromite','icehoundpup':'Ice Hound Pup','superhog':'Super Hog','superrider':'Super Rider','bigboy':'Big Boy','spellbat':'Spell Bat','spellskeletonshielded':'Spell Shielded Skeleton','spellskeleton':'Spell Unshielded Skeleton','totem':'Totem','snake':'BK Equipment Snake','henchman':'MP Equipment Henchman','gwlavaloon':'GW Equipment Lavaloon','gwlavaloonpup':'GW Equipment Lavaloon Pup','defendingbuilder':'Defending Builder','trapskeleton':'Trap Skeleton','trapairskeleton':'Trap Air Skeleton'}
SIEGE={'wallwrecker':'Wall Wrecker','battleblimp':'Battle Blimp','stoneslammer':'Stone Slammer','siegebarracks':'Siege Barracks','loglauncher':'Log Launcher','flameflinger':'Flame Flinger','battledrill':'Battle Drill','trooplauncher':'Troop Launcher'}
SUPER={'superbarbarian':'Super Barbarian','superarcher':'Super Archer','supergiant':'Super Giant','sneakygoblin':'Sneaky Goblin','superwallbreaker':'Super Wall Breaker','rocketballoon':'Rocket Balloon','superwizard':'Super Wizard','superdragon':'Super Dragon','infernodragon':'Inferno Dragon','superminer':'Super Miner','superyeti':'Super Yeti','superminion':'Super Minion','superhogrider':'Super Hog Rider','supervalkyrie':'Super Valkyrie','superwitch':'Super Witch','icehound':'Ice Hound','superbowler':'Super Bowler'}
UNITS={**SECONDARY,**SIEGE,**SUPER}

@lru_cache(maxsize=4)
def texture(path,index):
 sc=art.scene(path);external=sc.textures[index]['external']
 return sc.embedded_texture(index) if external is None else decode_sctx(art.read('sc/'+external))

def resolve(name,chars,animations):
 """Level tiers with every named state, or the reason no 2D SC animation exists.

 Unnamed rows are weighted variants of the preceding state; like the troop
 importer, the first declared variant of each state is retained.
 """
 if name not in chars:return 'Missing from logic/characters.csv'
 levels,groups=[],{}
 for row in inherited_levels(chars[name]):
  animation=row.get('Animation')
  if not animation:return f'Level {len(levels)+1} declares no Animation'
  if animation not in animations:return f'Animation {animation} missing from csv/animations.csv'
  states,models={},[]
  for event in animations[animation]['rows']:
   state=event['Name'].lower();prefix=event.get('ExportName')
   if not state or state in states:continue
   if event.get('SCW') and not event.get('SWF'):models.append(event['SCW']);continue
   if not prefix:continue
   path=event.get('SWF') or 'sc/characters.sc';sc=art.scene(path)
   exports=([prefix] if prefix in sc.exports else sorted([n for n in sc.exports if re.fullmatch(re.escape(prefix)+r'_\d+',n)],key=lambda n:int(n.rsplit('_',1)[1])))
   require(exports,f'Missing {path}:{prefix}');groups.setdefault(path,set()).update(exports)
   states[state]=dict(scene=path.split('/')[-1].removesuffix('.sc'),exports=exports,scale=float(event.get('Scale') or 100)/100,actionFrame=int(event.get('ActionFrame') or 0),loop=event.get('Looping')=='TRUE')
  if not states:return f'Animation {animation} has only 3D SCW models ({", ".join(sorted(set(models)))})' if models else f'Animation {animation} declares no 2D SC exports'
  require('idle' in states or 'walk' in states,f'Missing locomotion for {animation}')
  levels.append(dict(level=len(levels)+1,animation=animation,states=states))
 return levels,groups

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');args=p.parse_args()
 raw=(art.ARCHIVE/'fingerprint.json').read_bytes();require(digest(raw)=='ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b','Fingerprint differs');art.MEMBERS={r['file']:r['sha'] for r in json.loads(raw)['files']}
 require(not set(UNITS)&set(data.TROOPS),'Unit keys would replace trainable troop packs')
 chars=records(decoded_rows(art.read('logic/characters.csv')));animations=animation_blocks(decoded_rows(art.read('csv/animations.csv')));index,skipped={},{}
 for kind,name in UNITS.items():
  resolved=resolve(name,chars,animations)
  if isinstance(resolved,str):
   skipped[kind]=dict(clientName=name,reason=resolved);print(f'{kind}: skipped, {resolved}',flush=True);continue
  levels,groups=resolved;scenes={};pack=ROOT/f'public/assets/troops-native/{kind}';files={'graph.json'}
  for path,exports in groups.items():
   sceneId=path.split('/')[-1].removesuffix('.sc');require(sceneId not in scenes,f'Duplicate scene name {sceneId}')
   graph=art.graph_for(art.scene(path),sorted(exports));used={t for commands in graph['shapes'].values() for t,_ in commands}
   images,_,runtime=crop_textures(graph,{t:texture(path,t) for t in used},f'assets/troops-native/{kind}/{sceneId}')
   for relative,image in images.items():
    target=ROOT/'public'/relative;files.add(target.relative_to(pack).as_posix())
    if args.check:
     with Image.open(target) as old:require(old.mode==image.mode and old.size==image.size and old.tobytes()==image.tobytes(),f'Texture differs: {relative}')
    else:target.parent.mkdir(parents=True,exist_ok=True);image.save(target,optimize=True)
   scenes[sceneId]=runtime
  result=dict(kind=kind,levels=levels,scenes=scenes)
  target=pack/'graph.json';serialized=json.dumps(result,separators=(',',':'))+'\n'
  if args.check:
   require(target.read_text()==serialized,f'Native graph differs: {kind}')
   require({f.relative_to(pack).as_posix() for f in pack.rglob('*') if f.is_file() and not f.name.startswith('.')}==files,f'Unexpected files in native pack: {kind}')
  else:target.parent.mkdir(parents=True,exist_ok=True);target.write_text(serialized)
  states=list(dict.fromkeys(state for level in levels for state in level['states']))
  index[kind]=dict(path=f'assets/troops-native/{kind}/graph.json',sha256=digest(serialized.encode()),levels=len(levels),clientName=name,states=states)
  print(f'{kind}: {len(levels)} original animation tiers; states {", ".join(states)}',flush=True)
 result=dict(clientVersion='18.400.21',sources=dict(sorted(art.PINS.items())),units=index,skipped=skipped);target=ROOT/'reference/full-client/unit-art.json';serialized=json.dumps(result,indent=2)+'\n'
 if args.check:require(target.read_text()==serialized,'Index differs')
 else:target.write_text(serialized)
if __name__=='__main__':main()
