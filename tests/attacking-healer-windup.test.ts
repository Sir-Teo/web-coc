import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { expect, it } from 'vitest';
import { healerBattle, healerRecording, healerPuppetRecording } from './fixtures/attacking-healer';
import { nativeUnitStats } from '../src/game/native-units';
import { replayBattle } from '../src/game/replay';
import { applyShrink } from '../src/game/shrink-trap';
import { nativeTroopFacingTarget } from '../src/game/native-troop-facing';

for (let level = 1; level <= 11; level++)
  for (const x of [8, 13])
    it(`Healer${level} spends200ms cast and keeps700ms repeats from${x}`, () => {
      const r = healerBattle(level, 210, x),
        s = nativeUnitStats('healer', level);
      while (!r.healer.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(r.shots).toHaveLength(0);
      expect(r.healer.native!.healerWindup!.animationOffset).toBeLessThan(0);
      r.untilCasts(1);
      expect(r.shots[0].at - engaged + 0.05).toBeCloseTo(0.2, 8);
      expect(r.shots[0].damage).toBeCloseTo(s.heal, 8);
      expect(r.shots[0].heroScale).toBe(s.heroMultiplier);
      r.untilCasts(4);
      for (let n = 1; n < 4; n++) expect(r.shots[n].at - r.shots[0].at).toBeCloseTo(n * 0.7, 8);
    });
for (const x of [8, 13])
  it(`version209 retains immediate Healer launch from${x}`, () => {
    const r = healerBattle(1, 209, x);
    r.untilCasts(1);
    expect(r.shots[0].at).toBeCloseTo(x === 8 ? 0.05 : 1.8, 8);
    expect(r.healer.native?.healerWindup).toBeUndefined();
    r.untilCasts(2);
    expect(r.shots[1].at - r.shots[0].at).toBeCloseTo(0.7, 8);
  });
for (const hold of ['frozenUntil', 'stunUntil'] as const)
  it(`${hold} holds a friendly cast`, () => {
    const r = healerBattle(1, 210);
    r.step();
    r.healer.native!.effects = { [hold]: r.battle.elapsed + 1.025 };
    r.untilCasts(1);
    expect(r.shots[0].at).toBeCloseTo(1.25, 8);
  });
for (const slowed of [false, true])
  it(`native cast modifiers slowed=${slowed}`, () => {
    const r = healerBattle(1, 210);
    r.step();
    r.healer.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    r.untilCasts(1);
    const first = r.shots[0].at;
    r.untilCasts(4);
    expect(Math.abs(r.shots[3].at - first - 3 * 0.7 * (slowed ? 2 : 0.5))).toBeLessThan(
      0.05 + 1e-8,
    );
  });
it('Shrink scales the friendly cast while retaining pulse damage', () => {
  const r = healerBattle(1, 210);
  applyShrink(r.healer, 0);
  r.untilCasts(1);
  expect(r.shots[0].at).toBeCloseTo(0.4, 8);
  expect(r.shots[0].damage).toBeCloseTo(25.2, 8);
  r.untilCasts(2);
  expect(r.shots[1].at - r.shots[0].at).toBeCloseTo(1.4, 8);
});
it('the original body faces its friendly cast target', () => {
  const r = healerBattle(1, 210);
  r.step();
  expect(nativeTroopFacingTarget(r.battle, r.healer)).toEqual({ x: r.hero.x, y: r.hero.y });
});
it('only carried Healers or actual Healer Puppet lineups enable the controller', () => {
  const r = healerBattle();
  expect(replayBattle(r.data.initial, 210).nativeHealerWindup).toBe(true);
  r.data.initial.army.healer = 0;
  expect(replayBattle(r.data.initial, 210).nativeHealerWindup).toBeUndefined();
  r.data.initial.heroes = [
    { kind: 'queen', level: 30, items: [{ slug: 'healer-puppet', level: 1 }] },
  ];
  expect(replayBattle(r.data.initial, 210).nativeHealerWindup).toBe(true);
  expect(replayBattle(r.data.initial, 209).nativeHealerWindup).toBeUndefined();
});

for (const version of [209, 210])
  for (const level of [1, 11])
    for (const x of [8, 13])
      it(`actual trained Healer${level} from${x} retains portable states version${version}`, () => {
        const r = healerRecording(level, version, x),
          viewer = new GameModel();
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(snapshot.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
        }
      });
for (const version of [209, 210])
  for (const item of [1, 18])
    it(`actual Healer Puppet${item} retains source tiers and casts version${version}`, () => {
      const r = healerPuppetRecording(item, version),
        viewer = new GameModel();
      expect(r.data.initial.army.healer).toBe(0);
      expect(r.level).toBe(item === 1 ? 4 : 8);
      expect(r.first - r.born).toBeCloseTo(version >= 210 ? 0.2 : 0.05, 8);
      expect(r.second - r.first).toBeCloseTo(0.7, 8);
      expect(r.shots[0].damage).toBeCloseTo(nativeUnitStats('healer', r.level).heal, 8);
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(snapshot.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
      }
    });

for (const state of ['dead', 'removed', 'ejected', 'recalled', 'unborn'] as const)
  it(`a ${state} friendly target cancels the pending cast`, () => {
    const r = healerBattle(1, 210);
    r.step();
    if (state === 'dead') {
      r.battle.nativeHeroes![0].abilityUsed = true;
      r.hero.hp = 0;
    } else if (state === 'removed')
      r.battle.units = r.battle.units.filter((u) => u.id !== r.hero.id);
    else if (state === 'ejected') r.hero.ejected = true;
    else if (state === 'recalled') (r.hero.native ??= {}).recalled = true;
    else r.hero.spawnedAt = 100;
    for (let n = 0; n < 6; n++) r.step();
    expect(r.shots).toHaveLength(0);
    expect(r.healer.native!.healerWindup!.engaged).toBeUndefined();
  });
it('a replacement friendly target spends a fresh cast', () => {
  const r = healerBattle(1, 210);
  r.step();
  r.model.activeTroop = 'giant';
  expect(r.model.deploy(8.5, 6.5)).toBe(true);
  r.hero.ejected = true;
  r.untilCasts(1);
  expect(r.shots[0].at).toBeCloseTo(0.25, 8);
});
it('switching recipients after a release preserves recovery once', () => {
  const r = healerBattle(1, 210);
  r.untilCasts(1);
  const first = r.shots[0].at;
  r.model.activeTroop = 'giant';
  expect(r.model.deploy(8.5, 6.5)).toBe(true);
  r.hero.ejected = true;
  r.untilCasts(2);
  expect(r.shots[1].at - first).toBeCloseTo(0.7, 8);
});
it('a committed friendly cast finishes once before chasing an escaping recipient', () => {
  const r = healerBattle(1, 210);
  r.step();
  r.hero.x = 25;
  r.untilCasts(1);
  expect(r.shots[0].at).toBeCloseTo(0.2, 8);
  r.step();
  expect(r.healer.native!.healerWindup!.engaged).toBeUndefined();
  while (r.battle.elapsed < 1 - 1e-9) r.step();
  expect(r.shots).toHaveLength(1);
});

it('defeat prevents a pending Healer cast from launching', () => {
  const r = healerBattle(1, 210);
  r.step();
  r.healer.hp = 0;
  for (let n = 0; n < 6; n++) r.step();
  expect(r.shots).toHaveLength(0);
});
it('irregular80ms samples retain700ms friendly cast remainders', () => {
  const r = healerBattle(1, 210),
    seen = new Set<string>(),
    times: number[] = [];
  while (times.length < 8) {
    r.model.step(0.08);
    if (r.battle.finished || r.battle.elapsed > 10) throw Error('Irregular Healer expired');
    for (const p of r.battle.projectiles ?? [])
      if (p.sourceId === r.healer.id && p.weapon === 'healing' && !seen.has(p.id)) {
        seen.add(p.id);
        times.push(p.launched!);
      }
  }
  expect(times[0]).toBeCloseTo(0.24, 8);
  expect(Math.abs(times[7] - times[0] - 4.9)).toBeLessThan(0.08 + 1e-8);
});
