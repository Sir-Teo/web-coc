import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { fireballShake, fireballShakeProfile } from '../src/game/fireball-shake';
import { fireballProfile } from '../src/game/fireball-effects';
import {
  presentationLive,
  presentationTime,
  settlePresentation,
} from '../src/game/presentation-clock';
import {
  fireballBattle,
  nativeFireballRecording,
  nativeWinningFireballRecording,
} from './fixtures/native-fireball';
import type { Battle } from '../src/game/model';

const rest = { x: 0, y: 0 };
it('retains all original tier shake rows and the independent 800 ms live-only specification', () => {
  const pack = JSON.parse(readFileSync('public/assets/fireball-native/effects/graph.json', 'utf8'));
  for (let level = 1; level <= 27; level++) {
    expect(fireballShakeProfile(level)).toEqual({ strength: 60, duration: 0.8, replay: false });
    expect(pack.effects[fireballProfile(level)!.HitEffect][0]).toMatchObject({
      CameraShake: '60',
      CameraShakeTimeMS: '800',
      CameraShakeInReplay: 'FALSE',
    });
  }
});

it('begins at canonical impact and returns smoothly to rest inside the source duration', () => {
  const r = fireballBattle();
  r.model.activateNativeHeroAbility('warden');
  const shot = r.battle.nativeFireballs![0];
  for (const at of [0, shot.impact - 0.01, shot.impact, shot.impact + 0.8, shot.impact + 1])
    expect(fireballShake(r.battle, false, false, at)).toEqual(rest);
  for (let step = 1; step < 800; step++) {
    const age = step / 1000;
    const offset = fireballShake(r.battle, false, false, shot.impact + age);
    expect(Math.abs(offset.x)).toBeLessThanOrEqual(19.2 * (1 - age / 0.8) + 1e-9);
    expect(Math.abs(offset.y)).toBeLessThanOrEqual(19.2 * (1 - age / 0.8) + 1e-9);
  }
  const early = fireballShake(r.battle, false, false, shot.impact + 0.000001);
  const late = fireballShake(r.battle, false, false, shot.impact + 0.799999);
  expect(Math.hypot(early.x, early.y)).toBeLessThan(0.001);
  expect(Math.hypot(late.x, late.y)).toBeLessThan(0.001);
});

it('suppresses replay and reduced-motion feedback without changing combat or RNG', () => {
  const r = fireballBattle();
  r.model.activateNativeHeroAbility('warden');
  r.until(1.65);
  const before = JSON.stringify(r.battle);
  const offset = fireballShake(r.battle, false);
  expect(offset).not.toEqual(rest);
  for (let frame = 0; frame < 100; frame++) expect(fireballShake(r.battle, false)).toEqual(offset);
  expect(fireballShake(r.battle, true)).toEqual(rest);
  expect(fireballShake(r.battle, false, true)).toEqual(rest);
  expect(fireballShake({ ...r.battle, started: false }, false)).toEqual(rest);
  expect(fireballShake({ ...r.battle, nativeWardenFireball: undefined }, false)).toEqual(rest);
  expect(fireballShake(null, false)).toEqual(rest);
  expect(JSON.stringify(r.battle)).toBe(before);
});

it('reconstructs the live impulse after the recorded Warden has been Recalled', () => {
  const r = nativeFireballRecording(27, undefined, true);
  const b = r.snapshots.find((s) => s.at === r.explosion)!.battle as Battle;
  expect(b.units.some((u) => u.id === r.wardenId)).toBe(false);
  expect(fireballShake(b, false)).not.toEqual(rest);
  expect(fireballShake(JSON.parse(JSON.stringify(b)), false)).toEqual(fireballShake(b, false));
  expect(fireballShake(b, false, true)).toEqual(rest);
});

it('bounds overlapping explosions independently of insertion order', () => {
  const r = fireballBattle();
  r.model.activateNativeHeroAbility('warden');
  const shot = r.battle.nativeFireballs![0];
  r.battle.nativeFireballs = Array.from({ length: 20 }, (_, i) => ({
    ...shot,
    id: `test:${i}`,
    sourceId: i + 100,
  }));
  for (let step = 1; step < 80; step++) {
    const at = shot.impact + step / 100;
    const offset = fireballShake(r.battle, false, false, at);
    expect(Math.abs(offset.x)).toBeLessThanOrEqual(19.2);
    expect(Math.abs(offset.y)).toBeLessThanOrEqual(19.2);
    expect(
      fireballShake(
        { ...r.battle, nativeFireballs: [...r.battle.nativeFireballs].reverse() },
        false,
        false,
        at,
      ),
    ).toEqual(offset);
  }
});

it('fades a real finishing hit using presentation time while its battle remains frozen', () => {
  const r = nativeWinningFireballRecording();
  const b = r.battle as Battle;
  // Presentation saw this same object running before the winning simulation sample.
  b.finished = false;
  presentationLive(b, 1000);
  b.finished = true;
  const before = JSON.stringify(b);
  const first = presentationTime(b, 1000);
  expect(fireballShake(b, false, false, first + 0.1)).not.toEqual(rest);
  expect(fireballShake(b, false, false, presentationTime(b, 1900))).toEqual(rest);
  expect(JSON.stringify(b)).toBe(before);
  settlePresentation(b);
  expect(presentationLive(b)).toBe(false);
  expect(fireballShake(b, false, false, Infinity)).toEqual(rest);
  const cold = JSON.parse(before) as Battle;
  expect(presentationLive(cold, 1000)).toBe(false);
});

it('does not invent a later explosion impulse for an airborne shot cancelled by End Battle', () => {
  const r = fireballBattle();
  r.model.activateNativeHeroAbility('warden');
  const shot = r.battle.nativeFireballs![0];
  r.model.finishBattle();
  const before = JSON.stringify(r.battle);
  expect(fireballShake(r.battle, false, false, shot.impact + 0.1)).toEqual(rest);
  expect(JSON.stringify(r.battle)).toBe(before);
});
