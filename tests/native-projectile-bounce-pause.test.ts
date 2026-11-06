import { describe, expect, it } from 'vitest';
import reference from '../reference/native-projectile-step-18.400.22.json' with { type: 'json' };
import { nativeProjectileBouncePause } from '../src/game/native-projectile-step';
import {
  nativeProjectileFlight,
  type NativeProjectileRow,
} from '../src/game/native-projectile-poses';
import { compatibleReplayVersion, replayBattle } from '../src/game/replay';
import { seekingShieldBattle } from './fixtures/native-seeking-shield';
import { spikyBallBattle } from './fixtures/native-spiky-ball';

const row: NativeProjectileRow = { SWF: 'flight.sc', ExportName: 'ball', exports: ['ball'] };
const view = {
  iso: (x: number, y: number) => ({ x, y }),
  airLift: 0,
  targetHeight: 0,
  launchHeight: 0,
};

describe('original projectile bounce stop counter', () => {
  for (const test of reference.cases.filter((test) => test.initial_stop_counter === 15)) {
    const name = test.speed_source === 1500 ? 'BarbarianKingGearFootball' : 'AmazonQueen_shield';
    it(`matches ARM64 ${name} at sublogic distance${test.distance_sublogic}`, () => {
      const pause = nativeProjectileBouncePause(name, 0, 0, test.distance_sublogic / 4096, 0);
      expect(pause).toBe(test.hold_seconds);
    });
  }

  it('does not invent a hold for a source projectile with a zero stop counter', () => {
    expect(nativeProjectileBouncePause('TH17CannonProjectile', 0, 0, 20, 20)).toBe(0);
  });

  for (const kind of ['shield', 'ball'] as const) {
    function fixture(version = 239) {
      const r = kind === 'shield' ? seekingShieldBattle(1, version) : spikyBallBattle(1, version);
      const hero = r.battle.units.find(
        (u) => u.hero === (kind === 'shield' ? 'champion' : 'king'),
      )!;
      (hero.native!.effects ??= {}).frozenUntil = 100;
      r.model.activateNativeHeroAbility(kind === 'shield' ? 'champion' : 'king');
      const cast = () =>
        kind === 'shield'
          ? r.battle.nativeSeekingShieldCasts![0]
          : r.battle.nativeSpikyBallCasts![0];
      for (let count = 0; cast().shots.length < 2; count++) {
        if (count > 300) throw Error('Ricochet was not released');
        r.model.step(0.01);
      }
      return { ...r, cast: cast() };
    }

    it(`${kind} holds only its ricochet and keeps launch/contact timestamps`, () => {
      const r = fixture();
      const [first, bounce] = r.cast.shots;
      expect(first.motionAt).toBeUndefined();
      expect(bounce.launched).toBe(first.impact);
      expect(bounce.motionAt).toBeCloseTo(bounce.launched + 0.016, 12);
      expect(JSON.parse(JSON.stringify(bounce)).motionAt).toBe(bounce.motionAt);
    });

    it(`${kind} stays at contact during the hold and then resumes at its source speed`, () => {
      const r = fixture();
      const bounce = r.cast.shots[1];
      const held = nativeProjectileFlight(row, bounce, bounce.launched + 0.008, view);
      expect(held.t).toBe(0);
      expect(held.ground).toEqual({ x: bounce.fromX, y: bounce.fromY });
      const moving = nativeProjectileFlight(row, bounce, bounce.motionAt! + 0.1, view);
      expect(moving.t).toBeCloseTo(0.1 / (bounce.impact - bounce.motionAt!), 12);
      expect(moving.ground.x).toBeGreaterThan(bounce.fromX);
    });

    it(`${kind} applies the next hit at its delayed deadline`, () => {
      const r = fixture();
      const bounce = r.cast.shots[1];
      const target = r.battle.buildings.find((b) => b.id === bounce.targetId)!;
      const hp = target.hp;
      const before = bounce.impact - 0.001;
      while (r.battle.elapsed < before - 1e-9)
        r.model.step(Math.min(0.01, before - r.battle.elapsed));
      expect(target.hp).toBe(hp);
      r.model.step(0.002);
      expect(target.hp).toBe(Math.max(0, hp - bounce.damage));
    });

    it(`${kind} preserves version238 immediate movement`, () => {
      const r = fixture(238);
      expect(r.battle.nativeProjectileBouncePause).toBeUndefined();
      expect(r.cast.shots.every((shot) => shot.motionAt === undefined)).toBe(true);
      const bounce = r.cast.shots[1];
      const old = nativeProjectileFlight(row, bounce, bounce.launched + 0.008, view);
      expect(old.t).toBeGreaterThan(0);
    });
  }

  it('enables the capability only for armies carrying the two source equipment types', () => {
    const r = spikyBallBattle(1, 239);
    expect(r.battle.nativeProjectileBouncePause).toBe(true);
    expect(
      replayBattle({ ...r.data.initial, heroes: [] }).nativeProjectileBouncePause,
    ).toBeUndefined();
    expect(replayBattle(r.data.initial, 238).nativeProjectileBouncePause).toBeUndefined();
    expect(compatibleReplayVersion(238)).toBe(true);
    expect(compatibleReplayVersion(239)).toBe(true);
  });
});
