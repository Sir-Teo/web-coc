#!/usr/bin/env python3
"""Build shared lazy-loadable packs for the client effects and particle emitters used by battle art.

References come from every battle projectile row (Effect, SpawnEffect, DestroyedEffect, BounceEffect and
the trail ParticleEmitter) and from the Town Hall 11-18 defenses and new traps (building, weapon, spell,
special-ability animation and trap effect columns). Each effect pack keeps its logic/effects.csv rows,
SpawnEffect chain, every csv/particle_emitters.csv record it names, and the SC exports those rows play.
Effects that declare only sounds produce no pack and are listed under ``noArt``.

    PYTHONPATH=scripts output/native-art-venv/bin/python scripts/import-native-effect-art.py [--check]
"""
import argparse
import importlib.util
import json

from native_art.bundle import ROOT
from native_art.effect_library import (BUILDING_EFFECTS, PROJECTILE_EFFECTS, SPELL_EFFECTS, TRAP_EFFECTS, WEAPON_EFFECTS,
                                       Collector, Library, sync_pack_dirs, unique_ids, write_pack)
from native_art.sc6 import require

OUTPUT = ROOT / 'public/assets/effects-native'
INDEX = ROOT / 'reference/full-client/effect-art.json'
PREFIX = 'assets/effects-native'
NOTES = dict(
    emission='ParticleCount particles are born evenly over EmissionTime after EmitterDelayMs; each follows the shared '
             'source-particle interpretation in src/game/native-particles.ts (documented local damping and bounce).',
    targeted='Targeted/Beam effect art is stretched along its source x extent between the attacker and the target; '
             'the native beam attachment and stretching rules are not in the tables.',
    sounds='Sound columns are retained in the rows; this pipeline does not play them.')


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / file)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def references(lib):
    effects, emitters = [], []

    def add(name, into):
        if name and name not in into:
            into.append(name)
    for row in lib.projectile_rows().values():
        for column in PROJECTILE_EFFECTS:
            add(row.get(column), effects)
        add(row.get('ParticleEmitter'), emitters)
    for entry in lib.defense_references().values():
        for level in entry['levels']:
            for column in BUILDING_EFFECTS + TRAP_EFFECTS:
                add(level.get(column), effects)
        for rows in entry['weapons'].values():
            for row in rows:
                for column in WEAPON_EFFECTS:
                    add(row.get(column), effects)
        for rows in entry['spells'].values():
            for row in rows:
                for column in SPELL_EFFECTS:
                    add(row.get(column), effects)
        for rows in entry['abilities'].values():
            for row in rows:
                for event in row['animation']:
                    add(event.get('Effect'), effects)
    return effects, emitters


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    art = module('art', 'native-full-catalog.py')
    lib = Library(art)
    effects, emitters = references(lib)
    groups, order, no_art = {}, [], []

    def join(kind, name, collector):
        # Records that play exactly the same exports share one pack (and its cropped texels).
        key = json.dumps({k: sorted(v) for k, v in sorted(collector.exports.items())})
        if key not in groups:
            groups[key] = dict(collector=collector, effects=[], emitters=[])
            order.append(key)
        else:
            groups[key]['collector'].effects.update(collector.effects)
            groups[key]['collector'].emitters.update(collector.emitters)
        groups[key]['effects' if kind == 'effect' else 'emitters'].append(name)
    for name in effects:
        collector = Collector(lib)
        collector.effect(name)
        require(not collector.missing, f'{name}: missing source records {collector.missing}')
        if not collector.exports:
            no_art.append(name)
            continue
        join('effect', name, collector)
    for name in emitters:
        collector = Collector(lib)
        collector.emitter(name)
        require(not collector.missing and collector.exports, f'{name}: missing particle emitter art')
        join('emitter', name, collector)
    first = lambda group: group['effects'][0] if group['effects'] else 'emitter-' + group['emitters'][0]
    ids = unique_ids([first(groups[key]) for key in order])
    packs, index_effects, index_emitters = {}, {}, {}
    for key in order:
        group = groups[key]
        pack_id = ids[first(group)]
        result = write_pack(lib, group['collector'], OUTPUT / pack_id, f'{PREFIX}/{pack_id}', dict(kind='effects'),
                            args.check)
        packs[pack_id] = dict(path=f'{PREFIX}/{pack_id}/graph.json', sha256=result['sha256'], bytes=result['bytes'],
                              **({'skipped': result['skipped']} if result['skipped'] else {}))
        for name in group['effects']:
            index_effects[name] = pack_id
        for name in group['emitters']:
            index_emitters[name] = pack_id
    sync_pack_dirs(OUTPUT, packs, args.check)
    total = sum(p['bytes'] for p in packs.values())
    index = dict(clientVersion='18.400.21', generator='scripts/import-native-effect-art.py', conventions=NOTES,
                 sources=dict(sorted(art.PINS.items())), totalBytes=total, effects=index_effects,
                 emitters=index_emitters, noArt=sorted(no_art), packs=packs)
    serialized = json.dumps(index, indent=2) + '\n'
    if args.check:
        require(INDEX.read_text() == serialized, 'Effect art index differs')
        print(f'check passed: {len(index_effects)} effects, {len(index_emitters)} emitters, {total:,} bytes')
    else:
        INDEX.write_text(serialized)
        print(f'{len(index_effects)} effects and {len(index_emitters)} emitters in {len(packs)} packs '
              f'({len(no_art)} sound-only effects), {total:,} bytes')


if __name__ == '__main__':
    main()
