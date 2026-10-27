import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  SEEKING_SHIELD_PRESENTATION,
  seekingShieldCarried,
} from '../src/game/seeking-shield-effects';
import {
  nativeProjectileFlight,
  nativeProjectilePack,
  nativeProjectilePoses,
  type NativeProjectilePack,
} from '../src/game/native-projectile-poses';
import { heroProjectileNames } from '../src/game/hero-projectile-prefetch';
import { BattleSoundLog, troopSoundCues } from '../src/game/troop-sounds';
import { seekingShieldBattle } from './fixtures/native-seeking-shield';

const pack = JSON.parse(
  readFileSync('public/' + nativeProjectilePack(SEEKING_SHIELD_PRESENTATION.projectile), 'utf8'),
) as NativeProjectilePack;
const row = pack.projectiles[SEEKING_SHIELD_PRESENTATION.projectile];
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });

it('reuses the original 16-frame shield, ground shadow and source glow trail', () => {
  expect(row).toMatchObject({
    SWF: 'sc/characters.sc',
    ExportName: 'shield_projectile',
    ShadowSWF: 'sc/buildings.sc',
    ShadowExportName: 'simple_shadow_small',
    ParticleEmitter: SEEKING_SHIELD_PRESENTATION.trail,
    DestroyedEffect: SEEKING_SHIELD_PRESENTATION.destroyed,
    Scale: '120',
    StartHeight: '50',
    BallisticHeight: '100',
    UseRotate: 'FALSE',
  });
  expect(row.BounceEffect).toBeUndefined();
  const graph = pack.scenes.characters,
    root = graph.clips[graph.exports[row.ExportName]];
  expect(root.timeline).toHaveLength(16);
  expect(root.fps).toBe(24);
  const shot = { fromX: 0, fromY: 0, x: 20, y: 0, launched: 0, impact: 1 };
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
  expect(sample(0.1).poses).not.toEqual(sample(0.4).poses);
});

it.each([false, true])(
  'starts each subsequent flight on its previous ground/air landing plane, air=%s',
  (air) => {
    const first = { fromX: 0, fromY: 0, x: 4, y: 0, launched: 0, impact: 0.2, toAir: air };
    const landing = nativeProjectileFlight(row, first, 0.2, { iso, airLift: 46 });
    const next = { fromX: 4, fromY: 0, x: 8, y: 0, launched: 0.2, impact: 0.4, fromAir: air };
    const launch = nativeProjectileFlight(row, next, 0.2, {
      iso,
      airLift: 46,
      launchHeight: air ? 46 : 16,
    });
    expect([launch.x, launch.y, launch.height]).toEqual([landing.x, landing.y, landing.height]);
  },
);

it('warms the carried original shield only when its replay controller is enabled', () => {
  const heroes = [
    { kind: 'champion' as const, level: 1, items: [{ slug: 'seeking-shield', level: 18 }] },
  ];
  expect(seekingShieldCarried(heroes)).toBe(true);
  expect(heroProjectileNames(heroes)).not.toContain(SEEKING_SHIELD_PRESENTATION.projectile);
  expect(heroProjectileNames(heroes, { seekingShield: true })).toContain(
    SEEKING_SHIELD_PRESENTATION.projectile,
  );
});

it('plays the declared destroyed sample once at the final landing, with source gain and pitch', () => {
  const r = seekingShieldBattle();
  (r.battle.units.find((u) => u.id === r.championId)!.native!.effects ??= {}).frozenUntil = 100;
  r.model.activateNativeHeroAbility('champion');
  r.until(0.95);
  const cast = r.battle.nativeSeekingShieldCasts![0];
  r.until(cast.shots[0].impact);
  expect(
    troopSoundCues(r.battle, new BattleSoundLog()).filter((cue) =>
      cue.key.endsWith(':shield:sound'),
    ),
  ).toEqual([]);
  for (let i = 0; cast.shots.length < 4 && i < 100; i++) r.model.step(0.05);
  const last = cast.shots[3];
  r.until(last.impact);
  const before = JSON.stringify(r.battle),
    cues = troopSoundCues(r.battle, new BattleSoundLog()).filter((cue) =>
      cue.key.endsWith(':shield:sound'),
    );
  expect(cues).toHaveLength(1);
  expect(cues[0]).toMatchObject({ key: `${last.id}:shield:sound`, at: last.impact, volume: 0.4 });
  expect(cues[0].pitch).toBeGreaterThanOrEqual(0.98);
  expect(cues[0].pitch).toBeLessThanOrEqual(1.02);
  expect(JSON.stringify(r.battle)).toBe(before);
});
