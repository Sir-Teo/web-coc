#!/usr/bin/env python3
"""Export original troop, hero, pet, spell and equipment icons from pinned source references."""
import argparse
import importlib.util
import json
import re
from native_art.bundle import ROOT, digest
from native_art.source_csv import records,decoded_rows
from native_art.sc6 import require
from PIL import Image

spec=importlib.util.spec_from_file_location('native_full_catalog',ROOT/'scripts/native-full-catalog.py')
art=importlib.util.module_from_spec(spec);spec.loader.exec_module(art)


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');args=p.parse_args()
    fp=(ROOT/'output/native-campaign-source/fingerprint.json').read_bytes()
    require(digest(fp)=='ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b','Fingerprint differs')
    art.MEMBERS={r['file']:r['sha'] for r in json.loads(fp)['files']}
    results,errors,without_icon,cache=[],[],[],{}
    for table,category in [('characters','troop'),('heroes','hero'),('pets','pet'),('spells','spell'),('character_items','equipment')]:
        rows=records(decoded_rows(art.read(f'logic/{table}.csv')))
        for name,levels in rows.items():
            row=levels[0];path=row.get('IconSWF');export=row.get('IconExportName')
            if not path or not export:
                without_icon.append(dict(name=name,category=category,reason='No standalone icon declared by source'))
                continue
            slug=re.sub('[^a-z0-9]+','-',name.lower()).strip('-')
            record=dict(id=f'{category}-{slug}',kind=slug,name=name,category=category,levels=len(levels),source=path,exports=[export],
                        path=f'assets/catalog-native/roster/{category}-{slug}.png',frame=0,
                        artReferences={k:v for k,v in row.items() if any(s in k for s in ['Icon','Picture','Animation'])})
            try:
                key=(path,export)
                if key not in cache:cache[key]=art.render([key])
                image,registration=cache[key];record.update(registration)
                target=ROOT/'public'/record['path']
                if args.check:
                    with Image.open(target) as old:require(old.mode==image.mode and old.size==image.size and old.tobytes()==image.tobytes(),f'Icon differs: {name}')
                else:target.parent.mkdir(parents=True,exist_ok=True);image.save(target,optimize=True)
                results.append(record)
            except Exception as exc:
                record['error']=str(exc);errors.append(record);print(f'ERROR {name}: {exc}',flush=True)
        print(f'{category}: {len(results)} icons; {len(errors)} unresolved',flush=True)
    result=dict(clientVersion='18.400.21',bundle=art.BUNDLE,sources=dict(sorted(art.PINS.items())),
                description='Every declared standalone icon in character, hero, pet, spell and equipment source tables. Includes home, builder-base and event content; source-only helper records are listed separately.',
                portraits=results,errors=errors,withoutStandaloneIcon=without_icon)
    for relative in ['reference/full-client/roster.json','public/assets/catalog-native/roster.json']:
        target=ROOT/relative;text=json.dumps(result,indent=2)+'\n'
        if args.check:require(target.read_text()==text,'Roster manifest differs')
        else:target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text)
    print(f'{len(results)} icons, {len(errors)} unresolved, {len(without_icon)} source-only helper records',flush=True)
    require(not errors,'Some declared icons could not be reconstructed')

if __name__=='__main__':main()
