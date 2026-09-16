#!/usr/bin/env python3
"""Build lazy-loadable native building timelines for the expanded village."""
import argparse,importlib.util,json,hashlib
from native_art.bundle import ROOT,digest
from native_art.source_csv import records,decoded_rows,inherited_levels,animation_blocks
from native_art.scene_graph import crop_textures
from native_art.sc6 import require,decode_sctx
from PIL import Image

def module(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
art=module('art','native-full-catalog.py');data=module('data','import-native-progression.py')
KINDS=['townhall','goldmine','collector','goldstorage','elixirstorage','barracks','laboratory','spellfactory','herohall','blacksmith','builder','camp','airdefense','bomb','giantbomb','airbomb','springtrap','wall']
KINDS += list(data.EXTRA) + ['tornadotrap','gigabomb']
FIELDS=['ExportName','ExportNameBase','ExportNameConstruction','ExportNameBuildAnim','ExportNameDamaged','ExportNameBroken','ExportNameTriggered','AlternateExportName']
SPELL_TOWER={'rage':'SpellTowerRage','poison':'SpellTowerPoison','invisibility':'SpellTowerInvisibility','earthquake':'SpellTowerEarthquake'}
# Battle-mode bodies with multi-megatexel timelines ship as separate per-level packs, loaded only when shown.
VARIANTS={'AlternateExportName':'alternate','Tier':'tiers'}

def variant(field):
 return next((name for prefix,name in VARIANTS.items() if field.startswith(prefix)),None)

def extra_refs(kind,row,tables):
 """Body timelines declared outside the building row: Town Hall weapon levels (Weapon1..N), Spell Tower weapon
 modes (Mode:<mode>) and special-ability tier overrides (Tier<n>). Revenge Tower tier transformation clips and its
 33-second inactive idle are not shipped (several megatexels each); tier changes switch bodies directly."""
 if row.get('Weapon'):
  for i,w in enumerate(inherited_levels(tables['weapons'][row['Weapon']])):yield f'Weapon{i+1}',w['ExportName']
 if kind=='spelltower':
  level=int(row['BuildingLevel'])
  for mode,weapon in SPELL_TOWER.items():
   rows=inherited_levels(tables['weapons'][weapon])
   if level<=len(rows):yield f'Mode:{mode}',rows[level-1]['ExportName']
 if row.get('SpecialAbilities'):
  for tier,(ability,level) in enumerate(zip(row['SpecialAbilities'].split(';'),row['SpecialAbilitiesLevel'].split(';')),1):
   a=inherited_levels(tables['special_abilities'][ability])[int(level)-1]
   if a.get('OverrideExportName'):yield f'Tier{tier}',a['OverrideExportName']

def build(kind,groups,prefix,check):
 scenes={}
 for path,exports in sorted(groups.items()):
  sceneId=path.split('/')[-1].removesuffix('.sc');graph=art.graph_for(art.scene(path),sorted(exports));used={t for commands in graph['shapes'].values() for t,_ in commands}
  decoded={t:decode_sctx(art.read(path.removesuffix('.sc')+f'_{t}.sctx')) for t in used}
  images,_,runtime=crop_textures(graph,decoded,f'{prefix}/{sceneId}')
  for relative,image in images.items():
   target_file=ROOT/'public'/relative
   if check:
    with Image.open(target_file) as old:require(old.mode==image.mode and old.size==image.size and old.tobytes()==image.tobytes(),'Texture differs')
   else:target_file.parent.mkdir(parents=True,exist_ok=True);image.save(target_file,optimize=True)
  scenes[sceneId]=runtime
 return scenes

def emit(result,relative,check):
 graph_file=ROOT/'public'/relative;serialized=json.dumps(result,separators=(',',':'))+'\n'
 if check:require(graph_file.read_text()==serialized,f'Native graph differs: {relative}')
 else:graph_file.parent.mkdir(parents=True,exist_ok=True);graph_file.write_text(serialized)
 return digest(serialized.encode())

def main():
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');p.add_argument('--only',nargs='*',help='rebuild these kinds and keep the other index entries');args=p.parse_args()
 raw=(art.ARCHIVE/'fingerprint.json').read_bytes();require(digest(raw)=='ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b','Fingerprint differs');art.MEMBERS={r['file']:r['sha'] for r in json.loads(raw)['files']}
 tables={t:records(decoded_rows(art.read(f'logic/{t}.csv'))) for t in ['buildings','traps','weapons','special_abilities']};index={}
 target=ROOT/'reference/full-client/village-art.json';previous=json.loads(target.read_text()) if args.only else None
 for kind in KINDS:
  if args.only and kind not in args.only:
   require(kind in previous['buildings'],f'--only needs an existing index entry for {kind}');index[kind]=previous['buildings'][kind];continue
  name={**data.MAPPING,**data.TRAPS}[kind];levels=[];groups={};extras={};raw=tables['traps' if kind in data.TRAPS else 'buildings'][name]
  for index_,row in enumerate(inherited_levels(raw)):
   # A blank Weapon cell means "none" (the Town Hall 18 row), exactly like the progression importer.
   row={k:v for k,v in row.items() if k not in data.EXACT or k in raw[index_]}
   level=int(row.get('BuildingLevel',row.get('Level',1)));refs={};skipped={}
   declared=[(field,row[field]) for field in FIELDS if row.get(field)]+list(extra_refs(kind,row,tables))
   for field,export in declared:
    paths=list(dict.fromkeys([row['SWF'],'sc/building_bases.sc','sc/buildings2.sc']))
    path=next((p for p in paths if export in art.scene(p).exports),None);require(path is not None,f'Missing {export}')
    try:art.graph_for(art.scene(path),[export])
    except ValueError as error:
     # The strict reader cannot retain masked timelines (Giga Bomb fuse); record instead of approximating.
     skipped[field]=dict(export=export,reason=str(error));continue
    sceneId=path.split('/')[-1].removesuffix('.sc');ref=dict(scene=sceneId,export=export)
    group=variant(field)
    if group:
     entry=extras.setdefault(f'{group}-{level}',dict(level=level,refs={},groups={}))
     entry['refs'][field]=ref;entry['groups'].setdefault(path,set()).add(export)
    else:groups.setdefault(path,set()).add(export);refs[field]=ref
   action=int(row['AnimationActionFrame']) if row.get('AnimationActionFrame') else None
   levels.append(dict(level=level,refs=refs,**({'action':action} if action else {}),**({'skipped':skipped} if skipped else {})))
  scenes=build(kind,groups,f'assets/village-native/{kind}',args.check)
  sha=emit(dict(kind=kind,levels=levels,scenes=scenes),f'assets/village-native/{kind}/graph.json',args.check)
  index[kind]=dict(path=f'assets/village-native/{kind}/graph.json',sha256=sha,levels=len(levels))
  variants={}
  for key,entry in sorted(extras.items()):
   prefix=f'assets/village-native/{kind}/{key}'
   scenes=build(kind,entry['groups'],prefix,args.check)
   variants[key]=dict(path=f'{prefix}/graph.json',sha256=emit(dict(kind=kind,variant=key,levels=[dict(level=entry['level'],refs=entry['refs'])],scenes=scenes),f'{prefix}/graph.json',args.check))
  if variants:index[kind]['variants']=variants
  print(f'{kind}: {len(levels)} complete source level/state references'+(f', variants {", ".join(variants)}' if variants else ''),flush=True)
 if args.only:art.PINS.update({k:v for k,v in previous['sources'].items() if k not in art.PINS})
 result=dict(clientVersion='18.400.21',sources=dict(sorted(art.PINS.items())),buildings=index);serialized=json.dumps(result,indent=2)+'\n'
 if args.check:require(target.read_text()==serialized,'Index differs')
 else:target.write_text(serialized)
if __name__=='__main__':main()
