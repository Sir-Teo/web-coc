#!/usr/bin/env python3
"""Preserve complete source definitions for the next campaign village's missing families.

Base levels inherit CSV fields. Mini-level records remain raw and separate: this
import does not infer supercharge arithmetic, beam timing or active-mode semantics.
"""
import argparse
import hashlib
import json
from native_art.bundle import ROOT, BUNDLE, source
from native_art.source_csv import decoded_rows, records, inherited_levels
from native_art.sc6 import require, SC6

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'sc/buildings.sc': 'f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'csv/particle_emitters.csv': '8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef',
    'logic/mini_levels.csv': '548d592770d5e0799a13a9e70da9092da4e282d5293bba852f5e0424c78812d3',
}
FAMILIES = {'inferno': ('Inferno Tower', 12), 'dark-drill': ('Dark Elixir Drill', 11)}

def build():
    blobs = {path: source(path, PINS) for path in PINS}
    fingerprint = json.loads(blobs['fingerprint.json'])
    members = {r['file']: r['sha'] for r in fingerprint['files']}
    for path, blob in blobs.items():
        if path != 'fingerprint.json':
            require(hashlib.sha1(blob).hexdigest() == members[path], 'Fingerprint differs: ' + path)
    tables = {path: records(decoded_rows(blob)) for path, blob in blobs.items() if path.endswith('.csv')}
    documents = {}
    scene = SC6(blobs['sc/buildings.sc'])
    for folder, (name, count) in FAMILIES.items():
        rows = tables['logic/buildings.csv'][name]
        require(len(rows) == count, 'Source level count changed')
        levels = inherited_levels(rows)
        require([int(r['BuildingLevel']) for r in levels] == list(range(1, count + 1)), 'Nonsequential source levels')
        effect_names = {v for r in levels for k, v in r.items() if k.endswith('Effect') or 'EffectLv' in k}
        effects = {}
        pending = set(effect_names)
        while pending:
            effect_name = pending.pop()
            if effect_name in effects:
                continue
            require(effect_name in tables['logic/effects.csv'], 'Unresolved source effect: ' + effect_name)
            effects[effect_name] = tables['logic/effects.csv'][effect_name]
            pending.update(r['SpawnEffect'] for r in effects[effect_name] if r.get('SpawnEffect'))
        effects = dict(sorted(effects.items()))
        emitters = sorted({r['ParticleEmitter'] for rs in effects.values() for r in rs if r.get('ParticleEmitter')})
        particles = {n: tables['csv/particle_emitters.csv'][n] for n in emitters}
        mini_name = levels[0]['MiniLevels']
        mini = tables['logic/mini_levels.csv'][mini_name]
        require(mini[0]['TargetBuilding'] == name, 'Mini-level family differs')
        exports = {v for row in levels for k, v in row.items() if 'ExportName' in k}
        require(all(row['SWF'] == 'sc/buildings.sc' for row in levels), 'Unexpected building art file')
        for emitter_rows in particles.values():
            swf = None
            for row in emitter_rows:
                swf = row.get('ParticleSwf', swf)
                require(swf == 'sc/buildings.sc', 'Unexpected particle art file')
                if row.get('ParticleExportName'):
                    exports.add(row['ParticleExportName'])
        require(exports <= scene.exports.keys(), 'Unresolved original scene export')
        export_ids = {n: scene.exports[n] for n in sorted(exports)}
        shapes, clips, textures, blend_modes, modifiers, text_fields = set(), set(), set(), set(), set(), set()
        unsupported_blends = {}
        def visit(id_, ancestors=()):
            require(id_ not in ancestors and len(ancestors) < 32, 'Recursive source display object')
            if id_ in shapes or id_ in clips or id_ in modifiers or id_ in text_fields:
                return
            if id_ in scene.shapes:
                shapes.add(id_)
                textures.update(t for t, _ in scene.commands(id_))
            elif id_ in scene.modifiers:
                modifiers.add(id_)
            elif id_ in scene.textfields:
                text_fields.add(id_)
            else:
                c = scene.clip(id_)
                clips.add(id_)
                blend_modes.update(c['blending'])
                unsupported = sorted(set(c['blending']) - {0, 4, 8})
                if unsupported:
                    unsupported_blends[str(id_)] = unsupported
                for child in c['children']:
                    visit(child, (*ancestors, id_))
        for id_ in export_ids.values():
            visit(id_)
        inventory = dict(source='sc/buildings.sc', exports=export_ids, clipCount=len(clips), shapeCount=len(shapes), blendModes=sorted(blend_modes),
                         unsupportedBlendClips=dict(sorted(unsupported_blends.items())), modifierIds=sorted(modifiers), textFieldIds=sorted(text_fields),
                         textures=[dict(index=t, file='sc/' + scene.textures[t]['external'], width=scene.textures[t]['width'], height=scene.textures[t]['height']) for t in sorted(textures)])
        native = dict(clientVersion=fingerprint['version'], bundle=BUNDLE, sources=PINS, name=name,
                      rows=rows, levels=levels, miniLevels=dict(name=mini_name, rows=mini), effects=effects, particles=particles, artInventory=inventory)
        catalogue = []
        for row in levels:
            n = lambda key: int(row.get(key, '0'))
            level = dict(level=n('BuildingLevel'), hp=n('Hitpoints'), size=[n('Width'), n('Height')],
                         townhall=n('TownHallLevel'), buildResource=row['BuildResource'], cost=n('BuildCost'),
                         seconds=n('BuildTimeD') * 86400 + n('BuildTimeH') * 3600 + n('BuildTimeM') * 60 + n('BuildTimeS'),
                         art={k: v for k, v in row.items() if 'ExportName' in k or k == 'SWF'})
            if folder == 'inferno':
                level['weapon'] = dict(intervalMs=n('AttackSpeed'), rangeSource=n('AttackRange'), alternateRangeSource=n('AltAttackRange'),
                    dps=[n('DPS'), n('DPSLv2'), n('DPSLv3')], switchTimesMs=[n('Lv2SwitchTime'), n('Lv3SwitchTime')],
                    alternateTargets=n('AltNumMultiTargets'), alternatePickNewTargetDelay=n('AlternatePickNewTargetDelay'),
                    ammoCount=n('AmmoCount'), ammoCost=n('AmmoCost'), ammoResource=row['AmmoResource'],
                    airTargets=row['AirTargets'] == 'TRUE', groundTargets=row['GroundTargets'] == 'TRUE',
                    alternateAirTargets=row['AltAirTargets'] == 'TRUE', alternateGroundTargets=row['AltGroundTargets'] == 'TRUE',
                    increasingDamage=row['IncreasingDamage'] == 'TRUE')
            else:
                level['production'] = dict(resource=row['ProducesResource'], per100Hours=n('ResourcePer100Hours'), capacity=n('ResourceMax'))
            catalogue.append(level)
        documents[f'reference/{folder}/native.json'] = native
        documents[f'reference/{folder}/catalog.json'] = dict(name=name, globalId=int(levels[0]['GlobalID']), levels=catalogue)
    return documents

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for path, document in build().items():
        target = ROOT / path
        data = json.dumps(document, indent=2) + '\n'
        if args.check:
            require(target.read_text() == data, 'Source catalogue differs: ' + path)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(data)
    print(('Verified' if args.check else 'Wrote') + ' all Inferno Tower and Dark Elixir Drill source levels, mini-level rows and effects')
