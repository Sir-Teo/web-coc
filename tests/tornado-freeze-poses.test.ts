import { describe, expect, it } from 'vitest';
import { nativeVertices, type NativeScenePose } from '../src/game/native-mesh';
import type { TornadoVortex } from '../src/game/tornado-trap';
import type { FreezeCast } from '../src/game/freeze-trap';
import {
  TORNADO_DEPTH,
  TORNADO_GRAPH,
  tornadoBodyPose,
  tornadoEffectPoses,
  tornadoSoundCues,
} from '../src/game/tornado-trap-poses';
import {
  FREEZE_TRIGGER_DURATION,
  freezeEffectPoses,
  freezeSoundCues,
  freezeTrapPoses,
} from '../src/game/freeze-trap-poses';

function vertices(poses: NativeScenePose[]): number[][] {
  return poses.flatMap((p) => ('group' in p ? vertices(p.group) : [nativeVertices(p)]));
}
const vortex: TornadoVortex = {
  trapId: 7,
  level: 3,
  x: 10.5,
  y: 12.5,
  activatedAt: 1,
  castAt: 1 + 8 / 24,
  firstHitAt: 1 + 8 / 24 + 0.375,
  endAt: 1 + 8 / 24 + 0.375 + 55 * 0.128,
  hits: 0,
  caught: [],
};
const cast: FreezeCast = {
  trapId: 8,
  x: 21,
  y: 21,
  activatedAt: 2,
  castAt: 2 + 14 / 24,
  hitAt: 2 + 14 / 24 + 0.01,
  hit: false,
  frozen: [],
};
const point = { x: 400, y: 300 };

describe('Tornado Trap presentation state', () => {
  it('draws the setup body, the looping triggered whirl on the ground, then the spent tier body', () => {
    expect(tornadoBodyPose(1, undefined, 3).export).toBe('tornado_trap_setup_lvl1');
    expect(tornadoBodyPose(2, undefined, 3).export).toBe('tornado_trap_setup_lvl2');
    const trigger = tornadoBodyPose(3, vortex, 1 + 8 / 24);
    expect(trigger).toMatchObject({ export: 'tornado_trap_lvl2', ground: true });
    expect(vertices(trigger.poses)).toEqual(
      vertices(tornadoBodyPose(3, vortex, 1 + 8 / 24 + 1e-7).poses),
    );
    // After the Init label the 605-frame Attack section loops, never replaying the reveal.
    const clip = TORNADO_GRAPH.clips[TORNADO_GRAPH.exports.tornado_trap_lvl2];
    expect(clip.timeline).toHaveLength(614);
    expect(
      vertices(tornadoBodyPose(3, { ...vortex, endAt: 99 }, 1 + (9 + 605) / 24).poses),
    ).toEqual(vertices(tornadoBodyPose(3, { ...vortex, endAt: 99 }, 1 + 9 / 24).poses));
    for (const [elapsed, reduced, finished] of [
      [vortex.endAt, false, false],
      [2, true, false],
      [2, false, true],
    ] as const)
      expect(tornadoBodyPose(3, vortex, elapsed, reduced, finished)).toMatchObject({
        export: 'tornado_trap_unarmed_lvl2',
        ground: false,
      });
  });

  it('layers the reveal, shadow, machine, wind and overlays by source layer, then clears at expiry', () => {
    const reveal = tornadoEffectPoses(vortex, 1.1, point).map((p) => p.emitter);
    expect(reveal).toContain('gen_appear_fx');
    expect(reveal).toContain('Grass');
    const active = tornadoEffectPoses(vortex, vortex.castAt + 0.35, point);
    const depth = Object.fromEntries(active.map((p) => [p.emitter, p.depth]));
    expect(depth).toMatchObject({
      e_trap_TornadoTrap_Shadow: TORNADO_DEPTH.shadow,
      e_trap_TornadoTrap_Model: TORNADO_DEPTH.model,
      e_trap_TornadoTrap_Wind: TORNADO_DEPTH.wind,
      e_trap_TornadoTrap_WindStart: TORNADO_DEPTH.wind,
      e_trap_TornadoTrap_WindOverlay: TORNADO_DEPTH.top,
      e_trap_TornadoTrap_branches: TORNADO_DEPTH.top,
    });
    expect(active.filter((p) => p.emitter === 'e_trap_TornadoTrap_branches')).toHaveLength(8);
    // WindOverlay starts after its source 300 ms emitter delay.
    expect(
      tornadoEffectPoses(vortex, vortex.castAt + 0.29, point).map((p) => p.emitter),
    ).not.toContain('e_trap_TornadoTrap_WindOverlay');
    expect(tornadoEffectPoses(vortex, vortex.castAt + 5.3, point).map((p) => p.emitter)).toContain(
      'e_trap_TornadoTrap_Model',
    );
    expect(tornadoEffectPoses(vortex, vortex.castAt + 5.68, point)).toEqual([]);
  });

  it('keeps one static wind marker under reduced motion without changing battle state', () => {
    const before = JSON.stringify(vortex);
    const a = tornadoEffectPoses(vortex, vortex.castAt + 1, point, true),
      b = tornadoEffectPoses(vortex, vortex.castAt + 4, point, true);
    expect(a.map((p) => p.emitter)).toEqual(['e_trap_TornadoTrap_Wind']);
    expect(vertices(a[0].poses)).toEqual(vertices(b[0].poses));
    expect(JSON.stringify(vortex)).toBe(before);
  });

  it('dispatches the reveal and deploy samples with stable source pitch draws', () => {
    const cues = tornadoSoundCues(vortex);
    expect(cues.map(({ key, sample, at, volume }) => ({ key, sample, at, volume }))).toEqual([
      { key: 'tornado:7:appear:0', sample: 'tornado-shrink_spell_03.ogg', at: 1, volume: 0.9 },
      {
        key: 'tornado:7:deploy:0',
        sample: 'tornado-total_suckage_01.ogg',
        at: vortex.castAt,
        volume: 0.8,
      },
    ]);
    expect(cues[0].pitch).toBe(1);
    expect(cues[1].pitch).toBeGreaterThanOrEqual(0.96);
    expect(cues[1].pitch).toBeLessThanOrEqual(1.04);
    expect(tornadoSoundCues({ ...vortex, hits: 55 })).toEqual(cues);
  });
});

describe('Goblin Freeze Trap presentation state', () => {
  it('keeps the compartment while the separate bottle rises, then leaves the spent compartment', () => {
    const armed = vertices(freezeTrapPoses(undefined, 0)),
      spent = vertices(freezeTrapPoses(cast, 10));
    expect([armed.length, spent.length]).toEqual([1, 1]);
    expect(spent).not.toEqual(armed);
    expect(FREEZE_TRIGGER_DURATION).toBe(14 / 24);
    for (let frame = 0; frame < 13; frame++) {
      const poses = vertices(freezeTrapPoses(cast, 2 + frame / 24));
      expect(poses).toHaveLength(2);
      expect(poses[0]).toEqual(spent[0]);
    }
    expect(vertices(freezeTrapPoses(cast, 2 + 13 / 24))).toEqual(spent);
    expect(vertices(freezeTrapPoses(cast, 2.1, true))).toEqual(spent);
    expect(vertices(freezeTrapPoses(cast, 2.1, false, true))).toEqual(spent);
  });

  it('plays both deploy effects from deployment, overlaying the second effect above troops', () => {
    expect(freezeEffectPoses(cast, cast.castAt - 0.01, point).map((p) => p.emitter)).not.toContain(
      'Freeze_glow_blue_lvl1',
    );
    const burst = freezeEffectPoses(cast, cast.castAt + 0.1, point);
    const emitters = new Set(burst.map((p) => p.emitter));
    for (const name of [
      'Freeze_glow_blue_lvl1',
      'Freeze1_lvl1',
      'Freeze2_lvl1',
      'Freeze3_lvl1',
      'Freeze_dots1_lvl1',
      'Freeze_dots2_lvl1',
      'Freeze_crystal_lvl1',
    ])
      expect(emitters.has(name)).toBe(true);
    expect(
      burst.filter((p) => p.emitter === 'Freeze_crystal_lvl1').every((p) => p.depth === 8000),
    ).toBe(true);
    expect(
      burst.filter((p) => p.emitter === 'Freeze_glow_blue_lvl1').every((p) => p.depth === -870),
    ).toBe(true);
    expect(freezeEffectPoses(cast, cast.castAt + 3, point, true).map((p) => p.emitter)).toEqual([]);
    expect(freezeEffectPoses(cast, cast.castAt + 1, point, true).map((p) => p.emitter)).toEqual([
      'Freeze_glow_blue_lvl1',
    ]);
    expect(freezeEffectPoses(cast, cast.castAt + 3, point)).toEqual([]);
  });

  it('dispatches the reveal and freeze samples once', () => {
    expect(freezeSoundCues(cast)).toEqual([
      { key: 'freeze:8:appear:0', sample: 'freeze-bad_move_06.ogg', at: 2, volume: 0.8, pitch: 1 },
      {
        key: 'freeze:8:deploy:0',
        sample: 'freeze-freeze_spell_01.ogg',
        at: cast.castAt,
        volume: 0.8,
        pitch: 0.9,
      },
    ]);
  });
});
