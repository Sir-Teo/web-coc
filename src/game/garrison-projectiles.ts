import { projectileRow, sourceFlag, sourceNumber } from './character-catalog';
import { PROJECTILE_ART } from './character-art';
import { CHARACTER_SCALE } from './character-poses';
import { garrisonStats } from './garrison-kinds';
import { distance2D } from './distance';
import { nativeScenePoses, type NativeScenePose } from './native-mesh';
import type { GarrisonShot } from './garrison-combat';
import type { Battle } from './model';

export interface GarrisonShotPose {
  key: string;
  prefix: string;
  x: number;
  y: number;
  depth: number;
  poses: NativeScenePose[];
  shadow?: { prefix: string; x: number; y: number; poses: NativeScenePose[] };
}
/** Local body height of a struck troop above its ground point, before any air lift. */
const TARGET_HEIGHT = 16;

/**
 * Original projectile meshes along their recorded tracking flight. Source StartHeight and
 * StartOffset use the character's local 0.6 world scale; a ballistic arc of BallisticHeight,
 * ScaleTimeline and the shadow export follow the projectile row. Screen projection and arc
 * shape are local interpretations, not native trajectory parity.
 */
export function garrisonShotPose(
  shot: GarrisonShot,
  shooterFlying: boolean,
  elapsed: number,
  iso: (x: number, y: number) => { x: number; y: number },
  lift: number,
  key: string,
): GarrisonShotPose | null {
  if (elapsed < shot.launched) return null;
  const row = projectileRow(shot.projectile);
  const art = PROJECTILE_ART[row.SWF];
  if (!art) throw Error(`Missing native projectile art: ${shot.projectile}`);
  const travelled = distance2D(shot.flight.x - shot.fromX, shot.flight.y - shot.fromY);
  const dx = shot.x - shot.flight.x,
    dy = shot.y - shot.flight.y;
  const remaining = distance2D(dx, dy);
  const progress = travelled + remaining ? travelled / (travelled + remaining) : 1;
  const offset = (sourceNumber(row, 'StartOffset') / 100) * (1 - progress);
  const ground = iso(
    shot.flight.x + (dx / (remaining || 1)) * offset,
    shot.flight.y + (dy / (remaining || 1)) * offset,
  );
  const fromHeight =
    sourceNumber(row, 'StartHeight') * CHARACTER_SCALE + (shooterFlying ? lift : 0);
  const toHeight = TARGET_HEIGHT + (shot.air ? lift : 0);
  const arc =
    4 * sourceNumber(row, 'BallisticHeight') * CHARACTER_SCALE * progress * (1 - progress);
  const height = fromHeight * (1 - progress) + toHeight * progress + arc;
  const x = ground.x,
    y = ground.y - height;
  const target = iso(shot.x, shot.y);
  // Original projectile tips point along +Y; face the projected destination.
  const rotation = sourceFlag(row, 'UseRotate')
    ? Math.atan2(target.y - toHeight - y, target.x - x) - Math.PI / 2
    : 0;
  const scale = (sourceNumber(row, 'Scale') / 100 || 1) * CHARACTER_SCALE;
  const c = Math.cos(rotation) * scale,
    s = Math.sin(rotation) * scale;
  const clip = art.graph.clips[art.graph.exports[row.ExportName]];
  const time = sourceFlag(row, 'ScaleTimeline')
    ? (progress * (clip.timeline.length - 1)) / clip.fps
    : elapsed - shot.launched;
  const pose: GarrisonShotPose = {
    key,
    prefix: art.prefix,
    x,
    y,
    depth: 7700 + ground.y / 10000,
    poses: nativeScenePoses(art.graph, row.ExportName, time, {}, [c, -s, 0, s, c, 0]),
  };
  if (row.ShadowExportName) {
    const shadowArt = PROJECTILE_ART[row.ShadowSWF];
    // The original projectile shadow stays on the ground beneath the flight.
    pose.shadow = {
      prefix: shadowArt.prefix,
      x: ground.x,
      y: ground.y,
      poses: nativeScenePoses(shadowArt.graph, row.ShadowExportName, 0, {}, [c, -s, 0, s, c, 0]),
    };
  }
  return pose;
}

export function garrisonShotPoses(
  battle: Battle | null,
  reduced: boolean,
  iso: (x: number, y: number) => { x: number; y: number },
  lift: number,
) {
  const result: GarrisonShotPose[] = [];
  if (!battle || reduced || battle.finished) return result;
  for (const defender of battle.defenders ?? []) {
    if (defender.kind === 'skeleton' || !defender.shots?.length) continue;
    const flying = garrisonStats(defender.kind, defender.level).flying;
    for (const shot of defender.shots) {
      const pose = garrisonShotPose(
        shot,
        flying,
        battle.elapsed,
        iso,
        lift,
        `garrison-shot:${defender.id}:${shot.n}`,
      );
      if (pose) result.push(pose);
    }
  }
  return result;
}
