import {
  nativeScenePoses,
  type NativeMatrix,
  type NativeMeshGraph,
  type NativeScenePose,
} from './native-mesh';

type Row = Record<string, string>;
type Point = { x: number; y: number };
export interface NativeParticlePose {
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

/** Source ranges with local continuous damping; native inertia/slowdown equations are unverified. */
export function nativeParticleTravel(
  speed: number,
  inertia: number,
  slowdown: number,
  age: number,
) {
  const time = inertia > 0 ? Math.log1p(inertia * age) / inertia : age;
  const moving = slowdown > 0 ? Math.min(time, speed / slowdown) : time;
  return Math.max(0, speed * moving - (slowdown * moving * moving) / 2);
}
/** Shared source-particle interpretation; effect-specific native art and static ground registration. */
export function nativeParticleSampler(
  graph: NativeMeshGraph,
  artScale: number,
  options: {
    reducedEmitters?: readonly string[];
    staticEmitters?: Readonly<Record<string, number>>;
    altitudeScale?: number;
    /** Effective duration for an animated descendant inside a static outer clip. */
    timelineDurations?: Readonly<Record<string, number>>;
  } = {},
) {
  const { reducedEmitters = [], staticEmitters = {}, altitudeScale = 0.8 } = options;
  return function particle(
    key: string,
    emitter: string,
    rows: Row[],
    age: number,
    ground: Point,
    random: (slot: number) => number,
    layer: string,
    reduced: boolean,
    parentAngle = 0,
  ): NativeParticlePose | undefined {
    const row = rows[0],
      life = mix(n(row, 'MinLife'), n(row, 'MaxLife'), random(0)) / 1000;
    if (age < 0 || age >= life) return;
    if (reduced && !reducedEmitters.includes(emitter)) return;
    const variant = rows[Math.floor(random(1) * rows.length)],
      name = variant.ParticleExportName;
    const phase = reduced ? 0.5 : clamp(age / life);
    const scale =
      (((artScale * mix(n(row, 'StartScale'), n(row, 'EndScale'), phase)) / 100) *
        mix(n(row, 'ScaleRandomMin'), n(row, 'ScaleRandomMax'), random(2))) /
      100;
    const horizontal =
      (mix(n(row, 'MinHorizAngle'), n(row, 'MaxHorizAngle'), random(3)) * Math.PI) / 180;
    const vertical =
      (mix(n(row, 'MinVertAngle'), n(row, 'MaxVertAngle'), random(4)) * Math.PI) / 180;
    const speed = mix(n(row, 'MinSpeed'), n(row, 'MaxSpeed'), random(5));
    const radius = mix(n(row, 'StartRadiusMin'), n(row, 'StartRadiusMax'), random(6));
    const radiusAngle = random(7) * Math.PI * 2;
    const distance = reduced
      ? 0
      : nativeParticleTravel(speed, n(row, 'Inertia'), n(row, 'Slowdown'), age);
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
          Math.sin(vertical) *
            nativeParticleTravel(speed, n(row, 'Inertia'), n(row, 'Slowdown'), mid) -
          (gravity * mid * mid) / 2;
        if (height > 0) low = mid;
        else high = mid;
      }
      const hit = (low + high) / 2,
        after = age - hit;
      const time =
        n(row, 'Inertia') > 0 ? Math.log1p(n(row, 'Inertia') * hit) / n(row, 'Inertia') : hit;
      const velocity =
        Math.max(0, speed - n(row, 'Slowdown') * time) / (1 + n(row, 'Inertia') * hit);
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
      angle += Math.atan2((vx + vy) * 0.16 - verticalSpeed * altitudeScale, (vx - vy) * 0.32);
    }
    const c = Math.cos(angle) * scale,
      sn = Math.sin(angle) * scale;
    const root: NativeMatrix = [c, -sn, 0, sn, c, (staticEmitters[emitter] ?? 0) * scale];
    const clip = graph.clips[graph.exports[name]];
    const seconds =
      row.ScaleTimeline === 'TRUE'
        ? options.timelineDurations?.[name] !== undefined
          ? phase * options.timelineDurations[name]
          : (phase * clip.timeline.length) / clip.fps
        : reduced
          ? 0
          : age;
    let alpha = n(row, 'Alpha') / 100;
    for (const field of ['ParticleFadeOutTime', 'FadeOutTime']) {
      const fade = n(row, field) / 1000;
      if (fade) alpha *= clamp((life - age) / fade);
    }
    const fadeIn = n(row, 'FadeInTime') / 1000;
    if (fadeIn) alpha *= clamp(age / fadeIn);
    if (reduced && !Object.hasOwn(staticEmitters, emitter)) alpha *= 0.25;
    if (alpha <= 0) return;
    let poses = nativeScenePoses(graph, name, seconds, {}, root);
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
      y:
        ground.y +
        (x + y) * 0.16 -
        (Object.hasOwn(staticEmitters, emitter) || reduced ? 0 : z * altitudeScale),
      depth: groundLayer
        ? -870
        : emitter === 'Grass'
          ? ground.y + (x + y) * 0.16
          : layer === 'Top'
            ? 8000
            : ground.y + (x + y) * 0.16 + 1,
    };
  };
}
