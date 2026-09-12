import raw from '../../reference/bombtower/effects.json';
import art from '../../reference/bombtower/particle_art.json';
import combat from '../../reference/bombtower/combat.json';
import {
  nativeScenePoses,
  type NativeMatrix,
  type NativeMeshGraph,
  type NativeScenePose,
} from './native-mesh';
import { visualRandom } from './visual-random';
import { BOMB_TOWER_ART } from './bomb-tower-art';
import { bombProjectilePose } from './bomb-tower-poses';
import type { BombTowerShot } from './bomb-tower-attack';
import type { SampleCue } from './sample-audio';

type Row = Record<string, string>;
type Point = { x: number; y: number };
export type BombTowerHandling = 'pickup' | 'place';
export const BOMB_TOWER_EFFECTS = raw.effects as Record<string, Row[]>;
export const BOMB_TOWER_EMITTERS = raw.particles as Record<string, Row[]>;
export const BOMB_TOWER_SOUNDS = raw.sounds;
export const BOMB_TOWER_PARTICLES = art as unknown as NativeMeshGraph;
export interface BombTowerEffectPose {
  key: string;
  emitter: string;
  poses: NativeScenePose[];
  x: number;
  y: number;
  depth: number;
}
const n = (r: Row, k: string) => Number(r[k] ?? 0);
const clamp = (t: number) => Math.max(0, Math.min(1, t));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const handlingEffect = (kind: BombTowerHandling) =>
  kind === 'pickup' ? 'Mortar Pickup' : 'Mortar Placing';
export const bombTowerSample = (path: string) =>
  `bombtower-${path.split('/').at(-1)!.replace('.ogg', '')}`;
export const bombTowerHitEffect = (level: number) => combat.levels[level - 1].hitEffect;
export const bombTowerDestroyedEffect = (level: number, armed: boolean) =>
  armed ? combat.levels[level - 1].destroyedEffect : 'Building Destroyed';

/** Preserve explicit spawned effects and their delays; native row/instance selection is unverified. */
function sources(name: string, delay = 0): { name: string; delay: number; rows: Row[] }[] {
  const rows = BOMB_TOWER_EFFECTS[name];
  return [
    { name, delay, rows },
    ...rows.flatMap((r) =>
      r.SpawnEffect ? sources(r.SpawnEffect, delay + n(r, 'SpawnEffectDelay') / 1000) : [],
    ),
  ];
}
export function bombTowerSoundCues(
  id: number,
  event: string,
  index: number,
  effect: string,
  at: number,
): SampleCue[] {
  return sources(effect).flatMap((source, group) =>
    source.rows.flatMap((row, i) =>
      !row.Sound
        ? []
        : [
            {
              key: `bombtower:${id}:${event}:${index}:${group}:${i}`,
              sample: bombTowerSample(row.Sound),
              at: at + source.delay + n(row, 'SoundDelay') / 1000,
              volume: n(row, 'Volume') / 100,
              pitch:
                mix(
                  n(row, 'MinPitch'),
                  n(row, 'MaxPitch'),
                  visualRandom(id, index, 50000 + group * 100 + i),
                ) / 100,
            },
          ],
    ),
  );
}
export const bombTowerHandlingCues = (
  id: number,
  index: number,
  kind: BombTowerHandling,
  at: number,
) => bombTowerSoundCues(id, `home-${kind}`, index, handlingEffect(kind), at);

/** Source ranges with local continuous damping; native inertia/slowdown equations are unverified. */
export function bombParticleTravel(speed: number, inertia: number, slowdown: number, age: number) {
  const time = inertia > 0 ? Math.log1p(inertia * age) / inertia : age;
  const moving = slowdown > 0 ? Math.min(time, speed / slowdown) : time;
  return Math.max(0, speed * moving - (slowdown * moving * moving) / 2);
}
function particle(
  key: string,
  emitter: string,
  rows: Row[],
  age: number,
  ground: Point,
  random: (slot: number) => number,
  layer: string,
  reduced: boolean,
  parentAngle = 0,
): BombTowerEffectPose | undefined {
  const row = rows[0],
    life = mix(n(row, 'MinLife'), n(row, 'MaxLife'), random(0)) / 1000;
  if (age < 0 || age >= life) return;
  if (
    reduced &&
    !['bomb_crater', 'bomb_tower_area_edge', 'Super_ground_bomb_area'].includes(emitter)
  )
    return;
  const variant = rows[Math.floor(random(1) * rows.length)],
    name = variant.ParticleExportName;
  const phase = reduced ? 0.5 : clamp(age / life);
  const scale =
    (((BOMB_TOWER_ART.scale * mix(n(row, 'StartScale'), n(row, 'EndScale'), phase)) / 100) *
      mix(n(row, 'ScaleRandomMin'), n(row, 'ScaleRandomMax'), random(2))) /
    100;
  const horizontal =
    (mix(n(row, 'MinHorizAngle'), n(row, 'MaxHorizAngle'), random(3)) * Math.PI) / 180;
  const vertical = (mix(n(row, 'MinVertAngle'), n(row, 'MaxVertAngle'), random(4)) * Math.PI) / 180;
  const speed = mix(n(row, 'MinSpeed'), n(row, 'MaxSpeed'), random(5));
  const radius = mix(n(row, 'StartRadiusMin'), n(row, 'StartRadiusMax'), random(6));
  const radiusAngle = random(7) * Math.PI * 2;
  const distance = reduced
    ? 0
    : bombParticleTravel(speed, n(row, 'Inertia'), n(row, 'Slowdown'), age);
  const x =
    n(row, 'StartX') +
    Math.cos(radiusAngle) * radius +
    Math.cos(horizontal) * Math.cos(vertical) * distance;
  const y =
    n(row, 'StartY') +
    Math.sin(radiusAngle) * radius +
    Math.sin(horizontal) * Math.cos(vertical) * distance;
  const gravity = n(row, 'Gravity'),
    z0 = n(row, 'StartZ');
  const dampedTime =
    n(row, 'Inertia') > 0 ? Math.log1p(n(row, 'Inertia') * age) / n(row, 'Inertia') : age;
  const velocity =
    Math.max(0, speed - n(row, 'Slowdown') * dampedTime) / (1 + n(row, 'Inertia') * age);
  let z = z0 + Math.sin(vertical) * distance - (gravity * age * age) / 2;
  let verticalSpeed = Math.sin(vertical) * velocity - gravity * age;
  if (row.BounceFromGround === 'TRUE' && z < 0 && gravity > 0) {
    // Solve the first floor crossing of this same damped trajectory, then make
    // one local 35% rebound. Native restitution is not in the source table.
    let low = 0,
      high = age;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      const height =
        z0 +
        Math.sin(vertical) * bombParticleTravel(speed, n(row, 'Inertia'), n(row, 'Slowdown'), mid) -
        (gravity * mid * mid) / 2;
      if (height > 0) low = mid;
      else high = mid;
    }
    const hit = (low + high) / 2,
      after = age - hit;
    const time =
      n(row, 'Inertia') > 0 ? Math.log1p(n(row, 'Inertia') * hit) / n(row, 'Inertia') : hit;
    const velocity = Math.max(0, speed - n(row, 'Slowdown') * time) / (1 + n(row, 'Inertia') * hit);
    const rebound = Math.max(0, gravity * hit - velocity * Math.sin(vertical)) * 0.35;
    z = Math.max(0, rebound * after - (gravity * after * after) / 2);
    verticalSpeed = z > 0 ? rebound - gravity * after : 0;
  }
  let angle =
    ((mix(n(row, 'StartAngleMin'), n(row, 'StartAngleMax'), random(8)) +
      mix(n(row, 'MinRotate'), n(row, 'MaxRotate'), random(9)) * (reduced ? 0 : age)) *
      Math.PI) /
    180;
  if (row.OrientToParentType === 'HorizontalAngle') angle += parentAngle;
  if (row.OrientToMovement === 'TRUE') {
    const vx = Math.cos(horizontal) * Math.cos(vertical) * velocity,
      vy = Math.sin(horizontal) * Math.cos(vertical) * velocity;
    angle += Math.atan2((vx + vy) * 0.16 - verticalSpeed * 0.8, (vx - vy) * 0.32);
  }
  const c = Math.cos(angle) * scale,
    sn = Math.sin(angle) * scale;
  const root: NativeMatrix = [c, -sn, 0, sn, c, emitter === 'bomb_crater' ? -42 * scale : 0];
  const clip = BOMB_TOWER_PARTICLES.clips[BOMB_TOWER_PARTICLES.exports[name]];
  const seconds =
    row.ScaleTimeline === 'TRUE' ? (phase * clip.timeline.length) / clip.fps : reduced ? 0 : age;
  let alpha = n(row, 'Alpha') / 100;
  for (const field of ['ParticleFadeOutTime', 'FadeOutTime']) {
    const fade = n(row, field) / 1000;
    if (fade) alpha *= clamp((life - age) / fade);
  }
  const fadeIn = n(row, 'FadeInTime') / 1000;
  if (fadeIn) alpha *= clamp(age / fadeIn);
  if (reduced && emitter !== 'bomb_crater') alpha *= 0.25;
  if (alpha <= 0) return;
  let poses = nativeScenePoses(BOMB_TOWER_PARTICLES, name, seconds, {}, root);
  if (variant.AdditiveBlend === 'TRUE' && !reduced)
    poses = [
      {
        key: name + ':emitter',
        group: poses,
        blend: 8,
        multiply: [1, 1, 1, alpha],
        add: [0, 0, 0, 0],
      },
    ];
  else
    poses = poses.map((p) => ({
      ...p,
      multiply: [...p.multiply.slice(0, 3), p.multiply[3] * alpha],
    }));
  const groundLayer = layer === 'Ground' || row.IsIsoParticle === 'TRUE';
  return {
    key,
    emitter,
    poses,
    x: ground.x + (x - y) * 0.32,
    y: ground.y + (x + y) * 0.16 - (emitter === 'bomb_crater' || reduced ? 0 : z * 0.8),
    depth: groundLayer
      ? -870
      : emitter === 'Grass'
        ? ground.y + (x + y) * 0.16
        : layer === 'Top'
          ? 8000
          : ground.y + (x + y) * 0.16 + 1,
  };
}

export function bombTowerEffectPoses(
  id: number,
  event: string,
  index: number,
  effect: string,
  at: number,
  elapsed: number,
  ground: Point,
  reduced: boolean,
): BombTowerEffectPose[] {
  const result: BombTowerEffectPose[] = [];
  for (const [group, source] of sources(effect).entries())
    for (const [emitterIndex, effectRow] of source.rows.entries()) {
      const name = effectRow.ParticleEmitter;
      // The original exposed charge has its own gameplay-fuse registration and lifecycle.
      if (!name || name.startsWith('Bomb Tower Bomb Appear')) continue;
      const rows = BOMB_TOWER_EMITTERS[name],
        row = rows[0],
        count = n(row, 'ParticleCount');
      const age = elapsed - at - source.delay - n(effectRow, 'EmitterDelayMs') / 1000;
      if (age < 0 || age >= (n(row, 'EmissionTime') + n(row, 'MaxLife')) / 1000) continue;
      for (let i = 0; i < count; i++) {
        const key = `${id}:${event}:${index}:${group}:${emitterIndex}:${i}`;
        const pose = particle(
          key,
          name,
          rows,
          age - ((n(row, 'EmissionTime') / 1000) * i) / count,
          ground,
          (slot) =>
            visualRandom(id, index, 1000000 + group * 100000 + emitterIndex * 1000 + i * 16 + slot),
          source.rows[0].IsoLayer,
          reduced,
        );
        if (pose) result.push(pose);
      }
    }
  return result;
}
export const bombTowerHandlingPoses = (
  id: number,
  index: number,
  kind: BombTowerHandling,
  at: number,
  elapsed: number,
  ground: Point,
  reduced: boolean,
) =>
  bombTowerEffectPoses(
    id,
    `home-${kind}`,
    index,
    handlingEffect(kind),
    at,
    elapsed,
    ground,
    reduced,
  );

/** Continuous trail births remain at their sampled flight positions after landing. */
export function bombTowerTrailPoses(
  id: number,
  level: number,
  shot: BombTowerShot,
  elapsed: number,
  iso: (x: number, y: number) => Point,
): BombTowerEffectPose[] {
  const rows = BOMB_TOWER_EMITTERS.mortar_trail,
    row = rows[0];
  if (elapsed < shot.at || elapsed >= shot.impact + n(row, 'MaxLife') / 1000) return [];
  const interval = n(row, 'EmissionTime') / 1000 / n(row, 'ParticleCount');
  const projectile = { ...shot, launched: shot.at };
  const from = iso(shot.fromX, shot.fromY),
    to = iso(shot.x, shot.y);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const result: BombTowerEffectPose[] = [];
  for (let i = 0; shot.at + i * interval < Math.min(elapsed + 1e-9, shot.impact); i++) {
    const at = shot.at + i * interval,
      point = bombProjectilePose(level, projectile, at, iso);
    const pose = particle(
      `${id}:trail:${shot.index}:${i}`,
      'mortar_trail',
      rows,
      elapsed - at,
      point,
      (slot) => visualRandom(id, shot.index, 200000 + i * 10 + slot),
      'Top',
      false,
      angle,
    );
    if (pose) result.push(pose);
  }
  return result;
}
