#!/usr/bin/env python3
"""Preserve the original campaign Tornado Trap data, graphics and sounds.

Uses the same pinned public client as the native campaign. The trap bodies and the reveal
effect come from sc/buildings.sc; the spell's current deploy effect (ps_trap_tornadoTrap)
comes from sc/vfx_env.sc. --check reconstructs every output pixel, sound byte and source
record without changing files.
"""
import argparse

from native_art.bundle import BUNDLE, BASE, source
from native_art.late_traps import (effect_closure, emitter_exports, previews, sounds, table, textures,
                                   verify_fingerprint, write)
from native_art.sc6 import SC6, require
from native_art.scene_graph import capture_graph, crop_textures
from native_art.source_csv import inherited_levels

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'sc/buildings.sc': 'f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed',
    'sc/buildings_18.sctx': 'bd0c3b2eece3e9c43b2b3d61463e5b12ff4d274ae6adcc0ce33ceed63df58ffa',
    'sc/buildings_39.sctx': 'dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16',
    'sc/buildings_66.sctx': 'c65a2f6e362edfd51d5fc634d5a6c30ec353bd936fa06fa8775b856aeb7baff0',
    'sc/vfx_env.sc': '8a85e7cfb07c5b92f83a4c944b13a18beb65c1b68dc1fd9ea283aebb3073703e',
    'sc/vfx_env_0.sctx': '79ec17b67253a2fa914ad7db2ea2a66fbfb6015a6c4897cc86ca0753dcea0554',
    'logic/traps.csv': '757ca07de02b26b2071b52bb3cb495df2f0ae879731a859d3102ca3552dd528c',
    'logic/spells.csv': '385159e00327e6a1567cd91f1585b4ed0717d3f4475f0823398243482598289d',
    'logic/globals.csv': '16210fc28bfb86d00ea04d581a99fe98e128172017b2d4f637b8848c0cf20087',
    'logic/effects.csv': '5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f',
    'csv/particle_emitters.csv': '8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef',
    'sfx/shrink_spell_03.ogg': '10780435f565ac93ddda10e02f5983f67682ec06bb631ae8bc56a0992d689081',
    'sfx/total_suckage_01.ogg': '1058f4a72544219ad4d6489e742091fd73da539badb0ee67f03177a606ce7385',
}
PREFIX = 'assets/buildings/tornado-trap-native'
BODY_FIELDS = ['ExportName', 'ExportNameBuildAnim', 'ExportNameBroken', 'BigPicture', 'ExportNameTriggered']
EFFECT_FIELDS = ['AppearEffect', 'EffectBroken', 'DamageEffect', 'PickUpEffect', 'PlacingEffect']


def build():
    verify_fingerprint(PINS)
    traps = {'Tornado Trap': table('logic/traps.csv', PINS)['Tornado Trap']}
    rows = traps['Tornado Trap']
    require(rows[0]['GlobalID'] == '12000016' and [r['Level'] for r in rows] == ['1', '2', '3'], 'Trap identity differs')
    levels = inherited_levels(rows)
    require({r['Spell'] for r in levels} == {'Tornado Trap'}, 'Trap spell differs')
    spells = {'Tornado Trap': table('logic/spells.csv', PINS)['Tornado Trap']}
    require(spells['Tornado Trap'][0]['GlobalID'] == '26000025' and len(spells['Tornado Trap']) == 3, 'Spell differs')
    spell_levels = inherited_levels(spells['Tornado Trap'])
    globals_ = {'TORNADO_SIEGE_FORCE_TIER': table('logic/globals.csv', PINS)['TORNADO_SIEGE_FORCE_TIER']}
    all_effects = table('logic/effects.csv', PINS)
    # Home-village effects keep their source rows; only battle effects import art and sound.
    referenced = {r[k] for r in levels for k in EFFECT_FIELDS if r.get(k)}
    battle = {levels[0]['AppearEffect']} | {r['DeployEffect'] for r in spell_levels}
    require(battle == {'Shrink Trap Appear', 'ps_trap_tornadoTrap'}, 'Battle effects differ')
    effects = effect_closure(referenced | battle, all_effects)
    battle_effects = {k: v for k, v in effects.items() if k in battle}
    all_particles = table('csv/particle_emitters.csv', PINS)
    names = sorted({r['ParticleEmitter'] for rows_ in battle_effects.values() for r in rows_ if r.get('ParticleEmitter')})
    particles = {name: all_particles[name] for name in names}

    world_exports = {r[k] for r in levels for k in BODY_FIELDS}
    require(world_exports == {'tornado_trap_setup_lvl1', 'tornado_trap_setup_lvl2', 'tornado_trap_unarmed_lvl1',
                              'tornado_trap_unarmed_lvl2', 'tornado_trap_lvl1', 'tornado_trap_lvl2'}, 'Body exports differ')
    for rows_ in battle_effects.values():
        for r in rows_:
            if r.get('ExportName'):
                require(r['SWF'] == 'sc/buildings.sc', 'Unexpected direct effect source')
                world_exports.add(r['ExportName'])
    world_exports |= emitter_exports(particles, 'sc/buildings.sc')
    vfx_exports = emitter_exports(particles, 'sc/vfx_env.sc')
    require(emitter_exports(particles, 'sc/buildings.sc') | vfx_exports ==
            {r['ParticleExportName'] for rows_ in particles.values() for r in rows_ if r.get('ParticleExportName')},
            'Unexpected particle source')
    sc = SC6(source('sc/buildings.sc', PINS))
    require(world_exports <= sc.exports.keys(), 'Missing original export')
    world = capture_graph(sc, {name: sc.exports[name] for name in sorted(world_exports)})
    world_images = textures(sc, world, PINS)
    require(set(world_images) == {18, 39, 66}, 'Texture membership differs')
    vfx_sc = SC6(source('sc/vfx_env.sc', PINS))
    require(vfx_exports <= vfx_sc.exports.keys(), 'Missing original vfx export')
    vfx = capture_graph(vfx_sc, {name: vfx_sc.exports[name] for name in sorted(vfx_exports)})
    vfx_images = textures(vfx_sc, vfx, PINS)
    require(set(vfx_images) == {0}, 'Vfx texture membership differs')

    outputs, world_textures, runtime = crop_textures(world, world_images, PREFIX + '/texture')
    vfx_outputs, vfx_textures, vfx_runtime = crop_textures(vfx, vfx_images, PREFIX + '/vfx-texture')
    outputs.update(vfx_outputs)
    preview_outputs, preview_rows = previews(world, world_images, {
        'preview-1': (['tornado_trap_setup_lvl1', 'tornado_trap_unarmed_lvl1', 'tornado_trap_setup_lvl2',
                       'tornado_trap_unarmed_lvl2'], 'tornado_trap_setup_lvl1'),
        'preview-2': ([], 'tornado_trap_setup_lvl2'),
    }, PREFIX)
    outputs.update(preview_outputs)
    sound_outputs, sound_rows = sounds(battle_effects, PREFIX, PINS)
    outputs.update(sound_outputs)
    trigger_fps = {world['clips'][str(world['exports'][r['ExportNameTriggered']])]['fps'] for r in levels}
    require(trigger_fps == {24}, 'Trigger clip rate differs')

    native = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS,
                  traps=traps, spells=spells, globals=globals_, effects=effects, particles=particles,
                  world=dict(source='sc/buildings.sc', graph=world, textures=world_textures),
                  vfx=dict(source='sc/vfx_env.sc', graph=vfx, textures=vfx_textures),
                  previews=preview_rows, sounds=sound_rows,
                  reconstruction=dict(
                      liveIntegration=True, nativePlaybackVerified=False,
                      scope='All three Tornado Trap levels, both art tiers, the triggered whirl, the reveal effect, the '
                            'current ps_trap_tornadoTrap deploy effect from sc/vfx_env.sc and its two battle sounds.',
                      preview='Common bounds enclose every setup and unarmed frame of both tiers with eight native '
                              'units of padding; framing is local.',
                      unusedEffects='Home-village pickup, placing, broken and hit effects keep their source rows; '
                                    'their art and sounds are not imported because campaign traps never use them.',
                      timing='ActionFrame=8 on 24 fps trigger clips, spell HitTimeMS=375, TimeBetweenHitsMS=128 and '
                             '39/47/55 hits are retained. Native tick quantization remains unverified; see README.'))
    combat = dict(trap=levels, spell=spell_levels,
                  siegeForceTier=int(globals_['TORNADO_SIEGE_FORCE_TIER'][0]['NumberValue']),
                  triggerFps=24)
    return outputs, dict(native=native, runtime=runtime, **{'vfx-runtime': vfx_runtime}, combat=combat,
                         effects=dict(effects=battle_effects, particles=particles, sounds=sound_rows))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, references = build()
    write(outputs, references, PREFIX, 'reference/tornado-trap', args.check, 'Tornado Trap')


if __name__ == '__main__': main()
