import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  SPIKY_BALL_PRESENTATION,
  spikyBallCarried,
  spikyBallSoundEvents,
} from '../src/game/spiky-ball-effects';
import {
  nativeProjectileFlight,
  nativeProjectilePack,
  nativeProjectilePoses,
  type NativeProjectilePack,
} from '../src/game/native-projectile-poses';
import { heroProjectileNames } from '../src/game/hero-projectile-prefetch';
import { spikyBallBattle } from './fixtures/native-spiky-ball';

const pack = JSON.parse(
  readFileSync('public/' + nativeProjectilePack(SPIKY_BALL_PRESENTATION.projectile), 'utf8'),
) as NativeProjectilePack;
const row = pack.projectiles[SPIKY_BALL_PRESENTATION.projectile];
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });

it('reuses the original spinning ball, shadow, trail and matching bounce/final contact effect', () => {
  expect(row).toMatchObject({
    SWF: 'sc/buildings.sc',
    ExportName: 'bk_hero_equipment_football_projectile',
    Scale: '120',
    StartHeight: '50',
    BallisticHeight: '100',
    UseRotate: 'TRUE',
    ScaleTimeline: 'FALSE',
    ParticleEmitter: SPIKY_BALL_PRESENTATION.trail,
    BounceEffect: SPIKY_BALL_PRESENTATION.impact,
    DestroyedEffect: SPIKY_BALL_PRESENTATION.impact,
    ShadowExportName: 'shadow_trollBoulder',
  });
  const graph = pack.scenes.buildings,
    root = graph.clips[graph.exports[row.ExportName]];
  expect(root.timeline).toHaveLength(22);
  expect(root.fps).toBe(30);
  const shot = { fromX: 0, fromY: 0, x: 15, y: 0, launched: 0, impact: 1 };
  const sample = (at: number) =>
    nativeProjectilePoses(
      pack,
      row,
      nativeProjectileFlight(row, shot, at, { iso, airLift: 46 }),
      at,
      0,
    );
  expect(sample(0.1).poses.length).toBeGreaterThan(0);
  expect(sample(0.1).shadow!.poses.length).toBeGreaterThan(0);
  expect(sample(0.1).poses).not.toEqual(sample(0.5).poses);
});

it('warms the carried original ball only when its replay controller is enabled', () => {
  const heroes = [{ kind: 'king' as const, level: 1, items: [{ slug: 'spiky-ball', level: 27 }] }];
  expect(spikyBallCarried(heroes)).toBe(true);
  expect(heroProjectileNames(heroes)).not.toContain(SPIKY_BALL_PRESENTATION.projectile);
  expect(heroProjectileNames(heroes, { spikyBall: true })).toContain(
    SPIKY_BALL_PRESENTATION.projectile,
  );
  const r = spikyBallBattle();
  r.model.activateNativeHeroAbility('king');
  const shot = r.battle.nativeSpikyBallCasts![0].shots[0];
  expect(spikyBallSoundEvents(r.battle)).toEqual([
    { effect: SPIKY_BALL_PRESENTATION.impact, key: `${shot.id}:spiky:sound`, at: shot.impact },
  ]);
});
