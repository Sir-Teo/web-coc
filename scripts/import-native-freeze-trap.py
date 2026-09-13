#!/usr/bin/env python3
"""Preserve the original campaign Goblin Freeze Trap data, graphics and sounds.

Uses the same pinned public client as the native campaign. The campaign identity
FreezeTrap_SinglePlayer (12000018) and the calendar FreezeBomb (12000009) share their art and
the FreezeTrap spell; both records are retained. --check reconstructs every output pixel, sound
byte and source record without changing files.
"""
import argparse

from native_art.bundle import BUNDLE, BASE, source
from native_art.late_traps import (effect_closure, emitter_exports, previews, sounds, table, textures,
                                   verify_fingerprint, write)
from native_art.sc6 import SC6, require
from native_art.scene_graph import capture_graph, crop_textures

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'sc/buildings.sc': 'f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed',
    'sc/buildings_18.sctx': 'bd0c3b2eece3e9c43b2b3d61463e5b12ff4d274ae6adcc0ce33ceed63df58ffa',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
    'sc/buildings_66.sctx': 'c65a2f6e362edfd51d5fc634d5a6c30ec353bd936fa06fa8775b856aeb7baff0',
    'logic/traps.csv': '757ca07de02b26b2071b52bb3cb495df2f0ae879731a859d3102ca3552dd528c',
    'logic/spells.csv': '385159e00327e6a1567cd91f1585b4ed0717d3f4475f0823398243482598289d',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'csv/particle_emitters.csv': '8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef',
    'sfx/bad_move_06.ogg': '8cd8ba9ed2b8605e72f0c36c1d8308adb3f784a2040f53f036b93323de9f3b69',
    'sfx/freeze_spell_01.ogg': '5af71f1c5dd30d27173649ee585021ba0f08572b28097c280bdcaeff11885c50',
}
PREFIX = 'assets/buildings/freeze-trap-native'
BODY_FIELDS = ['ExportName', 'ExportNameBuildAnim', 'ExportNameBroken', 'BigPicture', 'ExportNameTriggered']
EFFECT_FIELDS = ['AppearEffect', 'EffectBroken', 'DamageEffect', 'PickUpEffect', 'PlacingEffect']


def build():
    verify_fingerprint(PINS)
    all_traps = table('logic/traps.csv', PINS)
    traps = {name: all_traps[name] for name in ['FreezeBomb', 'FreezeTrap_SinglePlayer']}
    require([traps[name][0]['GlobalID'] for name in traps] == ['12000009', '12000018'], 'Trap identity differs')
    require(all(len(rows) == 1 for rows in traps.values()), 'Trap levels differ')
    trap = traps['FreezeTrap_SinglePlayer'][0]
    require({r['Spell'] for rows in traps.values() for r in rows} == {'FreezeTrap'}, 'Trap spell differs')
    spells = {'FreezeTrap': table('logic/spells.csv', PINS)['FreezeTrap']}
    require(spells['FreezeTrap'][0]['GlobalID'] == '26000018' and len(spells['FreezeTrap']) == 1, 'Spell differs')
    spell = spells['FreezeTrap'][0]
    all_effects = table('logic/effects.csv', PINS)
    referenced = {r[k] for rows in traps.values() for r in rows for k in EFFECT_FIELDS if r.get(k)}
    battle = {trap['AppearEffect'], spell['DeployEffect'], spell['DeployEffect2']}
    require(battle == {'Bomb Appear', 'Freeze deploy lvl1', 'Freeze deploy2 lvl1'}, 'Battle effects differ')
    effects = effect_closure(referenced | battle, all_effects)
    battle_effects = {k: v for k, v in effects.items() if k in battle}
    all_particles = table('csv/particle_emitters.csv', PINS)
    names = sorted({r['ParticleEmitter'] for rows in battle_effects.values() for r in rows if r.get('ParticleEmitter')})
    particles = {name: all_particles[name] for name in names}

    exports = {r[k] for rows in traps.values() for r in rows for k in BODY_FIELDS}
    require(exports == {'Freeze_trap_armed', 'Freeze_trap_unarmed', 'Freeze_trap_trigger'}, 'Body exports differ')
    for rows in battle_effects.values():
        for r in rows:
            if r.get('ExportName'):
                require(r['SWF'] == 'sc/buildings.sc', 'Unexpected direct effect source')
                exports.add(r['ExportName'])
    particle_exports = emitter_exports(particles, 'sc/buildings.sc')
    require(particle_exports == {r['ParticleExportName'] for rows in particles.values() for r in rows
                                 if r.get('ParticleExportName')}, 'Unexpected particle source')
    exports |= particle_exports
    sc = SC6(source('sc/buildings.sc', PINS))
    require(exports <= sc.exports.keys(), 'Missing original export')
    graph = capture_graph(sc, {name: sc.exports[name] for name in sorted(exports)})
    images = textures(sc, graph, PINS)
    require(set(images) == {18, 39, 66}, 'Texture membership differs')
    outputs, world_textures, runtime = crop_textures(graph, images, PREFIX + '/texture')
    preview_outputs, preview_rows = previews(graph, images, {
        'armed': (['Freeze_trap_armed', 'Freeze_trap_unarmed', 'Freeze_trap_trigger'], 'Freeze_trap_armed'),
        'unarmed': ([], 'Freeze_trap_unarmed'),
    }, PREFIX)
    outputs.update(preview_outputs)
    sound_outputs, sound_rows = sounds(battle_effects, PREFIX, PINS)
    outputs.update(sound_outputs)
    trigger = graph['clips'][str(graph['exports'][trap['ExportNameTriggered']])]
    require((trigger['fps'], len(trigger['timeline'])) == (24, 14), 'Trigger clip differs')

    native = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS,
                  traps=traps, spells=spells, effects=effects, particles=particles,
                  world=dict(source='sc/buildings.sc', graph=graph, textures=world_textures),
                  previews=preview_rows, sounds=sound_rows,
                  reconstruction=dict(
                      liveIntegration=True, nativePlaybackVerified=False,
                      scope='Both original Freeze Trap identities, all body/reveal/deploy/particle exports, the '
                            'FreezeTrap spell fields and two battle sounds.',
                      preview='Common bounds enclose every armed, unarmed and trigger frame with eight native units '
                              'of padding; framing is local.',
                      unusedEffects='Home-village pickup, placing, broken and hit effects keep their source rows; '
                                    'their art and sounds are not imported because campaign traps never use them.',
                      timing='ActionFrame=14 on the 14-frame 24 fps trigger clip, HitTimeMS=10, FreezeTimeMS=5000 and '
                             'FreezeOuterTimeMS=4500 are retained. The distance handoff is documented in README.'))
    combat = dict(trap=trap, spell=spell, triggerFps=trigger['fps'])
    return outputs, dict(native=native, runtime=runtime, combat=combat,
                         effects=dict(effects=battle_effects, particles=particles, sounds=sound_rows))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, references = build()
    write(outputs, references, PREFIX, 'reference/freeze-trap', args.check, 'Goblin Freeze Trap')


if __name__ == '__main__': main()
