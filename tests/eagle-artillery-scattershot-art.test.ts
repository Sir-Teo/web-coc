import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { NativeMeshGraph, NativeMeshPose, NativeScenePose } from '../src/game/native-mesh';
import {
  EAGLE_ARTILLERY_BASE_GRAPH,
  EAGLE_ARTILLERY_GRAPH,
  eagleArtilleryBasePoses,
  eagleArtilleryBeamPoses,
  eagleArtilleryBounds,
  eagleArtilleryLabels,
  eagleArtilleryPoses,
  eagleArtilleryTurretFrame,
} from '../src/game/eagle-artillery-poses';
import {
  EAGLE_ARTILLERY_EFFECT_ROWS,
  EAGLE_ARTILLERY_EMITTERS,
  EAGLE_ARTILLERY_SOUNDS,
} from '../src/game/eagle-artillery-effects';
import { EAGLE_ARTILLERY_ART_LEVELS, eagleArtilleryAsset } from '../src/game/eagle-artillery-art';
import {
  EAGLE_ARTILLERY_BEAMS,
  EAGLE_ARTILLERY_EFFECTS,
  EAGLE_ARTILLERY_EXPORTS,
  EAGLE_ARTILLERY_LEVELS,
} from '../src/game/eagle-artillery-stats';
import type { EagleArtilleryTowerState } from '../src/game/eagle-artillery';
import {
  SCATTERSHOT_GRAPH,
  scattershotBounds,
  scattershotConePoses,
  scattershotPoses,
  scattershotView,
} from '../src/game/scattershot-poses';
import {
  SCATTERSHOT_EFFECT_ROWS,
  SCATTERSHOT_EMITTERS,
  SCATTERSHOT_SOUNDS,
} from '../src/game/scattershot-effects';
import { SCATTERSHOT_ART_LEVELS, scattershotAsset } from '../src/game/scattershot-art';
import {
  SCATTERSHOT_EFFECTS,
  SCATTERSHOT_EXPORTS,
  SCATTERSHOT_LEVELS,
} from '../src/game/scattershot-stats';
import scatterCombat from '../reference/scattershot/combat.json';

const meshes = (poses: NativeScenePose[]): NativeMeshPose[] =>
  poses.flatMap((p) => ('group' in p ? meshes(p.group) : [p]));
/** Non-empty, finite geometry whose every texture page ships with the game. */
function drawable(graph: NativeMeshGraph, poses: NativeScenePose[]) {
  const flat = meshes(poses);
  expect(flat.length).toBeGreaterThan(0);
  for (const p of flat) {
    const texture = graph.textures[String(p.texture)];
    expect(texture, `texture ${p.texture}`).toBeDefined();
    expect(existsSync(`public/${texture.path}`)).toBe(true);
    expect([...p.matrix, ...p.vertices].every(Number.isFinite)).toBe(true);
  }
  return JSON.stringify(flat.map((p) => [p.key, p.matrix.map((v) => Math.round(v * 1000))]));
}
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
function shipsEffects(
  names: string[],
  rows: Record<string, Record<string, string>[]>,
  emitters: Record<string, Record<string, string>[]>,
  sounds: Record<string, { path: string; sha256: string }>,
  external: string[] = [],
) {
  for (const name of names) {
    expect(rows[name], name).toBeDefined();
    for (const row of rows[name]) {
      if (row.ParticleEmitter)
        expect(
          emitters[row.ParticleEmitter] ?? external.includes(row.ParticleEmitter),
          row.ParticleEmitter,
        ).toBeTruthy();
      if (row.Sound && sounds[row.Sound])
        expect(sha256(`public/${sounds[row.Sound].path}`)).toBe(sounds[row.Sound].sha256);
    }
  }
}

describe('original Eagle Artillery art', () => {
  it('composes every level in dormant, activation, awake, attack, load, empty, upgrade and ruin states', () => {
    expect(EAGLE_ARTILLERY_ART_LEVELS).toEqual(EAGLE_ARTILLERY_LEVELS.map((l) => l.level));
    drawable(EAGLE_ARTILLERY_BASE_GRAPH, eagleArtilleryBasePoses());
    drawable(EAGLE_ARTILLERY_GRAPH, eagleArtilleryPoses(1, 'ruin', 0));
    for (const level of EAGLE_ARTILLERY_ART_LEVELS) {
      const row = EAGLE_ARTILLERY_LEVELS[level - 1];
      expect(EAGLE_ARTILLERY_GRAPH.exports[row.body]).toBeDefined();
      expect(EAGLE_ARTILLERY_GRAPH.exports[row.projectileExport]).toBeDefined();
      const labels = eagleArtilleryLabels(level);
      const frames = [
        labels.idle,
        25,
        50,
        75,
        labels.activating_end,
        labels.battleidle_start,
        labels.attack_start,
        labels.load_start,
        labels.empty,
      ];
      const looks = frames.map((frame) =>
        drawable(EAGLE_ARTILLERY_GRAPH, eagleArtilleryPoses(level, 'active', frame)),
      );
      // Dormant, awake and empty turrets are visibly distinct source states.
      expect(new Set([looks[0], looks[5], looks[8]]).size).toBe(3);
      drawable(EAGLE_ARTILLERY_GRAPH, eagleArtilleryPoses(level, 'upgrading', 0));
      const [left, top, right, bottom] = eagleArtilleryBounds(level);
      expect(right - left).toBeGreaterThan(100);
      expect(bottom - top).toBeGreaterThan(100);
      expect(existsSync(`public${eagleArtilleryAsset(level)}`)).toBe(true);
    }
    for (const [kind, beam] of Object.entries(EAGLE_ARTILLERY_BEAMS))
      for (const frame of [beam.labels.warmup, beam.labels.loop, beam.labels.fadeend])
        drawable(
          EAGLE_ARTILLERY_GRAPH,
          eagleArtilleryBeamPoses(kind as keyof typeof EAGLE_ARTILLERY_BEAMS, frame),
        );
    expect(
      [EAGLE_ARTILLERY_EXPORTS.beamUp, EAGLE_ARTILLERY_EXPORTS.beamDown].every(
        (e) => EAGLE_ARTILLERY_GRAPH.exports[e] !== undefined,
      ),
    ).toBe(true);
  });
  it('schedules turret states from recorded activation, launches and emptiness', () => {
    const labels = eagleArtilleryLabels(2);
    const tower = (extra: Partial<EagleArtilleryTowerState>) =>
      ({
        level: 2,
        ammunition: 30,
        wakeMs: 1125,
        stages: [],
        hitMs: 0,
        burstMs: 0,
        cooldownMs: 0,
        searchMs: 0,
        group: [],
        targetId: null,
        reticle: null,
        fired: 0,
        volleys: [],
        ...extra,
      }) as EagleArtilleryTowerState;
    expect(eagleArtilleryTurretFrame(2, tower({}), 5)).toBe(labels.idle);
    // Stages at 1, 2 and 3 s play 25-frame segments in sequence: the third starts at 1 + 50/24 s,
    // so 10 frames (24 fps) have elapsed at 3.5 s.
    expect(eagleArtilleryTurretFrame(2, tower({ stages: [1, 2, 3] }), 3.5)).toBe(61);
    expect(eagleArtilleryTurretFrame(2, tower({ stages: [1, 2, 3] }), 3.5, true)).toBe(75);
    const awake = tower({ stages: [0, 0, 0, 0], awakeAt: 1 });
    expect(eagleArtilleryTurretFrame(2, awake, 1)).toBe(labels.battleidle_start);
    const firing = tower({
      stages: [0, 0, 0, 0],
      awakeAt: 1,
      volleys: [{ index: 0, startedAt: 2, launches: [5, 5.7, 6.5] }],
    });
    expect(eagleArtilleryTurretFrame(2, firing, 5.01)).toBe(labels.attack_start);
    expect(eagleArtilleryTurretFrame(2, firing, 6.6)).toBe(labels.load_start);
    const empty = tower({ ...firing, ammunition: 0, emptyAt: 6.5 });
    expect(eagleArtilleryTurretFrame(2, empty, 9)).toBe(labels.empty);
    expect(eagleArtilleryTurretFrame(2, empty, 6.6, true)).toBe(labels.empty);
  });
  it('ships the pinned battle effects, emitters and sounds', () => {
    shipsEffects(
      Object.values(EAGLE_ARTILLERY_EFFECTS),
      EAGLE_ARTILLERY_EFFECT_ROWS,
      EAGLE_ARTILLERY_EMITTERS,
      EAGLE_ARTILLERY_SOUNDS,
    );
    for (const sound of Object.values(EAGLE_ARTILLERY_SOUNDS))
      expect(sha256(`public/${sound.path}`)).toBe(sound.sha256);
  });
});

describe('original Scattershot art', () => {
  it('composes all 24 aimed throw bands with 15 frames, upgrade and ruin exports', () => {
    expect(SCATTERSHOT_ART_LEVELS).toEqual(SCATTERSHOT_LEVELS.map((l) => l.level));
    drawable(SCATTERSHOT_GRAPH, scattershotPoses(1, 'ruin', 0));
    for (const level of SCATTERSHOT_ART_LEVELS) {
      const row = SCATTERSHOT_LEVELS[level - 1];
      expect(scatterCombat.directions[row.body as keyof typeof scatterCombat.directions]).toEqual({
        views: 24,
        frames: 360,
        framesPerView: 15,
        fps: 30,
      });
      expect(SCATTERSHOT_GRAPH.exports[row.projectileExport]).toBeDefined();
      const full = level === 1 || level === 7;
      const views = new Set<string>();
      for (let view = 0; view < 24; view++)
        for (const frame of full ? [0, 5, 14] : [0]) {
          const look = drawable(
            SCATTERSHOT_GRAPH,
            scattershotPoses(level, 'active', view * 15 + frame),
          );
          if (frame === 0) views.add(look);
        }
      expect(views.size).toBe(24);
      drawable(SCATTERSHOT_GRAPH, scattershotPoses(level, 'upgrading', 0));
      const [left, top, right, bottom] = scattershotBounds(level);
      expect(right - left).toBeGreaterThan(80);
      expect(bottom - top).toBeGreaterThan(80);
      expect(existsSync(`public${scattershotAsset(level)}`)).toBe(true);
    }
    // Throw frames: map +X is view 0 and +Y is view 6 (90 degrees), matching the turret calibration.
    expect([
      scattershotView(1, 0),
      scattershotView(0, 1),
      scattershotView(-1, 0),
      scattershotView(0, -1),
    ]).toEqual([0, 6, 12, 18]);
  });
  it('rotates the original shard cone with the throw direction and ends with its clip', () => {
    const looks = [0, 45, 90, 180, 270].map((degrees) => {
      const r = (degrees * Math.PI) / 180;
      return drawable(SCATTERSHOT_GRAPH, scattershotConePoses(Math.cos(r), Math.sin(r), 0.1));
    });
    expect(new Set(looks).size).toBe(5);
    expect(scattershotConePoses(1, 0, -0.01)).toEqual([]);
    expect(scattershotConePoses(1, 0, 60)).toEqual([]);
    expect(SCATTERSHOT_GRAPH.exports[SCATTERSHOT_EXPORTS.cone]).toBeDefined();
  });
  it('ships the pinned battle effects, emitters and sounds', () => {
    shipsEffects(
      Object.values(SCATTERSHOT_EFFECTS),
      SCATTERSHOT_EFFECT_ROWS,
      SCATTERSHOT_EMITTERS,
      SCATTERSHOT_SOUNDS,
      Object.keys(scatterCombat.externalParticles),
    );
    for (const sound of Object.values(SCATTERSHOT_SOUNDS))
      expect(sha256(`public/${sound.path}`)).toBe(sound.sha256);
  });
});
